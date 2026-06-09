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
        <router-link to="/features/overview" class="nav-link">Tính năng</router-link>
        <router-link to="/pricing" class="nav-link router-link-active">Bảng giá</router-link>
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
          <router-link to="/features/overview" class="mobile-nav-link" @click="isMobileMenuOpen = false">Tính năng</router-link>
          <router-link to="/pricing" class="mobile-nav-link active" @click="isMobileMenuOpen = false">Bảng giá</router-link>
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
        <div class="hero-overlay"></div>
        <div class="page-hero-content">
          <div class="badge">💎 Minh bạch, không phí ẩn</div>
          <h1>Bảng giá đơn giản<br /><span class="gradient-text">Phù hợp mọi quy mô</span></h1>
          <p>Chọn gói phù hợp với doanh nghiệp của bạn. Nâng cấp hoặc hủy bất cứ lúc nào.</p>
        </div>
      </section>

      <!-- PRICING TOGGLE -->
      <section class="pricing-section">
        <div class="container">
          <div class="billing-toggle">
            <span :class="{ active: !isYearly }" @click="isYearly = false">Hàng tháng</span>
            <div class="toggle-switch" @click="isYearly = !isYearly" :class="{ 'on': isYearly }">
              <div class="toggle-knob"></div>
            </div>
            <span :class="{ active: isYearly }" @click="isYearly = true">Hàng năm <span class="save-badge">Tiết kiệm 20%</span></span>
          </div>

          <div class="pricing-grid">
            <div class="pricing-card" v-for="plan in plans" :key="plan.name" :class="{ popular: plan.popular }">
              <div v-if="plan.popular" class="popular-badge">Phổ biến nhất</div>
              <div class="plan-name">{{ plan.name }}</div>
              <div class="plan-price">
                <span class="currency">₫</span>
                <span class="amount">{{ isYearly ? plan.yearlyPrice : plan.monthlyPrice }}</span>
                <span class="period">/tháng</span>
              </div>
              <div class="plan-desc">{{ plan.desc }}</div>
              <ul class="plan-features">
                <li v-for="feat in plan.features" :key="feat"><span class="check">✓</span> {{ feat }}</li>
              </ul>
              <button class="plan-btn" :class="{ 'plan-btn-primary': plan.popular }" @click="goToLogin">
                {{ plan.cta }}
              </button>
            </div>
          </div>

          <p class="pricing-note">Tất cả gói đều bao gồm hỗ trợ kỹ thuật và cập nhật miễn phí. Doanh nghiệp lớn? <router-link to="/contact" class="link-cyan">Liên hệ tư vấn</router-link></p>
        </div>
      </section>

      <!-- FAQ -->
      <section class="faq-section">
        <div class="container">
          <h2 class="section-title">Câu hỏi thường gặp</h2>
          <div class="faq-grid">
            <div class="faq-item" v-for="q in faqs" :key="q.q">
              <h4>{{ q.q }}</h4>
              <p>{{ q.a }}</p>
            </div>
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
const isYearly = ref(false);

function handleScroll() { isScrolled.value = window.scrollY > 20; }
function goToLogin() { router.push('/login'); }
onMounted(() => window.addEventListener('scroll', handleScroll));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));

const plans = [
  {
    name: 'Starter', popular: false,
    monthlyPrice: '490K', yearlyPrice: '390K',
    desc: 'Dành cho cá nhân và hộ kinh doanh nhỏ.',
    cta: 'Dùng thử miễn phí',
    features: ['1 tài khoản Zalo', 'Hộp thư hội thoại tập trung', 'Gửi tin hàng loạt (1,000/tháng)', 'Chatbot cơ bản', 'Báo cáo đơn giản', 'Hỗ trợ qua email'],
  },
  {
    name: 'Pro', popular: true,
    monthlyPrice: '990K', yearlyPrice: '790K',
    desc: 'Dành cho team bán hàng chuyên nghiệp.',
    cta: 'Bắt đầu ngay',
    features: ['5 tài khoản Zalo', 'Zalo OA không giới hạn', 'Gửi tin hàng loạt (10,000/tháng)', 'Automation đầy đủ', 'Mini CRM & Phễu bán hàng', 'Báo cáo AI nâng cao', 'Hỗ trợ ưu tiên 24/7'],
  },
  {
    name: 'Enterprise', popular: false,
    monthlyPrice: 'Liên hệ', yearlyPrice: 'Liên hệ',
    desc: 'Dành cho doanh nghiệp lớn, tùy chỉnh hoàn toàn.',
    cta: 'Liên hệ tư vấn',
    features: ['Tài khoản Zalo không giới hạn', 'API tích hợp đầy đủ', 'Gửi tin không giới hạn', 'Quản lý đa chi nhánh', 'SLA & Uptime đảm bảo', 'Onboarding & training', 'Dedicated Account Manager'],
  },
];

const faqs = [
  { q: 'Tôi có thể dùng thử miễn phí không?', a: 'Có! Tất cả các gói đều có 14 ngày dùng thử miễn phí, không cần thẻ tín dụng.' },
  { q: 'Tôi có thể nâng/hạ cấp gói không?', a: 'Hoàn toàn có thể. Bạn có thể thay đổi gói bất cứ lúc nào và sẽ được tính phí theo tỷ lệ ngày sử dụng.' },
  { q: 'Dữ liệu của tôi có được bảo mật không?', a: 'Dữ liệu được mã hóa AES-256, lưu trữ trên hạ tầng đám mây đạt chuẩn ISO 27001 tại Việt Nam.' },
  { q: 'Có hỗ trợ tiếng Việt không?', a: 'Toàn bộ giao diện và hỗ trợ kỹ thuật đều bằng tiếng Việt, với đội ngũ support trong nước.' },
];
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800;900&display=swap');
.page { font-family: 'Be Vietnam Pro', sans-serif; background: #070f28; color: white; min-height: 100vh; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.gradient-text { background: linear-gradient(90deg,#00D5FF,#087BFF); -webkit-background-clip: text; background-clip: text; color: transparent; }

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
.page-hero { min-height: 55vh; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background: radial-gradient(circle at 70% 50%, rgba(0,213,255,0.1) 0%, transparent 60%), linear-gradient(135deg,#030b1e 0%,#081a42 100%); padding-top: 100px; }
.hero-overlay { position: absolute; inset: 0; }
.page-hero-content { position: relative; z-index: 2; text-align: center; max-width: 760px; padding: 80px 24px; }
.badge { display: inline-block; background: rgba(0,213,255,0.15); border: 1px solid rgba(0,213,255,0.3); color: #00d5ff; padding: 6px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; margin-bottom: 28px; }
.page-hero-content h1 { font-size: clamp(36px,4vw,60px); font-weight: 900; line-height: 1.15; margin-bottom: 20px; }
.page-hero-content p { font-size: 18px; color: rgba(255,255,255,0.75); line-height: 1.6; }

/* PRICING */
.pricing-section { padding: 80px 0; }
.billing-toggle { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 60px; font-size: 16px; font-weight: 600; }
.billing-toggle span { color: rgba(255,255,255,0.5); cursor: pointer; transition: color 0.3s; }
.billing-toggle span.active { color: white; }
.toggle-switch { width: 52px; height: 28px; background: rgba(255,255,255,0.15); border-radius: 999px; cursor: pointer; position: relative; transition: background 0.3s; }
.toggle-switch.on { background: linear-gradient(90deg,#00c2ff,#0072ff); }
.toggle-knob { width: 22px; height: 22px; background: white; border-radius: 50%; position: absolute; top: 3px; left: 3px; transition: transform 0.3s; }
.toggle-switch.on .toggle-knob { transform: translateX(24px); }
.save-badge { background: rgba(0,213,255,0.2); color: #00d5ff; font-size: 11px; padding: 2px 8px; border-radius: 999px; margin-left: 6px; }
.pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; align-items: start; margin-bottom: 40px; }
.pricing-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 40px 32px; position: relative; transition: all 0.3s ease; }
.pricing-card.popular { border-color: rgba(0,213,255,0.5); background: rgba(0,213,255,0.05); transform: scale(1.03); }
.popular-badge { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: linear-gradient(90deg,#00c2ff,#0072ff); color: white; font-size: 13px; font-weight: 700; padding: 4px 20px; border-radius: 999px; }
.plan-name { font-size: 20px; font-weight: 800; margin-bottom: 16px; }
.plan-price { display: flex; align-items: flex-end; gap: 4px; margin-bottom: 12px; }
.currency { font-size: 22px; font-weight: 700; color: #00d5ff; margin-bottom: 8px; }
.amount { font-size: 48px; font-weight: 900; line-height: 1; }
.period { font-size: 16px; color: rgba(255,255,255,0.5); margin-bottom: 8px; }
.plan-desc { font-size: 14px; color: rgba(255,255,255,0.55); margin-bottom: 28px; line-height: 1.5; }
.plan-features { list-style: none; padding: 0; margin: 0 0 32px; display: flex; flex-direction: column; gap: 12px; }
.plan-features li { font-size: 15px; color: rgba(255,255,255,0.8); display: flex; align-items: flex-start; gap: 10px; }
.check { color: #00d5ff; font-weight: 900; flex-shrink: 0; }
.plan-btn { width: 100%; padding: 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: white; font-size: 16px; font-weight: 700; cursor: pointer; transition: all 0.3s ease; }
.plan-btn:hover { background: rgba(255,255,255,0.1); }
.plan-btn-primary { background: linear-gradient(135deg,#00c2ff,#0072ff); border: none; box-shadow: 0 0 30px rgba(0,194,255,0.3); }
.plan-btn-primary:hover { box-shadow: 0 0 40px rgba(0,194,255,0.5); }
.pricing-note { text-align: center; font-size: 15px; color: rgba(255,255,255,0.5); }
.link-cyan { color: #00d5ff; }

/* FAQ */
.faq-section { padding: 60px 0 80px; }
.section-title { font-size: clamp(28px,3vw,40px); font-weight: 900; text-align: center; margin-bottom: 48px; }
.faq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.faq-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 28px; }
.faq-item h4 { font-size: 17px; font-weight: 700; margin-bottom: 12px; }
.faq-item p { font-size: 15px; color: rgba(255,255,255,0.65); line-height: 1.6; }

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
  .pricing-grid { grid-template-columns: 1fr; }
  .pricing-card.popular { transform: none; }
  .faq-grid { grid-template-columns: 1fr; }
}
</style>
