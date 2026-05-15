<template>
  <v-card class="pa-8 join-card" elevation="0">
    <!-- Header with Premium Orb -->
    <div class="text-center mb-10">
      <div class="logo-container mx-auto mb-6">
        <div class="glow-effect"></div>
        <img 
          src="@/assets/logo-cropped.png" 
          alt="Adsup Logo" 
          class="premium-logo"
        />
      </div>
      <h1 class="text-h4 font-weight-black main-title">
        Tham gia <span class="gradient-text">Tổ chức</span>
      </h1>
      <p class="text-subtitle-2 mt-2 opacity-70">Bắt đầu hành trình kết nối khách hàng chuyên nghiệp</p>
    </div>

    <!-- Modern Segmented Control -->
    <div class="mode-switcher mb-8">
      <div 
        class="switcher-bg" 
        :style="{ transform: joinMode === 'token' ? 'translateX(0)' : 'translateX(100%)' }"
      ></div>
      <button 
        class="switcher-btn" 
        :class="{ active: joinMode === 'token' }" 
        @click="joinMode = 'token'"
      >
        <v-icon start size="18">mdi-shield-key-outline</v-icon>
        Dùng Token
      </button>
      <button 
        class="switcher-btn" 
        :class="{ active: joinMode === 'name' }" 
        @click="joinMode = 'name'"
      >
        <v-icon start size="18">mdi-office-building-outline</v-icon>
        Dùng Tên
      </button>
    </div>

    <!-- Form Section -->
    <v-form @submit.prevent="handleJoin" class="premium-form">
      <v-window v-model="joinMode" class="mb-4 overflow-visible">
        <v-window-item value="token">
          <div class="input-group">
            <label class="input-label">Mã Token bảo mật (15 phút)</label>
            <v-textarea
              v-model="token"
              placeholder="Dán mã Token tham gia..."
              variant="outlined"
              prepend-inner-icon="mdi-key-variant"
              required
              rows="2"
              auto-grow
              hide-details
              class="custom-field"
            />
          </div>
        </v-window-item>

        <v-window-item value="name">
          <div class="input-group">
            <label class="input-label">Tên chính xác của tổ chức</label>
            <v-text-field
              v-model="orgName"
              placeholder="Nhập tên tổ chức muốn tham gia..."
              variant="outlined"
              prepend-inner-icon="mdi-magnify"
              required
              hide-details
              class="custom-field"
            />
          </div>
        </v-window-item>
      </v-window>

      <div class="personal-info-grid mb-6">
        <div class="input-group">
          <label class="input-label">Họ và tên</label>
          <v-text-field
            v-model="fullName"
            placeholder="Nhập họ và tên..."
            variant="outlined"
            prepend-inner-icon="mdi-account-outline"
            required
            hide-details
            class="custom-field"
          />
        </div>
        
        <div class="input-group">
          <label class="input-label">Email công việc</label>
          <v-text-field
            v-model="email"
            type="email"
            placeholder="Nhập email..."
            variant="outlined"
            prepend-inner-icon="mdi-email-outline"
            required
            hide-details
            class="custom-field"
          />
        </div>

        <div class="input-group">
          <label class="input-label">Mật khẩu tự chọn</label>
          <v-text-field
            v-model="password"
            type="password"
            placeholder="Nhập mật khẩu..."
            variant="outlined"
            prepend-inner-icon="mdi-lock-outline"
            required
            hide-details
            class="custom-field"
          />
        </div>
      </div>
      
      <v-btn 
        type="submit" 
        color="primary" 
        block 
        size="x-large" 
        :loading="loading" 
        class="join-btn"
      >
        <v-icon start>{{ joinMode === 'token' ? 'mdi-account-plus' : 'mdi-send-check' }}</v-icon>
        {{ joinMode === 'token' ? 'Tham gia ngay' : 'Gửi yêu cầu duyệt' }}
      </v-btn>

      <div class="text-center mt-8">
        <span class="text-caption opacity-60">Đã có tài khoản? </span>
        <router-link to="/login" class="login-link">
          Đăng nhập ngay
        </router-link>
      </div>
    </v-form>

    <v-snackbar v-model="hasError" color="error" timeout="4000" location="top">
      {{ error }}
    </v-snackbar>
    
    <v-dialog v-model="success" persistent max-width="400">
      <v-card class="pa-6 text-center success-dialog">
        <v-icon color="success" size="64" class="mb-4">mdi-check-circle-outline</v-icon>
        <h3 class="text-h5 font-weight-bold mb-2">Thành công!</h3>
        <p class="text-body-2 opacity-80">{{ successMessage }}</p>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const joinMode = ref('token');
const token = ref('');
const orgName = ref('');
const fullName = ref('');
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const success = ref(false);
const successMessage = ref('');
const router = useRouter();
const authStore = useAuthStore();

const hasError = computed(() => !!error.value);

async function handleJoin() {
  if (joinMode.value === 'token' && !token.value) {
    error.value = 'Vui lòng dán mã Token mời';
    return;
  }
  if (joinMode.value === 'name' && !orgName.value) {
    error.value = 'Vui lòng nhập tên chính xác của tổ chức';
    return;
  }
  if (!fullName.value || !email.value || !password.value) {
    error.value = 'Vui lòng điền đầy đủ thông tin cá nhân';
    return;
  }
  
  loading.value = true;
  error.value = '';
  try {
    if (joinMode.value === 'token') {
      await authStore.join({
        token: token.value,
        fullName: fullName.value,
        email: email.value,
        password: password.value
      });
      successMessage.value = 'Bạn đã tham gia thành công! Đang chuyển hướng...';
      success.value = true;
      setTimeout(() => router.push('/dashboard'), 2000);
    } else {
      const msg = await authStore.submitJoinRequest({
        orgName: orgName.value,
        fullName: fullName.value,
        email: email.value,
        password: password.value
      });
      successMessage.value = msg;
      success.value = true;
      setTimeout(() => router.push('/login'), 4000);
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Có lỗi xảy ra. Vui lòng kiểm tra lại thông tin.';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.join-card {
  background: rgba(10, 25, 41, 0.7) !important;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 24px !important;
}

.logo-container {
  position: relative;
  width: 120px;
  height: 50px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: scale(1.1);
  margin-top: 20px;
}

.premium-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  z-index: 2;
}

.glow-effect {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #1a73e8;
  filter: blur(20px);
  opacity: 0.4;
  animation: pulse 3s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.1); opacity: 0.5; }
  100% { transform: scale(1); opacity: 0.3; }
}

.main-title {
  color: #fff;
  letter-spacing: -1px;
}

.gradient-text {
  background: linear-gradient(90deg, #1a73e8 0%, #004fb1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Custom Mode Switcher */
.mode-switcher {
  background: rgba(255, 255, 255, 0.05);
  height: 50px;
  border-radius: 12px;
  position: relative;
  display: flex;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.switcher-bg {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  background: #1a73e8;
  border-radius: 10px;
  transition: transform 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  box-shadow: 0 4px 15px rgba(26, 115, 232, 0.3);
}

.switcher-btn {
  flex: 1;
  z-index: 2;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.3s ease;
}

.switcher-btn.active {
  color: #fff;
}

/* Premium Form Styling */
.input-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  color: #1a73e8;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
  margin-left: 4px;
}

.input-group {
  margin-bottom: 16px;
}

.custom-field :deep(.v-field) {
  border-radius: 12px !important;
  background: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  transition: all 0.3s ease;
}

.custom-field :deep(.v-field--focused) {
  border-color: #1a73e8 !important;
  background: rgba(26, 115, 232, 0.05) !important;
  box-shadow: 0 0 15px rgba(26, 115, 232, 0.1);
}

.join-btn {
  height: 56px !important;
  border-radius: 16px !important;
  font-weight: 800 !important;
  letter-spacing: 1px !important;
  background: linear-gradient(135deg, #1a73e8 0%, #004fb1 100%) !important;
  box-shadow: 0 10px 30px rgba(26, 115, 232, 0.2) !important;
  text-transform: none !important;
  font-size: 1.1rem !important;
}

.join-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 15px 35px rgba(26, 115, 232, 0.3) !important;
}

.login-link {
  color: #1a73e8;
  font-weight: 700;
  text-decoration: none;
  transition: all 0.3s ease;
}

.login-link:hover {
  text-shadow: 0 0 10px rgba(26, 115, 232, 0.5);
  text-decoration: underline;
}

.success-dialog {
  border-radius: 24px !important;
  background: #0a1929 !important;
  border: 2px solid #1a73e8 !important;
}

.personal-info-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
