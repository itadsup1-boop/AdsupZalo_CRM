import client from 'prom-client';

// 7.1 Metrics Dashboard
export const metrics = {
  // Số lượng trình duyệt đang hoạt động
  activeBrowsers: new client.Gauge({
    name: 'zalo_active_browsers',
    help: 'Number of active Zalo browser nodes',
  }),

  // Tốc độ tin nhắn (Messages per minute)
  messagesProcessed: new client.Counter({
    name: 'zalo_messages_total',
    help: 'Total number of messages processed',
    labelNames: ['status'] // success, failed
  }),

  // Tỷ lệ Reconnect
  reconnectAttempts: new client.Counter({
    name: 'zalo_reconnect_total',
    help: 'Total number of reconnection attempts',
  }),

  // Tỷ lệ Sync thất bại
  syncFailures: new client.Counter({
    name: 'zalo_sync_failures_total',
    help: 'Total number of failed sync events',
  }),

  // Hệ thống thu thập mặc định (CPU, RAM, Event Loop)
  collectDefaultMetrics: () => {
    client.collectDefaultMetrics();
  },

  // Export dữ liệu cho Prometheus
  getMetrics: async () => {
    return await client.register.metrics();
  },
  
  contentType: client.register.contentType
};

metrics.collectDefaultMetrics();
