<template>
  <div class="mobile-chat" :class="{ 'chat-active': !!selectedConvId }">
    <!-- Conversation list (shown when no conversation selected) -->
    <div v-if="!selectedConvId" style="height: 100%;">
      <ConversationList
        :conversations="conversations"
        :selected-id="selectedConvId"
        :loading="loadingConvs"
        v-model:search="searchQuery"
        @select="selectConversation"
        @filter-account="onFilterAccount"
      />
    </div>

    <!-- Message thread (shown when conversation selected) -->
    <div v-else style="height: 100%; display: flex; flex-direction: column;">
      <!-- Back button bar -->
      <div class="d-flex align-center pa-2" style="flex-shrink: 0;">
        <v-btn icon variant="text" size="small" @click="goBack">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <span v-if="selectedConv" class="text-body-2 font-weight-medium ml-1">
          {{ selectedConv.contact?.fullName || 'Chat' }}
        </span>
      </div>

      <MessageThread
        :conversation="selectedConv"
        :messages="allMessages"
        :loading="loadingMsgs"
        :sending="sendingMsg"
        :show-contact-panel="showContactPanel"
        :ai-suggestion="(null as any)"
        :ai-suggestion-loading="false"
        :ai-suggestion-error="(null as any)"
        @send="handleSend"
        @send-voice="sendVoiceMessage"
        @send-file="sendFileMessage"
        @toggle-contact-panel="handleToggleContactPanel"
        @refresh-thread="selectedConvId && fetchMessages(selectedConvId)"
        style="flex: 1; min-height: 0;"
      />
    </div>

    <!-- Contact Details Overlay -->
    <v-dialog v-model="showContactPanel" fullscreen transition="dialog-bottom-transition">
      <v-card style="display: flex; flex-direction: column; height: 100vh;">
        <v-toolbar color="surface" flat style="border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.1);">
          <v-btn icon @click="showContactPanel = false">
            <v-icon>mdi-arrow-left</v-icon>
          </v-btn>
          <v-toolbar-title class="text-subtitle-1 font-weight-bold">Thông tin khách hàng</v-toolbar-title>
        </v-toolbar>
        
        <v-card-text class="pa-0 flex-grow-1 overflow-y-auto">
          <ChatContactPanel
            v-if="selectedConv?.contact"
            :contact-id="selectedConv.contact.id"
            :contact="selectedConv.contact"
            :ai-summary="aiSummary"
            :ai-summary-loading="aiSummaryLoading"
            :ai-sentiment="aiSentiment"
            :ai-sentiment-loading="aiSentimentLoading"
            @refresh-ai-summary="generateAiSummary"
            @refresh-ai-sentiment="generateAiSentiment"
            @close="showContactPanel = false"
            @saved="fetchConversations()"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch, computed, ref } from 'vue';
import ConversationList from '@/components/chat/ConversationList.vue';
import MessageThread from '@/components/chat/MessageThread.vue';
import ChatContactPanel from '@/components/chat/ChatContactPanel.vue';
import { useChat } from '@/composables/use-chat';
import { useOfflineQueue } from '@/composables/use-offline-queue';

const {
  conversations, selectedConvId, selectedConv, messages,
  loadingConvs, loadingMsgs, sendingMsg, searchQuery, accountFilter,
  aiSummary, aiSummaryLoading, aiSentiment, aiSentimentLoading,
  fetchConversations, fetchMessages, selectConversation, sendMessage, sendMessageTo, sendVoiceMessage, sendFileMessage,
  generateAiSummary, generateAiSentiment,
  initSocket, destroySocket,
  isMobileChatActive,
} = useChat();

// Sync global state for layout
watch(selectedConvId, (val) => {
  isMobileChatActive.value = !!val;
}, { immediate: true });

const showContactPanel = ref(false);

function handleToggleContactPanel() {
  showContactPanel.value = !showContactPanel.value;
}

const { pendingMessages, enqueue, flush } = useOfflineQueue();

function onFilterAccount(id: string | null) {
  accountFilter.value = id;
  fetchConversations();
}

function goBack() {
  selectedConvId.value = null;
}

// Merge real messages with pending offline messages
const allMessages = computed(() => {
  const pending = pendingMessages.value
    .filter(p => p.conversationId === selectedConvId.value)
    .map(p => ({
      id: p.id,
      content: p.content,
      contentType: 'text',
      senderType: 'self',
      senderName: null,
      sentAt: p.createdAt,
      isDeleted: false,
      zaloMsgId: null,
      albumKey: null,
      albumIndex: null,
      albumTotal: null,
      _pending: true,
    }));
  return [...messages.value, ...pending];
});

async function handleSend(content: string, replyMessageId?: string | null) {
  if (!selectedConvId.value) return;
  if (!navigator.onLine) {
    enqueue(selectedConvId.value, content);
    return;
  }
  await sendMessage(content, replyMessageId);
}

// Flush queue when coming back online
function onOnline() {
  flush(sendMessageTo);
}

onMounted(() => {
  fetchConversations();
  initSocket();
  window.addEventListener('online', onOnline);
});

onUnmounted(() => {
  destroySocket();
  window.removeEventListener('online', onOnline);
  clearTimeout(searchTimeout);
});

let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchQuery, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchConversations(), 300);
});
</script>
 
<style scoped>
.mobile-chat {
  height: calc(100dvh - 120px); /* Use dynamic viewport height */
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:deep(.message-thread) {
  flex: 1;
  min-height: 0;
}

/* Ensure the input area is always visible and at the bottom */
:deep(.chat-input-area) {
  padding-bottom: max(16px, env(safe-area-inset-bottom)) !important;
}
</style>
