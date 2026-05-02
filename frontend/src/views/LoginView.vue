<template>
  <v-card class="pa-8" style="backdrop-filter: blur(20px);" elevation="0">
    <div class="text-center mb-8">
      <div
        class="ai-core-orb mx-auto mb-4 d-flex align-center justify-center"
        style="
          width: 80px; 
          height: 80px; 
          border-radius: 50%; 
          background: white; 
          padding: 4px; 
          overflow: hidden; 
          box-shadow: 0 0 20px rgba(0, 242, 255, 0.4);
        "
      >
        <img 
          src="@/assets/logo-adsup.jpg" 
          alt="Adsup Logo" 
          style="width: 100%; height: 100%; object-fit: cover;"
        />
      </div>
      <h1 class="text-h4 font-weight-bold">
        <span>Adsup</span><span style="color: #00F2FF; margin-left: 6px;">CRM</span>
      </h1>
      <p class="text-caption mt-1" style="color: #8892b0;">Giải pháp quản lý Zalo chuyên nghiệp</p>
    </div>

    <v-form @submit.prevent="handleLogin">
      <v-text-field
        v-model="email"
        label="Email"
        type="email"
        prepend-inner-icon="mdi-email-outline"
        required
        class="mb-3"
      />
      <v-text-field
        v-model="password"
        label="Mật khẩu"
        type="password"
        prepend-inner-icon="mdi-lock-outline"
        required
        class="mb-5"
      />
      <v-btn type="submit" color="primary" block size="large" :loading="loading" rounded="xl">
        <v-icon start>mdi-login</v-icon>
        Đăng nhập
      </v-btn>
    </v-form>

    <v-alert v-if="error" type="error" class="mt-4" density="compact" closable variant="tonal">
      {{ error }}
    </v-alert>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const router = useRouter();
const authStore = useAuthStore();

onMounted(async () => {
  try {
    const needs = await authStore.checkSetup();
    if (needs) router.replace('/setup');
  } catch {}
});

async function handleLogin() {
  loading.value = true;
  error.value = '';
  try {
    await authStore.login(email.value, password.value);
    router.push('/');
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Đăng nhập thất bại';
  } finally {
    loading.value = false;
  }
}
</script>
