/**
 * Composable for Zalo account management logic:
 * - CRUD operations via REST API
 * - Real-time QR login flow via Socket.IO
 */
import { ref, onUnmounted } from 'vue';
import { api } from '@/api/index';
import { io, Socket } from 'socket.io-client';

export interface ZaloAccount {
  id: string;
  displayName: string | null;
  zaloUid: string | null;
  status: string;
  liveStatus?: string;
  phone: string | null;
  hasSession?: boolean;
  ownerUserId: string;
  createdAt: string;
  lastConnectedAt?: string | null;
  disconnectedAt?: string | null;
  lastReconnectAt?: string | null;
  connectionError?: string | null;
}

export function useZaloAccounts() {
  const accounts = ref<ZaloAccount[]>([]);
  const loading = ref(false);
  const adding = ref(false);
  const deleting = ref(false);
  const loginLoading = ref('');
  const reconnectLoading = ref('');
  const fetchError = ref('');
  const lastFetchedAt = ref<string | null>(null);

  // QR dialog state
  const showQRDialog = ref(false);
  const qrImage = ref('');
  const qrScanned = ref(false);
  const scannedName = ref('');
  const qrError = ref('');
  const currentLoginAccountId = ref('');

  let socket: Socket | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  function displayStatus(account: Pick<ZaloAccount, 'liveStatus' | 'status'>) {
    return account.liveStatus || account.status || 'disconnected';
  }

  function statusColor(status?: string) {
    switch (status || 'disconnected') {
      case 'connected': return 'success';
      case 'qr_pending': return 'warning';
      case 'need_qr': return 'warning';
      case 'connecting': return 'info';
      case 'reconnecting': return 'info';
      case 'recovering': return 'info';
      case 'unhealthy': return 'info';
      case 'hydrating': return 'info';
      default: return 'error';
    }
  }

  function statusText(status?: string) {
    switch (status || 'disconnected') {
      case 'connected': return 'Đã kết nối';
      case 'qr_pending': return 'Chờ QR';
      case 'need_qr': return 'Cần quét QR';
      case 'connecting': return 'Đang kết nối...';
      case 'reconnecting': return 'Đang kết nối lại...';
      case 'recovering': return 'Đang khôi phục...';
      case 'unhealthy': return 'Đang khôi phục...';
      case 'hydrating': return 'Đang đồng bộ...';
      case 'disconnected': return 'Mất kết nối';
      case 'error': return 'Lỗi kết nối';
      default: return status || 'Ngắt kết nối';
    }
  }

  function setLocalStatus(accountId: string, status: string) {
    accounts.value = accounts.value.map((account) =>
      account.id === accountId ? { ...account, liveStatus: status, status } : account,
    );
  }

  async function fetchAccounts(options: { silent?: boolean } = {}) {
    if (!options.silent) loading.value = true;
    try {
      const res = await api.get('/zalo-accounts');
      accounts.value = res.data;
      fetchError.value = '';
      lastFetchedAt.value = new Date().toISOString();
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
      fetchError.value = 'Không tải được trạng thái Zalo. Hệ thống sẽ tự thử lại.';
    } finally {
      if (!options.silent) loading.value = false;
    }
  }

  async function addAccount(displayName: string) {
    adding.value = true;
    try {
      await api.post('/zalo-accounts', { displayName: displayName || undefined });
      await fetchAccounts();
      return true;
    } catch (err: any) {
      console.error('Failed to add account:', err);
      return false;
    } finally {
      adding.value = false;
    }
  }

  async function loginAccount(accountId: string) {
    if (loginLoading.value || reconnectLoading.value) return;
    loginLoading.value = accountId;
    currentLoginAccountId.value = accountId;
    qrImage.value = '';
    qrScanned.value = false;
    scannedName.value = '';
    qrError.value = '';
    showQRDialog.value = true;
    setLocalStatus(accountId, 'connecting');
    socket?.emit('zalo:subscribe', { accountId });
    try {
      await api.post(`/zalo-accounts/${accountId}/login`, {});
      await fetchAccounts({ silent: true });
    } catch (err: any) {
      qrError.value = err.response?.data?.error || 'Không thể bắt đầu đăng nhập';
      await fetchAccounts({ silent: true });
    } finally {
      loginLoading.value = '';
    }
  }

  async function reconnectAccount(accountId: string) {
    if (loginLoading.value || reconnectLoading.value) return;
    reconnectLoading.value = accountId;
    setLocalStatus(accountId, 'reconnecting');
    try {
      await api.post(`/zalo-accounts/${accountId}/reconnect`, {});
      await fetchAccounts({ silent: true });
    } catch (err: any) {
      console.error('Reconnect failed:', err);
      await fetchAccounts({ silent: true });
    } finally {
      reconnectLoading.value = '';
    }
  }

  async function deleteAccount(account: ZaloAccount) {
    deleting.value = true;
    try {
      await api.delete(`/zalo-accounts/${account.id}`);
      await fetchAccounts();
      return true;
    } catch (err: any) {
      console.error('Delete failed:', err);
      return false;
    } finally {
      deleting.value = false;
    }
  }

  function cancelQR() {
    showQRDialog.value = false;
    qrImage.value = '';
    qrScanned.value = false;
    scannedName.value = '';
    qrError.value = '';
    socket?.emit('zalo:unsubscribe', { accountId: currentLoginAccountId.value });
    currentLoginAccountId.value = '';
    fetchAccounts({ silent: true });
  }

  function startAutoRefresh(intervalMs = 15000) {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      fetchAccounts({ silent: true });
    }, intervalMs);
  }

  function setupSocket() {
    if (socket) return;
    socket = io({
      transports: ['websocket', 'polling'],
      auth: { token: localStorage.getItem('token') }
    });
    socket.on('connect', () => {
      socket!.emit('user:join');
    });

    socket.on('zalo:qr', (data: { accountId: string; qrImage: string }) => {
      setLocalStatus(data.accountId, 'qr_pending');
      if (data.accountId === currentLoginAccountId.value) qrImage.value = data.qrImage;
    });

    socket.on('zalo:scanned', (data: { accountId: string; displayName: string }) => {
      setLocalStatus(data.accountId, 'connecting');
      if (data.accountId === currentLoginAccountId.value) {
        qrImage.value = '';
        qrScanned.value = true;
        scannedName.value = data.displayName;
      }
    });

    socket.on('zalo:connected', (data: { accountId: string }) => {
      setLocalStatus(data.accountId, 'connected');
      showQRDialog.value = false;
      fetchAccounts({ silent: true });
    });

    socket.on('zalo:disconnected', (data: { accountId: string }) => {
      setLocalStatus(data.accountId, 'disconnected');
      fetchAccounts({ silent: true });
    });

    socket.on('zalo:recovering', (data: { accountId: string }) => {
      setLocalStatus(data.accountId, 'recovering');
      fetchAccounts({ silent: true });
    });

    socket.on('zalo:error', (data: { accountId: string; error: string }) => {
      if (data.accountId === currentLoginAccountId.value) qrError.value = data.error;
      setLocalStatus(data.accountId, 'error');
      fetchAccounts({ silent: true });
    });

    socket.on('zalo:qr-expired', (data: { accountId: string }) => {
      if (data.accountId === currentLoginAccountId.value) {
        qrImage.value = '';
        qrError.value = 'QR đã hết hạn, đang tạo lại...';
      }
    });

    socket.on('zalo:reconnect-failed', (data: { accountId: string; isNetworkError?: boolean }) => {
      setLocalStatus(data.accountId, data.isNetworkError ? 'recovering' : 'qr_pending');
      fetchAccounts({ silent: true });
    });
  }

  onUnmounted(() => {
    if (refreshTimer) clearInterval(refreshTimer);
    socket?.disconnect();
    socket = null;
  });

  return {
    accounts, loading, adding, deleting, loginLoading, reconnectLoading, fetchError, lastFetchedAt,
    showQRDialog, qrImage, qrScanned, scannedName, qrError,
    displayStatus, statusColor, statusText,
    fetchAccounts, addAccount, loginAccount, reconnectAccount, deleteAccount,
    cancelQR, setupSocket, startAutoRefresh,
  };
}
