<template>
  <div class="message-thread d-flex flex-column flex-grow-1" style="height: 100%;">
    <!-- Empty state -->
    <div v-if="!conversation" class="d-flex align-center justify-center flex-grow-1">
      <div class="text-center text-grey">
        <v-icon icon="mdi-chat-outline" size="96" color="grey-lighten-2" />
        <p class="text-h6 mt-4">Chọn cuộc trò chuyện</p>
      </div>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="pa-3 d-flex align-center" style="border-bottom: 1px solid var(--border-glow, rgba(0,242,255,0.1));">
        <!-- Back button for mobile -->
        <v-btn v-if="showBack" icon size="small" variant="text" class="mr-1" @click="$emit('go-back')">
          <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-avatar size="36" color="grey-lighten-2" class="mr-3">
          <v-icon v-if="conversation.threadType === 'group'" icon="mdi-account-group" />
          <v-img v-else-if="conversation.contact?.avatarUrl" :src="conversation.contact.avatarUrl" />
          <v-icon v-else icon="mdi-account" />
        </v-avatar>
        <div class="flex-grow-1">
          <div class="font-weight-medium">{{ conversation.contact?.fullName || 'Unknown' }}</div>
          <div class="text-caption text-grey">{{ conversation.zaloAccount?.displayName || 'Zalo' }}</div>
        </div>
        <v-btn size="small" variant="tonal" color="primary" class="mr-1" :loading="aiSuggestionLoading" @click="$emit('ask-ai')">
          Ask AI
        </v-btn>


        <v-menu v-model="showTagMenu" :close-on-content-click="false" location="bottom end">
          <template v-slot:activator="{ props }">
            <v-btn size="small" variant="tonal" color="deep-purple-accent-1" class="mr-1" v-bind="props" :loading="loadingTags" @click="fetchTagsIfNeeded">
              Phân loại <v-icon size="small" class="ml-1">mdi-chevron-down</v-icon>
            </v-btn>
          </template>
          <v-card width="280">
            <v-card-text class="pa-2">
              <div class="text-caption text-grey mb-2 px-2">Theo thẻ phân loại</div>
              <v-list density="compact" class="pa-0">
                <v-list-item
                  v-for="tag in availableTags"
                  :key="tag.id"
                  @click="toggleTag(tag)"
                >
                  <template v-slot:prepend>
                    <v-checkbox-btn
                      :model-value="conversationHasTag(tag)"
                      color="primary"
                      class="mr-2"
                      style="pointer-events: none;"
                    ></v-checkbox-btn>
                    <v-icon :color="getTagColor(tag.color)" class="mr-2">mdi-label</v-icon>
                  </template>
                  <v-list-item-title>{{ tag.text }}</v-list-item-title>
                </v-list-item>
              </v-list>
              <v-divider class="my-2"></v-divider>
              <v-btn variant="text" block color="primary" size="small" @click="showLabelManager = true; showTagMenu = false">Quản lý thẻ phân loại</v-btn>
            </v-card-text>
          </v-card>
        </v-menu>

        <!-- Label Manager Dialog -->
        <LabelManagerDialog
          v-if="conversation?.zaloAccountId"
          v-model="showLabelManager"
          :account-id="conversation.zaloAccountId"
          @updated="onLabelsUpdated"
        />

        <!-- On desktop: show all buttons inline -->
        <template class="d-none d-sm-flex">
          <v-btn size="small" variant="tonal" color="success" class="mr-1" @click="onVideoCallClick">
            <v-icon left size="small" class="mr-1">mdi-video</v-icon> Gọi Video
          </v-btn>
          <v-btn size="small" variant="tonal" color="info" class="mr-1" @click="onLinkClick">
            Link
          </v-btn>
        </template>

        <!-- On mobile: collapse secondary actions into a menu -->
        <v-menu location="bottom end">
          <template v-slot:activator="{ props }">
            <v-btn icon size="small" variant="text" class="mr-1" v-bind="props">
              <v-icon size="20">mdi-dots-vertical</v-icon>
            </v-btn>
          </template>
          <v-list density="compact">
            <v-list-item prepend-icon="mdi-video" title="Gọi Video" @click="onVideoCallClick" />
            <v-list-item prepend-icon="mdi-link" title="Gửi Link" @click="onLinkClick" />
          </v-list>
        </v-menu>

        <v-btn
          :icon="showContactPanel ? 'mdi-account-details' : 'mdi-account-details-outline'"
          size="small" variant="text"
          :color="showContactPanel ? 'primary' : undefined"
          @click="$emit('toggle-contact-panel')"
        />
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" class="flex-grow-1 overflow-y-auto pa-3 chat-messages-area">
        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />
        <template v-for="item in displayItems" :key="item.key">
          <!-- Album: multiple images sharing the same Zalo albumKey -->
          <div v-if="item.kind === 'album'" class="mb-2 d-flex" :class="item.senderType === 'self' ? 'justify-end' : 'justify-start'">
            <div style="max-width: 70%;">
              <div v-if="conversation.threadType === 'group' && item.senderType !== 'self'" class="text-caption mb-1" style="color: #00F2FF; font-weight: 500;">
                {{ item.senderName || 'Unknown' }}
              </div>
              <div class="message-bubble pa-1 rounded-lg" :class="item.senderType === 'self' ? 'bg-primary' : 'bg-white'">
                <div class="album-grid" :class="albumGridClass(item.messages.length)">
                  <img
                    v-for="m in item.messages"
                    :key="m.id"
                    :src="getImageUrl(m)!"
                    alt="Hình ảnh"
                    class="album-tile"
                    @click="previewImageUrl = getImageUrl(m)!"
                  />
                </div>
                <div v-if="item.totalExpected && item.totalExpected > item.messages.length" class="text-caption px-2 py-1" style="opacity: 0.7;">
                  {{ item.messages.length }}/{{ item.totalExpected }} ảnh đã nhận
                </div>
                <div class="text-caption px-2 pb-1 msg-time" :class="item.senderType === 'self' ? 'msg-time-self' : 'msg-time-contact'" style="font-size: 0.7rem;">
                  {{ formatMessageTime(item.sentAt) }} · 🖼️ {{ item.messages.length }} ảnh
                </div>
              </div>
            </div>
          </div>
          <!-- Single message — rendered via MessageBubble -->
          <MessageBubble
            v-else
            :message="item.msg"
            :reply="item.msg.reply || null"
            :reactions="item.msg.reactions || []"
            :is-self="item.msg.senderType === 'self'"
            :is-group="conversation.threadType === 'group'"
            @contextmenu="onContextMenu($event, item.msg)"
            @preview-image="previewImageUrl = $event"
            @toggle-reaction="onToggleReaction(item.msg, $event)"
          />
        </template>
        <div v-if="!loading && messages.length === 0" class="text-center pa-8 text-grey">Chưa có tin nhắn</div>
      </div>

      <!-- Typing indicator -->
      <TypingIndicator :typers="currentTypers" />

      <!-- Input area -->
      <div class="pa-2 chat-input-area">
        <AiSuggestionPanel
          v-if="aiSuggestionLoading || aiSuggestion || aiSuggestionError"
          :suggestion="aiSuggestion"
          :loading="aiSuggestionLoading"
          :error="aiSuggestionError"
          @generate="$emit('ask-ai')"
          @apply="applySuggestion"
        />
        <ReplyPreviewBar
          :message="(replyingTo || editingMessage) ?? null"
          :mode="editingMessage ? 'edit' : 'reply'"
          @cancel="onCancelReplyEdit"
        />
        <div class="d-flex align-end" style="position: relative;">
          <QuickTemplatePopup
            :visible="showTemplatePopup"
            :query="templateQuery"
            :templates="templates"
            :contact="conversation.contact"
            @select="onTemplateSelect"
            @close="showTemplatePopup = false"
          />
          
          <!-- Emoji Picker Menu -->
          <v-menu v-model="showEmojiPicker" :close-on-content-click="false" location="top start" origin="bottom start">
            <template v-slot:activator="{ props }">
              <v-btn icon variant="text" size="small" class="mr-2 mb-1 text-grey" v-bind="props">
                <v-icon size="28">mdi-emoticon-outline</v-icon>
              </v-btn>
            </template>
            <v-card width="300" max-height="300" class="overflow-y-auto pa-2">
              <div class="d-flex flex-wrap">
                <v-btn
                  v-for="emoji in popularEmojis"
                  :key="emoji"
                  variant="text"
                  size="small"
                  class="ma-1"
                  style="min-width: 36px; font-size: 1.2rem;"
                  @click="onSelectEmoji(emoji)"
                >
                  {{ emoji }}
                </v-btn>
              </div>
            </v-card>
          </v-menu>
          
          <!-- Pill Input Container -->
          <div class="flex-grow-1 d-flex align-center rounded-xl px-2" style="background: rgba(var(--v-theme-on-surface), 0.05); border: 1px solid rgba(var(--v-theme-on-surface), 0.1); min-height: 44px;">
            
            <!-- Voice Recording UI -->
            <div v-if="isRecording" class="d-flex align-center flex-grow-1 px-2">
              <v-icon color="red" class="mr-2 blink-animation">mdi-record-circle</v-icon>
              <span class="text-subtitle-2 text-red font-weight-medium">{{ recordingTimeString }}</span>
              <v-spacer></v-spacer>
              <v-btn icon variant="text" size="small" color="grey" @click="cancelRecording">
                <v-icon size="22">mdi-delete-outline</v-icon>
              </v-btn>
              <v-btn icon class="send-btn ml-2" size="small" density="comfortable" color="primary" @click="stopAndSendRecording">
                <v-icon size="18">mdi-send</v-icon>
              </v-btn>
            </div>

            <!-- Normal Chat Input -->
            <template v-else>
              <RichTextEditor
                ref="editorRef"
                v-model="inputText"
                placeholder="Tin nhắn"
                class="flex-grow-1 zalo-like-input align-self-end"
                :show-toolbar="false"
                @submit="handleSend"
                @typing="onTypingEvent"
              />
              
              <div class="d-flex align-center pb-1 pr-1 align-self-end" v-if="!inputText.trim()">
                <!-- More Actions Menu -->
                <v-menu location="top start">
                  <template v-slot:activator="{ props }">
                    <v-btn icon variant="text" size="small" class="text-grey" density="comfortable" v-bind="props">
                      <v-icon size="22">mdi-dots-horizontal</v-icon>
                    </v-btn>
                  </template>
                  <v-list density="compact" width="180">
                    <v-list-item prepend-icon="mdi-map-marker-outline" title="Gửi vị trí" @click="showLocationDialog = true" />
                    <v-list-item prepend-icon="mdi-card-account-details-outline" title="Gửi danh thiếp" @click="openCardDialog" />
                  </v-list>
                </v-menu>

                <v-btn icon variant="text" size="small" class="text-grey" density="comfortable" @click="startRecording">
                  <v-icon size="22">mdi-microphone-outline</v-icon>
                </v-btn>
                <v-btn icon variant="text" size="small" class="text-grey" density="comfortable" @click="openFilePicker">
                  <v-icon size="22">mdi-image-outline</v-icon>
                </v-btn>
                <input type="file" ref="fileInput" multiple style="display: none;" @change="onFileSelected" />
              </div>
              
              <!-- Send button when typing -->
              <div class="d-flex align-center pb-1 pr-1 pl-2 align-self-end" v-else>
                <v-btn icon class="send-btn" size="small" density="comfortable" :loading="sending" @click="handleSend">
                  <v-icon size="18">mdi-send</v-icon>
                </v-btn>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Location Dialog -->
      <v-dialog v-model="showLocationDialog" max-width="450">
        <v-card class="rounded-xl pa-2">
          <v-card-title class="d-flex align-center">
            <v-icon color="primary" class="mr-2">mdi-map-marker-radius</v-icon>
            Gửi vị trí
          </v-card-title>
          <v-card-text>
            <p class="text-caption mb-4">Gửi link bản đồ Google Maps cho khách hàng (Zalo sẽ tự động hiển thị thẻ bản đồ).</p>
            
            <div class="d-flex align-center mb-4">
              <v-btn 
                color="secondary" 
                variant="tonal" 
                prepend-icon="mdi-crosshairs-gps" 
                class="flex-grow-1 rounded-pill"
                @click="getCurrentLocation"
                :loading="gettingLocation"
              >
                Lấy vị trí hiện tại của tôi
              </v-btn>
            </div>
            
            <div class="text-caption text-center text-grey mb-4">HOẶC DÁN LINK TỰ DO</div>
            
            <v-text-field 
              v-model="locationData.link" 
              label="Link Google Maps" 
              placeholder="https://goo.gl/maps/..." 
              variant="outlined" 
              density="comfortable" 
              class="mb-2" 
            />
            <v-text-field 
              v-model="locationData.desc" 
              label="Mô tả tin nhắn (Không bắt buộc)" 
              placeholder="Ví dụ: Dạ, văn phòng công ty em ở đây ạ." 
              variant="outlined" 
              density="comfortable" 
              hide-details 
            />
          </v-card-text>
          <v-card-actions class="pa-4">
            <v-spacer></v-spacer>
            <v-btn variant="text" @click="showLocationDialog = false">Hủy</v-btn>
            <v-btn 
              color="primary" 
              variant="flat" 
              class="px-6 rounded-pill" 
              @click="onSendLocation" 
              :loading="sendingLocation"
              :disabled="!locationData.link"
            >
              Gửi vị trí
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Business Card Dialog -->
      <v-dialog v-model="showCardDialog" max-width="450" scrollable>
        <v-card class="rounded-xl">
          <v-card-title class="d-flex align-center pa-4 pb-2">
            <v-icon color="success" class="mr-2">mdi-card-account-details</v-icon>
            Chia sẻ danh thiếp
          </v-card-title>
          <div class="px-4 pb-2">
            <v-text-field
              v-model="cardSearch"
              placeholder="Tìm nhân viên hoặc khách hàng..."
              variant="outlined"
              density="compact"
              prepend-inner-icon="mdi-magnify"
              hide-details
              class="mt-2"
            />
          </div>
          <v-divider></v-divider>
          <v-card-text style="height: 350px;" class="pa-0">
            <v-list v-if="filteredCardItems.length">
              <v-list-item
                v-for="item in filteredCardItems"
                :key="item.id"
                @click="selectedCardItem = item"
                :active="selectedCardItem?.id === item.id"
                color="primary"
              >
                <template v-slot:prepend>
                  <v-avatar size="32" color="grey-lighten-3">
                    <v-img v-if="item.avatarUrl" :src="item.avatarUrl" />
                    <v-icon v-else icon="mdi-account" />
                  </v-avatar>
                </template>
                <v-list-item-title class="font-weight-medium">{{ item.name }}</v-list-item-title>
                <v-list-item-subtitle>{{ item.sub }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
            <div v-else class="text-center pa-8 text-grey">Không tìm thấy kết quả</div>
          </v-card-text>
          <v-divider></v-divider>
          <v-card-actions class="pa-4">
            <v-spacer></v-spacer>
            <v-btn variant="text" @click="showCardDialog = false">Hủy</v-btn>
            <v-btn
              color="success"
              variant="flat"
              class="px-6 rounded-pill"
              :disabled="!selectedCardItem"
              @click="onSendCard"
              :loading="sendingCard"
            >Chia sẻ</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      
      <!-- Feature under development notification -->
      <v-snackbar v-model="notImplementedToast" color="info" :timeout="2000" location="bottom">
        🚀 Tính năng này đang được phát triển ở phiên bản sau!
      </v-snackbar>
    </template>

    <!-- Context menu -->
    <MessageContextMenu
      v-model="showContextMenu"
      :message="contextMsg"
      :is-self="contextMsg?.senderType === 'self'"
      :is-pinned="conversation?.isPinned"
      :position="contextPos"
      @reply="onReply"
      @edit="onEdit"
      @delete="onDelete"
      @undo="onUndo"
      @forward="showForwardDialog = true"
      @copy="() => {}"
      @pin="onPin"
    />

    <!-- Forward dialog -->
    <ForwardDialog
      v-model="showForwardDialog"
      :conversations="allConversations ?? []"
      @forward="onForward"
    />

    <!-- Image preview dialog -->
    <v-dialog v-model="showImagePreview" max-width="900" content-class="elevation-0">
      <div class="text-center" @click="showImagePreview = false" style="cursor: pointer;">
        <img :src="previewImageUrl" alt="Preview" style="max-width: 100%; max-height: 85vh; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);" />
        <div class="text-caption mt-2" style="color: #aaa;">Nhấn để đóng</div>
      </div>
    </v-dialog>

    <v-snackbar v-model="syncSnack.show" :color="syncSnack.color" timeout="3000">{{ syncSnack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted } from 'vue';
import type { Conversation, Message } from '@/composables/use-chat';
import { api } from '@/api/index';
import AiSuggestionPanel from '@/components/ai/ai-suggestion-panel.vue';
import QuickTemplatePopup from '@/components/chat/quick-template-popup.vue';
import MessageBubble from '@/components/chat/message-bubble.vue';
import MessageContextMenu from '@/components/chat/message-context-menu.vue';
import TypingIndicator from '@/components/chat/typing-indicator.vue';
import ReplyPreviewBar from '@/components/chat/reply-preview-bar.vue';
import ForwardDialog from '@/components/chat/forward-dialog.vue';
import RichTextEditor from '@/components/chat/rich-text-editor.vue';
import LabelManagerDialog from '@/components/chat/LabelManagerDialog.vue';

interface TemplateItem { id: string; name: string; content: string; category: string | null; isPersonal: boolean; }

const props = defineProps<{
  conversation: Conversation | null;
  messages: Message[];
  loading: boolean;
  sending: boolean;
  showContactPanel?: boolean;
  showBack?: boolean;
  aiSuggestion: string;
  aiSuggestionLoading: boolean;
  aiSuggestionError: string;
  allConversations?: Conversation[];
  replyingTo?: Message | null;
  editingMessage?: Message | null;
  typingUsers?: { userId: string; userName: string }[];
}>();

const emit = defineEmits<{
  send: [content: string, replyMessageId?: string | null];
  'send-voice': [audioBlob: Blob];
  'send-file': [files: File[]];
  'toggle-contact-panel': [];
  'go-back': [];
  'ask-ai': [];
  'add-reaction': [msgId: string, reaction: string];
  'delete-message': [msgId: string];
  'undo-message': [msgId: string];
  'edit-message': [msgId: string, content: string];
  'forward-message': [msgId: string, targetIds: string[]];
  'pin-conversation': [];
  'set-reply-to': [msg: Message];
  'set-editing': [msg: Message];
  'cancel-reply-edit': [];
  'typing': [];
  'refresh-thread': [];
}>();

const inputText = ref('');

const messagesContainer = ref<HTMLElement | null>(null);
const previewImageUrl = ref('');
const showImagePreview = computed({ get: () => !!previewImageUrl.value, set: (v) => { if (!v) previewImageUrl.value = ''; } });
const syncSnack = ref({ show: false, text: '', color: 'success' });


const notImplementedToast = ref(false);

const showEmojiPicker = ref(false);

const isRecording = ref(false);
const recordingTime = ref(0);
const audioChunks = ref<Blob[]>([]);
let mediaRecorder: MediaRecorder | null = null;
let recordingTimer: any = null;

const recordingTimeString = computed(() => {
  const m = Math.floor(recordingTime.value / 60);
  const s = recordingTime.value % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks.value = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.value.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    isRecording.value = true;
    recordingTime.value = 0;
    
    recordingTimer = setInterval(() => {
      recordingTime.value++;
    }, 1000);
  } catch (err) {
    console.error('Microphone access denied or error:', err);
    alert('Không thể truy cập Microphone. Vui lòng kiểm tra quyền trên trình duyệt.');
  }
}

function stopAndSendRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  
  mediaRecorder.onstop = () => {
    const audioBlob = new Blob(audioChunks.value, { type: 'audio/webm' });
    emit('send-voice', audioBlob);
    cleanupRecording();
  };
  
  mediaRecorder.stop();
}

function cancelRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.onstop = () => {
      cleanupRecording();
    };
    mediaRecorder.stop();
  } else {
    cleanupRecording();
  }
}

function cleanupRecording() {
  isRecording.value = false;
  clearInterval(recordingTimer);
  audioChunks.value = [];
  mediaRecorder = null;
}

const fileInput = ref<HTMLInputElement | null>(null);

function openFilePicker() {
  if (fileInput.value) {
    fileInput.value.click();
  }
}

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    emit('send-file', Array.from(target.files));
    target.value = ''; // reset input
  }
}

const popularEmojis = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
  '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸',
  '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️',
  '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡',
  '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓',
  '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄',
  '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵',
  '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠',
  '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘',
  '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖',
  '👋', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳',
  '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀',
  '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '🩸'
];

function onSelectEmoji(emoji: string) {
  // Append emoji to inputText
  inputText.value += emoji;
}

// Context menu state
const showContextMenu = ref(false);
const contextMsg = ref<Message | null>(null);
const contextPos = ref({ x: 0, y: 0 });

// Forward dialog
const showForwardDialog = ref(false);
const editorRef = ref<InstanceType<typeof RichTextEditor> | null>(null);

// --- New Features: Location & Card & Tags ---
import { useChatOperations } from '@/composables/use-chat-operations';
const { sendCard: apiSendCard, getLabels, updateConversationLabels } = useChatOperations();

// Tagging System
const showTagMenu = ref(false);
const showLabelManager = ref(false);
const loadingTags = ref(false);
const availableTags = ref<any[]>([]);

async function fetchTagsIfNeeded() {
  if (availableTags.value.length > 0 || !props.conversation) return;
  loadingTags.value = true;
  try {
    availableTags.value = await getLabels(props.conversation.zaloAccountId);
  } finally {
    loadingTags.value = false;
  }
}

function conversationHasTag(tag: any) {
  if (!props.conversation || !props.conversation.externalThreadId) return false;
  return tag.conversations?.includes(props.conversation.externalThreadId);
}

async function toggleTag(tag: any) {
  if (!props.conversation || !props.conversation.externalThreadId) return;
  const hasTag = conversationHasTag(tag);
  
  // Optimistic update
  if (hasTag) {
    tag.conversations = tag.conversations.filter((id: string) => id !== props.conversation!.externalThreadId);
  } else {
    tag.conversations = [...(tag.conversations || []), props.conversation.externalThreadId];
  }
  
  const activeIds = availableTags.value.filter(t => conversationHasTag(t)).map(t => t.id);
  
  try {
    await updateConversationLabels(props.conversation.id, activeIds);
  } catch (err) {
    if (hasTag) {
      tag.conversations = [...(tag.conversations || []), props.conversation!.externalThreadId];
    } else {
      tag.conversations = tag.conversations.filter((id: string) => id !== props.conversation!.externalThreadId);
    }
  }
}

function getTagColor(color: string | number) {
  const colorMap: Record<string, string> = {
    '1': '#F44336',
    '2': '#E91E63',
    '3': '#FF9800',
    '4': '#FFEB3B',
    '5': '#4CAF50',
    '6': '#2196F3',
    '7': '#9C27B0',
    '8': '#607D8B',
    '9': '#009688',
  };
  return colorMap[String(color)] || String(color) || 'primary';
}

function onLabelsUpdated() {
  // Refresh tags list after label manager saves changes
  availableTags.value = [];
  fetchTagsIfNeeded();
}

const showLocationDialog = ref(false);
const sendingLocation = ref(false);
const locationData = ref({ link: '', desc: 'Vị trí hiện tại của tôi' });
const gettingLocation = ref(false);

function getCurrentLocation() {
  if (!navigator.geolocation) {
    alert('Trình duyệt của bạn không hỗ trợ lấy vị trí.');
    return;
  }
  gettingLocation.value = true;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      locationData.value.link = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
      gettingLocation.value = false;
    },
    (err) => {
      console.error('Error getting location:', err);
      alert('Không thể lấy vị trí. Vui lòng kiểm tra quyền truy cập vị trí trên trình duyệt.');
      gettingLocation.value = false;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function onSendLocation() {
  if (!props.conversation || !locationData.value.link) return;
  sendingLocation.value = true;
  try {
    // Send description text first if exists
    if (locationData.value.desc) {
      await api.post(`/conversations/${props.conversation.id}/messages`, {
        content: locationData.value.desc,
      });
    }
    // Then send the link which Zalo converts to a rich map card
    await api.post(`/conversations/${props.conversation.id}/link`, { 
      url: locationData.value.link 
    });
    
    showLocationDialog.value = false;
    emit('refresh-thread');
  } catch (err) {
    console.error('Failed to send location link:', err);
  } finally {
    sendingLocation.value = false;
  }
}

const showCardDialog = ref(false);
const sendingCard = ref(false);
const cardSearch = ref('');
const cardItems = ref<{ id: string; name: string; avatarUrl: string | null; sub: string }[]>([]);
const selectedCardItem = ref<any>(null);

const filteredCardItems = computed(() => {
  const s = cardSearch.value.toLowerCase().trim();
  if (!s) return cardItems.value;
  return cardItems.value.filter(i => i.name.toLowerCase().includes(s) || i.sub.toLowerCase().includes(s));
});

async function openCardDialog() {
  showCardDialog.value = true;
  cardSearch.value = '';
  selectedCardItem.value = null;
  
  // Load some potential card targets (staff + recent contacts)
  try {
    const [staffRes, contactRes] = await Promise.all([
      api.get('/users'),
      api.get('/contacts', { params: { limit: 20 } })
    ]);
    
    const staff = (staffRes.data.users || []).map((u: any) => ({
      id: u.id,
      name: u.fullName,
      avatarUrl: u.avatarUrl,
      sub: `Nhân viên · ${u.role}`
    }));
    
    const contacts = (contactRes.data.contacts || []).map((c: any) => ({
      id: c.id,
      name: c.fullName,
      avatarUrl: c.avatarUrl,
      sub: `Khách hàng · ${c.phone || c.email || 'Zalo'}`
    }));
    
    cardItems.value = [...staff, ...contacts];
  } catch (err) {
    console.error('Failed to load card items:', err);
  }
}

async function onSendCard() {
  if (!props.conversation || !selectedCardItem.value) return;
  sendingCard.value = true;
  try {
    // Note: Zalo card sharing usually needs the external UID or a valid card payload
    // Our API takes a contactId and resolves it on backend if possible
    await apiSendCard(props.conversation.id, selectedCardItem.value.id);
    showCardDialog.value = false;
    emit('refresh-thread');
  } catch (err) {
    console.error('Failed to send card:', err);
  } finally {
    sendingCard.value = false;
  }
}

// Typing indicator — computed from prop
const currentTypers = computed(() => props.typingUsers || []);

// ── Display item types ──────────────────────────────────────────────────────

type DisplayItem =
  | { kind: 'single'; key: string; msg: Message }
  | { kind: 'album'; key: string; senderType: string; senderName: string | null; sentAt: string; totalExpected: number | null; messages: Message[] };

/** Group consecutive image messages sharing the same Zalo albumKey into an album item. */
const displayItems = computed<DisplayItem[]>(() => {
  const out: DisplayItem[] = [];
  let cur: Extract<DisplayItem, { kind: 'album' }> | null = null;
  for (const msg of props.messages) {
    const canGroup = msg.contentType === 'image' && msg.albumKey && !msg.isDeleted && !!getImageUrl(msg);
    if (canGroup && cur && cur.key === `album:${msg.albumKey}:${msg.senderType}`) {
      cur.messages.push(msg);
      continue;
    }
    cur = null;
    if (canGroup) {
      cur = {
        kind: 'album',
        key: `album:${msg.albumKey}:${msg.senderType}`,
        senderType: msg.senderType,
        senderName: msg.senderName,
        sentAt: msg.sentAt,
        totalExpected: msg.albumTotal ?? null,
        messages: [msg],
      };
      out.push(cur);
    } else {
      out.push({ kind: 'single', key: msg.id, msg });
    }
  }
  // Sort images within each album by albumIndex for stable order
  for (const item of out) {
    if (item.kind === 'album') {
      item.messages.sort((a, b) => (a.albumIndex ?? 0) - (b.albumIndex ?? 0));
    }
  }
  return out;
});

function albumGridClass(count: number): string {
  if (count <= 1) return 'album-grid-1';
  if (count === 2) return 'album-grid-2';
  if (count <= 4) return 'album-grid-2';
  return 'album-grid-3';
}

// ── Context menu / actions ──────────────────────────────────────────────────

function onContextMenu(event: MouseEvent, msg: Message) {
  contextMsg.value = msg;
  contextPos.value = { x: event.clientX, y: event.clientY };
  showContextMenu.value = true;
}

function onToggleReaction(msg: Message, emoji: string) {
  emit('add-reaction', msg.id, emoji);
}

function onReply() {
  if (contextMsg.value) emit('set-reply-to', contextMsg.value);
}

function onEdit() {
  if (contextMsg.value) {
    emit('set-editing', contextMsg.value);
    inputText.value = contextMsg.value.content || '';
  }
}

function onDelete() {
  if (contextMsg.value) emit('delete-message', contextMsg.value.id);
}

function onUndo() {
  if (contextMsg.value) emit('undo-message', contextMsg.value.id);
}

function onPin() {
  emit('pin-conversation');
}

async function onLinkClick() {
  const url = window.prompt('Nhập URL để gửi link');
  if (!url?.trim() || !props.conversation) return;
  try {
    await api.post(`/conversations/${props.conversation.id}/link`, { url: url.trim() });
    emit('refresh-thread');
  } catch (err) {
    console.error('Failed to send link:', err);
  }
}

function onVideoCallClick() {
  if (!props.conversation) return;
  const roomId = props.conversation.id; // Using conversation ID as room ID
  const callUrl = `${window.location.origin}/call/${roomId}`;
  
  // Send automated message with the link
  const messageContent = `Dạ mời anh/chị nhấn vào link sau để tham gia phòng gọi video trực tiếp ạ: ${callUrl}`;
  emit('send', messageContent, undefined);

  // Open the video call room in a new tab for the sale agent
  window.open(callUrl, '_blank');
}

function onForward(targetIds: string[]) {
  if (contextMsg.value) emit('forward-message', contextMsg.value.id, targetIds);
  showForwardDialog.value = false;
}

function onCancelReplyEdit() {
  emit('cancel-reply-edit');
  if (props.editingMessage) inputText.value = '';
}

// ── Template quick-insert ───────────────────────────────────────────────────

const showTemplatePopup = ref(false);
const templateQuery = ref('');
const templates = ref<TemplateItem[]>([]);

async function loadTemplates() {
  try {
    const res = await api.get<{ templates: TemplateItem[] }>('/automation/templates');
    templates.value = res.data.templates;
  } catch { /* Non-critical */ }
}

onMounted(() => { loadTemplates(); });

function onTypingEvent() {
  emit('typing');
  const value = inputText.value;
  if (value === '/' || /\s\/$/.test(value)) {
    showTemplatePopup.value = true;
    templateQuery.value = '';
  } else if (showTemplatePopup.value) {
    const lastSlash = value.lastIndexOf('/');
    if (lastSlash === -1) { showTemplatePopup.value = false; } else { templateQuery.value = value.slice(lastSlash + 1); }
  }
}

function onTemplateSelect(rendered: string) {
  const lastSlash = inputText.value.lastIndexOf('/');
  inputText.value = lastSlash >= 0 ? inputText.value.slice(0, lastSlash) + rendered : rendered;
  showTemplatePopup.value = false;
  templateQuery.value = '';
}

// ── Send ────────────────────────────────────────────────────────────────────

function handleSend() {
  if (showTemplatePopup.value) { showTemplatePopup.value = false; return; }
  if (!inputText.value.trim()) return;
  if (props.editingMessage) {
    emit('edit-message', props.editingMessage.id, inputText.value);
  } else {
    emit('send', inputText.value, props.replyingTo?.id ?? null);
  }
  inputText.value = '';
  editorRef.value?.clear();
  emit('cancel-reply-edit');
}

function applySuggestion() { if (!props.aiSuggestion) return; inputText.value = props.aiSuggestion; }

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatMessageTime(d: string) {
  return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Extract image URL from JSON content */
function getImageUrl(msg: Message): string | null {
  if (msg.contentType === 'image' && msg.content) {
    if (msg.content.startsWith('http')) return msg.content;
    try { const p = JSON.parse(msg.content); return p.href || p.thumb || p.hdUrl || null; } catch {}
  }
  if (msg.content?.startsWith('{')) {
    try {
      const p = JSON.parse(msg.content);
      const href = p.href || p.thumb || '';
      if (href && /\.(jpg|jpeg|png|webp|gif)/i.test(href)) return href;
      if (href && href.includes('zdn.vn') && !p.params?.includes('fileExt')) return href;
    } catch {}
  }
  return null;
}

// ── Scroll on new messages ──────────────────────────────────────────────────

watch(() => props.messages.length, async () => {
  await nextTick();
  if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
});
</script>

<style scoped>
.message-bubble { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); }
.album-grid { display: grid; gap: 3px; border-radius: 10px; overflow: hidden; max-width: 420px; }
.album-grid-1 { grid-template-columns: 1fr; }
.album-grid-2 { grid-template-columns: 1fr 1fr; }
.album-grid-3 { grid-template-columns: 1fr 1fr 1fr; }
.album-tile { width: 100%; aspect-ratio: 1/1; object-fit: cover; cursor: pointer; transition: transform 0.2s; }
.album-tile:hover { transform: scale(1.02); }

.chat-input-area {
  background: rgba(var(--v-theme-surface), 1);
  padding: 8px 12px 16px 12px !important;
}

.zalo-like-input {
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
}
.zalo-like-input :deep(.tiptap-input) {
  padding: 10px 14px;
  min-height: 40px;
}
.zalo-like-input :deep(.tiptap-input p.is-editor-empty:first-child::before) {
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.send-btn {
  background: linear-gradient(135deg, #00F2FF, #0088FF) !important;
  color: #ffffff !important;
  box-shadow: 0 4px 15px rgba(0, 242, 255, 0.3) !important;
}
.send-btn:disabled {
  background: rgba(var(--v-theme-on-surface), 0.1) !important;
  color: rgba(var(--v-theme-on-surface), 0.3) !important;
  box-shadow: none !important;
}
</style>
