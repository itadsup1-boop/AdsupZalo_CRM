import { ref, computed } from 'vue';
import { api } from '@/api/index';
import { io, Socket } from 'socket.io-client';
import type { Contact } from '@/composables/use-contacts';
import { useAuthStore } from '@/stores/auth';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';

interface ZaloAccount {
  id: string;
  displayName: string | null;
}

export interface AiSentiment {
  label: 'positive' | 'neutral' | 'negative';
  confidence: number;
  reason: string;
}

export interface AiConfig {
  provider: string;
  model: string;
  maxDaily: number;
  enabled: boolean;
  hasAnthropicKey?: boolean;
  hasGeminiKey?: boolean;
}

interface ConversationMessage {
  content: string | null;
  contentType: string;
  senderType: string;
  sentAt: string;
  isDeleted: boolean;
}

export interface ReplyMessageRef {
  msgId: string;
  cliMsgId?: string;
  content: string;
  msgType: string;
  uidFrom: string;
  ts: string;
  propertyExt?: Record<string, unknown>;
  ttl?: number;
}

interface RawMessage extends Omit<Message, 'reactions' | 'reply'> {
  quote?: ReplyMessageRef | null;
  reactions?: Array<{ emoji: string; reactorId: string; count?: number; reacted?: boolean }>;
}

export interface Conversation {
  id: string;
  zaloAccountId: string;
  externalThreadId?: string;
  threadType: 'user' | 'group';
  contact: Contact | null;
  zaloAccount: ZaloAccount | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isReplied: boolean;
  isPinned?: boolean;
  aiPaused?: boolean;
  messages?: ConversationMessage[];
}

export interface MessageReactionView {
  emoji: string;
  count: number;
  reacted: boolean;
}

export interface Message {
  id: string;
  content: string | null;
  contentType: string;
  senderType: string;
  senderName: string | null;
  sentAt: string;
  isDeleted: boolean;
  zaloMsgId: string | null;
  albumKey: string | null;
  albumIndex: number | null;
  albumTotal: number | null;
  reply?: ReplyMessageRef | null;
  reactions?: MessageReactionView[];
  attachments?: any[];
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  duration?: number | null;
  size?: number | null;
}

// Module-level singleton so all components share the same state
const isMobileChatActive = ref(false);

export function useChat() {
  const conversations = ref<Conversation[]>([]);
  const selectedConvId = ref<string | null>(null);
  const messages = ref<Message[]>([]);
  const loadingConvs = ref(false);
  const loadingMsgs = ref(false);
  const sendingMsg = ref(false);
  const searchQuery = ref('');
  const accountFilter = ref<string | null>(null);
  const aiSuggestion = ref('');
  const aiSuggestionLoading = ref(false);
  const aiSuggestionError = ref('');
  const aiSummary = ref('');
  const aiSummaryLoading = ref(false);
  const aiSentiment = ref<AiSentiment | null>(null);
  const aiSentimentLoading = ref(false);
  const aiUsage = ref({ usedToday: 0, maxDaily: 500, remaining: 500, enabled: true });
  const aiConfig = ref<AiConfig>({ provider: 'anthropic', model: 'claude-sonnet-4-6', maxDaily: 500, enabled: true });
  let socket: Socket | null = null;
  const accountsReady = ref(false);
  const { accounts, fetchAccounts } = useZaloAccounts();

  const selectedConv = computed(() =>
    conversations.value.find(c => c.id === selectedConvId.value) || null,
  );

  function clearAiState() {
    aiSuggestion.value = '';
    aiSuggestionError.value = '';
    aiSummary.value = '';
    aiSentiment.value = null;
  }

  const extraFilters = ref<Record<string, string>>({});

  async function fetchConversations() {
    loadingConvs.value = true;
    try {
      const res = await api.get('/conversations', {
        params: {
          limit: 100,
          search: searchQuery.value,
          accountId: accountFilter.value || undefined,
          ...extraFilters.value,
        },
      });
      conversations.value = res.data.conversations;
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      loadingConvs.value = false;
    }
  }

  function normalizeMessage(message: RawMessage): Message {
    const counts = new Map<string, number>();
    for (const reaction of message.reactions || []) {
      counts.set(reaction.emoji, (counts.get(reaction.emoji) || 0) + 1);
    }
    const { reactions, quote, ...base } = message;
    return {
      ...base,
      reply: quote ?? null,
      reactions: Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count, reacted: false })),
    };
  }

  async function fetchMessages(convId: string) {
    loadingMsgs.value = true;
    try {
      const res = await api.get(`/conversations/${convId}/messages`, {
        params: { limit: 250 },
      });
      messages.value = (res.data.messages as RawMessage[]).map(normalizeMessage);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      loadingMsgs.value = false;
    }
  }

  async function fetchAiConfig() {
    try {
      const res = await api.get('/ai/config');
      aiConfig.value = {
        provider: res.data.provider,
        model: res.data.model,
        maxDaily: res.data.maxDaily,
        enabled: res.data.enabled,
        hasAnthropicKey: res.data.hasAnthropicKey,
        hasGeminiKey: res.data.hasGeminiKey,
      };
    } catch (err) {
      console.error('Failed to fetch AI config:', err);
    }
  }

  async function saveAiConfig(payload: AiConfig) {
    const res = await api.put('/ai/config', payload);
    aiConfig.value = {
      provider: res.data.provider,
      model: res.data.model,
      maxDaily: res.data.maxDaily,
      enabled: res.data.enabled,
      hasAnthropicKey: aiConfig.value.hasAnthropicKey,
      hasGeminiKey: aiConfig.value.hasGeminiKey,
    };
  }

  async function fetchAiUsage() {
    try {
      const res = await api.get('/ai/usage');
      aiUsage.value = res.data;
    } catch (err) {
      console.error('Failed to fetch AI usage:', err);
    }
  }

  async function generateAiSuggestion() {
    if (!selectedConvId.value) return;
    aiSuggestionLoading.value = true;
    aiSuggestionError.value = '';
    try {
      const res = await api.post('/ai/suggest', { conversationId: selectedConvId.value });
      let content = res.data.content || '';
      if (content.includes('[CANNOT_ANSWER]')) {
        content = 'AI không chắc chắn câu trả lời dựa trên kho kiến thức. Hệ thống đã tự động gắn thẻ "Cần nhân viên xử lý" và gửi thông báo cho nhân viên phụ trách.';
      }
      aiSuggestion.value = content;
      await fetchAiUsage();
    } catch (err: any) {
      aiSuggestionError.value = err.response?.data?.error || 'Không thể tạo gợi ý AI';
    } finally {
      aiSuggestionLoading.value = false;
    }
  }

  async function generateAiSummary() {
    if (!selectedConvId.value) return;
    aiSummaryLoading.value = true;
    try {
      const res = await api.post(`/ai/summarize/${selectedConvId.value}`);
      aiSummary.value = res.data.content || '';
      await fetchAiUsage();
    } catch (err) {
      console.error('Failed to summarize conversation:', err);
    } finally {
      aiSummaryLoading.value = false;
    }
  }

  async function generateAiSentiment() {
    if (!selectedConvId.value) return;
    aiSentimentLoading.value = true;
    try {
      const res = await api.post(`/ai/sentiment/${selectedConvId.value}`);
      aiSentiment.value = res.data;
      await fetchAiUsage();
    } catch (err) {
      console.error('Failed to analyze sentiment:', err);
    } finally {
      aiSentimentLoading.value = false;
    }
  }

  async function pauseConversationAi(convId: string) {
    try {
      await api.post(`/conversations/${convId}/ai/pause`, {});
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) conv.aiPaused = true;
    } catch (err) {
      console.error('Failed to pause AI:', err);
    }
  }

  async function resumeConversationAi(convId: string) {
    try {
      await api.post(`/conversations/${convId}/ai/resume`, {});
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) conv.aiPaused = false;
    } catch (err) {
      console.error('Failed to resume AI:', err);
    }
  }

  async function handoverConversationToStaff(convId: string) {
    try {
      await api.post(`/conversations/${convId}/ai/handover`, {});
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) conv.aiPaused = true;
    } catch (err) {
      console.error('Failed to handover to staff:', err);
    }
  }

  async function selectConversation(convId: string) {
    selectedConvId.value = convId;
    clearAiState();
    await fetchMessages(convId);
    try {
      const convDetail = await api.get(`/conversations/${convId}`);
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) {
        if (convDetail.data.contact) conv.contact = convDetail.data.contact;
        conv.aiPaused = convDetail.data.aiPaused;
      }
    } catch {
      // Non-critical
    }
    try {
      await api.post(`/conversations/${convId}/mark-read`);
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) conv.unreadCount = 0;
    } catch {
      // Ignore mark-read errors
    }
    await Promise.allSettled([generateAiSummary(), generateAiSentiment(), fetchAiUsage()]);
  }

  // Helper to locally update the conversation list without doing a full fetch
  // This ensures the UI instantly updates without needing to wait for a full list reload from the server.
  function updateConversationListLocally(conversationId: string, message: any) {
    const index = conversations.value.findIndex(c => c.id === conversationId);
    if (index !== -1) {
      const conv = conversations.value[index];
      
      // Update preview snippet
      if (!conv.messages) conv.messages = [];
      conv.messages[0] = {
        id: message.id,
        zaloMsgId: message.zaloMsgId,
        senderUid: message.senderUid,
        senderName: message.senderName,
        content: message.content,
        contentType: message.contentType,
        senderType: message.senderType,
        sentAt: message.sentAt,
        isDeleted: message.isDeleted,
        reactions: message.reactions
      } as any;
      
      // Update timestamp
      conv.lastMessageAt = message.sentAt;
      
      // Update read/reply status based on who sent it
      if (message.senderType === 'self') {
        conv.isReplied = true;
        conv.unreadCount = 0;
      } else {
        conv.isReplied = false;
        if (conversationId !== selectedConvId.value) {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
        } else {
          conv.unreadCount = 0;
        }
      }

      // Tránh dùng splice/unshift trên Proxy của Vue 3 vì nó gây lag/đứng UI (nó kích hoạt tracker trên toàn bộ index mảng)
      // Thay vào đó, tạo một mảng mới hoàn toàn và gán lại (re-assign)
      const newList = conversations.value.filter(c => c.id !== conversationId);
      
      // Xử lý giữ nguyên các hội thoại đã ghim (Pin) ở trên cùng
      if (conv.isPinned) {
        newList.unshift(conv);
      } else {
        // Tìm vị trí của hội thoại không ghim đầu tiên
        const firstUnpinnedIndex = newList.findIndex(c => !c.isPinned);
        if (firstUnpinnedIndex === -1) {
          newList.push(conv);
        } else {
          newList.splice(firstUnpinnedIndex, 0, conv);
        }
      }
      
      conversations.value = newList;
    } else {
      // Nếu có tin nhắn từ người mới (chưa có trong danh sách hiện tại),
      // bắt buộc phải tải lại danh sách từ server để lấy tên, avatar...
      fetchConversations();
    }
  }

  async function sendMessage(content: string, replyMessageId?: string | null) {
    if (!selectedConvId.value || !content.trim()) return;
    await sendMessageTo(selectedConvId.value, content, replyMessageId);
  }

  async function sendMessageTo(conversationId: string, content: string, replyMessageId?: string | null) {
    if (!content.trim()) return;
    sendingMsg.value = true;
    try {
      const payload = replyMessageId ? { content, replyMessageId } : { content };
      const res = await api.post(`/conversations/${conversationId}/messages`, payload);
      if (conversationId === selectedConvId.value) {
        if (!messages.value.find(m => m.id === res.data.id)) {
          messages.value.push(res.data);
        }
      }
      // Instantly update the left sidebar
      updateConversationListLocally(conversationId, res.data);
    } catch (err) {
      console.error('Failed to send message:', err);
      throw err;
    } finally {
      sendingMsg.value = false;
    }
  }

  async function sendVoiceMessage(audioBlob: Blob, durationMs: number = 0) {
    if (!selectedConvId.value) return;
    sendingMsg.value = true;
    try {
      const formData = new FormData();
      const extensionByMime: Record<string, string> = {
        'audio/webm': 'webm',
        'audio/ogg': 'ogg',
        'audio/mp4': 'm4a',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
      };
      const baseMime = audioBlob.type.split(';')[0].toLowerCase();
      const extension = extensionByMime[baseMime] || 'webm';
      formData.append('file', audioBlob, `voice_message.${extension}`);
      if (durationMs > 0) {
        formData.append('duration', durationMs.toString());
      }
      
      const res = await api.post(`/conversations/${selectedConvId.value}/send-audio`, formData);
      if (!messages.value.find(m => m.id === res.data.id)) {
        messages.value.push(res.data);
      }
      updateConversationListLocally(selectedConvId.value, res.data);
    } catch (err) {
      console.error('Failed to send voice message:', err);
      const message = (err as any)?.response?.data?.error || 'Không gửi được tin nhắn thoại. Vui lòng thử lại.';
      alert(message);
      throw err;
    } finally {
      sendingMsg.value = false;
    }
  }

  async function sendFileMessage(files: FileList | File[]) {
    if (!selectedConvId.value || !files.length) return;
    sendingMsg.value = true;
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('file', files[i]); // Note: backend expects 'file' for fastify-multipart request.files() if configured or just loops over parts
      }
      
      const res = await api.post(`/conversations/${selectedConvId.value}/file`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      if (!messages.value.find(m => m.id === res.data.id)) {
        messages.value.push(res.data);
      }
      updateConversationListLocally(selectedConvId.value, res.data);
    } catch (err) {
      console.error('Failed to send files:', err);
      throw err;
    } finally {
      sendingMsg.value = false;
    }
  }

  function playNotificationSound() {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      // First ding (C5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
      gain1.gain.setValueAtTime(0, ctx.currentTime);
      gain1.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.2);

      // Second ding (E5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.1);
      gain2.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.1);
      osc2.stop(ctx.currentTime + 0.4);
    } catch (err) {
      console.error('Audio playback failed', err);
    }
  }

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function subscribeToPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Get the server's public key (hardcoded or from config)
      const publicKey = 'BIoqjUVwIrPgvs_3tSHzeHgqkdczA-riw3xjfgAIpK_IxqAq9-aXu9vvQBxEpnaCXM-71NSBKk0gtKmhcrvbquI';
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      // Send subscription to backend
      const subJSON = subscription.toJSON();
      await api.post('/notifications/subscribe', {
        endpoint: subJSON.endpoint,
        keys: subJSON.keys
      });
      
      console.log('[push] Subscribed successfully');
    } catch (err) {
      console.error('[push] Failed to subscribe:', err);
    }
  }

  function requestNotificationPermission() {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            subscribeToPushNotifications();
          }
        });
      } else if (Notification.permission === 'granted') {
        subscribeToPushNotifications();
      }
    }
  }

  function showBrowserNotification(message: any, conversationId: string) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    
    // Don't show notification if user is actively looking at this exact chat
    if (document.visibilityState === 'visible' && selectedConvId.value === conversationId) {
      return; 
    }

    let title = message.senderName || 'Tin nhắn mới';
    let bodyText = message.content || 'Bạn có tin nhắn mới';
    
    if (message.contentType !== 'text' && message.contentType !== 'text_link') {
       bodyText = `[${message.contentType}]`;
    } else if (bodyText.length > 80) {
       bodyText = bodyText.substring(0, 80) + '...';
    }

    try {
      const notification = new Notification(title, {
        body: bodyText,
        icon: '/pwa-192x192.png', 
        tag: 'zalo-msg-' + conversationId,
      });

      notification.onclick = () => {
        window.focus();
        if (selectedConvId.value !== conversationId) {
          selectConversation(conversationId);
        }
        notification.close();
      };
    } catch (e) {
      console.error('Browser notification error', e);
    }
  }

  async function registerFcmToken(token: string) {
    try {
      await api.post('/notifications/fcm/register', {
        token,
        deviceInfo: `Android App (${navigator.userAgent})`
      });
      console.log('[fcm] Token registered successfully on backend');
    } catch (err) {
      console.error('[fcm] Failed to register token on backend:', err);
    }
  }

  function initAndroidFcmListener() {
    if (typeof window !== 'undefined') {
      // 1. Khai báo callback toàn cục để Android Gọi xuống
      (window as any).onFcmTokenReceived = function(token: string) {
        console.log('[AndroidBridge] FCM Token Received:', token);
        localStorage.setItem('fcm_token', token);
        registerFcmToken(token);
      };

      // 2. Chủ động kiểm tra cầu nối Javascript Interface
      try {
        const bridge = (window as any).AndroidBridge;
        if (bridge && typeof bridge.getFcmToken === 'function') {
          const token = bridge.getFcmToken();
          if (token) {
            localStorage.setItem('fcm_token', token);
            registerFcmToken(token);
          }
        }
      } catch (e) {
        // Bỏ qua nếu chạy trong trình duyệt desktop thông thường
      }
    }
  }

  function initSocket() {
    // Tự động kích hoạt lắng nghe Firebase trên Android WebView
    initAndroidFcmListener();
    // Fetch accounts and mark ready so socket guard can validate accountId
    fetchAccounts().then(() => {
      accountsReady.value = true;
    }).catch(() => {});

    socket = io({
      transports: ['websocket', 'polling'],
      auth: { token: localStorage.getItem('token') }
    });

    // Join org-scoped room immediately on connect — CRITICAL for multi-tenant isolation
    // Without this, the client receives socket events from ALL organizations
    socket.on('connect', () => {
      const auth = useAuthStore();
      const orgId = auth.user?.orgId;
      if (orgId) {
        socket!.emit('org:join', { orgId });
      }
      socket!.emit('user:join');
    });

    socket.on('chat:message', (data: { message: Message; conversationId: string; accountId?: string }) => {
      const targetAccountId = data.accountId;
      const auth = useAuthStore();
      const isAdmin = auth.user?.role === 'admin' || auth.user?.role === 'owner';

      // For non-admin users: strictly enforce account-level access control.
      // Block events if accounts haven't loaded yet (race condition guard) OR
      // if the target account is not in user's allowed list.
      if (!isAdmin) {
        if (!accountsReady.value) {
          // Accounts list not ready yet — silently discard to prevent race-condition leaks.
          console.debug(`[Socket] Deferred chat:message — accounts not ready yet.`);
          return;
        }
        if (targetAccountId) {
          const hasAccess = accounts.value.some(acc => acc.id === targetAccountId);
          if (!hasAccess) {
            console.warn(`[Socket] Blocked chat:message for unauthorized account ${targetAccountId}`);
            return;
          }
        }
      }

      // Play sound and show notification if message is not from self
      if (data.message.senderType !== 'self') {
        playNotificationSound();
        showBrowserNotification(data.message, data.conversationId);
      }

      if (data.conversationId === selectedConvId.value) {
        if (!messages.value.find(m => m.id === data.message.id)) {
          messages.value.push(normalizeMessage(data.message as RawMessage));
        }
      }
      
      // Update locally instead of fetching the whole list to prevent UI jitter
      updateConversationListLocally(data.conversationId, data.message);
      // fetchConversations(); // Ghi chú: Đã thay thế bằng updateConversationListLocally để mượt hơn
    });

    socket.on('chat:deleted', (data: { conversationId?: string; messageId?: string; zaloMsgId?: string; content?: string }) => {
      if (data.conversationId && !conversations.value.some(c => c.id === data.conversationId)) return;
      const msg = messages.value.find(m => m.id === data.messageId || m.zaloMsgId === data.zaloMsgId);
      if (msg) {
        msg.isDeleted = true;
        if (data.content) msg.content = data.content;
      }
    });

    socket.on('chat:message-edited', (data: { conversationId?: string; messageId?: string; zaloMsgId?: string; content: string }) => {
      if (data.conversationId && !conversations.value.some(c => c.id === data.conversationId)) return;
      const msg = messages.value.find(m => m.id === data.messageId || m.zaloMsgId === data.zaloMsgId);
      if (msg) msg.content = data.content;
    });

    socket.on('chat:reactions', (data: { conversationId?: string; messageId?: string; msgId?: string; zaloMsgId?: string; reactions: { userId: string; userName: string; reaction: string; action: 'add' | 'remove' }[] }) => {
      if (data.conversationId && !conversations.value.some(c => c.id === data.conversationId)) return;
      const msg = messages.value.find(m => m.id === data.messageId || m.id === data.msgId || m.zaloMsgId === data.zaloMsgId);
      if (!msg) return;
      const counts = new Map<string, number>();
      for (const reaction of data.reactions) {
        const emoji = reaction.reaction;
        if (reaction.action === 'add') counts.set(emoji, (counts.get(emoji) || 0) + 1);
        if (reaction.action === 'remove') counts.delete(emoji);
      }
      msg.reactions = Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count, reacted: false }));
    });

    socket.on('chat:pinned', (data?: { conversationId?: string }) => {
      if (data?.conversationId && !conversations.value.some(c => c.id === data.conversationId)) return;
      fetchConversations();
    });

    socket.on('chat:unpinned', (data?: { conversationId?: string }) => {
      if (data?.conversationId && !conversations.value.some(c => c.id === data.conversationId)) return;
      fetchConversations();
    });

    socket.on('chat:ai-status', (data: { conversationId: string; aiPaused: boolean }) => {
      const conv = conversations.value.find(c => c.id === data.conversationId);
      if (conv) {
        conv.aiPaused = data.aiPaused;
      }
    });
  }

  function destroySocket() {
    socket?.disconnect();
    socket = null;
  }

  return {
    conversations,
    selectedConvId,
    selectedConv,
    messages,
    loadingConvs,
    loadingMsgs,
    sendingMsg,
    searchQuery,
    accountFilter,
    extraFilters,
    aiSuggestion,
    aiSuggestionLoading,
    aiSuggestionError,
    aiSummary,
    aiSummaryLoading,
    aiSentiment,
    aiSentimentLoading,
    aiUsage,
    aiConfig,
    fetchConversations,
    fetchAiConfig,
    saveAiConfig,
    fetchAiUsage,
    fetchMessages,
    selectConversation,
    sendMessage,
    sendMessageTo,
    sendVoiceMessage,
    sendFileMessage,
    generateAiSuggestion,
    pauseConversationAi,
    resumeConversationAi,
    handoverConversationToStaff,
    generateAiSummary,
    generateAiSentiment,
    clearAiState,
    isMobileChatActive,
    initSocket,
    destroySocket,
    getSocket: () => socket,
    requestNotificationPermission,
    initAndroidFcmListener,
  };
}
