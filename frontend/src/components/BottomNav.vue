<template>
  <v-bottom-navigation
    grow
    flat
    active
    color="primary"
    :model-value="activeTab"
    @update:model-value="navigate"
    style="
      padding-bottom: env(safe-area-inset-bottom); 
      height: calc(68px + env(safe-area-inset-bottom)) !important;
      border-top: 1px solid rgba(255,255,255,0.05);
    "
  >
    <v-btn 
      v-for="tab in tabs" 
      :key="tab.path" 
      :value="tab.path"
      variant="plain"
      :ripple="false"
      class="pb-1"
    >
      <v-icon size="24">{{ tab.icon }}</v-icon>
      <span class="text-caption mt-1" style="font-weight: 500;">{{ tab.title }}</span>
    </v-btn>
  </v-bottom-navigation>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const tabs = [
  { title: 'Chat', icon: 'mdi-message-text-outline', path: '/chat' },
  { title: 'Khách hàng', icon: 'mdi-account-group-outline', path: '/contacts' },
  { title: 'Lịch hẹn', icon: 'mdi-calendar-clock-outline', path: '/appointments' },
  { title: 'Tổng quan', icon: 'mdi-view-dashboard-outline', path: '/dashboard' },
];

const activeTab = computed(() => {
  return tabs.find(t => t.path === route.path)?.path ?? '/chat';
});

function navigate(path: string) {
  router.push(path);
}
</script>
