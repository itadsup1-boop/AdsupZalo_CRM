<template>
  <div
    class="chat-contact-panel d-flex flex-column"
    style="width: 320px; border-left: 1px solid rgba(0,0,0,0.12); height: 100%; overflow-y: auto; flex-shrink: 0;"
  >
    <div class="pa-3 d-flex align-center" style="border-bottom: 1px solid rgba(0,0,0,0.12);">
      <v-icon icon="mdi-account-details" class="mr-2" />
      <span class="font-weight-medium">Thông tin khách hàng</span>
      <v-spacer />
      <v-btn icon size="small" variant="text" @click="$emit('close')">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </div>

    <div class="pa-3">
      <!-- Lead score + last activity display -->
      <div v-if="props.contact" class="d-flex align-center mb-3 ga-2">
        <v-chip
          :color="scoreColor(props.contact.leadScore)"
          size="small"
          variant="tonal"
          prepend-icon="mdi-star"
        >
          {{ props.contact.leadScore ?? 0 }} điểm
        </v-chip>
        <span v-if="props.contact.lastActivity" class="text-caption text-grey">
          {{ relativeTime(props.contact.lastActivity) }}
        </span>
      </div>

      <v-text-field v-model="form.crmName" label="Tên CRM (tên thật)" density="compact" variant="outlined" class="mb-2" hide-details
        hint="Tên chuẩn hóa dùng cho automation, VD: Nguyễn Văn Hải" persistent-hint />
      <v-text-field v-model="form.fullName" label="Tên hiển thị Zalo" density="compact" variant="outlined" class="mb-2" hide-details
        hint="Tên gợi nhớ trên Zalo, VD: Hải - Quan tâm 2PN" persistent-hint />
      <v-text-field v-model="form.phone" label="Số điện thoại" density="compact" variant="outlined" class="mb-2" hide-details />
      <v-text-field v-model="form.email" label="Email" type="email" density="compact" variant="outlined" class="mb-2" hide-details />

      <v-select v-model="form.source" label="Nguồn" :items="SOURCE_OPTIONS" item-title="text" item-value="value"
        density="compact" variant="outlined" clearable class="mb-2" hide-details />

      <v-select v-model="form.status" label="Trạng thái" :items="STATUS_OPTIONS" item-title="text" item-value="value"
        density="compact" variant="outlined" clearable class="mb-2" hide-details />

      <v-text-field v-model="form.firstContactDate" label="Ngày tiếp nhận" type="date"
        density="compact" variant="outlined" class="mb-2" hide-details />

      <v-text-field v-model="form.nextAppointmentDate" label="Hẹn tái khám" type="date"
        density="compact" variant="outlined" class="mb-2" hide-details />

      <!-- Zalo Labels (Phân loại) -->
      <div class="mb-3">
        <div class="text-caption text-grey mb-1 ml-1 d-flex align-center">
          <v-icon size="14" class="mr-1">mdi-label-outline</v-icon>
          Phân loại (Zalo)
        </div>
        <div v-if="loadingLabels" class="pa-2 d-flex justify-center">
          <v-progress-circular indeterminate size="20" width="2" color="primary" />
        </div>
        <div v-else class="d-flex flex-wrap gap-1 pa-1 rounded" style="border: 1px solid rgba(0,0,0,0.12); min-height: 40px;">
          <v-chip
            v-for="tag in activeTags"
            :key="tag.id"
            size="x-small"
            :color="getZaloColor(tag.color)"
            variant="elevated"
            class="ma-1"
            style="color: white; font-weight: 500;"
          >
            {{ tag.text }}
          </v-chip>
          <v-menu v-model="showLabelMenu" :close-on-content-click="false" location="bottom end">
            <template #activator="{ props: menuProps }">
              <v-btn v-bind="menuProps" icon size="x-small" variant="text" class="ma-1">
                <v-icon>mdi-plus-circle-outline</v-icon>
              </v-btn>
            </template>
            <v-card width="240">
              <v-list density="compact" class="pa-0">
                <v-list-subheader>Chọn phân loại</v-list-subheader>
                <v-list-item
                  v-for="tag in availableLabels"
                  :key="tag.id"
                  @click="toggleZaloLabel(tag)"
                >
                  <template #prepend>
                    <v-checkbox-btn
                      :model-value="hasTag(tag)"
                      color="primary"
                      class="mr-1"
                      style="pointer-events: none;"
                    />
                    <div class="label-dot-small mr-2" :style="{ background: getZaloColor(tag.color) }"></div>
                  </template>
                  <v-list-item-title class="text-body-2">{{ tag.text }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-card>
          </v-menu>
          <div v-if="!activeTags.length && !loadingLabels" class="text-caption text-grey-lighten-1 pa-2">Chưa phân loại</div>
        </div>
      </div>

      <v-textarea v-model="form.notes" label="Ghi chú" rows="2" auto-grow
        density="compact" variant="outlined" class="mb-3" hide-details />

      <v-btn color="primary" block :loading="saving" @click="saveContact">Lưu thông tin</v-btn>

      <v-alert v-if="saveSuccess" type="success" density="compact" class="mt-2" closable @click:close="saveSuccess = false">
        Đã lưu thành công!
      </v-alert>
      <v-alert v-if="saveError" type="error" density="compact" class="mt-2" closable @click:close="saveError = false">
        Lưu thất bại, thử lại!
      </v-alert>

      <AiSummaryCard :summary="aiSummary" :loading="aiSummaryLoading" @refresh="$emit('refresh-ai-summary')" />

      <v-card variant="outlined" class="mb-3">
        <v-card-title class="d-flex align-center text-body-1">
          <v-icon class="mr-2">mdi-chart-bell-curve-cumulative</v-icon>
          Cảm xúc khách hàng
          <v-spacer />
          <v-btn size="small" variant="text" :loading="aiSentimentLoading" @click="$emit('refresh-ai-sentiment')">Làm mới</v-btn>
        </v-card-title>
        <v-card-text>
          <AiSentimentBadge :sentiment="aiSentiment" />
          <div v-if="aiSentiment?.reason" class="text-body-2 mt-2">{{ aiSentiment.reason }}</div>
        </v-card-text>
      </v-card>

      <ChatAppointments
        v-if="props.contactId"
        :contact-id="props.contactId"
        :appointments="contactAppointments"
        @refresh="reloadAppointments"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { SOURCE_OPTIONS, STATUS_OPTIONS } from '@/composables/use-contacts';
import type { Contact } from '@/composables/use-contacts';
import type { AiSentiment } from '@/composables/use-chat';
import { useChatContactPanel } from '@/composables/use-chat-contact-panel';
import ChatAppointments from './ChatAppointments.vue';
import AiSummaryCard from '@/components/ai/ai-summary-card.vue';
import AiSentimentBadge from '@/components/ai/ai-sentiment-badge.vue';

const props = defineProps<{
  contactId: string | null;
  contact: Contact | null;
  conversation: any | null; // Selected conversation
  aiSummary: string;
  aiSummaryLoading: boolean;
  aiSentiment: AiSentiment | null;
  aiSentimentLoading: boolean;
}>();

const emit = defineEmits<{ close: []; saved: []; 'refresh-ai-summary': []; 'refresh-ai-sentiment': [] }>();

const {
  form, saving, saveSuccess, saveError,
  contactAppointments,
  saveContact, reloadAppointments,
} = useChatContactPanel(
  () => props.contactId,
  () => props.contact,
  () => emit('saved'),
);

// ── Zalo Labels logic ────────────────────────────────────────────────────────
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/index';

const availableLabels = ref<any[]>([]);
const loadingLabels = ref(false);
const showLabelMenu = ref(false);

async function fetchLabels() {
  if (!props.conversation?.zaloAccountId) return;
  loadingLabels.value = true;
  try {
    const res = await api.get(`/zalo-accounts/${props.conversation.zaloAccountId}/labels`);
    availableLabels.value = res.data.labels || [];
  } catch (e) {
    console.error('Failed to fetch labels in panel', e);
  } finally {
    loadingLabels.value = false;
  }
}

const activeTags = computed(() => {
  if (!props.conversation?.externalThreadId) return [];
  return availableLabels.value.filter(l => l.conversations?.includes(props.conversation.externalThreadId));
});

function hasTag(tag: any) {
  return tag.conversations?.includes(props.conversation?.externalThreadId);
}

async function toggleZaloLabel(tag: any) {
  if (!props.conversation?.id) return;
  
  const currentIds = activeTags.value.map(t => t.id);
  const newIds = currentIds.includes(tag.id)
    ? currentIds.filter(id => id !== tag.id)
    : [...currentIds, tag.id];
    
  try {
    // Optimistic UI update
    const convs = new Set(tag.conversations || []);
    if (currentIds.includes(tag.id)) {
      convs.delete(props.conversation.externalThreadId);
    } else {
      convs.add(props.conversation.externalThreadId);
    }
    tag.conversations = Array.from(convs);

    await api.post(`/conversations/${props.conversation.id}/labels`, { labelIds: newIds });
  } catch (e) {
    console.error('Failed to toggle label in panel', e);
    fetchLabels(); // Rollback
  }
}

function getZaloColor(c: string | number) {
  const map: Record<string, string> = {
    '1': '#F44336', '2': '#E91E63', '3': '#FF9800', '4': '#FFEB3B',
    '5': '#4CAF50', '6': '#2196F3', '7': '#9C27B0', '8': '#607D8B', '9': '#009688'
  };
  return map[String(c)] || '#9E9E9E';
}

onMounted(fetchLabels);
watch(() => props.conversation?.zaloAccountId, fetchLabels);

function scoreColor(score: number) {
  if (score >= 70) return 'success';
  if (score >= 40) return 'orange';
  return 'error';
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  return `${days} ngày trước`;
}
</script>

<style scoped>
.label-dot-small {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
