<template>
  <div class="page">
    <header class="header" :class="{ 'scrolled': isScrolled }">
      <div class="logo-wrapper">
        <router-link to="/" class="logo-link">
          <img src="/logo-v6-512.png" alt="Adsup CRM" class="header-logo" />
        </router-link>
      </div>
      <nav class="header-nav desktop-nav">
        <router-link to="/" class="nav-link">Trang chủ</router-link>
        <router-link to="/features/overview" class="nav-link router-link-active">Tính năng</router-link>
        <router-link to="/pricing" class="nav-link">Bảng giá</router-link>
        <router-link to="/solutions/overview" class="nav-link">Giải pháp</router-link>
        <router-link to="/customers" class="nav-link">Khách hàng</router-link>
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
          <router-link to="/features/overview" class="mobile-nav-link active" @click="isMobileMenuOpen = false">Tính năng</router-link>
          <router-link to="/pricing" class="mobile-nav-link" @click="isMobileMenuOpen = false">Bảng giá</router-link>
          <router-link to="/solutions/overview" class="mobile-nav-link" @click="isMobileMenuOpen = false">Giải pháp</router-link>
          <router-link to="/customers" class="mobile-nav-link" @click="isMobileMenuOpen = false">Khách hàng</router-link>
          <router-link to="/contact" class="mobile-nav-link" @click="isMobileMenuOpen = false">Liên hệ</router-link>
          <v-btn rounded="pill" class="mobile-login-btn mt-6" elevation="0" @click="goToLogin">Đăng nhập</v-btn>
        </div>
      </div>
    </header>

    <main>
      <!-- HERO -->
      <section class="page-hero">
        <div class="hero-overlay" />
        <div class="page-hero-content">
          <div class="badge">⚡ Tính năng mạnh mẽ</div>
          <h1>Tất cả công cụ bạn cần<br /><span class="gradient-text">để chinh phục khách hàng Zalo</span></h1>
          <p>Hệ sinh thái CRM Zalo toàn diện — từ quản lý hội thoại, tự động hóa đến phân tích AI, tất cả trong một nền tảng.</p>
        </div>
      </section>

      <!-- FEATURES GRID -->
      <section class="features-section">
        <div class="container">
          <div class="features-grid">
            <div class="feature-card" v-for="f in features" :key="f.title">
              <div class="feature-icon-wrap">{{ f.icon }}</div>
              <h3>{{ f.title }}</h3>
              <p>{{ f.desc }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- CTA SECTION -->
      <section class="cta-section">
        <div class="container">
          <h2>Sẵn sàng trải nghiệm?</h2>
          <p>Dùng thử miễn phí 14 ngày, không cần thẻ tín dụng.</p>
          <div class="cta-buttons">
            <button class="btn-primary" @click="goToLogin">Dùng thử miễn phí</button>
            <router-link to="/contact" class="btn-secondary">Liên hệ tư vấn</router-link>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="container"><p>© 2026 Adsup CRM. Giải pháp CRM Zalo hàng đầu Việt Nam.</p></div>
    </footer>
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

const features = [
  { icon: '💬', title: 'Quản lý hội thoại tập trung', desc: 'Gộp tất cả tin nhắn từ nhiều tài khoản Zalo cá nhân và OA về một hộp thư duy nhất. Không bỏ sót khách hàng nào.' },
  { icon: '🤖', title: 'Tự động hóa thông minh', desc: 'Tạo kịch bản chăm sóc khách hàng tự động: chào hàng, nhắc lịch hẹn, sinh nhật, follow-up — tất cả chạy tự động 24/7.' },
  { icon: '📢', title: 'Gửi tin hàng loạt (Broadcast)', desc: 'Gửi thông điệp cá nhân hóa đến hàng ngàn khách hàng chỉ trong vài giây. Tỷ lệ mở cao hơn email marketing tới 5 lần.' },
  { icon: '📊', title: 'Mini CRM & Phễu bán hàng', desc: 'Phân loại, gắn nhãn và theo dõi tiến trình của từng khách hàng qua các giai đoạn bán hàng trực quan.' },
  { icon: '🧠', title: 'Phân tích AI & Báo cáo', desc: 'AI tự động tóm tắt hội thoại, phân tích cảm xúc khách hàng, đo KPI nhân viên và dự báo doanh thu.' },
  { icon: '🔗', title: 'Tích hợp hệ thống', desc: 'Kết nối với Google Sheets, CRM nội bộ, Webhook và hơn 50 ứng dụng phổ biến thông qua API.' },
];
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800;900&display=swap');

.page { font-family: 'Be Vietnam Pro', sans-serif; background: #070f28; color: white; min-height: 100vh; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

/* HEADER */
.header { position: fixed; top: 0; left: 0; width: 100%; height: 100px; padding: 0 72px; z-index: 100; display: flex; justify-content: space-between; align-items: center; transition: all 0.4s ease; background: transparent; border-bottom: 1px solid rgba(255,255,255,0.12); }
.header.scrolled { background: rgba(8,22,50,0.95); backdrop-filter: blur(16px); box-shadow: 0 4px 30px rgba(0,0,0,0.3); }
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
.mobile-nav-link { color: rgba(255,255,255,0.85); text-decoration: none; font-size: 18px; font-weight: 600; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.1); transition: color 0.3s ease; }
.mobile-nav-link.active { color: #00d5ff; }
.mobile-login-btn { width: 100%; height: 52px !important; background: linear-gradient(135deg,#00c2ff 0%,#0072ff 100%) !important; color: white !important; font-size: 16px; font-weight: bold; }

/* HERO */
.page-hero { min-height: 60vh; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background: radial-gradient(circle at 30% 50%, rgba(0,213,255,0.12) 0%, transparent 60%), linear-gradient(135deg,#030b1e 0%,#081a42 100%); padding-top: 100px; }
.hero-overlay { position: absolute; inset: 0; background: linear-gradient(to right, rgba(4,11,28,0.8), rgba(4,11,28,0.4)); }
.page-hero-content { position: relative; z-index: 2; text-align: center; max-width: 860px; padding: 80px 24px; }
.badge { display: inline-block; background: rgba(0,213,255,0.15); border: 1px solid rgba(0,213,255,0.3); color: #00d5ff; padding: 6px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; margin-bottom: 28px; }
.page-hero-content h1 { font-size: clamp(36px, 4vw, 60px); font-weight: 900; line-height: 1.15; margin-bottom: 24px; }
.gradient-text { background: linear-gradient(90deg,#00D5FF,#087BFF); -webkit-background-clip: text; background-clip: text; color: transparent; }
.page-hero-content p { font-size: 20px; color: rgba(255,255,255,0.75); line-height: 1.6; }

/* FEATURES */
.features-section { padding: 80px 0; }
.features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
.feature-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 36px 28px; transition: all 0.3s ease; }
.feature-card:hover { background: rgba(0,213,255,0.06); border-color: rgba(0,213,255,0.25); transform: translateY(-4px); }
.feature-icon-wrap { font-size: 40px; margin-bottom: 20px; }
.feature-card h3 { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
.feature-card p { font-size: 15px; color: rgba(255,255,255,0.65); line-height: 1.6; }

/* CTA SECTION */
.cta-section { padding: 80px 0; text-align: center; background: radial-gradient(circle at center, rgba(0,213,255,0.08) 0%, transparent 70%); }
.cta-section h2 { font-size: clamp(28px, 3vw, 48px); font-weight: 900; margin-bottom: 16px; }
.cta-section p { font-size: 18px; color: rgba(255,255,255,0.7); margin-bottom: 40px; }
.cta-buttons { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; }
.btn-primary { background: white; color: #0a1940; font-size: 16px; font-weight: 800; padding: 18px 40px; border-radius: 14px; border: none; cursor: pointer; box-shadow: 0 0 30px rgba(0,213,255,0.3); transition: all 0.3s ease; }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 0 40px rgba(0,213,255,0.5); }
.btn-secondary { background: transparent; color: white; font-size: 16px; font-weight: 600; padding: 18px 40px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.3); text-decoration: none; transition: all 0.3s ease; display: inline-flex; align-items: center; }
.btn-secondary:hover { border-color: #00d5ff; color: #00d5ff; }

/* FOOTER */
.footer { padding: 40px 0; text-align: center; border-top: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); font-size: 14px; }

@media (max-width: 1024px) {
  .desktop-nav { display: none !important; }
  .mobile-menu-btn { display: block !important; }
}
@media (max-width: 768px) {
  .header { padding: 0 20px; height: 80px; }
  .header-logo { width: 130px !important; }
  .login-btn { width: auto !important; padding: 0 16px; height: 40px !important; font-size: 14px; }
  .mobile-nav-overlay { top: 80px; height: calc(100vh - 80px); }
  .features-grid { grid-template-columns: 1fr; }
}
</style>
