<template>
  <v-app :class="{ 'liquid-bg': isDark }">
    <OfflineIndicator />

    <!-- Premium Mobile App Bar with perfect vertical alignment -->
    <v-app-bar 
      flat 
      color="surface"
      style="padding-top: 54px; height: 120px !important; border-bottom: 1px solid rgba(255,255,255,0.05);"
    >
      <div class="d-flex align-center w-100 px-4 mt-2">
        <!-- Logo & Title -->
        <div class="d-flex align-center" style="gap: 12px;">
          <div
            style="
              width: 38px;
              height: 38px;
              border-radius: 50%;
              background: white;
              padding: 2px;
              overflow: hidden;
              box-shadow: 0 4px 15px rgba(0, 242, 255, 0.2);
            "
          >
            <img src="@/assets/logo-adsup.jpg" alt="Logo" style="width: 100%; height: 100%; object-fit: cover;" />
          </div>
          <div class="d-flex flex-column justify-center">
            <span class="font-weight-black" style="font-size: 1.2rem; line-height: 1; letter-spacing: -0.5px;">
              <span :class="isDark ? 'text-white' : 'text-grey-darken-4'">Adsup</span>
              <span style="color: #00F2FF; margin-left: 2px;">CRM</span>
            </span>
            <span class="text-caption text-grey mt-1" style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 600;">Premium Edition</span>
          </div>
        </div>

        <v-spacer />

        <!-- Actions -->
        <div class="d-flex align-center" style="gap: 6px;">
          <NotificationBell />
          <v-btn icon size="small" variant="text" @click="toggleTheme">
            <v-icon size="24">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
          </v-btn>
          <v-btn icon size="small" variant="text" @click="logout" color="error">
            <v-icon size="24">mdi-logout</v-icon>
          </v-btn>
        </div>
      </div>
    </v-app-bar>

    <!-- Main content with substantial padding to avoid overlap -->
    <v-main>
      <slot />
    </v-main>

    <BottomNav v-if="!isMobileChatActive" />
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import { useChat } from '@/composables/use-chat';
import NotificationBell from '@/components/NotificationBell.vue';
import BottomNav from '@/components/BottomNav.vue';
import OfflineIndicator from '@/components/OfflineIndicator.vue';

const { isMobileChatActive } = useChat();

const theme = useTheme();
const authStore = useAuthStore();
const router = useRouter();
const isDark = ref(localStorage.getItem('theme') !== 'light');

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
});

function toggleTheme() {
  isDark.value = !isDark.value;
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}

function logout() {
  authStore.logout();
  router.push('/login');
}
</script>
