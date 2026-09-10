<template>
  <div class="voice-bubble px-3 py-2 rounded-xl" style="min-width: 180px; max-width: 280px;">
    <div class="d-flex align-center gap-2">
    <!-- Play / Pause button -->
    <v-btn
      icon
      size="small"
      :color="isPlaying ? 'primary' : 'default'"
      variant="tonal"
      :disabled="!audioUrl"
      @click="togglePlay"
    >
      <v-icon size="18">{{ isPlaying ? 'mdi-pause' : 'mdi-play' }}</v-icon>
    </v-btn>

    <!-- Waveform bars (static visual, animated when playing) -->
    <div class="waveform flex-grow-1 d-flex align-center gap-px" style="height: 28px;">
      <div
        v-for="(h, i) in bars"
        :key="i"
        class="waveform-bar rounded-pill"
        :class="{ active: isPlaying }"
        :style="{ height: `${h}%`, animationDelay: `${i * 60}ms` }"
      />
    </div>

    <!-- Duration -->
    <span class="text-caption" style="white-space: nowrap; min-width: 36px; text-align: right;">
      {{ displayTime }}
    </span>

    <!-- Hidden audio element -->
    <audio
      ref="audioEl"
      :src="audioUrl"
      @ended="onEnded"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onMeta"
      @error="onError"
    />
    </div>
    <audio
      v-if="playbackError"
      :src="audioUrl"
      controls
      preload="metadata"
      class="native-audio mt-2"
    />
    <div v-if="playbackError" class="text-caption mt-1" style="color: #ffb4ab;">
      Safari không phát được bằng nút nhanh. Hãy dùng trình phát bên dưới.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';

declare global {
  interface Window {
    AndroidBridge?: {
      playAudio?: (url: string) => void;
      stopAudio?: () => void;
    };
  }
}

const props = defineProps<{
  audioUrl: string;
  /** Duration in milliseconds (from message metadata) */
  durationMs?: number;
}>();

const audioEl = ref<HTMLAudioElement | null>(null);
const isPlaying = ref(false);
const currentTimeSec = ref(0);
const totalSec = ref(props.durationMs ? props.durationMs / 1000 : 0);
const playbackError = ref(false);

// 12 bars with pseudo-random heights for waveform visual
const bars = Array.from({ length: 12 }, (_, i) => {
  const heights = [35, 55, 70, 45, 80, 60, 40, 75, 50, 65, 38, 58];
  return heights[i % heights.length]!;
});

const displayTime = computed(() => {
  const sec = isPlaying.value ? Math.floor(currentTimeSec.value) : Math.round(totalSec.value);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
});

function togglePlay() {
  const audio = audioEl.value;
  if (!audio) return;
  const resolvedUrl = new URL(props.audioUrl, window.location.origin).href;
  if (window.AndroidBridge?.playAudio) {
    if (isPlaying.value) {
      window.AndroidBridge.stopAudio?.();
      isPlaying.value = false;
    } else {
      window.AndroidBridge.playAudio(resolvedUrl);
      isPlaying.value = true;
      window.setTimeout(() => { isPlaying.value = false; }, Math.max(totalSec.value * 1000, 1000));
    }
    return;
  }
  if (isPlaying.value) {
    audio.pause();
    isPlaying.value = false;
  } else {
    playbackError.value = false;
    audio.play().then(() => { isPlaying.value = true; }).catch(() => { playbackError.value = true; });
  }
}

function onEnded() { isPlaying.value = false; currentTimeSec.value = 0; }
function onTimeUpdate() { currentTimeSec.value = audioEl.value?.currentTime ?? 0; }
function onMeta() { if (!props.durationMs) totalSec.value = audioEl.value?.duration ?? 0; }
function onError() { playbackError.value = true; isPlaying.value = false; }

onBeforeUnmount(() => {
  audioEl.value?.pause();
  window.AndroidBridge?.stopAudio?.();
});
</script>

<style scoped>
.voice-bubble {
  background: rgba(var(--v-theme-surface-variant), 0.6);
}
.native-audio {
  display: block;
  width: 100%;
  height: 36px;
}
.waveform-bar {
  width: 3px;
  background: rgba(var(--v-theme-primary), 0.5);
  transition: background 0.2s;
  flex-shrink: 0;
}
.waveform-bar.active {
  background: rgb(var(--v-theme-primary));
  animation: pulse 0.8s ease-in-out infinite alternate;
}
@keyframes pulse {
  from { transform: scaleY(0.6); }
  to   { transform: scaleY(1.2); }
}
</style>
