import amqp, { Channel, Connection } from 'amqplib';
import { logger } from '../utils/logger.js';
import { config } from '../../config/index.js';

class QueueService {
  private connection: Connection | null = null;
  private channel: Channel | null = null;

  async init() {
    try {
      // @ts-ignore - rabbitUrl might be missing in config type but exists in env
      const url = config.rabbitUrl || 'amqp://localhost';
      this.connection = await amqp.connect(url);
      if (this.connection) {
        this.channel = await this.connection.createChannel();
      }

      if (!this.channel) return;

      // 1. Setup Queues and Dead Letter Exchange
      const DLX = 'zalo_dlx';
      const MAIN_QUEUE = 'zalo_ingestion_queue';
      const RETRY_QUEUE = 'zalo_retry_queue';

      await this.channel.assertExchange(DLX, 'direct', { durable: true });

      // Main Queue
      await this.channel.assertQueue(MAIN_QUEUE, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': DLX }
      });

      // Retry Queue (Exponential Backoff)
      await this.channel.assertQueue(RETRY_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': MAIN_QUEUE,
          'x-message-ttl': 30000 // 30s
        }
      });

      logger.info('[queue:service] RabbitMQ Queues initialized');
    } catch (err) {
      logger.error('[queue:service] Failed to connect to RabbitMQ:', err);
    }
  }

  async publish(queue: string, data: any) {
    if (!this.channel) return false;
    return this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), {
      persistent: true
    });
  }

  async consume(queue: string, processor: (data: any) => Promise<void>) {
    if (!this.channel) return;
    
    await this.channel.prefetch(10); // Handle 10 messages at a time
    this.channel.consume(queue, async (msg) => {
      if (!msg) return;
      
      try {
        const data = JSON.parse(msg.content.toString());
        await processor(data);
        this.channel?.ack(msg);
      } catch (err) {
        logger.error(`[queue:consume] Error processing ${queue}:`, err);
        // Retry logic or move to DLQ
        this.channel?.nack(msg, false, false); 
      }
    });
  }
}

export const queueService = new QueueService();
