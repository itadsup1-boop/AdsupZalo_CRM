import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { emitToConversationRooms } from '../../shared/utils/permission-scope.js';

let clientSocket: tls.TLSSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;
let globalIo: Server | null = null;
let buffer = '';
let heartbeatInterval: NodeJS.Timeout | null = null;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (isAgentConnected()) {
      sendToAgent({ event: 'ping' });
    }
  }, 10000); // 10s heartbeat to keep connection alive
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Resolves paths to SSL certificates by checking different directory levels
 */
function getCertPaths() {
  const possiblePaths = [
    {
      cert: path.join(process.cwd(), 'certs/zalo_cert.pem'),
      key: path.join(process.cwd(), 'certs/zalo_key.pem')
    },
    {
      cert: path.join(process.cwd(), 'backend/certs/zalo_cert.pem'),
      key: path.join(process.cwd(), 'backend/certs/zalo_key.pem')
    }
  ];

  for (const paths of possiblePaths) {
    if (fs.existsSync(paths.cert) && fs.existsSync(paths.key)) {
      return paths;
    }
  }

  // Fallback to absolute paths based on default location
  return {
    cert: '/home/ok/Code/ZaloCRM-main (1)/ZaloCRM-main/backend/certs/zalo_cert.pem',
    key: '/home/ok/Code/ZaloCRM-main (1)/ZaloCRM-main/backend/certs/zalo_key.pem'
  };
}

/**
 * Initializes and starts the connection to the external Agent Master.
 */
export function startAgentSocketClient(io: Server) {
  globalIo = io;
  if (!config.agentSocketEnabled) {
    logger.info('[AgentSocket] External AI Agent Socket is disabled by configuration.');
    return;
  }

  connectToAgent();
}

/**
 * Establishes the secure SSL/TLS connection.
 */
function connectToAgent() {
  if (clientSocket) {
    clientSocket.destroy();
    clientSocket = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  const certs = getCertPaths();
  logger.info(`[AgentSocket] Loading certs: cert=${certs.cert}, key=${certs.key}`);

  if (!fs.existsSync(certs.cert) || !fs.existsSync(certs.key)) {
    logger.error(`[AgentSocket] Certificate files not found. Cannot start connection.`);
    scheduleReconnect();
    return;
  }

  logger.info(`[AgentSocket] Connecting to Agent Master at ${config.agentSocketHost}:${config.agentSocketPort}...`);

  try {
    clientSocket = tls.connect(
      {
        host: config.agentSocketHost,
        port: config.agentSocketPort,
        cert: fs.readFileSync(certs.cert),
        key: fs.readFileSync(certs.key),
        rejectUnauthorized: false, // Bypassing authorization for self-signed certificates
      },
      () => {
        logger.info('[AgentSocket] Secure connection established with Agent Master!');
        buffer = ''; // Reset buffer on fresh connection
        startHeartbeat(); // Start periodic pinging to avoid timeouts
      }
    );

    clientSocket.on('data', (chunk) => {
      handleSocketData(chunk);
    });

    clientSocket.on('close', () => {
      logger.warn('[AgentSocket] Connection closed. Reconnecting in 5s...');
      stopHeartbeat();
      scheduleReconnect();
    });

    clientSocket.on('error', (err) => {
      logger.error('[AgentSocket] TLS Socket error:', err.message);
      stopHeartbeat();
    });
  } catch (err: any) {
    logger.error('[AgentSocket] Connection setup failed:', err.message);
    scheduleReconnect();
  }
}

/**
 * Schedules reconnection after a delay.
 */
function scheduleReconnect() {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connectToAgent();
  }, 5000);
}

/**
 * Buffers and parses JSON objects out of raw stream chunks using brace matching.
 */
function handleSocketData(chunk: any) {
  buffer += chunk.toString();
  while (true) {
    const startIdx = buffer.indexOf('{');
    if (startIdx === -1) {
      buffer = '';
      break;
    }

    let braceCount = 0;
    let endIdx = -1;
    for (let i = startIdx; i < buffer.length; i++) {
      if (buffer[i] === '{') {
        braceCount++;
      } else if (buffer[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx !== -1) {
      const jsonStr = buffer.slice(startIdx, endIdx + 1);
      buffer = buffer.slice(endIdx + 1);
      try {
        const payload = JSON.parse(jsonStr);
        handleIncomingSocketMessage(payload).catch((err) => {
          logger.error('[AgentSocket] Error handling payload message:', err);
        });
      } catch (err) {
        logger.error('[AgentSocket] Failed to parse JSON chunk:', jsonStr, err);
      }
    } else {
      break; // Incomplete JSON payload, wait for next chunks
    }
  }
}

/**
 * Handles incoming JSON messages received from the master agent.
 */
async function handleIncomingSocketMessage(payload: any) {
  logger.info(`[AgentSocket] Incoming message event: ${payload?.event}`);
  
  if (payload?.event === 'reply_message') {
    const { conversation_id, reply } = payload.data || {};
    if (!conversation_id || !reply?.content) {
      logger.warn('[AgentSocket] Invalid reply_message payload structure.');
      return;
    }

    logger.warn(`[AgentSocket] Blocked autonomous AI reply for conversation ${conversation_id}. Auto-reply is locked off.`);
  }
}

/**
 * Checks if the secure agent socket is currently active and connected.
 */
export function isAgentConnected(): boolean {
  return !!(clientSocket && !clientSocket.destroyed && clientSocket.writable);
}

/**
 * Sends a message payload to the master agent.
 */
export function sendToAgent(payload: any): boolean {
  if (isAgentConnected() && clientSocket) {
    try {
      clientSocket.write(JSON.stringify(payload) + '\n');
      return true;
    } catch (err) {
      logger.error('[AgentSocket] Error writing to socket:', err);
      return false;
    }
  }
  return false;
}
