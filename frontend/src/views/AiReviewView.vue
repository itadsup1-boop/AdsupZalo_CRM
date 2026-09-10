<template>
  <div>
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="text-h5 mr-4">AI Review</h1>
      <v-spacer />
      <v-btn variant="tonal" prepend-icon="mdi-refresh" @click="fetchItems">Tải lại</v-btn>
    </div>

    <v-sheet class="pa-3 mb-4" border rounded>
      <v-row dense>
        <v-col cols="12" md="2"><v-select v-model="filters.status" :items="statusOptions" label="Trạng thái" clearable hide-details /></v-col>
        <v-col cols="12" md="2"><v-select v-model="filters.issueType" :items="issueOptions" label="Loại lỗi" clearable hide-details /></v-col>
        <v-col cols="12" md="2"><v-select v-model="filters.severity" :items="severityOptions" label="Mức độ" clearable hide-details /></v-col>
        <v-col cols="6" md="2"><v-text-field v-model="filters.dateFrom" label="Từ ngày" type="date" hide-details /></v-col>
        <v-col cols="6" md="2"><v-text-field v-model="filters.dateTo" label="Đến ngày" type="date" hide-details /></v-col>
        <v-col cols="12" md="2"><v-btn block color="primary" variant="tonal" prepend-icon="mdi-filter" @click="fetchItems">Lọc</v-btn></v-col>
      </v-row>
    </v-sheet>

    <v-row>
      <v-col cols="12" lg="7">
        <v-data-table :headers="headers" :items="items" :loading="loading" item-value="id" hover @click:row="onRowClick">
          <template #item.createdAt="{ item }">{{ formatDate(item.createdAt) }}</template>
          <template #item.contact="{ item }">
            <div>{{ item.contact?.fullName || item.contact?.crmName || '—' }}</div>
            <div class="text-caption text-grey">{{ item.contact?.phone || '' }}</div>
          </template>
          <template #item.issueType="{ item }"><v-chip size="small" variant="tonal">{{ item.issueType }}</v-chip></template>
          <template #item.severity="{ item }"><v-chip size="small" :color="severityColor(item.severity)" variant="tonal">{{ item.severity }}</v-chip></template>
          <template #item.status="{ item }"><v-chip size="small" :color="statusColor(item.status)" variant="tonal">{{ item.status }}</v-chip></template>
        </v-data-table>
      </v-col>

      <v-col cols="12" lg="5">
        <v-sheet border rounded class="pa-4 detail-panel">
          <template v-if="selected">
            <div class="d-flex align-center mb-3">
              <div>
                <div class="text-subtitle-1 font-weight-medium">{{ selected.issueType }}</div>
                <div class="text-caption text-grey">{{ formatDate(selected.createdAt) }}</div>
              </div>
              <v-spacer />
              <v-btn icon="mdi-open-in-new" variant="text" :to="selected.conversationId ? `/chat/${selected.conversationId}` : undefined" />
            </div>

            <v-alert :color="severityColor(selected.severity)" variant="tonal" class="mb-3">{{ selected.reason || 'Cần kiểm tra lại phản hồi AI' }}</v-alert>
            <div class="text-caption text-grey mb-1">Tin nhắn khách</div>
            <div class="review-box mb-3">{{ selected.customerMessage || '—' }}</div>
            <div class="text-caption text-grey mb-1">AI đã trả lời</div>
            <div class="review-box mb-3">{{ selected.aiResponse || '—' }}</div>
            <div class="text-caption text-grey mb-1">Log liên quan</div>
            <div class="review-box mb-3">{{ selected.aiActivityLog?.actionType || '—' }} · confidence {{ selected.aiActivityLog?.confidence ?? '—' }}</div>
            <v-textarea v-model="suggestedFix" label="Ghi chú cách sửa kịch bản/kho kiến thức" rows="2" auto-grow />
            <v-row dense>
              <v-col cols="12" sm="6"><v-select v-model="assignToUserId" :items="users" item-title="fullName" item-value="id" label="Giao nhân viên" clearable /></v-col>
              <v-col cols="12" sm="6" class="d-flex align-center"><v-switch v-model="pauseAi" label="Tắt AI hội thoại" hide-details /></v-col>
            </v-row>
            <div class="d-flex gap-2 mt-2">
              <v-btn color="success" prepend-icon="mdi-check" @click="updateSelected('resolved')">Đã xử lý</v-btn>
              <v-btn color="grey" variant="tonal" prepend-icon="mdi-eye-off" @click="updateSelected('ignored')">Bỏ qua</v-btn>
              <v-btn color="primary" variant="tonal" prepend-icon="mdi-account-arrow-right" @click="updateSelected('reviewing')">Lưu xử lý</v-btn>
            </div>
          </template>
          <div v-else class="text-grey text-center py-10">Chọn một ca AI để xem chi tiết</div>
        </v-sheet>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '@/api/index';

const loading = ref(false);
const items = ref<any[]>([]);
const selected = ref<any | null>(null);
const users = ref<any[]>([]);
const suggestedFix = ref('');
const assignToUserId = ref<string | null>(null);
const pauseAi = ref(false);

const filters = ref({ status: 'open', issueType: '', severity: '', dateFrom: '', dateTo: '' });
const statusOptions = ['open', 'reviewing', 'resolved', 'ignored'];
const issueOptions = ['low_confidence', 'cannot_answer', 'negative_feedback', 'send_failed', 'booking_error', 'staff_flagged'];
const severityOptions = ['low', 'medium', 'high', 'critical'];
const headers = [
  { title: 'Ngày', key: 'createdAt' },
  { title: 'Khách', key: 'contact' },
  { title: 'Loại lỗi', key: 'issueType' },
  { title: 'Mức độ', key: 'severity' },
  { title: 'Trạng thái', key: 'status' },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
function severityColor(value: string) {
  return value === 'critical' ? 'red' : value === 'high' ? 'deep-orange' : value === 'medium' ? 'orange' : 'blue';
}
function statusColor(value: string) {
  return value === 'resolved' ? 'green' : value === 'ignored' ? 'grey' : value === 'reviewing' ? 'indigo' : 'red';
}
async function fetchItems() {
  loading.value = true;
  try {
    const res = await api.get('/ai/review-items', { params: filters.value });
    items.value = res.data.items || [];
  } finally {
    loading.value = false;
  }
}
async function loadUsers() {
  const res = await api.get('/users');
  users.value = res.data.users || [];
}
async function selectItem(item: any) {
  const res = await api.get(`/ai/review-items/${item.id}`);
  selected.value = res.data;
  suggestedFix.value = selected.value.suggestedFix || '';
  assignToUserId.value = null;
  pauseAi.value = false;
}
function onRowClick(_: unknown, row: { item: any }) {
  selectItem(row.item);
}
async function updateSelected(status: string) {
  if (!selected.value) return;
  await api.patch(`/ai/review-items/${selected.value.id}`, {
    status,
    suggestedFix: suggestedFix.value || undefined,
    assignToUserId: assignToUserId.value || undefined,
    pauseAi: pauseAi.value,
  });
  await fetchItems();
  const current = items.value.find((item) => item.id === selected.value.id);
  if (current) await selectItem(current);
}

onMounted(() => {
  fetchItems();
  loadUsers();
});
</script>

<style scoped>
.detail-panel {
  min-height: 520px;
}
.review-box {
  white-space: pre-wrap;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  padding: 10px;
  background: rgba(var(--v-theme-surface-variant), 0.18);
  max-height: 180px;
  overflow: auto;
}
</style>
