import { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';

export async function productRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // ==========================
  // Category API
  // ==========================

  fastify.get('/api/v1/product-categories', async (request, reply) => {
    const categories = await prisma.productCategory.findMany({
      where: { orgId: request.user.orgId },
      orderBy: { createdAt: 'desc' }
    });
    return { data: categories };
  });

  fastify.post('/api/v1/product-categories', async (request, reply) => {
    const { name } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'Name is required' });

    const category = await prisma.productCategory.create({
      data: {
        orgId: request.user.orgId,
        name
      }
    });
    return { data: category };
  });

  // ==========================
  // Product API
  // ==========================

  fastify.get('/api/v1/products', async (request, reply) => {
    const products = await prisma.product.findMany({
      where: { orgId: request.user.orgId },
      include: {
        category: true,
        productWorkflows: {
          include: { workflow: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return { data: products };
  });

  fastify.post('/api/v1/products', async (request, reply) => {
    const { name, code, categoryId, description, price, isActive } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'Name is required' });

    const product = await prisma.product.create({
      data: {
        orgId: request.user.orgId,
        name,
        code,
        categoryId,
        description,
        price,
        isActive: isActive !== undefined ? isActive : true,
        createdBy: request.user.id
      }
    });
    return { data: product };
  });

  fastify.put('/api/v1/products/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { name, code, categoryId, description, price, isActive } = request.body as any;

    const product = await prisma.product.update({
      where: { orgId_id: { orgId: request.user.orgId, id } },
      data: { name, code, categoryId, description, price, isActive }
    });
    return { data: product };
  });

  fastify.delete('/api/v1/products/:id', async (request, reply) => {
    const { id } = request.params as any;

    // Check if there are associated customers or workflows
    const count = await prisma.customerProduct.count({
      where: { orgId: request.user.orgId, productId: id }
    });
    
    if (count > 0) {
      return reply.status(400).send({ error: 'Cannot delete product currently attached to customers.' });
    }

    await prisma.product.delete({
      where: { orgId_id: { orgId: request.user.orgId, id } }
    });
    return { success: true };
  });

  // ==========================
  // Workflow Link API
  // ==========================

  fastify.post('/api/v1/products/:id/workflows', async (request, reply) => {
    const { id: productId } = request.params as any;
    const { workflowId, triggerType } = request.body as any;

    const pw = await prisma.productWorkflow.create({
      data: {
        orgId: request.user.orgId,
        productId,
        workflowId,
        triggerType: triggerType || 'on_interest'
      }
    });
    return { data: pw };
  });

  fastify.delete('/api/v1/products/:id/workflows/:workflowId', async (request, reply) => {
    const { id: productId, workflowId } = request.params as any;

    await prisma.productWorkflow.deleteMany({
      where: { orgId: request.user.orgId, productId, workflowId }
    });
    return { success: true };
  });

  // ==========================
  // Customer Product API
  // ==========================

  fastify.post('/api/v1/customers/:id/products', async (request, reply) => {
    const { id: customerId } = request.params as any;
    const { productId, interestLevel, budget, status, notes } = request.body as any;

    // Optional: Trigger Automation logic will be added here in phase 3

    const cp = await prisma.customerProduct.create({
      data: {
        orgId: request.user.orgId,
        customerId,
        productId,
        interestLevel,
        budget,
        status: status || 'new',
        notes
      }
    });
    return { data: cp };
  });

  fastify.put('/api/v1/customers/:id/products/:productId/status', async (request, reply) => {
    const { id: customerId, productId } = request.params as any;
    const { status, interestLevel, budget, notes } = request.body as any;

    const cp = await prisma.customerProduct.update({
      where: { customerId_productId: { customerId, productId } },
      data: { status, interestLevel, budget, notes }
    });
    return { data: cp };
  });

  fastify.delete('/api/v1/customers/:id/products/:productId', async (request, reply) => {
    const { id: customerId, productId } = request.params as any;

    await prisma.customerProduct.delete({
      where: { customerId_productId: { customerId, productId } }
    });
    return { success: true };
  });
}
