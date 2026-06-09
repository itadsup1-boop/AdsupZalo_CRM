<template>
  <v-card variant="outlined" class="mt-4">
    <v-card-title class="d-flex align-center justify-between py-3">
      <div class="text-subtitle-1 font-weight-bold d-flex align-center">
        <v-icon color="primary" class="mr-2" size="20">mdi-history</v-icon>
        Lịch sử cuộc gọi Zalo ZCC
      </div>
      <v-spacer></v-spacer>
      <v-btn icon size="small" variant="text" @click="fetchHistory" :loading="loading">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </v-card-title>
    
    <v-divider></v-divider>

    <v-card-text class="pa-0">
      <!-- Loading State -->
      <div v-if="loading && history.length === 0" class="d-flex justify-center align-center py-6">
        <v-progress-circular indeterminate color="primary" size="30"></v-progress-circular>
      </div>

      <!-- Empty State -->
      <div v-else-if="history.length === 0" class="text-center py-8 text-grey-darken-1">
        <v-icon size="40" class="mb-2 text-grey-lighten-1">mdi-phone-missed</v-icon>
        <p class="text-body-2">Chưa có lịch sử cuộc gọi ZCC nào.</p>
      </div>

      <!-- History Table -->
      <v-table v-else density="comfortable" class="call-history-table">
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Nhân viên</th>
            <th>Trạng thái</th>
            <th>Thời lượng</th>
            <th>Ghi âm</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in history" :key="log.id">
            <td class="text-caption font-weight-medium">
              {{ formatDate(log.createdAt) }}
            </td>
            <td>
              <div class="text-body-2 font-weight-medium">{{ log.agent?.fullName || 'N/A' }}</div>
              <div class="text-caption text-grey">{{ log.agent?.email || '' }}</div>
            </td>
            <td>
              <v-chip :color="getStatusColor(log.callStatus)" size="x-small" class="text-capitalize">
                {{ getStatusText(log.callStatus) }}
              </v-chip>
            </td>
            <td class="text-body-2 font-mono">
              {{ formatDuration(log.callStartedAt, log.callEndedAt) }}
            </td>
            <td>
              <div v-if="log.recordingUrl" class="d-flex align-center">
                <audio :src="log.recordingUrl" controls class="custom-audio-player"></audio>
              </div>
              <span v-else class="text-grey text-caption">-</span>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card-text>
  </v-card>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { api } from '@/api/index';

const props = defineProps<{
  customerId: string;
}>();

interface CallLog {
  id: string;
  createdAt: string;
  callStartedAt?: string;
  callEndedAt?: string;
  callStatus: string;
  recordingUrl?: string;
  agent?: {
    fullName: string;
    email: string;
  };
}

const history = ref<CallLog[]>([]);
const loading = ref(false);

async function fetchHistory() {
  if (!props.customerId) return;
  loading.value = true;
  try {
    const response = await api.get(`/zalo-call/history`, {
      params: { customerId: props.customerId }
    });
    history.value = response.data;
  } catch (err) {
    console.error('Failed to fetch call history', err);
  } finally {
    loading.value = false;
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('vi-VN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDuration(start?: string, end?: string) {
  if (!start || !end) return '-';
  const durationMs = new Date(end).getTime() - new Date(start).getTime();
  const durationSec = Math.max(0, Math.floor(durationMs / 1000));
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
    case 'answered':
      return 'success';
    case 'ringing':
    case 'initiated':
      return 'info';
    case 'failed':
      return 'error';
    case 'no_answer':
    case 'busy':
      return 'warning';
    default:
      return 'grey';
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'initiated':
      return 'Đang khởi tạo';
    case 'ringing':
      return 'Đang đổ chuông';
    case 'answered':
      return 'Đang đàm thoại';
    case 'completed':
      return 'Thành công';
    case 'failed':
      return 'Thất bại';
    case 'no_answer':
      return 'Không nghe máy';
    case 'busy':
      return 'Máy bận';
    default:
      return status;
  }
}

// Expose refresh method so parent can trigger reload
defineExpose({
  refresh: fetchHistory
});

watch(() => props.customerId, (newId) => {
  if (newId) {
    fetchHistory();
  }
}, { immediate: true });
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
.custom-audio-player {
  height: 28px;
  max-width: 140px;
  border-radius: 4px;
}
.call-history-table th {
  font-weight: 600 !important;
  color: rgba(255, 255, 255, 0.7) !important;
}
</style>
