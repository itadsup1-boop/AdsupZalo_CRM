<template>
  <v-dialog
    v-model="dialog"
    max-width="380"
    persistent
    transition="dialog-bottom-transition"
    content-class="call-dialog-wrapper"
  >
    <v-card class="call-dialog-card" rounded="xl" elevation="24">
      <!-- Status bar top -->
      <div class="call-status-bar" :class="statusBarClass">
        <v-icon size="12" class="mr-1">{{ statusIcon }}</v-icon>
        <span class="text-caption font-weight-medium">{{ statusLabel }}</span>
      </div>

      <!-- Contact Info -->
      <div class="call-contact-section pa-6 pb-4">
        <div class="avatar-container mb-4">
          <v-avatar size="96" class="call-avatar">
            <v-img v-if="contact?.avatarUrl" :src="contact.avatarUrl" />
            <span v-else class="text-h4 text-white font-weight-bold">
              {{ avatarInitial }}
            </span>
          </v-avatar>
          <!-- Ringing pulse rings -->
          <div v-if="callState === 'ringing'" class="pulse-ring ring-1" />
          <div v-if="callState === 'ringing'" class="pulse-ring ring-2" />
          <div v-if="callState === 'ringing'" class="pulse-ring ring-3" />
          <!-- Answered glow -->
          <div v-if="callState === 'answered'" class="answered-glow" />
        </div>

        <h2 class="call-name text-h6 font-weight-bold text-center mb-1">
          {{ contact?.fullName || contact?.crmName || 'Khách hàng' }}
        </h2>
        <p class="call-phone text-body-2 text-center text-medium-emphasis mb-0">
          {{ contact?.phone || contact?.zaloUid || 'Zalo ZCC' }}
        </p>
      </div>

      <!-- Call state display -->
      <div class="call-state-section px-6 pb-3 text-center">
        <!-- Initiated -->
        <div v-if="callState === 'initiated'" class="state-initiated">
          <div class="dots-loader">
            <span /><span /><span />
          </div>
          <p class="text-body-2 text-medium-emphasis mt-2">Đang kết nối tổng đài ZCC...</p>
        </div>

        <!-- Ringing -->
        <div v-else-if="callState === 'ringing'" class="state-ringing">
          <div class="ringing-wave">
            <div v-for="n in 4" :key="n" class="wave-bar" :style="{ animationDelay: (n - 1) * 0.15 + 's' }" />
          </div>
          <p class="text-body-2 mt-2" style="color: #60a5fa;">Đang đổ chuông bên máy khách...</p>
        </div>

        <!-- Answered -->
        <div v-else-if="callState === 'answered'" class="state-answered">
          <p class="text-h5 font-weight-bold" style="color: #34d399; font-variant-numeric: tabular-nums;">
            {{ formattedDuration }}
          </p>
          <p class="text-caption text-medium-emphasis">Đang đàm thoại qua Zalo ZCC</p>
        </div>

        <!-- Completed / Failed / No answer -->
        <div v-else-if="['completed', 'failed', 'no_answer', 'busy'].includes(callState)" class="state-ended">
          <v-icon :color="endedColor" size="28" class="mb-1">{{ endedIcon }}</v-icon>
          <p class="text-body-2 font-weight-medium" :style="{ color: endedColor }">{{ endedText }}</p>
          <p v-if="duration > 0" class="text-caption text-medium-emphasis">Thời lượng: {{ formattedDuration }}</p>
        </div>
      </div>

      <!-- ZCC Provider badge -->
      <div class="px-6 pb-4 text-center">
        <v-chip size="small" variant="tonal" color="blue" prepend-icon="mdi-phone-voip">
          Zalo Cloud Connect SIP
        </v-chip>
      </div>

      <!-- Action buttons -->
      <div class="call-actions pa-5 pt-2">
        <div class="d-flex justify-center align-center gap-4">
          <!-- Mute (placeholder) -->
          <div class="action-btn-circle" @click="toggleMute">
            <v-icon>{{ muted ? 'mdi-microphone-off' : 'mdi-microphone' }}</v-icon>
          </div>

          <!-- Hang up -->
          <div class="action-btn-circle hangup-btn" @click="endCall">
            <v-icon color="white" size="28">mdi-phone-hangup</v-icon>
          </div>

          <!-- Speaker (placeholder) -->
          <div class="action-btn-circle" @click="toggleSpeaker">
            <v-icon>{{ speaker ? 'mdi-volume-high' : 'mdi-volume-off' }}</v-icon>
          </div>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';

interface Contact {
  fullName?: string | null;
  crmName?: string | null;
  phone?: string | null;
  zaloUid?: string | null;
  avatarUrl?: string | null;
}

const props = defineProps<{
  modelValue: boolean;
  callState: string; // initiated, ringing, answered, completed, failed, no_answer, busy
  contact?: Contact;
}>();

const emit = defineEmits(['update:modelValue', 'end-call']);

const dialog = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
});

const muted = ref(false);
const speaker = ref(false);

// Duration timer
const duration = ref(0);
let durationInterval: ReturnType<typeof setInterval> | null = null;

watch(() => props.callState, (state) => {
  if (state === 'answered') {
    duration.value = 0;
    durationInterval = setInterval(() => { duration.value++; }, 1000);
  } else if (['completed', 'failed', 'no_answer', 'busy'].includes(state)) {
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
    // Auto close after 3 seconds when call ends
    setTimeout(() => {
      dialog.value = false;
    }, 3000);
  }
});

onBeforeUnmount(() => {
  if (durationInterval) clearInterval(durationInterval);
});

const formattedDuration = computed(() => {
  const m = Math.floor(duration.value / 60).toString().padStart(2, '0');
  const s = (duration.value % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
});

const avatarInitial = computed(() => {
  const name = props.contact?.fullName || props.contact?.crmName || 'K';
  return name.charAt(0).toUpperCase();
});

const statusBarClass = computed(() => {
  if (props.callState === 'answered') return 'status-answered';
  if (props.callState === 'ringing') return 'status-ringing';
  if (['completed', 'failed', 'no_answer', 'busy'].includes(props.callState)) return 'status-ended';
  return 'status-initiated';
});

const statusIcon = computed(() => {
  if (props.callState === 'answered') return 'mdi-phone-in-talk';
  if (props.callState === 'ringing') return 'mdi-phone-ring';
  if (props.callState === 'completed') return 'mdi-phone-check';
  if (['failed', 'no_answer', 'busy'].includes(props.callState)) return 'mdi-phone-missed';
  return 'mdi-loading mdi-spin';
});

const statusLabel = computed(() => {
  if (props.callState === 'initiated') return 'Đang kết nối';
  if (props.callState === 'ringing') return 'Đang đổ chuông';
  if (props.callState === 'answered') return 'Đang đàm thoại';
  if (props.callState === 'completed') return 'Cuộc gọi kết thúc';
  if (props.callState === 'no_answer') return 'Không trả lời';
  if (props.callState === 'busy') return 'Máy bận';
  return 'Thất bại';
});

const endedColor = computed(() => {
  if (props.callState === 'completed') return '#34d399';
  return '#f87171';
});

const endedIcon = computed(() => {
  if (props.callState === 'completed') return 'mdi-check-circle-outline';
  if (props.callState === 'no_answer') return 'mdi-phone-missed';
  if (props.callState === 'busy') return 'mdi-phone-busy';
  return 'mdi-close-circle-outline';
});

const endedText = computed(() => {
  if (props.callState === 'completed') return 'Cuộc gọi đã kết thúc';
  if (props.callState === 'no_answer') return 'Khách không bắt máy';
  if (props.callState === 'busy') return 'Máy bận';
  return 'Cuộc gọi thất bại';
});

function toggleMute() { muted.value = !muted.value; }
function toggleSpeaker() { speaker.value = !speaker.value; }

function endCall() {
  emit('end-call');
  if (durationInterval) clearInterval(durationInterval);
  dialog.value = false;
}
</script>

<style scoped>
.call-dialog-card {
  background: linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%) !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.call-status-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 16px;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.status-initiated { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
.status-ringing   { background: rgba(96, 165, 250, 0.2);  color: #60a5fa; }
.status-answered  { background: rgba(52, 211, 153, 0.2);  color: #34d399; }
.status-ended     { background: rgba(248, 113, 113, 0.15); color: #f87171; }

.call-contact-section {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.avatar-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 120px;
}

.call-avatar {
  background: linear-gradient(135deg, #3b82f6, #8b5cf6) !important;
  border: 3px solid rgba(255, 255, 255, 0.15);
  z-index: 2;
  position: relative;
}

/* Pulse rings for ringing state */
.pulse-ring {
  position: absolute;
  border-radius: 50%;
  border: 2px solid rgba(96, 165, 250, 0.5);
  animation: pulse-ring 2s ease-out infinite;
}
.ring-1 { width: 110px; height: 110px; animation-delay: 0s; }
.ring-2 { width: 130px; height: 130px; animation-delay: 0.5s; }
.ring-3 { width: 150px; height: 150px; animation-delay: 1s; }

@keyframes pulse-ring {
  0%   { transform: scale(0.85); opacity: 0.8; }
  100% { transform: scale(1.2);  opacity: 0; }
}

/* Answered glow */
.answered-glow {
  position: absolute;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(52, 211, 153, 0.3) 0%, transparent 70%);
  animation: glow-pulse 2s ease-in-out infinite;
}

@keyframes glow-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50%       { opacity: 1;   transform: scale(1.15); }
}

.call-name { color: #f1f5f9; }
.call-phone { color: #64748b; }

/* Dots loader */
.dots-loader {
  display: flex;
  gap: 6px;
  justify-content: center;
}
.dots-loader span {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #60a5fa;
  animation: dots-bounce 1.4s infinite ease-in-out both;
}
.dots-loader span:nth-child(1) { animation-delay: -0.32s; }
.dots-loader span:nth-child(2) { animation-delay: -0.16s; }
@keyframes dots-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40%           { transform: scale(1);   opacity: 1; }
}

/* Wave bars for ringing */
.ringing-wave {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  height: 28px;
}
.wave-bar {
  width: 4px;
  background: #60a5fa;
  border-radius: 2px;
  animation: wave-bar 0.9s ease-in-out infinite alternate;
}
.wave-bar:nth-child(1) { height: 12px; }
.wave-bar:nth-child(2) { height: 22px; }
.wave-bar:nth-child(3) { height: 18px; }
.wave-bar:nth-child(4) { height: 12px; }
@keyframes wave-bar {
  from { transform: scaleY(0.4); opacity: 0.6; }
  to   { transform: scaleY(1.2); opacity: 1; }
}

/* Action buttons */
.call-actions { background: rgba(255, 255, 255, 0.03); }

.gap-4 { gap: 24px; }

.action-btn-circle {
  width: 54px; height: 54px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
  color: #cbd5e1;
}
.action-btn-circle:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: scale(1.05);
}
.hangup-btn {
  width: 64px; height: 64px;
  background: #ef4444 !important;
  border-color: #dc2626 !important;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
}
.hangup-btn:hover {
  background: #dc2626 !important;
  box-shadow: 0 0 30px rgba(239, 68, 68, 0.6);
}
</style>
