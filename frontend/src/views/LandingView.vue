<template>
  <div class="landing-page">
    <!-- NAVBAR -->
    <header class="navbar" :class="{ 'scrolled': isScrolled }">
      <div class="container">
        <img 
          src="@/assets/logo-cropped.png" 
          alt="Adsup CRM - Phần mềm quản lý Zalo chuyên nghiệp" 
          class="logo"
        />
        <v-btn
          rounded="pill"
          class="login-btn text-none px-6"
          color="primary"
          @click="goToLogin"
        >
          Đăng nhập
        </v-btn>
      </div>
    </header>

    <main>
      <!-- HERO -->
      <section class="hero">
        <video autoPlay loop muted playsInline class="hero-video">
          <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260206_044704_dd33cb15-c23f-4cfc-aa09-a0465d4dcb54.mp4" />
        </video>

        <div class="hero-overlay" />

        <div class="container hero-content">
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

/* NAVBAR */
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 100;
  transition: all 0.3s ease;
}

.navbar.scrolled {
  background: rgba(11, 30, 74, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
}

.navbar .container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  padding-bottom: 16px;
}

.logo {
  height: 80px;
  width: auto;
  object-fit: contain;
  transform: scale(1.8);
  transform-origin: left center;
}

/* HERO */
.hero {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: #21346e;
  display: flex;
  align-items: center;
}

.hero-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.5;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(33, 52, 110, 0.8), rgba(26, 47, 102, 0.8), rgba(11, 30, 74, 0.95));
}

.hero-content {
  position: relative;
  z-index: 1;
  padding-top: 80px;
}

.hero-title {
  font-size: clamp(3rem, 10vw, 6rem);
  font-weight: 900;
  line-height: 1.35;
  letter-spacing: -1px;
  text-transform: uppercase;
}

.gradient-text {
  background: linear-gradient(to right, #00c2ff, #0072ff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.cta-button {
  margin-top: 40px;
  width: 184px;
  height: 65px;
  position: relative;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.3s ease;
}

.cta-button:hover {
  transform: scale(1.05);
}

.cta-blur {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, #00c2ff, #0072ff);
  border-radius: 12px;
  filter: blur(8px);
  opacity: 0.7;
}

.cta-inner {
  position: relative;
  width: 100%;
  height: 100%;
  background: white;
  color: #161a20;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 1.125rem;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  font-size: 1.25rem;
  color: #d1d5db;
  max-width: 800px;
  margin: 24px 0 40px;
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
