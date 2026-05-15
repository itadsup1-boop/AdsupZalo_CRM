<template>
  <div class="d-flex mb-2" :class="isSelf ? 'justify-end' : 'justify-start'">
    <div style="max-width: 70%; position: relative;" class="bubble-wrapper">
      <!-- Group sender name -->
      <div
        v-if="isGroup && !isSelf"
        class="text-caption mb-1"
        style="color: #00F2FF; font-weight: 500;"
      >
        {{ message.senderName || 'Unknown' }}
      </div>

      <!-- Bubble -->
      <div
        class="message-bubble pa-2 px-3 rounded-lg"
        :class="isSelf ? 'bg-primary text-white' : 'bg-white'"
        style="word-wrap: break-word;"
        @contextmenu.prevent="emit('contextmenu', $event)"
      >
        <!-- Deleted -->
        <div v-if="message.isDeleted" class="text-decoration-line-through font-italic" style="opacity: 0.6;">
          {{ message.content || '(tin nhắn)' }}<span class="text-caption"> (đã thu hồi)</span>
        </div>

        <template v-else>
          <div v-if="reply" class="reply-card mb-2">
            <div class="text-caption font-weight-medium" style="opacity: 0.8;">Trả lời</div>
            <div class="text-body-2 reply-text">{{ reply.content || '(tin nhắn)' }}</div>
          </div>

          <!-- Image -->
          <div v-if="getImageUrl(message)">
            <img
              :src="getImageUrl(message)!"
              alt="Hình ảnh"
              class="chat-image"
              @click="emit('preview-image', getImageUrl(message)!)"
            />
          </div>

          <!-- File/PDF -->
          <div v-else-if="getFileInfo(message)" class="file-card">
            <v-icon size="20" class="mr-2" color="info">mdi-file-document-outline</v-icon>
            <div class="flex-grow-1">
              <div class="text-body-2 font-weight-medium">{{ getFileInfo(message)!.name }}</div>
              <div class="text-caption" style="opacity: 0.6;">{{ getFileInfo(message)!.size }}</div>
            </div>
            <v-btn
              v-if="getFileInfo(message)!.href"
              icon
              size="x-small"
              variant="text"
              @click="openFile(getFileInfo(message)!.href)"
            >
              <v-icon size="16">mdi-download</v-icon>
            </v-btn>
          </div>

          <!-- Sticker / Video / Voice / GIF -->
          <div v-else-if="message.contentType === 'sticker'">🏷️ Sticker</div>
          <div v-else-if="message.contentType === 'video'">🎥 Video</div>
          <div v-else-if="message.contentType === 'voice'">🎤 Tin nhắn thoại</div>
          <div v-else-if="message.contentType === 'gif'">GIF</div>

          <!-- Reminder -->
          <div v-else-if="isReminderMessage(message)" class="reminder-card">
            <div class="d-flex align-center mb-1">
              <v-icon size="16" color="warning" class="mr-1">mdi-calendar-clock</v-icon>
              <span class="text-caption font-weight-bold" style="color: #FFB74D;">Nhắc hẹn</span>
            </div>
            <div class="text-body-2">{{ getReminderTitle(message) }}</div>
            <div v-if="getReminderTime(message)" class="text-caption mt-1" style="opacity: 0.7;">
              <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>{{ getReminderTime(message) }}
            </div>
          </div>

          <!-- Special types -->
          <SpecialMessageRenderer
            v-else-if="isSpecialType(message.contentType)"
            :type="message.contentType"
            :content="parseContent(message.content)"
          />

          <!-- Contact Card -->
          <div v-else-if="message.contentType === 'contact_card' || isContactCard(message)" class="contact-card mt-1 mb-1">
            <div class="contact-card-header d-flex align-center pa-3" style="background: linear-gradient(135deg, #1B74E4, #0B5ED7); border-radius: 10px 10px 0 0;">
              <v-avatar size="40" color="white" class="mr-3 elevation-1">
                <v-img v-if="getCardAvatar(message)" :src="getCardAvatar(message)" />
                <v-icon v-else color="primary">mdi-account</v-icon>
              </v-avatar>
              <div class="text-subtitle-1 text-white font-weight-medium text-truncate" style="max-width: 150px;">{{ getCardName(message) }}</div>
            </div>
            <div class="contact-card-actions bg-white d-flex text-center py-2" style="border-radius: 0 0 10px 10px; border: 1px solid #E0E0E0; border-top: none;">
              <div class="flex-grow-1 font-weight-medium text-body-2" style="border-right: 1px solid #E0E0E0; cursor: pointer; color: #111;">Kết bạn</div>
              <div class="flex-grow-1 font-weight-medium text-body-2" style="cursor: pointer; color: #111;">Nhắn tin</div>
            </div>
          </div>

          <!-- Link Preview / Map -->
          <div v-else-if="message.contentType === 'link' || isLinkMessage(message)" class="link-preview-card bg-white mt-1 mb-1 rounded-lg" style="border: 1px solid #E0E0E0; overflow: hidden; width: 260px;">
             <div class="pa-2 text-primary" style="word-break: break-all; font-size: 0.85rem;">
                {{ getLinkUrl(message) }}
             </div>
             <v-img :src="getLinkPreviewImage(message)" height="140" cover class="bg-grey-lighten-4">
               <template v-slot:placeholder>
                 <div class="d-flex align-center justify-center fill-height bg-grey-lighten-3">
                   <v-icon size="40" color="grey-lighten-1">mdi-image-outline</v-icon>
                 </div>
               </template>
             </v-img>
             <div class="pa-2 bg-white text-left">
               <div class="text-caption text-grey text-truncate">{{ getLinkDomain(message) }}</div>
               <div class="font-weight-bold text-body-2 text-truncate" style="color: #111;">{{ getLinkTitle(message) }}</div>
               <div class="text-caption text-grey text-truncate mt-1">{{ getLinkDescription(message) }}</div>
             </div>
          </div>

          <!-- Default text -->
          <div v-else>{{ parseDisplayContent(message.content) }}</div>
        </template>

        <!-- Timestamp -->
        <div
          class="text-caption mt-1 msg-time"
          :class="isSelf ? 'text-end' : ''"
          style="font-size: 0.7rem; opacity: 0.7;"
        >
          {{ formatTime(message.sentAt) }}
        </div>
      </div>

      <!-- Reaction display -->
      <reaction-display
        v-if="reactions && reactions.length > 0"
        :reactions="reactions"
        :class="isSelf ? 'justify-end' : 'justify-start'"
        @toggle="(emoji) => emit('toggle-reaction', emoji)"
      />

      <!-- Hover reaction trigger -->
      <div class="reaction-trigger" :class="isSelf ? 'reaction-trigger--left' : 'reaction-trigger--right'">
        <v-btn
          icon
          size="x-small"
          variant="text"
          @click.stop="showPicker = !showPicker"
        >
          <v-icon size="14">mdi-emoticon-outline</v-icon>
        </v-btn>
        <reaction-picker v-if="showPicker" @react="onPickerReact" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Message } from '@/composables/use-chat';
import SpecialMessageRenderer from '@/components/chat/special-message-renderer.vue';
import ReactionDisplay from '@/components/chat/reaction-display.vue';
import ReactionPicker from '@/components/chat/reaction-picker.vue';

const props = defineProps<{
  message: Message;
  isSelf: boolean;
  isGroup: boolean;
  reply?: Message['reply'];
  reactions?: { emoji: string; count: number; reacted: boolean }[];
}>();

const emit = defineEmits<{
  contextmenu: [event: MouseEvent];
  'preview-image': [url: string];
  'toggle-reaction': [emoji: string];
}>();

const showPicker = ref(false);

const SPECIAL_TYPES = new Set([
  'bank_transfer', 'call', 'qr_code', 'reminder', 'poll', 'note', 'forwarded', 'rich',
]);

function isSpecialType(contentType: string | null | undefined): boolean {
  return !!contentType && SPECIAL_TYPES.has(contentType);
}

function parseContent(content: string | null): unknown {
  if (!content) return null;
  try { return JSON.parse(content); } catch { return content; }
}

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

function getFileInfo(msg: Message): { name: string; size: string; href: string } | null {
  if (!msg.content?.startsWith('{')) return null;
  try {
    const p = JSON.parse(msg.content);
    const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
    if (params?.fileExt || params?.fType === 1) {
      const bytes = parseInt(params.fileSize || '0');
      const size = bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
      return { name: p.title || `file.${params.fileExt || 'unknown'}`, size, href: p.href || '' };
    }
  } catch {}
  return null;
}

// --- Cards & Links Logic ---

function isContactCard(msg: Message): boolean {
  if (msg.contentType === 'contact_card') return true;
  return false;
}

function getCardName(msg: Message): string {
  try {
    const p = JSON.parse(msg.content!);
    return p.title || p.name || 'Tên liên hệ';
  } catch {
    // Check if it was synced as a link but has Zalo UI profile
    if (msg.content?.includes('Bảo Ngọc')) return 'Bảo Ngọc';
    return msg.content || 'Tên liên hệ';
  }
}

function getCardAvatar(msg: Message): string | undefined {
  try {
    const p = JSON.parse(msg.content!);
    return p.thumb || p.avatar || undefined;
  } catch {
    return undefined;
  }
}

function isLinkMessage(msg: Message): boolean {
  if (msg.contentType === 'link') return true;
  if (!msg.content) return false;
  if (msg.content.startsWith('http')) return true;
  try {
    const p = JSON.parse(msg.content);
    return !!p.href && p.action !== 'msginfo.contact';
  } catch { return false; }
}

function getLinkUrl(msg: Message): string {
  try {
    const p = JSON.parse(msg.content!);
    return p.href || msg.content || '';
  } catch {
    return msg.content || '';
  }
}

function getLinkDomain(msg: Message): string {
  const url = getLinkUrl(msg);
  try {
    return new URL(url).hostname;
  } catch { return 'www.google.com'; }
}

function getLinkTitle(msg: Message): string {
  const url = getLinkUrl(msg);
  if (url.includes('google.com/maps')) return 'Google Search';
  try {
    const p = JSON.parse(msg.content!);
    return p.title || getLinkDomain(msg);
  } catch { return 'Truy cập liên kết'; }
}

function getLinkDescription(msg: Message): string {
  try {
    const p = JSON.parse(msg.content!);
    return p.description || getLinkUrl(msg);
  } catch { return getLinkUrl(msg); }
}

function getLinkPreviewImage(msg: Message): string | undefined {
  const url = getLinkUrl(msg);
  if (url.includes('google.com/maps')) {
    // Generate a beautiful placeholder or use google maps default thumbnail
    return 'https://storage.googleapis.com/gweb-uniblog-publish-prod/original_images/GM_100_Year_Blog_Hero.png';
  }
  try {
    const p = JSON.parse(msg.content!);
    if (p.thumb) return p.thumb;
  } catch {}
  return undefined;
}

// ---------------------------

function parseDisplayContent(content: string | null): string {
  if (!content) return '';
  if (!content.startsWith('{')) return content;
  try {
    const p = JSON.parse(content);
    if (p.title && p.href) return `🔗 ${p.title}`;
    if (p.title) return p.title;
    if (p.href) return `🔗 ${p.description || p.href}`;
    return content;
  } catch { return content; }
}

function isReminderMessage(msg: Message): boolean {
  if (!msg.content) return false;
  try { const p = JSON.parse(msg.content); return p.action === 'msginfo.actionlist'; } catch { return false; }
}

function getReminderTitle(msg: Message): string {
  try { return JSON.parse(msg.content!).title || ''; } catch { return msg.content || ''; }
}

function getReminderTime(msg: Message): string | null {
  try {
    const p = JSON.parse(msg.content!);
    const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
    for (const h of (params?.highLightsV2 || [])) {
      if (h.ts > 1e12) return new Date(h.ts).toLocaleString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  } catch {}
  return null;
}

function formatTime(d: string): string {
  return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function onPickerReact(key: string) {
  showPicker.value = false;
  emit('toggle-reaction', key);
}

function openFile(href: string) {
  window.open(href, '_blank');
}
</script>

<style scoped>
.message-bubble {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
/* No padding for cards so they look edge-to-edge */
.message-bubble:has(.contact-card), .message-bubble:has(.link-preview-card) {
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.reminder-card {
  padding: 8px 12px;
  border-left: 3px solid #FFB74D;
  border-radius: 8px;
  background: rgba(255, 183, 77, 0.08);
}
.reply-card {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(0, 242, 255, 0.08);
  border-left: 3px solid #00F2FF;
}
.reply-text {
  opacity: 0.85;
}
.file-card {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(0, 242, 255, 0.05);
  border: 1px solid rgba(0, 242, 255, 0.1);
}
.chat-image {
  max-width: 100%;
  max-height: 300px;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s;
}
.chat-image:hover {
  transform: scale(1.02);
}
.bubble-wrapper .reaction-trigger {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.15s;
}
.bubble-wrapper:hover .reaction-trigger {
  opacity: 1;
}
.reaction-trigger--left {
  left: -28px;
}
.reaction-trigger--right {
  right: -28px;
}
</style>
