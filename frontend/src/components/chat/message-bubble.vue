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
          <VideoMessageBubble
            v-else-if="message.contentType === 'video'"
            :video-url="getVideoUrl(message)"
            :thumbnail-url="getVideoThumbnailUrl(message)"
            :duration="getVideoDuration(message)"
          />
          <VoiceMessageBubble
            v-else-if="message.contentType === 'voice' || message.contentType === 'audio'"
            :audio-url="getAudioUrl(message)"
            :duration-ms="getAudioDuration(message)"
          />
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

          <!-- Location / Map -->
          <div v-else-if="getLocationInfo(message)" class="location-card" @click="openFile(getLocationInfo(message)!.mapsUrl)">
            <div class="location-map-placeholder d-flex align-center justify-center">
              <v-icon size="32" color="white">mdi-map-marker</v-icon>
            </div>
            <div class="location-card-body pa-3">
              <div class="d-flex align-center mb-1">
                <v-icon size="14" color="error" class="mr-1">mdi-map-marker-radius</v-icon>
                <span class="text-caption font-weight-bold" style="color: #E53935;">Vị trí</span>
              </div>
              <div class="text-body-2 font-weight-medium location-address">{{ getLocationInfo(message)!.address || 'Xem trên bản đồ' }}</div>
              <div class="text-caption mt-1" style="color: #1a73e8;">Mở Google Maps ↗</div>
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
          {{ formatMessageTimestamp(message.sentAt) }}
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
import VoiceMessageBubble from '@/components/chat/voice-message-bubble.vue';
import VideoMessageBubble from '@/components/chat/video-message-bubble.vue';
import { formatMessageTimestamp } from '@/utils/date-formatter';


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
  if (msg.contentType !== 'image') return null;
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

function getAudioUrl(msg: Message): string {
  if (msg.fileUrl) return msg.fileUrl;
  
  // Try finding in attachments (e.g. from webhook sync)
  if (msg.attachments && msg.attachments.length > 0) {
    const audioAttachment = msg.attachments.find((a: any) => a.type === 'audio');
    if (audioAttachment?.payload?.url) return audioAttachment.payload.url;
    if (audioAttachment?.url) return audioAttachment.url;
  }
  
  // Try parsing content
  if (msg.content?.startsWith('{')) {
    try {
      const p = JSON.parse(msg.content);
      if (p.href && (p.href.includes('.m4a') || p.href.includes('.mp3') || p.href.includes('.aac') || p.href.includes('.amr'))) {
        return p.href;
      }
    } catch {}
  }
  
  return '';
}

function getVideoUrl(msg: Message): string {
  if (msg.fileUrl) return msg.fileUrl;

  if (msg.attachments && msg.attachments.length > 0) {
    const videoAttachment = msg.attachments.find((a: any) => a.type === 'video');
    if (videoAttachment?.payload?.url) return videoAttachment.payload.url;
    if (videoAttachment?.url) return videoAttachment.url;
  }

  if (msg.content?.startsWith('{')) {
    try {
      const p = JSON.parse(msg.content);
      const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
      return p.href || p.url || params?.url || params?.mp4 || params?.videoUrl || '';
    } catch {}
  }

  return msg.content?.startsWith('http') ? msg.content : '';
}

function getVideoThumbnailUrl(msg: Message): string {
  if (msg.attachments && msg.attachments.length > 0) {
    const videoAttachment = msg.attachments.find((a: any) => a.type === 'video');
    const payload = videoAttachment?.payload || {};
    if (payload.thumbnailUrl) return payload.thumbnailUrl;
    if (payload.thumbUrl) return payload.thumbUrl;
    if (videoAttachment?.thumbnailUrl) return videoAttachment.thumbnailUrl;
  }

  if (msg.content?.startsWith('{')) {
    try {
      const p = JSON.parse(msg.content);
      const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
      return p.thumb || p.thumbnail || p.thumbnailUrl || params?.thumb || params?.thumbnailUrl || '';
    } catch {}
  }

  return '';
}

function getVideoDuration(msg: Message): number | undefined {
  if (msg.duration && msg.duration > 0) return msg.duration;
  if (msg.attachments && msg.attachments.length > 0) {
    const videoAttachment = msg.attachments.find((a: any) => a.type === 'video');
    const duration = Number(videoAttachment?.payload?.duration ?? videoAttachment?.duration);
    if (Number.isFinite(duration) && duration > 0) return duration;
  }
  if (msg.content?.startsWith('{')) {
    try {
      const content = JSON.parse(msg.content);
      const params = typeof content.params === 'string' ? JSON.parse(content.params) : content.params;
      const duration = Number(params?.duration ?? content.duration);
      if (Number.isFinite(duration) && duration > 0) return duration;
    } catch {}
  }
  return undefined;
}

function getAudioDuration(msg: Message): number {
  if (msg.duration && msg.duration > 0) return msg.duration;
  if (!msg.content?.startsWith('{')) return 0;
  try {
    const content = JSON.parse(msg.content);
    const params = typeof content.params === 'string' ? JSON.parse(content.params) : content.params;
    const duration = Number(params?.duration ?? content.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch {
    return 0;
  }
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

function getLocationInfo(msg: Message): { address: string; mapsUrl: string } | null {
  if (!msg.content?.startsWith('{')) return null;
  try {
    const p = JSON.parse(msg.content);
    if (p._type === 'location') {
      return {
        address: p.address || '',
        mapsUrl: p.mapsUrl || `https://www.google.com/maps?q=${p.latitude},${p.longitude}`,
      };
    }
    // fallback: detect bằng tọa độ nếu không có _type
    if (typeof p.latitude === 'number' && typeof p.longitude === 'number') {
      return {
        address: p.description || p.address || '',
        mapsUrl: `https://www.google.com/maps?q=${p.latitude},${p.longitude}`,
      };
    }
  } catch {}
  return null;
}

function parseDisplayContent(content: string | null): string {
  if (!content) return '';
  if (!content.startsWith('{')) return content;
  try {
    const p = JSON.parse(content);
    if (p._type === 'location') return `📍 ${p.address || 'Vị trí'}`;
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
.location-card {
  border-radius: 10px;
  overflow: hidden;
  width: 240px;
  cursor: pointer;
  border: 1px solid #E0E0E0;
  transition: box-shadow 0.2s;
}
.location-card:hover {
  box-shadow: 0 4px 12px rgba(26,115,232,0.2);
}
.location-map-placeholder {
  height: 110px;
  background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Ccircle cx='50' cy='50' r='40' fill='none' stroke='rgba(255,255,255,0.15)' stroke-width='1'/%3E%3Ccircle cx='50' cy='50' r='25' fill='none' stroke='rgba(255,255,255,0.1)' stroke-width='1'/%3E%3C/svg%3E");
}
.location-card-body {
  background: white;
}
.location-address {
  color: #212121;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
