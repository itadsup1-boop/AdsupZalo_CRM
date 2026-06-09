<template>
  <div class="landing-page">
    <!-- HEADER -->
    <header class="header" :class="{ 'scrolled': isScrolled }">
      <div class="logo-wrapper">
        <router-link to="/" class="logo-link">
          <img 
            src="/logo-v6-512.png" 
            alt="Adsup CRM" 
            class="header-logo"
          />
        </router-link>
      </div>

      <nav class="header-nav d-none d-lg-flex">
        <router-link to="/" class="nav-link">Trang chủ</router-link>
        <router-link to="/features/overview" class="nav-link">Tính năng</router-link>
        <router-link to="/pricing" class="nav-link">Bảng giá</router-link>
        <router-link to="/solutions/overview" class="nav-link">Giải pháp</router-link>
        <router-link to="/customers" class="nav-link">Khách hàng</router-link>
        <router-link to="/contact" class="nav-link">Liên hệ</router-link>
      </nav>

      <div class="header-right">
        <v-btn rounded="pill" class="login-btn text-none font-weight-bold" elevation="0" @click="goToLogin">
          Đăng nhập
        </v-btn>
      </div>
    </header>

    <main>
      <section class="hero page-hero">
        <div class="hero-overlay" />
        <div class="page-content">
          <h1 class="page-title gradient-text">{{ pageTitle }}</h1>
          <p class="page-subtitle">Nội dung trang này đang được Adsup phát triển và sẽ sớm ra mắt.</p>
          <v-btn class="mt-8" rounded="pill" color="white" variant="outlined" size="large" to="/">
            Quay lại trang chủ
          </v-btn>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const isScrolled = ref(false);

function handleScroll() {
  isScrolled.value = window.scrollY > 20;
}

const titleMap: Record<string, string> = {
  'conversation': 'Quản lý hội thoại',
  'automation': 'Tự động hóa (Automation)',
  'broadcast': 'Gửi tin hàng loạt',
  'crm': 'Quản lý khách hàng (Mini CRM)',
  'analytics': 'Báo cáo & AI',
  'sales': 'Giải pháp cho Bán hàng',
  'support': 'Giải pháp cho CSKH',
  'marketing': 'Giải pháp cho Marketing',
  'blog': 'Blog / Kiến thức',
  'docs': 'Hướng dẫn sử dụng',
  'api': 'API & Tích hợp',
  'pricing': 'Bảng giá',
  'about': 'Về chúng tôi',
  'overview': 'Tổng quan',
  'customers': 'Khách hàng',
  'contact': 'Liên hệ'
};

const pageTitle = computed(() => {
  const id = (route.params.id as string) || route.path.split('/').pop() || '';
  return titleMap[id] || 'Trang đang cập nhật...';
});

function goToLogin() {
  router.push('/login');
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll);
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800;900&display=swap');

.landing-page {
  font-family: 'Be Vietnam Pro', sans-serif;
  background-color: #0b1e4a;
  color: white;
  min-height: 100vh;
}

.header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100px;
  padding: 0 72px;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(8, 22, 50, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
}

.logo-link {
  display: flex;
  align-items: center;
  text-decoration: none;
}

.logo-wrapper {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  background: transparent !important;
  border: none !important;
  overflow: visible !important;
}

.header-logo {
  width: 200px !important;
  height: auto !important;
  display: block;
  object-fit: contain;
  background: transparent !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  filter: drop-shadow(0 0 18px rgba(0, 213, 255, 0.35));
}

/* HEADER NAV MENU */
.header-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.header-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  flex: 1;
}

.nav-link {
  color: rgba(255, 255, 255, 0.72);
  text-decoration: none;
  font-size: 16px;
  font-weight: 500;
  padding: 8px 0;
  position: relative;
  transition: color 0.3s ease;
}

.nav-link.active {
  color: #00d5ff;
}

.nav-link::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, #00d5ff, #087BFF);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.3s ease;
}

.nav-link:hover {
  color: white;
}

.nav-link:hover::after, .nav-link.active::after {
  transform: scaleX(1);
}

.login-btn {
  width: 150px;
  height: 52px !important;
  background: linear-gradient(135deg, #00c2ff 0%, #0072ff 100%) !important;
  color: white !important;
  box-shadow: 0 4px 15px rgba(0, 194, 255, 0.3) !important;
  letter-spacing: 0.5px;
  font-size: 16px;
}

.page-hero {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 50%, rgba(0, 213, 255, 0.1) 0%, transparent 60%),
              linear-gradient(135deg, #030b1e 0%, #081a42 100%);
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, rgba(4, 11, 28, 0.8) 0%, rgba(4, 11, 28, 0.4) 100%);
  z-index: 1;
}

.page-content {
  position: relative;
  z-index: 2;
  text-align: center;
  max-width: 900px;
  padding: 0 24px;
}

.page-title {
  font-size: clamp(48px, 5vw, 72px);
  font-weight: 900;
  line-height: 1.1;
  letter-spacing: -2px;
  margin-bottom: 24px;
}

.gradient-text {
  background: linear-gradient(90deg, #00D5FF 0%, #087BFF 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.page-subtitle {
  font-size: 22px;
  color: rgba(255, 255, 255, 0.78);
  line-height: 1.6;
}

@media (max-width: 768px) {
  .header {
    padding: 0 24px;
  }
  .header-logo {
    width: 140px !important;
  }
}
</style>
