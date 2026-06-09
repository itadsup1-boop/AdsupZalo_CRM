<template>
  <div class="page">
    <header class="header" :class="{ 'scrolled': isScrolled }">
      <div class="logo-wrapper"><router-link to="/" class="logo-link"><img src="/logo-v6-512.png" alt="Adsup CRM" class="header-logo" /></router-link></div>
      <nav class="header-nav desktop-nav">
        <router-link to="/" class="nav-link">Trang chủ</router-link>
        <router-link to="/features/overview" class="nav-link">Tính năng</router-link>
        <router-link to="/pricing" class="nav-link">Bảng giá</router-link>
        <router-link to="/solutions/overview" class="nav-link router-link-active">Giải pháp</router-link>
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
          <router-link to="/pricing" class="mobile-nav-link" @click="isMobileMenuOpen = false">Bảng giá</router-link>
          <router-link to="/solutions/overview" class="mobile-nav-link active" @click="isMobileMenuOpen = false">Giải pháp</router-link>
          <router-link to="/customers" class="mobile-nav-link" @click="isMobileMenuOpen = false">Khách hàng</router-link>
          <router-link to="/contact" class="mobile-nav-link" @click="isMobileMenuOpen = false">Liên hệ</router-link>
          <v-btn rounded="pill" class="mobile-login-btn mt-6" elevation="0" @click="goToLogin">Đăng nhập</v-btn>
        </div>
      </div>
    </header>

    <main>
      <section class="page-hero">
        <div class="page-hero-content">
          <div class="badge">🎯 Giải pháp theo ngành</div>
          <h1>Giải pháp CRM Zalo<br /><span class="gradient-text">cho mọi bộ phận</span></h1>
          <p>Dù bạn là Sales, Marketing hay CSKH — Adsup CRM đều có bộ công cụ tối ưu cho bạn.</p>
        </div>
      </section>

      <section class="solutions-section">
        <div class="container">
          <div class="solutions-tabs">
            <button v-for="s in solutions" :key="s.id" class="tab-btn" :class="{ active: activeTab === s.id }" @click="activeTab = s.id">{{ s.label }}</button>
          </div>
          <div class="solution-content" v-for="s in solutions" :key="s.id" v-show="activeTab === s.id">
            <div class="solution-text">
              <h2>{{ s.title }}</h2>
              <p>{{ s.desc }}</p>
              <ul class="solution-list">
                <li v-for="item in s.items" :key="item"><span class="check">✓</span> {{ item }}</li>
              </ul>
              <button class="btn-primary" @click="goToLogin">Dùng thử ngay</button>
            </div>
            <div class="solution-visual">
              <div class="visual-card" v-for="stat in s.stats" :key="stat.label">
                <div class="stat-number">{{ stat.value }}</div>
                <div class="stat-label">{{ stat.label }}</div>
              </div>
            </div>
          </div>
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
const activeTab = ref('sales');

function handleScroll() { isScrolled.value = window.scrollY > 20; }
function goToLogin() { router.push('/login'); }
onMounted(() => window.addEventListener('scroll', handleScroll));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));

const solutions = [
  {
    id: 'sales', label: '💼 Bán hàng (Sales)', title: 'Tăng tốc doanh thu với CRM Zalo',
    desc: 'Theo dõi từng lead, quản lý pipeline và chốt đơn nhanh hơn bao giờ hết với bộ công cụ Sales tích hợp Zalo.',
    items: ['Quản lý pipeline bán hàng trực quan', 'Gán lead tự động cho nhân viên', 'Nhắc lịch follow-up thông minh', 'Template trả lời nhanh', 'Báo cáo doanh số real-time'],
    stats: [{ value: '+68%', label: 'Tỷ lệ chốt đơn' }, { value: '3x', label: 'Tốc độ xử lý lead' }, { value: '-40%', label: 'Thời gian báo cáo' }],
  },
  {
    id: 'cskh', label: '🎧 CSKH (Support)', title: 'Hỗ trợ khách hàng 24/7 không ngừng nghỉ',
    desc: 'Chatbot tự động xử lý câu hỏi thường gặp, phân loại ticket và escalate lên nhân viên khi cần.',
    items: ['Chatbot AI hỗ trợ 24/7', 'Phân loại và ưu tiên ticket tự động', 'Lịch sử hội thoại đầy đủ', 'Đánh giá hài lòng (CSAT)', 'SLA tracking & cảnh báo'],
    stats: [{ value: '87%', label: 'Câu hỏi giải quyết tự động' }, { value: '<2 phút', label: 'Thời gian phản hồi trung bình' }, { value: '4.8/5', label: 'Điểm hài lòng khách hàng' }],
  },
  {
    id: 'marketing', label: '📣 Marketing', title: 'Tiếp cận khách hàng đúng lúc, đúng thông điệp',
    desc: 'Tạo chiến dịch broadcast cá nhân hóa, A/B test nội dung và theo dõi hiệu quả chiến dịch trong thời gian thực.',
    items: ['Broadcast đến hàng ngàn khách hàng', 'Phân khúc khách hàng nâng cao', 'A/B testing tự động', 'Lịch gửi tin tự động hóa', 'Báo cáo tỷ lệ mở, click, conversion'],
    stats: [{ value: '92%', label: 'Tỷ lệ tin nhắn được đọc' }, { value: '5x', label: 'So với email marketing' }, { value: '+45%', label: 'Tỷ lệ chuyển đổi' }],
  },
];
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800;900&display=swap');
.page { font-family: 'Be Vietnam Pro', sans-serif; background: #070f28; color: white; min-height: 100vh; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.gradient-text { background: linear-gradient(90deg,#00D5FF,#087BFF); -webkit-background-clip: text; background-clip: text; color: transparent; }
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
.page-hero { min-height: 55vh; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background: radial-gradient(circle at 50% 50%, rgba(0,213,255,0.1) 0%, transparent 60%), linear-gradient(135deg,#030b1e 0%,#081a42 100%); padding-top: 100px; }
.page-hero-content { position: relative; z-index: 2; text-align: center; max-width: 760px; padding: 80px 24px; }
.badge { display: inline-block; background: rgba(0,213,255,0.15); border: 1px solid rgba(0,213,255,0.3); color: #00d5ff; padding: 6px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; margin-bottom: 28px; }
.page-hero-content h1 { font-size: clamp(36px,4vw,60px); font-weight: 900; line-height: 1.15; margin-bottom: 20px; }
.page-hero-content p { font-size: 18px; color: rgba(255,255,255,0.75); line-height: 1.6; }
.solutions-section { padding: 80px 0; }
.solutions-tabs { display: flex; gap: 12px; margin-bottom: 56px; flex-wrap: wrap; justify-content: center; }
.tab-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); padding: 12px 24px; border-radius: 999px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; }
.tab-btn.active { background: rgba(0,213,255,0.15); border-color: rgba(0,213,255,0.4); color: #00d5ff; }
.solution-content { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; }
.solution-text h2 { font-size: clamp(28px,3vw,42px); font-weight: 900; margin-bottom: 20px; }
.solution-text p { font-size: 17px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 28px; }
.solution-list { list-style: none; padding: 0; margin: 0 0 36px; display: flex; flex-direction: column; gap: 12px; }
.solution-list li { font-size: 16px; display: flex; gap: 10px; align-items: flex-start; }
.check { color: #00d5ff; font-weight: 900; }
.btn-primary { background: white; color: #0a1940; font-size: 16px; font-weight: 800; padding: 18px 40px; border-radius: 14px; border: none; cursor: pointer; box-shadow: 0 0 30px rgba(0,213,255,0.3); transition: all 0.3s ease; }
.btn-primary:hover { transform: translateY(-2px); }
.solution-visual { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.visual-card { background: rgba(0,213,255,0.07); border: 1px solid rgba(0,213,255,0.2); border-radius: 20px; padding: 32px 24px; text-align: center; transition: all 0.3s ease; }
.visual-card:hover { background: rgba(0,213,255,0.12); }
.stat-number { font-size: 40px; font-weight: 900; color: #00d5ff; margin-bottom: 8px; }
.stat-label { font-size: 14px; color: rgba(255,255,255,0.6); line-height: 1.4; }
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
  .solution-content { grid-template-columns: 1fr; }
  .solution-visual { grid-template-columns: 1fr 1fr; }
}
</style>
