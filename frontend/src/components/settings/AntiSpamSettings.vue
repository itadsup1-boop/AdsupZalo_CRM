<template>
  <div style="max-width: 640px;">
    <div class="text-h6 mb-4">Cấu hình chống spam tin nhắn</div>

    <v-card variant="outlined" class="pa-4 mb-4">
      <div class="d-flex align-center justify-space-between mb-4">
        <div>
          <div class="text-subtitle-1 font-weight-bold">Trạng thái bảo vệ chống spam</div>
          <div class="text-caption text-medium-emphasis">
            Bật tính năng này để ngăn chặn gửi tin nhắn tự động hàng loạt gây phiền hà cho khách hàng.
          </div>
        </div>
        <v-switch
          v-model="settings.enabled"
          color="primary"
          hide-details
          :disabled="saving"
        />
      </div>

      <v-divider class="my-4" />

      <v-form ref="form" :disabled="!settings.enabled || saving">
        <div class="text-subtitle-2 font-weight-bold mb-3">1. Khung giờ nghỉ ngơi (Quiet Hours)</div>
        <p class="text-caption text-medium-emphasis mb-3 mt-n1">
          Trong khung giờ này, các tin nhắn tự động lập lịch sẽ được hoãn gửi (giữ hàng chờ gửi tiếp vào sáng hôm sau).
        </p>
        <v-row class="mb-2">
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="settings.quietHoursStart"
              label="Giờ bắt đầu nghỉ"
              placeholder="22:00"
              variant="outlined"
              density="compact"
              persistent-placeholder
              hint="Ví dụ: 22:00"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="settings.quietHoursEnd"
              label="Giờ kết thúc nghỉ"
              placeholder="08:00"
              variant="outlined"
              density="compact"
              persistent-placeholder
              hint="Ví dụ: 08:00"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-divider class="my-4" />

        <div class="text-subtitle-2 font-weight-bold mb-3">2. Giới hạn tần suất gửi tin nhắn tự động</div>
        <p class="text-caption text-medium-emphasis mb-3 mt-n1">
          Giới hạn số lượng tin nhắn tự động tối đa gửi cho mỗi khách hàng trong khoảng thời gian xác định.
        </p>
        <v-row class="mb-2">
          <v-col cols="12" sm="6">
            <v-text-field
              v-model.number="settings.maxMessagesPerHour"
              label="Số tin nhắn tối đa mỗi giờ"
              type="number"
              variant="outlined"
              density="compact"
              min="0"
              hint="Để 0 nếu không muốn giới hạn"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model.number="settings.maxMessagesPerDay"
              label="Số tin nhắn tối đa mỗi ngày"
              type="number"
              variant="outlined"
              density="compact"
              min="0"
              hint="Để 0 nếu không muốn giới hạn"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-divider class="my-4" />

        <div class="text-subtitle-2 font-weight-bold mb-3">3. Khách hàng đang tương tác / Tránh gửi trùng</div>
        <v-row class="mb-2">
          <v-col cols="12" sm="6">
            <v-text-field
              v-model.number="settings.recentReplyThresholdMinutes"
              label="Bỏ qua gửi tự động nếu khách vừa nhắn (Phút)"
              type="number"
              variant="outlined"
              density="compact"
              min="0"
              hint="Tránh gửi đè tin nhắn robot khi khách vừa chat"
              persistent-hint
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model.number="settings.duplicateThresholdHours"
              label="Chặn gửi trùng nội dung trong vòng (Giờ)"
              type="number"
              variant="outlined"
              density="compact"
              min="0"
              hint="Không gửi cùng 1 mẫu tin liên tiếp trong khoảng thời gian này"
              persistent-hint
            />
          </v-col>
        </v-row>
      </v-form>

      <v-alert v-if="error" type="error" density="compact" class="mt-4">{{ error }}</v-alert>
      <v-alert v-if="saved" type="success" density="compact" class="mt-4">Lưu cấu hình chống spam thành công</v-alert>

      <div class="d-flex justify-start mt-4">
        <v-btn
          color="primary"
          :loading="saving"
          @click="handleSave"
        >
          Lưu cài đặt
        </v-btn>
      </div>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/index';

const settings = ref({
  enabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  maxMessagesPerHour: 3,
  maxMessagesPerDay: 10,
  recentReplyThresholdMinutes: 15,
  duplicateThresholdHours: 24,
});

const saving = ref(false);
const error = ref('');
const saved = ref(false);

async function fetchSettings() {
  try {
    const res = await api.get('/organization/anti-spam');
    settings.value = {
      enabled: res.data.enabled !== undefined ? res.data.enabled : true,
      quietHoursStart: res.data.quietHoursStart || '22:00',
      quietHoursEnd: res.data.quietHoursEnd || '08:00',
      maxMessagesPerHour: res.data.maxMessagesPerHour !== undefined ? res.data.maxMessagesPerHour : 3,
      maxMessagesPerDay: res.data.maxMessagesPerDay !== undefined ? res.data.maxMessagesPerDay : 10,
      recentReplyThresholdMinutes: res.data.recentReplyThresholdMinutes !== undefined ? res.data.recentReplyThresholdMinutes : 15,
      duplicateThresholdHours: res.data.duplicateThresholdHours !== undefined ? res.data.duplicateThresholdHours : 24,
    };
  } catch (err) {
    console.error('Lỗi khi tải cấu hình chống spam:', err);
  }
}

async function handleSave() {
  saving.value = true;
  error.value = '';
  saved.value = false;
  try {
    await api.put('/organization/anti-spam', settings.value);
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 3000);
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Lỗi lưu cấu hình chống spam';
  } finally {
    saving.value = false;
  }
}

onMounted(fetchSettings);
</script>
