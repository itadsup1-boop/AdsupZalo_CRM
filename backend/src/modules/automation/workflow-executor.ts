import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';

export interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  data: {
    type: string;
    content?: string;
    delayType?: 'relative' | 'absolute';
    delayMinutes?: number;
    absoluteDateTime?: string;
    tagName?: string;
    taskNote?: string;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface AutomationRunData {
  id: string;
  orgId: string;
  workflowId: string;
  contactId: string;
  status: string;
  currentNodeId: string | null;
  scheduledAt: Date | null;
  state: Record<string, unknown>;
  workflow: {
    nodes: unknown;
    edges: unknown;
  };
}

export function findRootNode(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode | null {
  if (nodes.length === 0) return null;
  const targets = new Set(edges.map((e) => e.target));
  const root = nodes.find((n) => !targets.has(n.id));
  return root || nodes[0];
}

export async function executeCurrentNode(run: AutomationRunData): Promise<void> {
  const { id: runId, orgId, contactId, workflowId } = run;

  const nodes = (run.workflow.nodes as WorkflowNode[]) ?? [];
  const edges = (run.workflow.edges as WorkflowEdge[]) ?? [];

  if (!run.currentNodeId) {
    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        currentNodeId: null,
        completedAt: new Date(),
      },
    });
    return;
  }

  const node = nodes.find((n) => n.id === run.currentNodeId);
  if (!node) {
    logger.warn(`[workflow-executor] Node ${run.currentNodeId} not found in workflow ${workflowId}`);
    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        currentNodeId: null,
        completedAt: new Date(),
      },
    });
    return;
  }

  const nodeType = node.data?.type || node.type;
  logger.info(`[workflow-executor] Executing node ${node.id} (${nodeType}) for run ${runId}`);

  try {
    let nextScheduledAt: Date = new Date();
    let isDelayNode = false;

    if (nodeType === 'zaloMessage') {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
      });
      if (!contact || !contact.zaloUid) {
        throw new Error(`Contact ${contactId} not found or has no zaloUid`);
      }

      let content = node.data.content || '';
      content = content
        .replace(/\{\{customer_name\}\}/g, contact.crmName || contact.fullName || 'Khách hàng')
        .replace(/\{\{customer_phone\}\}/g, contact.phone || '');

      let zaloAccountId: string | null = null;
      const conv = await prisma.conversation.findFirst({
        where: { contactId, orgId },
        select: { zaloAccountId: true },
      });
      if (conv) {
        zaloAccountId = conv.zaloAccountId;
      } else {
        const fallbackAcc = await prisma.zaloAccount.findFirst({
          where: { orgId },
          select: { id: true },
        });
        zaloAccountId = fallbackAcc?.id || null;
      }

      if (!zaloAccountId) {
        throw new Error('No Zalo account found for sending message');
      }

      const instance = zaloPool.getInstance(zaloAccountId);
      if (!instance?.api) {
        throw new Error(`Zalo account ${zaloAccountId} not active/loaded`);
      }

      const limits = await zaloRateLimiter.checkLimits(zaloAccountId);
      if (!limits.allowed) {
        throw new Error(`Zalo account ${zaloAccountId} rate limit reached`);
      }

      // Check Anti-spam limits
      const { checkSpamLimits } = await import('./anti-spam.js');
      const spamCheck = await checkSpamLimits(orgId, contactId, content);
      if (!spamCheck.allowed) {
        if (spamCheck.action === 'wait') {
          // Quiet hours: Reschedule the workflow run to try again in 30 minutes
          const postponeTime = new Date(Date.now() + 30 * 60 * 1000);
          await prisma.automationRun.update({
            where: { id: runId },
            data: { scheduledAt: postponeTime, status: 'running' },
          });
          logger.warn(`[workflow-executor] Workflow run ${runId} postponed due to quiet hours: ${spamCheck.reason}`);
          return;
        } else {
          // Other anti-spam block: fail/skip this execution
          throw new Error(`Anti-Spam Blocked: ${spamCheck.reason}`);
        }
      }

      zaloRateLimiter.recordSend(zaloAccountId);
      const sendResult = await instance.api.sendMessage({ msg: content }, contact.zaloUid, 0);
      const zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');

      let conversation = await prisma.conversation.findFirst({
        where: { zaloAccountId, contactId },
      });
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            id: randomUUID(),
            orgId,
            zaloAccountId,
            contactId,
            threadType: 'personal',
            externalThreadId: contact.zaloUid,
            lastMessageAt: new Date(),
            unreadCount: 0,
            isReplied: true,
          },
        });
      }

      await prisma.message.create({
        data: {
          id: randomUUID(),
          orgId,
          conversationId: conversation.id,
          zaloMsgId: zaloMsgId || `wf-${randomUUID()}`,
          senderType: 'self',
          senderUid: '',
          senderName: 'Automation',
          content,
          contentType: 'text',
          sentAt: new Date(),
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          isReplied: true,
          unreadCount: 0,
        },
      });

    } else if (nodeType === 'delay') {
      isDelayNode = true;
      if (node.data.delayType === 'absolute' && node.data.absoluteDateTime) {
        nextScheduledAt = new Date(node.data.absoluteDateTime);
      } else {
        const delayMinutes = Number(node.data.delayMinutes) || 0;
        nextScheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);
      }
      logger.info(`[workflow-executor] Node ${node.id} is delay. Rescheduling run ${runId} at ${nextScheduledAt.toISOString()}`);

    } else if (nodeType === 'tagContact') {
      const tagName = node.data.tagName;
      if (tagName) {
        let tag = await prisma.tag.findFirst({
          where: { orgId, name: tagName },
        });
        if (!tag) {
          tag = await prisma.tag.create({
            data: { orgId, name: tagName, color: '#3B82F6' },
          });
        }
        const existing = await prisma.contactTag.findFirst({
          where: { orgId, contactId, tagId: tag.id },
        });
        if (!existing) {
          await prisma.contactTag.create({
            data: { orgId, contactId, tagId: tag.id },
          });
        }
      }

    } else if (nodeType === 'createTask') {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { assignedUserId: true },
      });
      await prisma.appointment.create({
        data: {
          id: randomUUID(),
          orgId,
          contactId,
          assignedUserId: contact?.assignedUserId || null,
          appointmentDate: new Date(),
          type: 'task',
          status: 'scheduled',
          notes: node.data.taskNote || 'Tạo nhắc nhở từ workflow automation',
        },
      });
    }

    // Ghi nhận log thành công
    await prisma.automationLog.create({
      data: {
        id: randomUUID(),
        orgId,
        runId,
        nodeId: node.id,
        nodeType,
        status: isDelayNode ? 'waiting' : 'success',
        details: node.data as any,
      },
    });

    const outgoing = edges.find((e) => e.source === node.id);
    const nextNode = outgoing ? nodes.find((n) => n.id === outgoing.target) : null;

    if (nextNode) {
      if (isDelayNode) {
        await prisma.automationRun.update({
          where: { id: runId },
          data: {
            currentNodeId: nextNode.id,
            scheduledAt: nextScheduledAt,
            status: 'running',
          },
        });
      } else {
        const updatedRun = await prisma.automationRun.update({
          where: { id: runId },
          data: {
            currentNodeId: nextNode.id,
            scheduledAt: new Date(),
            status: 'running',
          },
        });
        await executeCurrentNode({
          ...updatedRun,
          state: updatedRun.state as Record<string, unknown>,
          workflow: run.workflow,
        });
      }
    } else {
      await prisma.automationRun.update({
        where: { id: runId },
        data: {
          currentNodeId: null,
          scheduledAt: null,
          status: 'completed',
          completedAt: new Date(),
        },
      });
      logger.info(`[workflow-executor] Completed workflow run ${runId}`);
    }

  } catch (err: any) {
    logger.error(`[workflow-executor] Error in node ${node.id} execution:`, err);
    await prisma.automationLog.create({
      data: {
        id: randomUUID(),
        orgId,
        runId,
        nodeId: node.id,
        nodeType,
        status: 'failed',
        details: { error: err.message || String(err) },
      },
    });
    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        completedAt: new Date(),
      },
    });
  }
}

export async function triggerWorkflowsByProduct(
  orgId: string,
  contactId: string,
  productId: string,
): Promise<void> {
  const links = await prisma.productWorkflow.findMany({
    where: { orgId, productId },
    include: {
      workflow: true,
    },
  });
  if (links.length === 0) return;
  for (const link of links) {
    const { workflow } = link;
    if (!workflow || workflow.status !== 'active') continue;
    // Tránh chạy trùng lặp kịch bản cho một khách hàng
    const existing = await prisma.automationRun.findFirst({
      where: { workflowId: workflow.id, contactId, status: { in: ['running', 'completed'] } },
    });
    if (existing) {
      logger.info(`[workflow-executor] Run already exists for product workflow ${workflow.id} / contact ${contactId}, skipping`);
      continue;
    }
    const nodes = (workflow.nodes as unknown as WorkflowNode[]) ?? [];
    const edges = (workflow.edges as unknown as WorkflowEdge[]) ?? [];
    const rootNode = findRootNode(nodes, edges);
    const run = await prisma.automationRun.create({
      data: {
        id: randomUUID(),
        orgId,
        workflowId: workflow.id,
        contactId,
        status: 'running',
        currentNodeId: rootNode?.id ?? null,
        scheduledAt: new Date(),
        state: {},
      },
    });
    logger.info(`[workflow-executor] Created AutomationRun ${run.id} for product "${productId}" workflow "${workflow.name}" / contact ${contactId}`);
    try {
      await executeCurrentNode({
        ...run,
        state: run.state as Record<string, unknown>,
        workflow: { nodes: workflow.nodes, edges: workflow.edges },
      });
    } catch (err) {
      logger.error(`[workflow-executor] Error executing product run ${run.id}:`, err);
    }
  }
}

export async function triggerWorkflowsByTag(
  orgId: string,
  contactId: string,
  tagId: string,
): Promise<void> {
  const workflows = await prisma.automationWorkflow.findMany({
    where: { orgId, triggerTagId: tagId, status: 'active' },
  });
  
  if (workflows.length === 0) return;
  
  for (const workflow of workflows) {
    // Check if run already exists for this workflow and contact to avoid duplicates
    const existing = await prisma.automationRun.findFirst({
      where: { workflowId: workflow.id, contactId, status: { in: ['running', 'completed'] } },
    });
    if (existing) {
      logger.info(`[workflow-executor] Run already exists for workflow ${workflow.id} / contact ${contactId}, skipping`);
      continue;
    }
    
    const nodes = (workflow.nodes as unknown as WorkflowNode[]) ?? [];
    const edges = (workflow.edges as unknown as WorkflowEdge[]) ?? [];
    const rootNode = findRootNode(nodes, edges);
    
    const run = await prisma.automationRun.create({
      data: {
        id: randomUUID(),
        orgId,
        workflowId: workflow.id,
        contactId,
        status: 'running',
        currentNodeId: rootNode?.id ?? null,
        scheduledAt: new Date(),
        state: {},
      },
    });
    
    logger.info(`[workflow-executor] Created AutomationRun ${run.id} for tag triggered workflow "${workflow.name}" / contact ${contactId}`);
    try {
      await executeCurrentNode({
        ...run,
        state: run.state as Record<string, unknown>,
        workflow: { nodes: workflow.nodes, edges: workflow.edges },
      });
    } catch (err) {
      logger.error(`[workflow-executor] Error executing tag triggered run ${run.id}:`, err);
    }
  }
}
