<template>
  <div class="d-inline-flex align-center flex-wrap gap-2">
    <!-- Call / Consent Request Button -->
    <v-btn
      v-if="consentStatus === 'granted'"
      :color="callActive ? (callState === 'answered' ? 'success' : 'info') : 'success'"
      :variant="variant || 'flat'"
      prepend-icon="mdi-phone-in-talk"
      @click="triggerCall"
      :loading="loading"
      :disabled="callActive"
      v-bind="$attrs"
    >
      {{ callActive ? callActiveText : 'Gọi Zalo qua ZCC' }}
    </v-btn>

    <v-btn
      v-else-if="consentStatus === 'pending'"
      color="warning"
      variant="tonal"
      prepend-icon="mdi-clock-outline"
      disabled
      v-bind="$attrs"
      class="text-none"
    >
      Đang chờ khách xác nhận quyền gọi...
    </v-btn>

    <v-btn
      v-else
      color="primary"
      variant="tonal"
      prepend-icon="mdi-shield-alert-outline"
      @click="triggerRequestConsent"
      :loading="loading"
      v-bind="$attrs"
      class="text-none"
    >
      Yêu cầu cấp quyền cuộc gọi Zalo
    </v-btn>

    <!-- Error/Feedback Snackbars -->
    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="4000">
      {{ snackbarText }}
      <template v-slot:actions>
        <v-btn variant="text" @click="snackbar = false">Đóng</v-btn>
      </template>
    </v-snackbar>

    <!-- ✅ CALL DIALOG -->
    <ZaloCallDialog
      v-model="showCallDialog"
      :callState="callState"
      :contact="contactInfo"
      @end-call="onEndCall"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { api } from '@/api/index';
import ZaloCallDialog from './ZaloCallDialog.vue';

const props = defineProps<{
  customerId?: string;
  phone?: string | null;
  contactName?: string | null;
  contactAvatar?: string | null;
  variant?: 'flat' | 'text' | 'tonal' | 'outlined';
}>();

const emit = defineEmits(['call-initiated', 'consent-updated', 'call-status-changed']);

const loading = ref(false);
const consentStatus = ref('unknown'); // unknown, pending, granted, denied
const callActive = ref(false);
const callState = ref(''); // initiated, ringing, answered, completed, failed
const showCallDialog = ref(false);

const snackbar = ref(false);
const snackbarText = ref('');
const snackbarColor = ref('error');

// Contact info for dialog display
const contactInfo = computed(() => ({
  fullName: props.contactName,
  phone: props.phone,
  avatarUrl: props.contactAvatar,
}));

function showMessage(text: string, color = 'error') {
  snackbarText.value = text;
  snackbarColor.value = color;
  snackbar.value = true;
}

// Fetch consent status
async function checkConsentStatus() {
  if (!props.customerId) return;
  try {
    const response = await api.get('/zalo-call/consent-status', {
      params: { customerId: props.customerId }
    });
    consentStatus.value = response.data.status;
    emit('consent-updated', consentStatus.value);
  } catch (err: any) {
    console.error('Check consent error:', err);
  }
}

// Request calling consent
async function triggerRequestConsent() {
  if (!props.customerId) return;
  loading.value = true;
  try {
    const response = await api.post('/zalo-call/request-consent', {
      customerId: props.customerId
    });

    consentStatus.value = response.data.status;
    showMessage('Đã gửi yêu cầu cấp quyền gọi qua Zalo. Vui lòng chờ khách xác nhận.', 'success');
    emit('consent-updated', consentStatus.value);

    startConsentPolling();
  } catch (err: any) {
    const errorMsg = err.response?.data?.error || err.message || 'Lỗi gửi yêu cầu';
    showMessage(errorMsg, 'error');
  } finally {
    loading.value = false;
  }
}

// Trigger ZCC calling — opens dialog immediately
async function triggerCall() {
  if (!props.customerId) return;
  loading.value = true;
  callActive.value = true;
  callState.value = 'initiated';
  showCallDialog.value = true;
  emit('call-status-changed', 'initiated');

  try {
    const response = await api.post('/zalo-call/call', {
      customerId: props.customerId
    });

    if (response.data.success) {
      callState.value = response.data.status || 'ringing';
      emit('call-status-changed', callState.value);
      emit('call-initiated', response.data.callId);
      trackCallProgress(response.data.callId);

      // Show SIP info if available (no real SIP trunk yet)
      if (response.data.sipInfo) {
        showMessage(
          `📞 Tổng đài viên quay số ZCC: ${response.data.sipInfo.to}`,
          'info'
        );
      }
    }
  } catch (err: any) {
    const errorMsg = err.response?.data?.error || err.message || 'Lỗi khởi tạo cuộc gọi';
    showMessage(errorMsg, 'error');
    callState.value = 'failed';
    emit('call-status-changed', 'failed');
    setTimeout(() => {
      callActive.value = false;
      showCallDialog.value = false;
    }, 2500);
  } finally {
    loading.value = false;
  }
}

// Track call log states dynamically (polling backend every 3s)
// Auto-timeout after 60s if no status change (no SIP trunk connected)
let callTrackerInterval: any = null;
let callTimeoutTimer: any = null;
function trackCallProgress(callId: string) {
  if (callTrackerInterval) clearInterval(callTrackerInterval);
  if (callTimeoutTimer) clearTimeout(callTimeoutTimer);

  callTrackerInterval = setInterval(async () => {
    try {
      const response = await api.get('/zalo-call/history', {
        params: { customerId: props.customerId }
      });

      const currentCall = response.data.find((log: any) => log.id === callId);
      if (currentCall) {
        callState.value = currentCall.callStatus;
        emit('call-status-changed', currentCall.callStatus);

        if (['completed', 'failed', 'no_answer', 'busy'].includes(currentCall.callStatus)) {
          clearInterval(callTrackerInterval);
          clearTimeout(callTimeoutTimer);
          callActive.value = false;
        }
      }
    } catch (e) {
      console.error('Error tracking call', e);
      clearInterval(callTrackerInterval);
      clearTimeout(callTimeoutTimer);
      callActive.value = false;
    }
  }, 3000);

  // Auto-timeout: if still 'initiated' or 'ringing' after 60s → fail
  callTimeoutTimer = setTimeout(() => {
    if (['initiated', 'ringing'].includes(callState.value)) {
      clearInterval(callTrackerInterval);
      callState.value = 'failed';
      callActive.value = false;
      emit('call-status-changed', 'failed');
      showMessage(
        'Hết thời gian chờ. Vui lòng kiểm tra kết nối SIP Trunk ZCC hoặc thử lại.',
        'warning'
      );
    }
  }, 60000);
}

function onEndCall() {
  if (callTrackerInterval) clearInterval(callTrackerInterval);
  callActive.value = false;
  callState.value = '';
  showCallDialog.value = false;
}

// Poll consent status while waiting
let consentPollInterval: any = null;
function startConsentPolling() {
  if (consentPollInterval) clearInterval(consentPollInterval);

  consentPollInterval = setInterval(async () => {
    await checkConsentStatus();
    if (consentStatus.value === 'granted' || consentStatus.value === 'denied') {
      clearInterval(consentPollInterval);
    }
  }, 3000);

  setTimeout(() => {
    if (consentPollInterval) clearInterval(consentPollInterval);
  }, 60000);
}

const callActiveText = computed(() => {
  if (callState.value === 'initiated') return 'Đang kết nối...';
  if (callState.value === 'ringing') return 'Đang đổ chuông...';
  if (callState.value === 'answered') return 'Đang đàm thoại...';
  return 'Đang gọi...';
});

watch(() => props.customerId, (newId) => {
  if (newId) {
    checkConsentStatus();
    callActive.value = false;
    callState.value = '';
    showCallDialog.value = false;
    if (callTrackerInterval) clearInterval(callTrackerInterval);
    if (consentPollInterval) clearInterval(consentPollInterval);
  }
}, { immediate: true });
</script>
