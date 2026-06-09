<template>
  <div class="page">
    <header class="header" :class="{ 'scrolled': isScrolled }">
      <div class="logo-wrapper"><router-link to="/" class="logo-link"><img src="/logo-v6-512.png" alt="Adsup CRM" class="header-logo" /></router-link></div>
      <nav class="header-nav desktop-nav">
        <router-link to="/" class="nav-link">Trang chủ</router-link>
        <router-link to="/features/overview" class="nav-link">Tính năng</router-link>
        <router-link to="/pricing" class="nav-link">Bảng giá</router-link>
        <router-link to="/solutions/overview" class="nav-link">Giải pháp</router-link>
        <router-link to="/customers" class="nav-link router-link-active">Khách hàng</router-link>
        <router-link to="/contact" class="nav-link">Liên hệ</router-link>
      </nav>
      <div class="header-right">
        <button class="mobile-menu-btn" @click="isMobileMenuOpen = !isMobileMenuOpen">
          <svg v-if="!isMobileMenuOpen" width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 12H21M3 6H21M3 18H21" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <v-btn rounded="pill" class="login-btn text-none font-weight-bold" elevation="0" @click="goToLogin">Đăng nhập</v-btn>
      </div>
      <div class="mobile-nav-overlay" :class="{ 'open': isMobileMenuOpen }">
        <div class="mobile-nav-content">
          <router-link to="/" class="mobile-nav-link" @click="isMobileMenuOpen = false">Trang chủ</router-link>
          <router-link to="/features/overview" class="mobile-nav-link" @click="isMobileMenuOpen = false">Tính năng</router-link>
          <router-link to="/pricing" class="mobile-nav-link" @click="isMobileMenuOpen = false">Bảng giá</router-link>
          <router-link to="/solutions/overview" class="mobile-nav-link" @click="isMobileMenuOpen = false">Giải pháp</router-link>
          <router-link to="/customers" class="mobile-nav-link active" @click="isMobileMenuOpen = false">Khách hàng</router-link>
          <router-link to="/contact" class="mobile-nav-link" @click="isMobileMenuOpen = false">Liên hệ</router-link>
          <v-btn rounded="pill" class="mobile-login-btn mt-6" elevation="0" @click="goToLogin">Đăng nhập</v-btn>
        </div>
      </div>
    </header>
    <main>
      <section class="page-hero">
        <div class="page-hero-content">
          <div class="badge">⭐ Hơn 1,000+ doanh nghiệp tin dùng</div>
          <h1>Khách hàng của chúng tôi<br /><span class="gradient-text">nói gì?</span></h1>
          <p>Hàng ngàn doanh nghiệp Việt đã tin dùng Adsup CRM để tự động hóa và tăng trưởng.</p>
        </div>
      </section>
      <section class="stats-section">
        <div class="container">
          <div class="stats-grid">
            <div class="stat-card" v-for="s in stats" :key="s.label">
              <div class="stat-value">{{ s.value }}</div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </div>
        </div>
      </section>
      <section class="testimonials-section">
        <div class="container">
          <h2 class="section-title">Câu chuyện thành công</h2>
          <div class="testimonials-grid">
            <div class="testimonial-card" v-for="t in testimonials" :key="t.name">
              <div class="stars">★★★★★</div>
              <p class="testimonial-text">"{{ t.text }}"</p>
              <div class="testimonial-author">
                <div class="author-avatar">{{ t.name[0] }}</div>
                <div>
                  <div class="author-name">{{ t.name }}</div>
                  <div class="author-role">{{ t.role }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section class="cta-section">
        <div class="container">
          <h2>Tham gia cùng 1,000+ doanh nghiệp thành công</h2>
          <button class="btn-primary" @click="goToLogin">Bắt đầu miễn phí ngay</button>
        </div>
      </section>
    </main>
    <footer class="footer"><div class="container"><p>© 2026 Adsup CRM. Giải pháp CRM Zalo hàng đầu Việt Nam.</p></div></footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
const router = useRouter();
const isScrolled = ref(false);
const isMobileMenuOpen = ref(false);
function handleScroll() { isScrolled.value = window.scrollY > 20; }
function goToLogin() { router.push('/login'); }
onMounted(() => window.addEventListener('scroll', handleScroll));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));
const stats = [
  { value: '1,000+', label: 'Doanh nghiệp tin dùng' },
  { value: '5 triệu+', label: 'Tin nhắn xử lý mỗi tháng' },
  { value: '98%', label: 'Tỷ lệ hài lòng khách hàng' },
  { value: '3x', label: 'Tăng trưởng doanh thu trung bình' },
];
const testimonials = [
  { name: 'Nguyễn Minh Tuấn', role: 'CEO — Chuỗi spa làm đẹp', text: 'Từ khi dùng Adsup CRM, đội sales của tôi không còn bỏ sót khách hàng nào. Doanh thu tháng đầu đã tăng 40%.' },
  { name: 'Trần Thị Hoa', role: 'Trưởng phòng CSKH — Công ty BĐS', text: 'Chatbot tự động trả lời khách hàng 24/7, nhân viên của tôi giờ chỉ tập trung vào các case phức tạp và chốt hợp đồng.' },
  { name: 'Lê Văn Đức', role: 'Marketing Manager — Thương mại điện tử', text: 'Broadcast Zalo có tỷ lệ mở lên đến 90%, so với email chỉ 20%. Đây là kênh marketing hiệu quả nhất chúng tôi có.' },
  { name: 'Phạm Thị Lan', role: 'Chủ salon tóc — Hà Nội', text: 'Hệ thống tự động nhắc lịch hẹn cho khách giúp tôi giảm 70% tỷ lệ no-show. Tuyệt vời!' },
  { name: 'Hoàng Việt Anh', role: 'COO — Công ty logistics', text: 'Quản lý hàng trăm nhân viên telesales trên cùng một nền tảng, báo cáo AI giúp tôi nắm tình hình trong 5 giây.' },
  { name: 'Võ Thanh Tùng', role: 'CEO — Agency marketing', text: 'Triển khai cho nhiều khách hàng, mỗi lần onboarding chỉ mất 30 phút. API linh hoạt, team dev không cần mò mẫm.' },
];
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800;900&display=swap');
.page { font-family: 'Be Vietnam Pro', sans-serif; background: #070f28; color: white; min-height: 100vh; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.gradient-text { background: linear-gradient(90deg,#00D5FF,#087BFF); -webkit-background-clip: text; background-clip: text; color: transparent; }
.header { position: fixed; top: 0; left: 0; width: 100%; height: 100px; padding: 0 72px; z-index: 100; display: flex; justify-content: space-between; align-items: center; background: transparent; border-bottom: 1px solid rgba(255,255,255,0.12); transition: all 0.4s ease; }
.header.scrolled { background: rgba(8,22,50,0.95); backdrop-filter: blur(16px); }
.logo-wrapper { display: flex; align-items: center; flex-shrink: 0; }
.logo-link { display: flex; align-items: center; text-decoration: none; }
.header-logo { width: 200px !important; height: auto !important; object-fit: contain; background: transparent !important; border-radius: 0 !important; filter: drop-shadow(0 0 18px rgba(0,213,255,0.35)); }
.header-right { display: flex; align-items: center; flex-shrink: 0; gap: 8px; }
.header-nav { display: flex; align-items: center; justify-content: center; gap: 32px; flex: 1; }
.desktop-nav { display: flex; }
.nav-link { color: rgba(255,255,255,0.72); text-decoration: none; font-size: 16px; font-weight: 500; padding: 8px 0; position: relative; transition: color 0.3s ease; }
.nav-link::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 2px; background: linear-gradient(90deg,#00d5ff,#087BFF); transform: scaleX(0); transform-origin: left; transition: transform 0.3s ease; }
.nav-link:hover { color: white; }
.nav-link:hover::after, .nav-link.router-link-active::after { transform: scaleX(1); }
.nav-link.router-link-active { color: #00d5ff; }
.login-btn { width: 150px; height: 52px !important; background: linear-gradient(135deg,#00c2ff 0%,#0072ff 100%) !important; color: white !important; font-size: 16px; }
.mobile-menu-btn { display: none; background: none; border: none; cursor: pointer; padding: 8px; }
.mobile-nav-overlay { position: fixed; top: 100px; left: 0; width: 100%; height: calc(100vh - 100px); background: rgba(8,22,50,0.98); backdrop-filter: blur(16px); z-index: 99; display: flex; flex-direction: column; padding: 24px; transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4,0,0.2,1); overflow-y: auto; }
.mobile-nav-overlay.open { transform: translateX(0); }
.mobile-nav-content { display: flex; flex-direction: column; gap: 12px; }
.mobile-nav-link { color: rgba(255,255,255,0.85); text-decoration: none; font-size: 18px; font-weight: 600; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
.mobile-nav-link.active { color: #00d5ff; }
.mobile-login-btn { width: 100%; height: 52px !important; background: linear-gradient(135deg,#00c2ff 0%,#0072ff 100%) !important; color: white !important; font-size: 16px; font-weight: bold; }
.page-hero { min-height: 55vh; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 50%, rgba(0,213,255,0.1) 0%, transparent 60%), linear-gradient(135deg,#030b1e 0%,#081a42 100%); padding-top: 100px; }
.page-hero-content { text-align: center; max-width: 760px; padding: 80px 24px; }
.badge { display: inline-block; background: rgba(0,213,255,0.15); border: 1px solid rgba(0,213,255,0.3); color: #00d5ff; padding: 6px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; margin-bottom: 28px; }
.page-hero-content h1 { font-size: clamp(36px,4vw,60px); font-weight: 900; line-height: 1.15; margin-bottom: 20px; }
.page-hero-content p { font-size: 18px; color: rgba(255,255,255,0.75); line-height: 1.6; }
.stats-section { padding: 60px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
.stat-card { text-align: center; padding: 32px; background: rgba(255,255,255,0.04); border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); }
.stat-value { font-size: 42px; font-weight: 900; color: #00d5ff; margin-bottom: 8px; }
.stat-label { font-size: 15px; color: rgba(255,255,255,0.6); }
.testimonials-section { padding: 80px 0; }
.section-title { font-size: clamp(28px,3vw,40px); font-weight: 900; text-align: center; margin-bottom: 48px; }
.testimonials-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.testimonial-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 32px; transition: all 0.3s ease; }
.testimonial-card:hover { border-color: rgba(0,213,255,0.25); transform: translateY(-4px); }
.stars { color: #FFD700; font-size: 18px; margin-bottom: 16px; letter-spacing: 2px; }
.testimonial-text { font-size: 15px; color: rgba(255,255,255,0.8); line-height: 1.7; margin-bottom: 24px; font-style: italic; }
.testimonial-author { display: flex; align-items: center; gap: 12px; }
.author-avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg,#00c2ff,#0072ff); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; flex-shrink: 0; }
.author-name { font-size: 15px; font-weight: 700; }
.author-role { font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 2px; }
.cta-section { padding: 80px 0; text-align: center; background: radial-gradient(circle at center, rgba(0,213,255,0.08) 0%, transparent 70%); }
.cta-section h2 { font-size: clamp(24px,3vw,40px); font-weight: 900; margin-bottom: 36px; }
.btn-primary { background: white; color: #0a1940; font-size: 18px; font-weight: 800; padding: 20px 48px; border-radius: 14px; border: none; cursor: pointer; box-shadow: 0 0 30px rgba(0,213,255,0.3); transition: all 0.3s ease; }
.btn-primary:hover { transform: translateY(-2px); }
.footer { padding: 40px 0; text-align: center; border-top: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); font-size: 14px; }
@media (max-width: 1024px) { .desktop-nav { display: none !important; } .mobile-menu-btn { display: block !important; } }
@media (max-width: 768px) {
  .header { padding: 0 20px; height: 80px; }
  .header-logo { width: 130px !important; }
  .login-btn { width: auto !important; padding: 0 16px; height: 40px !important; font-size: 14px; }
  .mobile-nav-overlay { top: 80px; height: calc(100vh - 80px); }
  .stats-grid { grid-template-columns: 1fr 1fr; }
  .testimonials-grid { grid-template-columns: 1fr; }
}
</style>
