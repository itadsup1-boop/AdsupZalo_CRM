<template>
  <v-chip
    :color="statusColor"
    :prepend-icon="statusIcon"
    size="small"
    class="font-weight-medium"
    variant="flat"
  >
    Zalo Consent: {{ statusText }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status?: 'unknown' | 'pending' | 'granted' | 'denied' | string;
}>();

const statusColor = computed(() => {
  switch (props.status) {
    case 'granted':
      return 'success';
    case 'pending':
      return 'warning';
    case 'denied':
      return 'error';
    default:
      return 'grey-darken-1';
  }
});

const statusIcon = computed(() => {
  switch (props.status) {
    case 'granted':
      return 'mdi-shield-check';
    case 'pending':
      return 'mdi-shield-alert-outline';
    case 'denied':
      return 'mdi-shield-remove';
    default:
      return 'mdi-shield-off-outline';
  }
});

const statusText = computed(() => {
  switch (props.status) {
    case 'granted':
      return 'Đã cấp quyền';
    case 'pending':
      return 'Đang chờ';
    case 'denied':
      return 'Từ chối';
    default:
      return 'Chưa xác định';
  }
});
</script>
