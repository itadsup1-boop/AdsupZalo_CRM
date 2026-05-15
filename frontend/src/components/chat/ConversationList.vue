<template>
  <div class="conversation-list d-flex flex-column" style="width: 100%; border-right: 1px solid var(--border-glow, rgba(0,242,255,0.1)); height: 100%;">
    <!-- Account filter + Search -->
    <div class="pa-2">
      <v-select
        v-model="selectedAccountId"
        :items="accountOptions"
        item-title="text"
        item-value="value"
        label="Tài khoản Zalo"
        density="compact"
        variant="solo-filled"
        hide-details
        clearable
        class="mb-2"
        @update:model-value="$emit('filter-account', $event)"
      >
        <template #append-inner>
          <v-btn
            icon="mdi-sync"
            size="x-small"
            color="cyan"
            variant="text"
            :loading="syncing"
            class="mr-1"
            title="Đồng bộ danh bạ & nhóm"
            @click.stop="handleSync"
          />
        </template>
      </v-select>
      <v-text-field
        :model-value="search"
        @update:model-value="$emit('update:search', $event)"
        placeholder="Tìm kiếm..."
        prepend-inner-icon="mdi-magnify"
        variant="solo-filled"
        density="compact"
        hide-details
        clearable
      />
    </div>

    <!-- Tab switcher: Main / Other -->
    <div class="d-flex px-2 pb-1">
      <v-btn-toggle v-model="activeTab" mandatory density="compact" color="primary" class="w-100">
        <v-btn value="main" size="small" class="flex-grow-1">Chính</v-btn>
        <v-btn value="other" size="small" class="flex-grow-1">Khác</v-btn>
      </v-btn-toggle>
    </div>

    <!-- Filter bar -->
    <div class="d-flex flex-wrap gap-2 px-2 pb-2">
      <v-chip
        :class="['filter-chip', { 'active-unread': filters.unread }]"
        :variant="filters.unread ? 'elevated' : 'outlined'"
        color="primary"
        size="small"
        @click="toggleFilter('unread')"
      >
        <v-icon icon="mdi-email-outline" start size="14" />
        Chưa đọc
        <span v-if="counts.unread > 0" class="filter-badge ml-1">{{ counts.unread > 99 ? '99+' : counts.unread }}</span>
      </v-chip>

      <v-chip
        :class="['filter-chip', { 'active-unreplied': filters.unreplied }]"
        :variant="filters.unreplied ? 'elevated' : 'outlined'"
        color="warning"
        size="small"
        @click="toggleFilter('unreplied')"
      >
        <v-icon icon="mdi-reply-outline" start size="14" />
        Chưa trả lời
        <span v-if="counts.unreplied > 0" class="filter-badge warn ml-1">{{ counts.unreplied > 99 ? '99+' : counts.unreplied }}</span>
      </v-chip>

      <!-- Date range filter -->
      <v-menu v-model="showDateMenu" :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: menuProps }">
          <v-chip
            v-bind="menuProps"
            :class="['filter-chip', { 'active-date': hasDateFilter }]"
            :variant="hasDateFilter ? 'elevated' : 'outlined'"
            color="secondary"
            size="small"
          >
            <v-icon icon="mdi-calendar-range" start size="14" />
            {{ dateLabel }}
          </v-chip>
        </template>
        <v-card min-width="280" class="pa-3 glass-card">
          <div class="text-subtitle-2 mb-2">Lọc theo thời gian</div>
          <v-text-field
            v-model="filters.from"
            label="Từ ngày"
            type="date"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-2"
          />
          <v-text-field
            v-model="filters.to"
            label="Đến ngày"
            type="date"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-2"
          />
          <div class="d-flex gap-2 justify-end">
            <v-btn size="small" variant="text" @click="clearDateFilter">Xóa</v-btn>
            <v-btn size="small" color="primary" @click="showDateMenu = false">Áp dụng</v-btn>
          </div>
        </v-card>
      </v-menu>

      <!-- Zalo Label filter -->
      <v-menu v-model="showTagMenu" :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: menuProps }">
          <v-chip
            v-bind="menuProps"
            :class="['filter-chip', { 'active-label': activeZaloLabelIds.length > 0 }]"
            :variant="activeZaloLabelIds.length > 0 ? 'elevated' : 'outlined'"
            color="deep-purple-lighten-1"
            size="small"
            @click="loadZaloLabelsIfNeeded"
          >
            <v-icon icon="mdi-label-outline" start size="14" />
            Phân loại
            <span v-if="activeZaloLabelIds.length > 0" class="filter-badge purple ml-1">{{ activeZaloLabelIds.length }}</span>
          </v-chip>
        </template>
        <v-card min-width="240" class="glass-card">
          <v-card-text class="pa-2">
            <div class="text-caption text-medium-emphasis mb-2 px-1">Theo thẻ phân loại</div>
            <v-progress-linear v-if="loadingZaloLabels" indeterminate color="primary" height="2" class="mb-2"/>
            <div v-if="zaloLabels.length === 0 && !loadingZaloLabels" class="text-caption text-grey pa-2">Không có thẻ nào</div>
            <v-list density="compact" class="pa-0 bg-transparent">
              <v-list-item
                v-for="label in zaloLabels"
                :key="label.id"
                @click="toggleZaloLabel(label)"
                class="rounded-lg mb-1"
              >
                <template v-slot:prepend>
                  <v-checkbox-btn
                    :model-value="activeZaloLabelIds.includes(String(label.id))"
                    color="primary"
                    style="pointer-events: none;"
                    class="mr-1"
                  />
                  <div class="label-dot mr-2" :style="{ background: getZaloLabelColor(label.color) }"></div>
                </template>
                <v-list-item-title class="text-body-2">{{ label.text }}</v-list-item-title>
              </v-list-item>
            </v-list>
            <v-divider class="my-1" />
            <div class="pa-1">
              <v-btn
                variant="text"
                block
                color="primary"
                size="small"
                prepend-icon="mdi-cog-outline"
                @click="showLabelManager = true; showTagMenu = false"
                class="rounded-lg"
              >
                Quản lý thẻ phân loại
              </v-btn>
            </div>
          </v-card-text>
        </v-card>
      </v-menu>

      <!-- Clear all -->
      <v-chip
        v-if="hasAnyFilter"
        size="small"
        variant="text"
        color="error"
        class="filter-chip-clear"
        @click="clearAllFilters"
      >
        <v-icon icon="mdi-close-circle-outline" start size="14" />
        Xóa lọc
      </v-chip>

      <!-- Label Manager Dialog -->
      <LabelManagerDialog
        v-if="labelManagerAccountId"
        v-model="showLabelManager"
        :account-id="labelManagerAccountId"
        @updated="onLabelsUpdated"
      />
    </div>

    <!-- List -->
    <v-list class="flex-grow-1 overflow-y-auto pa-0" density="compact">
      <v-progress-linear v-if="loading" indeterminate color="primary" />

      <v-list-item
        v-for="conv in conversations"
        :key="conv.id"
        :active="conv.id === selectedId"
        @click="$emit('select', conv.id)"
        @contextmenu.prevent="openContextMenu($event, conv)"
        class="py-2"
        :class="{ 'conversation-active': conv.id === selectedId, 'bg-blue-lighten-5': conv.unreadCount > 0 && conv.id !== selectedId }"
      >
        <template #prepend>
          <v-avatar size="40" color="grey-lighten-2">
            <v-icon v-if="conv.threadType === 'group'" icon="mdi-account-group" />
            <v-img v-else-if="conv.contact?.avatarUrl" :src="conv.contact.avatarUrl" />
            <v-icon v-else icon="mdi-account" />
          </v-avatar>
        </template>

        <v-list-item-title class="d-flex align-center">
          <span class="text-truncate" :class="{ 'font-weight-bold': conv.unreadCount > 0 }">
            {{ conv.threadType === 'group' ? (conv.contact?.fullName || 'Nhóm') : (conv.contact?.crmName || conv.contact?.fullName || 'Unknown') }}
          </span>
          <v-chip v-if="conv.threadType === 'group'" size="x-small" color="info" variant="tonal" class="ml-1">Nhóm</v-chip>
          <v-spacer />
          <span class="text-caption text-grey ml-1">{{ formatTime(conv.lastMessageAt) }}</span>
        </v-list-item-title>

        <v-list-item-subtitle class="d-flex align-center">
          <span class="text-truncate" style="max-width: 200px;" :class="{ 'font-weight-medium': conv.unreadCount > 0 }">
            {{ lastMessagePreview(conv) }}
          </span>
          <v-spacer />
          <AiSentimentBadge v-if="parseSentiment(conv)" :sentiment="parseSentiment(conv)" class="mr-2" />
          <v-badge
            v-if="conv.unreadCount > 0"
            :content="conv.unreadCount"
            color="error"
            inline
          />
        </v-list-item-subtitle>

        <!-- Zalo account indicator -->
        <template #append>
          <span v-if="conv.zaloAccount?.displayName" class="text-caption text-grey-darken-1 ml-1" style="font-size: 0.65rem; max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            {{ conv.zaloAccount.displayName }}
          </span>
        </template>
      </v-list-item>

      <div v-if="!loading && conversations.length === 0" class="text-center pa-8 text-grey">
        Chưa có cuộc trò chuyện nào
      </div>
    </v-list>

    <!-- Context menu for tab actions -->
    <v-menu
      v-model="contextMenu.show"
      :target="[contextMenu.x, contextMenu.y]"
      location="end"
    >
      <v-list density="compact">
        <v-list-item
          v-if="activeTab === 'main'"
          prepend-icon="mdi-archive-arrow-down-outline"
          @click="moveConversation(contextMenu.convId, 'other')"
        >
          <v-list-item-title>Chuyển sang tab Khác</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-else
          prepend-icon="mdi-archive-arrow-up-outline"
          @click="moveConversation(contextMenu.convId, 'main')"
        >
          <v-list-item-title>Chuyển sang tab Chính</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
    
    <v-snackbar v-model="snackbar" timeout="3000" color="success">
      {{ snackbarText }}
      <template v-slot:actions>
        <v-btn variant="text" @click="snackbar = false">Đóng</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import type { Conversation, AiSentiment } from '@/composables/use-chat';
import { api } from '@/api/index';
import AiSentimentBadge from '@/components/ai/ai-sentiment-badge.vue';
import LabelManagerDialog from '@/components/chat/LabelManagerDialog.vue';

const props = defineProps<{
  conversations: Conversation[];
  selectedId: string | null;
  loading: boolean;
  search: string;
  accountId?: string | null;
}>();

const emit = defineEmits<{
  select: [id: string];
  'update:search': [value: string];
  'filter-account': [accountId: string | null];
  'update:filters': [params: Record<string, string>];
  'tab-changed': [tab: string];
  'conversation-moved': [id: string, tab: string];
}>();

// ── Tab state ──────────────────────────────────────────────────────────────
const activeTab = ref('main');

// ── Context menu state ─────────────────────────────────────────────────────
const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  convId: '',
});

// ── Account selector ────────────────────────────────────────────────────────
const accountOptions = ref<{ text: string; value: string }[]>([]);
const selectedAccountId = ref<string | null>(null);
const syncing = ref(false);
const snackbar = ref(false);
const snackbarText = ref('');

// Sync with prop if provided
watch(() => props.accountId, (val) => {
  selectedAccountId.value = val || null;
}, { immediate: true });

async function handleSync() {
  const targets = selectedAccountId.value 
    ? [selectedAccountId.value] 
    : accountOptions.value.filter(a => (a as any).status === 'connected').map(a => a.value);

  if (targets.length === 0) {
    snackbarText.value = 'Vui lòng chọn hoặc kết nối ít nhất một tài khoản Zalo để đồng bộ.';
    snackbar.value = true;
    return;
  }

  syncing.value = true;
  let totalStats = { contactsCreated: 0, groupsCreated: 0, messagesSynced: 0 };

  try {
    for (const id of targets) {
      try {
        const res = await api.post(`/zalo-accounts/${id}/sync-full`);
        const stats = res.data.stats;
        totalStats.contactsCreated += stats.contactsCreated;
        totalStats.groupsCreated += stats.groupsCreated;
        totalStats.messagesSynced += stats.messagesSynced;
      } catch (e) {
        console.error(`Sync failed for account ${id}`, e);
      }
    }
    snackbarText.value = `Đồng bộ xong! Tổng cộng: +${totalStats.contactsCreated} liên hệ, +${totalStats.groupsCreated} nhóm, +${totalStats.messagesSynced} tin nhắn.`;
    snackbar.value = true;
    // Refresh list
    emit('filter-account', selectedAccountId.value);
  } catch (err: any) {
    console.error('Sync process failed:', err);
    snackbarText.value = 'Đồng bộ thất bại: ' + (err.response?.data?.error || err.message);
    snackbar.value = true;
  } finally {
    syncing.value = false;
  }
}

// ── Filter state ────────────────────────────────────────────────────────────
const filters = reactive({
  unread: false,
  unreplied: false,
  from: null as string | null,
  to: null as string | null,
  tags: [] as string[],
});

const counts = reactive({ unread: 0, unreplied: 0, total: 0 });
const availableTags = ref<string[]>([]);
const showDateMenu = ref(false);
const showTagMenu = ref(false);

// ── Zalo Label filter state ─────────────────────────────────────────────────
const zaloLabels = ref<any[]>([]);
const activeZaloLabelIds = ref<string[]>([]);
const loadingZaloLabels = ref(false);
const showLabelManager = ref(false);

const labelManagerAccountId = computed(() => {
  if (selectedAccountId.value) {
    // Even if selected, if it's disconnected, user might want to know
    return selectedAccountId.value;
  }
  // If "All Zalo", pick the first CONNECTED account to manage
  const connected = accountOptions.value.find(a => (a as any).status === 'connected');
  return connected?.value || accountOptions.value[0]?.value || null;
});

function onLabelsUpdated() {
  zaloLabels.value = []; // Force reload
  loadZaloLabelsIfNeeded();
}

const ZALO_LABEL_COLORS: Record<string, string> = {
  '1': '#F44336', '2': '#E91E63', '3': '#FF9800',
  '4': '#FFEB3B', '5': '#4CAF50', '6': '#2196F3',
  '7': '#9C27B0', '8': '#607D8B', '9': '#009688',
};

function getZaloLabelColor(c: string | number) {
  return ZALO_LABEL_COLORS[String(c)] || '#9E9E9E';
}

async function loadZaloLabelsIfNeeded() {
  if (zaloLabels.value.length > 0 && !loadingZaloLabels.value) return;

  loadingZaloLabels.value = true;
  try {
    const accRes = await api.get('/zalo-accounts');
    const accounts: any[] = Array.isArray(accRes.data) ? accRes.data : accRes.data.accounts || [];
    if (!accounts.length) {
      zaloLabels.value = [];
      return;
    }

    let targetAccounts = selectedAccountId.value 
      ? accounts.filter(a => a.id === selectedAccountId.value)
      : accounts;

    const labelMap = new Map<string, any>(); // Map by text to merge similar labels across accounts

    for (const acc of targetAccounts) {
      try {
        const res = await api.get(`/zalo-accounts/${acc.id}/labels`);
        const labels = res.data.labels || [];
        labels.forEach((l: any) => {
          const key = `${l.id}_${l.text}`; // Use ID + Text to distinguish
          if (!labelMap.has(key)) {
            labelMap.set(key, { ...l });
          } else {
            // Merge conversations
            const existing = labelMap.get(key);
            existing.conversations = [...new Set([...(existing.conversations || []), ...(l.conversations || [])])];
          }
        });
      } catch (e) {
        console.error(`Failed to load labels for account ${acc.id}`, e);
      }
    }

    zaloLabels.value = Array.from(labelMap.values()).sort((a, b) => (a.id || 0) - (b.id || 0));
  } catch (e) {
    console.error('Failed to load Zalo labels', e);
    zaloLabels.value = [];
  } finally {
    loadingZaloLabels.value = false;
  }
}

function toggleZaloLabel(label: any) {
  const labelId = String(label.id);
  const idx = activeZaloLabelIds.value.indexOf(labelId);
  if (idx === -1) {
    activeZaloLabelIds.value = [...activeZaloLabelIds.value, labelId];
  } else {
    activeZaloLabelIds.value = activeZaloLabelIds.value.filter(id => id !== labelId);
  }
  // Emit as filter param — filtered client-side by conversation list
  emitLabelFilter();
}

function emitLabelFilter() {
  const params = buildFilterParams();
  if (activeZaloLabelIds.value.length > 0) {
    // Compute the union of externalThreadIds for all active labels
    const convIdSet = new Set<string>();
    for (const label of zaloLabels.value) {
      if (activeZaloLabelIds.value.includes(String(label.id))) {
        (label.conversations || []).forEach((id: string) => convIdSet.add(id));
      }
    }
    params._zaloLabelConvIds = Array.from(convIdSet).join(',');
  } else {
    params._zaloLabelConvIds = '';
  }
  emit('update:filters', params);
}

// ── Computed helpers ────────────────────────────────────────────────────────
const hasDateFilter = computed(() => !!(filters.from || filters.to));

const hasAnyFilter = computed(
  () => filters.unread || filters.unreplied || hasDateFilter.value || filters.tags.length > 0 || activeZaloLabelIds.value.length > 0
);

const dateLabel = computed(() => {
  if (!hasDateFilter.value) return 'Thời gian';
  if (filters.from && filters.to) {
    return `${formatDateShort(filters.from)} – ${formatDateShort(filters.to)}`;
  }
  if (filters.from) return `Từ ${formatDateShort(filters.from)}`;
  return `Đến ${formatDateShort(filters.to!)}`;
});

// ── Filter actions ──────────────────────────────────────────────────────────
function toggleFilter(key: 'unread' | 'unreplied') {
  filters[key] = !filters[key];
}

function clearDateFilter() {
  filters.from = null;
  filters.to = null;
  showDateMenu.value = false;
}

function clearAllFilters() {
  filters.unread = false;
  filters.unreplied = false;
  filters.from = null;
  filters.to = null;
  filters.tags = [];
  activeZaloLabelIds.value = [];
  emitLabelFilter();
}

function buildFilterParams(): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.unread) params.unread = 'true';
  if (filters.unreplied) params.unreplied = 'true';
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.tags.length > 0) params.tags = filters.tags.join(',');
  params.tab = activeTab.value;
  return params;
}

// ── Context menu ───────────────────────────────────────────────────────────
function openContextMenu(event: MouseEvent, conv: Conversation) {
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.convId = conv.id;
  contextMenu.show = true;
}

async function moveConversation(convId: string, targetTab: string) {
  contextMenu.show = false;
  try {
    await api.patch(`/conversations/${convId}/tab`, { tab: targetTab });
    emit('conversation-moved', convId, targetTab);
  } catch (err) {
    console.error('Failed to move conversation:', err);
  }
}

// ── Counts fetch ────────────────────────────────────────────────────────────
async function fetchCounts() {
  try {
    const params: Record<string, string> = { tab: activeTab.value };
    if (selectedAccountId.value) params.accountId = selectedAccountId.value;
    const res = await api.get('/conversations/counts', { params });
    counts.unread = res.data.unread ?? 0;
    counts.unreplied = res.data.unreplied ?? 0;
    counts.total = res.data.total ?? 0;
  } catch {
    // Non-critical — badges just won't show counts
  }
}

// ── Available tags fetch ────────────────────────────────────────────────────
async function fetchAvailableTags() {
  try {
    const res = await api.get('/contacts', { params: { limit: '200', fields: 'tags' } });
    const contacts: any[] = Array.isArray(res.data) ? res.data : res.data.contacts || [];
    const tagSet = new Set<string>();
    for (const c of contacts) {
      const tags = Array.isArray(c.tags) ? c.tags : [];
      tags.forEach((t: string) => tagSet.add(t));
    }
    availableTags.value = Array.from(tagSet).sort();
  } catch {
    // Non-critical — tag filter will show empty list
  }
}

// ── Watchers ────────────────────────────────────────────────────────────────
watch(
  filters,
  () => emit('update:filters', buildFilterParams()),
  { deep: true }
);

watch(activeTab, () => {
  emit('tab-changed', activeTab.value);
  emit('update:filters', buildFilterParams());
  fetchCounts();
});

watch(selectedAccountId, () => {
  fetchCounts();
  // Clear Zalo labels so they reload for the new account
  zaloLabels.value = [];
  activeZaloLabelIds.value = [];
  emitLabelFilter();
});

// ── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const res = await api.get('/zalo-accounts');
    const accounts = Array.isArray(res.data) ? res.data : res.data.accounts || [];
    accountOptions.value = accounts.map((a: any) => ({
      text: a.displayName || a.zaloUid || a.id,
      value: a.id,
      status: a.status,
    }));
  } catch {
    // Non-critical — filter just won't show accounts
  }

  await Promise.all([fetchCounts(), fetchAvailableTags()]);
});

// ── Utility functions ───────────────────────────────────────────────────────
function lastMessagePreview(conv: Conversation): string {
  const msg = conv.messages?.[0];
  if (!msg) return '';
  if (msg.isDeleted) return '(đã thu hồi)';
  const prefix = msg.senderType === 'self' ? 'Bạn: ' : '';

  switch (msg.contentType) {
    case 'image': return prefix + '📷 Hình ảnh';
    case 'sticker': return prefix + '🏷️ Sticker';
    case 'video': return prefix + '🎥 Video';
    case 'voice': return prefix + '🎤 Tin nhắn thoại';
    case 'gif': return prefix + 'GIF';
    case 'file': return prefix + '📎 Tệp đính kèm';
    case 'link': return prefix + '🔗 Liên kết';
    case 'bank_transfer': return prefix + '🏦 Chuyển khoản';
    case 'call': return prefix + '📞 Cuộc gọi';
    case 'qr_code': return prefix + '📱 Mã QR';
    case 'reminder': return prefix + '📅 Nhắc hẹn';
    case 'poll': return prefix + '📊 Bình chọn';
    case 'note': return prefix + '📝 Ghi chú';
    case 'forwarded': return prefix + '↩️ Chuyển tiếp';
    case 'contact_card': return prefix + '👤 Danh thiếp';
    case 'rich': return prefix + '📋 Tin nhắn đặc biệt';
  }

  // Reminder/calendar messages (legacy — before contentType was set)
  if (msg.content) {
    try {
      const p = JSON.parse(msg.content);
      if (p.action === 'msginfo.actionlist' && p.title) {
        return prefix + '📅 ' + p.title.slice(0, 50);
      }
    } catch { /* not JSON */ }
  }

  const text = msg.content || '';
  return prefix + (text.length > 50 ? text.slice(0, 50) + '...' : text);
}

function parseSentiment(conv: Conversation): AiSentiment | null {
  const raw = (conv.contact as any)?.metadata?.aiSentiment;
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) return `${diffDays} ngày`;

  return date.toLocaleDateString('vi-VN');
}

function formatDateShort(dateStr: string): string {
  // dateStr is YYYY-MM-DD from <input type="date">
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}
</script>

<style scoped>
.label-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.filter-chip {
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
  border-radius: 100px !important;
  font-weight: 600 !important;
  letter-spacing: 0.1px;
  border-width: 1.5px !important;
  font-size: 0.75rem !important;
  height: 30px !important;
}

.filter-chip:hover {
  transform: translateY(-1.5px);
  box-shadow: 0 4px 10px rgba(0,0,0,0.15) !important;
}

.active-unread {
  background: linear-gradient(135deg, #00F2FF, #0088FF) !important;
  border-color: transparent !important;
  color: #fff !important;
}

.active-unreplied {
  background: linear-gradient(135deg, #FF9800, #F44336) !important;
  border-color: transparent !important;
  color: #fff !important;
}

.active-date {
  background: linear-gradient(135deg, #607D8B, #455A64) !important;
  border-color: transparent !important;
  color: #fff !important;
}

.active-label {
  background: linear-gradient(135deg, #9C27B0, #673AB7) !important;
  border-color: transparent !important;
  color: #fff !important;
}

.filter-badge {
  background: rgba(255, 255, 255, 0.9);
  color: #F44336;
  font-size: 0.7rem;
  padding: 0 5px;
  border-radius: 10px;
  min-width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.filter-badge.warn { color: #FF9800; }
.filter-badge.purple { color: #9C27B0; }

/* Apply darker colors for white-text badges when chip is active */
.active-unread .filter-badge { color: #0088FF; }
.active-unreplied .filter-badge { color: #F44336; }
.active-label .filter-badge { color: #673AB7; }

.filter-chip-clear {
  font-weight: 700 !important;
  opacity: 0.8;
}
.filter-chip-clear:hover {
  opacity: 1;
}

.glass-card {
  background: rgba(25, 30, 45, 0.9) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}
</style>
