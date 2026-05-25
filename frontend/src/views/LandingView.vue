<template>
  <div class="landing-page">
    <!-- HEADER -->
    <header class="header" :class="{ 'scrolled': isScrolled }">
      <div class="logo-wrapper">
        <a href="/" class="logo-link">
          <img 
            src="/logo-v6-512.png" 
            alt="Adsup CRM" 
            class="header-logo"
          />
        </a>
      </div>

      <nav class="header-nav desktop-nav">
        <router-link to="/" class="nav-link active">Trang chủ</router-link>
        <router-link to="/features/overview" class="nav-link">Tính năng</router-link>
        <router-link to="/pricing" class="nav-link">Bảng giá</router-link>
        <router-link to="/solutions/overview" class="nav-link">Giải pháp</router-link>
        <router-link to="/customers" class="nav-link">Khách hàng</router-link>
        <router-link to="/contact" class="nav-link">Liên hệ</router-link>
        <a href="/AdsupCRM.apk" download="AdsupCRM.apk" class="nav-link">Tải App Android</a>
      </nav>

      <div class="header-right">
        <!-- Hamburger Icon (Mobile Only) -->
        <button class="mobile-menu-btn d-lg-none" @click="isMobileMenuOpen = !isMobileMenuOpen">
          <svg v-if="!isMobileMenuOpen" width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 12H21M3 6H21M3 18H21" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6L18 18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <v-btn
          rounded="pill"
          class="login-btn text-none font-weight-bold"
          elevation="0"
          @click="goToLogin"
        >
          Đăng nhập
        </v-btn>
      </div>

      <!-- Mobile Nav Overlay -->
      <div class="mobile-nav-overlay" :class="{ 'open': isMobileMenuOpen }">
        <div class="mobile-nav-content">
          <router-link to="/" class="mobile-nav-link active" @click="isMobileMenuOpen = false">Trang chủ</router-link>
          <router-link to="/features/overview" class="mobile-nav-link" @click="isMobileMenuOpen = false">Tính năng</router-link>
          <router-link to="/pricing" class="mobile-nav-link" @click="isMobileMenuOpen = false">Bảng giá</router-link>
          <router-link to="/solutions/overview" class="mobile-nav-link" @click="isMobileMenuOpen = false">Giải pháp</router-link>
          <router-link to="/customers" class="mobile-nav-link" @click="isMobileMenuOpen = false">Khách hàng</router-link>
          <router-link to="/contact" class="mobile-nav-link" @click="isMobileMenuOpen = false">Liên hệ</router-link>
          <a href="/AdsupCRM.apk" download="AdsupCRM.apk" class="mobile-nav-link" @click="isMobileMenuOpen = false" style="color: #00d5ff;">Tải App Android</a>
          <v-btn rounded="pill" class="mobile-login-btn mt-6" elevation="0" @click="goToLogin">
            Đăng nhập
          </v-btn>
        </div>
      </div>
    </header>

    <main>
      <!-- HERO -->
      <section class="hero">
        <video autoPlay loop muted playsInline class="hero-visual">
          <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260206_044704_dd33cb15-c23f-4cfc-aa09-a0465d4dcb54.mp4" />
        </video>

        <div class="hero-overlay" />

        <div class="hero-content">
          <h1 class="hero-title">
            PHẦN MỀM <span class="gradient-text">CRM ZALO</span><br />
            TỰ ĐỘNG HÓA BÁN HÀNG
          </h1>
          <p class="hero-subtitle">Giải pháp quản lý tin nhắn Zalo tập trung, tự động hóa quy trình chăm sóc khách hàng và tăng trưởng doanh thu vượt trội cho doanh nghiệp.</p>

          <button class="cta-button" @click="goToLogin">
            <div class="cta-blur" />
            <div class="cta-inner">
              DÙNG THỬ MIỄN PHÍ
            </div>
          </button>
        </div>
      </section>

      <!-- KEY FEATURES -->
      <section class="features">
        <div class="container">
          <h2 class="section-title">
            <span class="gradient-text">Tính năng nổi bật của Adsup CRM</span>
          </h2>
          <p class="section-subtitle">Tại sao hơn 1000+ doanh nghiệp tin dùng giải pháp quản lý Zalo của chúng tôi?</p>

          <div class="features-grid">
            <div class="feature-card">
              <div class="feature-icon">📱</div>
              <h3 class="feature-title">Quản lý Zalo đa tài khoản</h3>
              <p class="feature-desc">Gộp tất cả tin nhắn từ nhiều tài khoản Zalo cá nhân, Official Account vào một màn hình duy nhất.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">🤖</div>
              <h3 class="feature-title">Tự động hóa (Automation)</h3>
              <p class="feature-desc">Tự động gửi tin nhắn chúc mừng sinh nhật, nhắc lịch hẹn và kịch bản chăm sóc khách hàng cũ.</p>
            </div>
            <div class="feature-card">
              <div class="feature-icon">📊</div>
              <h3 class="feature-title">Báo cáo & Phân tích AI</h3>
              <p class="feature-desc">Phân tích sắc thái hội thoại, tóm tắt nội dung chat và báo cáo hiệu suất nhân viên theo thời gian thực.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- SEO CONTENT SECTION -->
      <section class="seo-content section-padding">
        <div class="container">
          <div class="content-wrapper">
            <h2>Phần mềm quản lý Zalo - Đột phá doanh thu 4.0</h2>
            <p>Trong kỷ nguyên số, <strong>Zalo</strong> đã trở thành kênh bán hàng không thể thiếu. Tuy nhiên, việc quản lý hàng trăm đoạn hội thoại mỗi ngày khiến nhân viên quá tải. <strong>Adsup CRM</strong> ra đời nhằm giải quyết triệt để bài toán này bằng công nghệ tự động hóa hiện đại nhất.</p>
            
            <div class="benefits-list">
              <div class="benefit-item">
                <h4>✅ Tiết kiệm 70% thời gian trực chat</h4>
                <p>Hệ thống chatbot thông minh và template trả lời nhanh giúp phản hồi khách hàng trong chưa đầy 3 giây.</p>
              </div>
              <div class="benefit-item">
                <h4>✅ Không bỏ sót bất kỳ khách hàng nào</h4>
                <p>Hệ thống cảnh báo tin nhắn chưa trả lời và phân loại khách hàng theo phễu bán hàng chuyên nghiệp.</p>
              </div>
              <div class="benefit-item">
                <h4>✅ Bảo mật dữ liệu tuyệt đối</h4>
                <p>Dữ liệu khách hàng được lưu trữ mã hóa, giúp doanh nghiệp sở hữu nguồn tài sản số quý giá mà không lo thất thoát.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- FAQ SECTION -->
      <section class="faq section-padding">
        <div class="container">
          <h2 class="section-title">Câu hỏi thường gặp</h2>
          <div class="faq-grid">
            <div class="faq-item">
              <h3>Adsup CRM có hỗ trợ Zalo cá nhân không?</h3>
              <p>Có, chúng tôi hỗ trợ quản lý tập trung cả Zalo cá nhân và Zalo OA trên cùng một nền tảng.</p>
            </div>
            <div class="faq-item">
              <h3>Dữ liệu của tôi có được an toàn không?</h3>
              <p>Mọi dữ liệu được lưu trữ trên hạ tầng đám mây bảo mật cao và chỉ có tài khoản của bạn mới có quyền truy cập.</p>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- FOOTER -->
    <footer class="footer">
      <div class="container">
        <div class="footer-content">
          <p>© 2026 Adsup CRM. Giải pháp CRM Zalo hàng đầu Việt Nam.</p>
          <div class="footer-links">
            <a href="#">Chính sách bảo mật</a>
            <a href="#">Điều khoản sử dụng</a>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const isScrolled = ref(false);
const isMobileMenuOpen = ref(false);

function handleScroll() {
  isScrolled.value = window.scrollY > 20;
}

function goToLogin() {
  router.push('/login');
}

onMounted(() => {
  const token = localStorage.getItem('token');
  if (token) {
    router.push('/dashboard');
    return;
  }
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

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

/* HEADER */
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
  transition: all 0.4s ease;
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.header.scrolled {
  background: rgba(8, 22, 50, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
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

.login-btn {
  width: 150px;
  height: 52px !important;
  background: linear-gradient(135deg, #00c2ff 0%, #0072ff 100%) !important;
  color: white !important;
  box-shadow: 0 4px 15px rgba(0, 194, 255, 0.3) !important;
  letter-spacing: 0.5px;
  transition: all 0.3s ease;
  font-size: 16px;
}

.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 194, 255, 0.5) !important;
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

/* Hide desktop nav on mobile */
.desktop-nav {
  display: flex;
}

@media (max-width: 1024px) {
  .desktop-nav {
    display: none !important;
  }
  .mobile-menu-btn {
    display: block !important;
  }
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

/* MOBILE NAV MENU */
.mobile-menu-btn {
  display: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  margin-right: 8px;
  z-index: 101;
}

.mobile-nav-overlay {
  position: fixed;
  top: 100px;
  left: 0;
  width: 100%;
  height: calc(100vh - 100px);
  background: rgba(8, 22, 50, 0.98);
  backdrop-filter: blur(16px);
  z-index: 99;
  display: flex;
  flex-direction: column;
  padding: 24px;
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow-y: auto;
}

.mobile-nav-overlay.open {
  transform: translateX(0);
}

.mobile-nav-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-nav-link {
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  font-size: 18px;
  font-weight: 600;
  padding: 14px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  transition: color 0.3s ease;
}

.mobile-nav-link.active {
  color: #00d5ff;
}

.mobile-login-btn {
  width: 100%;
  height: 52px !important;
  background: linear-gradient(135deg, #00c2ff 0%, #0072ff 100%) !important;
  color: white !important;
  font-size: 16px;
  font-weight: bold;
}

@media (min-width: 769px) {
  .mobile-nav-overlay {
    display: none !important;
  }
}

@media (max-width: 768px) {
  .header {
    padding: 0 20px;
    height: 80px;
  }
  .header-logo {
    width: 130px !important;
  }
  .header-nav {
    display: none !important;
  }
  .mobile-menu-btn {
    display: block;
  }
  .mobile-nav-overlay {
    top: 80px;
    height: calc(100vh - 80px);
  }
  .login-btn {
    width: auto;
    padding: 0 16px;
    height: 40px !important;
    font-size: 14px;
  }
  .hero-content {
    margin-left: 20px !important;
    padding-top: 15vh !important;
    width: calc(100% - 40px);
  }
  .hero-title {
    font-size: 40px !important;
    line-height: 1.15 !important;
    white-space: normal !important;
    letter-spacing: -1px;
  }
  .hero-subtitle {
    font-size: 16px !important;
    margin-top: 24px;
  }
  .cta-button {
    width: 100% !important;
    max-width: 280px;
    height: 60px !important;
  }
  .hero-visual {
    opacity: 0.3 !important;
    width: 100% !important;
  }
}

/* HERO */
.hero {
  min-height: calc(100vh - 100px);
  position: relative;
  overflow: hidden;
  background: radial-gradient(circle at 10% 20%, rgba(0, 213, 255, 0.15) 0%, transparent 40%),
              linear-gradient(135deg, #030b1e 0%, #081a42 100%);
}

.hero-visual {
  position: absolute;
  right: 0;
  top: 100px;
  width: 52vw;
  height: calc(100vh - 100px);
  object-fit: cover;
  z-index: 1;
  opacity: 0.6;
  mix-blend-mode: screen;
  mask-image: linear-gradient(to right, transparent, black 30%);
  -webkit-mask-image: linear-gradient(to right, transparent, black 30%);
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, rgba(4, 11, 28, 0.95) 0%, rgba(4, 11, 28, 0.6) 45%, rgba(4, 11, 28, 0.1) 100%);
  z-index: 1;
}

.hero-content {
  position: relative;
  z-index: 2;
  margin-left: 15vw;
  padding-top: 24vh;
  max-width: 1200px;
  text-align: left;
}

.hero-title {
  font-size: clamp(64px, 5.4vw, 88px);
  line-height: 1.05;
  font-weight: 900;
  letter-spacing: -3px;
  max-width: 1200px;
  color: white;
  margin-bottom: 0;
  white-space: nowrap;
}

.gradient-text {
  background: linear-gradient(90deg, #00D5FF 0%, #087BFF 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  display: inline-block;
}

.hero-subtitle {
  max-width: 760px;
  margin-top: 34px;
  font-size: 20px;
  line-height: 1.6;
  color: rgba(255,255,255,0.78);
  white-space: normal;
}

.cta-button {
  margin-top: 44px;
  width: 330px;
  height: 72px;
  position: relative;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.3s ease;
}

.cta-button:hover {
  transform: translateY(-2px);
}

.cta-blur {
  position: absolute;
  inset: 0;
  background: #00D5FF;
  border-radius: 16px;
  filter: blur(16px);
  opacity: 0.6;
  transition: all 0.3s ease;
}

.cta-button:hover .cta-blur {
  opacity: 1;
  filter: blur(16px);
}

.cta-inner {
  position: relative;
  width: 100%;
  height: 100%;
  background: white;
  color: #0b1e4a;
  font-weight: 800;
  text-transform: uppercase;
  font-size: 1rem;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  padding: 0 20px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

/* FEATURES */
.features {
  padding: 96px 0;
  background: #0b1e4a;
}

.section-title {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 48px;
  text-align: center;
}

.hero-subtitle {
  font-size: 19px; /* 18-20px */
  color: #cbd5e1; /* Trắng xám nhẹ */
  max-width: 740px; /* 720-760px */
  margin: 32px 0 40px; /* Margin-top 28-36px */
  line-height: 1.6;
}

.section-subtitle {
  text-align: center;
  color: #9ca3af;
  margin-top: -32px;
  margin-bottom: 48px;
  font-size: 1.125rem;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 32px;
}

.feature-card {
  padding: 32px;
  background: #132a63;
  border: 1px solid #1f3b82;
  border-radius: 20px;
  transition: all 0.3s ease;
  text-align: left;
}

.feature-card:hover {
  transform: translateY(-10px);
  border-color: #00c2ff;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.feature-icon {
  font-size: 2.5rem;
  margin-bottom: 16px;
}

.feature-title {
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 12px;
  color: white;
}

.feature-desc {
  color: #d1d5db;
  line-height: 1.5;
}

.section-padding {
  padding: 100px 0;
}

.seo-content {
  background: #081632;
}

.content-wrapper h2 {
  font-size: 2.25rem;
  margin-bottom: 24px;
  color: #00c2ff;
}

.content-wrapper p {
  font-size: 1.125rem;
  line-height: 1.8;
  color: #d1d5db;
  margin-bottom: 32px;
}

.benefits-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
}

.benefit-item {
  background: rgba(255, 255, 255, 0.03);
  padding: 24px;
  border-radius: 12px;
}

.benefit-item h4 {
  font-size: 1.125rem;
  margin-bottom: 12px;
  color: white;
}

.faq {
  background: #0b1e4a;
}

.faq-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 32px;
  margin-top: 48px;
}

.faq-item {
  padding-bottom: 24px;
  border-bottom: 1px solid #1f3b82;
}

.faq-item h3 {
  font-size: 1.25rem;
  margin-bottom: 12px;
  color: #00c2ff;
}

.footer {
  padding: 60px 0;
  background: #050b14;
  border-top: 1px solid #1f3b82;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

.footer-links {
  display: flex;
  gap: 24px;
}

.footer-links a {
  color: #9ca3af;
  text-decoration: none;
  transition: color 0.2s;
}

.footer-links a:hover {
  color: white;
}

@media (max-width: 768px) {
  .hero-title {
    font-size: 2.5rem;
  }
  .section-title {
    font-size: 2rem;
  }
  .footer-content {
    flex-direction: column;
    text-align: center;
  }
}
</style>
