<template>
  <div>
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="text-h5 mr-4">Báo cáo AI Agent</h1>
      <v-spacer />
      <v-btn prepend-icon="mdi-file-excel" color="success" variant="tonal" @click="exportExcel">Xuất Excel</v-btn>
      <v-btn prepend-icon="mdi-refresh" variant="tonal" @click="loadAll">Tải lại</v-btn>
    </div>

    <v-sheet class="pa-3 mb-4" border rounded>
      <v-row dense>
        <v-col cols="6" md="2"><v-text-field v-model="filters.from" label="Từ ngày" type="date" hide-details /></v-col>
        <v-col cols="6" md="2"><v-text-field v-model="filters.to" label="Đến ngày" type="date" hide-details /></v-col>
        <v-col cols="12" md="2"><v-select v-model="filters.teamId" :items="teams" item-title="name" item-value="id" label="Cơ sở" clearable hide-details /></v-col>
        <v-col cols="12" md="2"><v-select v-model="filters.assignedUserId" :items="users" item-title="fullName" item-value="id" label="Sale" clearable hide-details /></v-col>
        <v-col cols="12" md="2"><v-text-field v-model="filters.source" label="Nguồn lead" clearable hide-details /></v-col>
        <v-col cols="12" md="2"><v-btn block color="primary" variant="tonal" prepend-icon="mdi-filter" @click="loadAll">Lọc</v-btn></v-col>
      </v-row>
    </v-sheet>

    <v-row class="mb-4">
      <v-col v-for="card in cards" :key="card.key" cols="12" sm="6" md="3">
        <v-sheet border rounded class="pa-4 metric-card">
          <div class="text-caption text-grey">{{ card.label }}</div>
          <div class="text-h5 font-weight-bold">{{ card.value }}</div>
        </v-sheet>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="6">
        <v-sheet border rounded class="pa-3">
          <div class="text-subtitle-1 font-weight-medium mb-2">Theo sale</div>
          <v-data-table :headers="groupHeaders" :items="bySale" density="compact" />
        </v-sheet>
      </v-col>
      <v-col cols="12" md="6">
        <v-sheet border rounded class="pa-3">
          <div class="text-subtitle-1 font-weight-medium mb-2">Theo cơ sở</div>
          <v-data-table :headers="groupHeaders" :items="byBranch" density="compact" />
        </v-sheet>
      </v-col>
      <v-col cols="12" md="6">
        <v-sheet border rounded class="pa-3">
          <div class="text-subtitle-1 font-weight-medium mb-2">Theo dịch vụ</div>
          <v-data-table :headers="serviceHeaders" :items="byService" density="compact" />
        </v-sheet>
      </v-col>
      <v-col cols="12" md="6">
        <v-sheet border rounded class="pa-3">
          <div class="text-subtitle-1 font-weight-medium mb-2">AI lỗi/cần kiểm tra</div>
          <v-data-table :headers="errorHeaders" :items="errors" density="compact">
            <template #item.createdAt="{ item }">{{ formatDate(item.createdAt) }}</template>
          </v-data-table>
        </v-sheet>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api/index';

const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
const filters = ref({ from: monthAgo, to: today, teamId: '', assignedUserId: '', source: '' });
const summary = ref<any>({});
const bySale = ref<any[]>([]);
const byBranch = ref<any[]>([]);
const byService = ref<any[]>([]);
const errors = ref<any[]>([]);
const users = ref<any[]>([]);
const teams = ref<any[]>([]);

const groupHeaders = [
  { title: 'Tên', key: 'name' },
  { title: 'Khách', key: 'totalContacts' },
  { title: 'AI actions', key: 'aiActions' },
];
const serviceHeaders = [{ title: 'Dịch vụ', key: 'name' }, { title: 'Lịch AI', key: 'aiAppointments' }];
const errorHeaders = [
  { title: 'Ngày', key: 'createdAt' },
  { title: 'Loại lỗi', key: 'issueType' },
  { title: 'Mức độ', key: 'severity' },
  { title: 'Trạng thái', key: 'status' },
];
const cards = computed(() => [
  { key: 'totalAiContacts', label: 'Khách AI chăm sóc', value: summary.value.totalAiContacts ?? 0 },
  { key: 'aiMessagesSent', label: 'Tin AI đã gửi', value: summary.value.aiMessagesSent ?? 0 },
  { key: 'respondedContacts', label: 'Khách phản hồi', value: summary.value.respondedContacts ?? 0 },
  { key: 'aiAppointments', label: 'Lịch AI tạo', value: summary.value.aiAppointments ?? 0 },
  { key: 'responseRate', label: 'Tỉ lệ phản hồi', value: `${summary.value.responseRate ?? 0}%` },
  { key: 'bookingRate', label: 'Tỉ lệ đặt lịch', value: `${summary.value.bookingRate ?? 0}%` },
  { key: 'aiErrors', label: 'Ca AI lỗi', value: summary.value.aiErrors ?? 0 },
  { key: 'needStaffCases', label: 'Cần nhân viên xử lý', value: summary.value.needStaffCases ?? 0 },
]);

function cleanParams() {
  return Object.fromEntries(Object.entries(filters.value).filter(([, v]) => !!v));
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
async function loadLookups() {
  const [userRes, teamRes] = await Promise.all([api.get('/users'), api.get('/teams')]);
  users.value = userRes.data.users || [];
  teams.value = teamRes.data.teams || [];
}
async function loadAll() {
  const params = cleanParams();
  const [summaryRes, saleRes, branchRes, serviceRes, errorRes] = await Promise.all([
    api.get('/reports/ai-agent/summary', { params }),
    api.get('/reports/ai-agent/by-sale', { params }),
    api.get('/reports/ai-agent/by-branch', { params }),
    api.get('/reports/ai-agent/by-service', { params }),
    api.get('/reports/ai-agent/errors', { params }),
  ]);
  summary.value = summaryRes.data;
  bySale.value = saleRes.data.data || [];
  byBranch.value = branchRes.data.data || [];
  byService.value = serviceRes.data.data || [];
  errors.value = errorRes.data.data || [];
}
async function exportExcel() {
  const res = await api.get('/reports/ai-agent/export', { params: cleanParams(), responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ai-agent-report-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
onMounted(async () => {
  await loadLookups();
  await loadAll();
});
</script>

<style scoped>
.metric-card {
  min-height: 96px;
}
</style>
