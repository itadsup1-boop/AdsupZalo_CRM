<template>
  <v-card class="pa-8" style="backdrop-filter: blur(20px);" elevation="0">
    <div class="text-center mb-8">
      <div
        class="ai-core-orb mx-auto mb-4 d-flex align-center justify-center"
        style="
          width: 100px; 
          height: 40px; 
          background: transparent; 
          padding: 0;
          overflow: visible; 
          transform: scale(1.1);
          margin-top: 20px;
        "
      >
        <img 
          src="@/assets/logo-cropped.png" 
          alt="Adsup Logo" 
          style="width: 100%; height: 100%; object-fit: contain;"
        />
      </div>
      <h1 class="text-h4 font-weight-bold">
        <span>Adsup</span><span class="text-primary" style="margin-left: 6px;">CRM</span>
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

      <div class="text-center mt-6">
        <p class="text-body-2 mb-2" style="color: #8892b0;">
          Bạn là nhân viên mới? 
          <router-link to="/join" class="text-primary font-weight-bold text-decoration-none">Tham gia tổ chức</router-link>
        </p>
        <p class="text-body-2 mb-0" style="color: #8892b0;">
          Chưa có tài khoản? 
          <router-link to="/setup" class="text-primary font-weight-bold text-decoration-none">Đăng ký tổ chức mới</router-link>
        </p>
      </div>
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
const success = ref(false);
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
    success.value = true;
    setTimeout(() => router.push('/dashboard'), 1000);
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Đăng nhập thất bại';
  } finally {
    loading.value = false;
  }
}
</script>
