<template>
  <div class="page">
    <header class="header" :class="{ 'scrolled': isScrolled }">
      <div class="logo-wrapper"><router-link to="/" class="logo-link"><img src="/logo-v6-512.png" alt="Adsup CRM" class="header-logo" /></router-link></div>
      <nav class="header-nav desktop-nav">
        <router-link to="/" class="nav-link">Trang chủ</router-link>
        <router-link to="/features/overview" class="nav-link">Tính năng</router-link>
        <router-link to="/pricing" class="nav-link">Bảng giá</router-link>
        <router-link to="/solutions/overview" class="nav-link">Giải pháp</router-link>
        <router-link to="/customers" class="nav-link">Khách hàng</router-link>
        <router-link to="/contact" class="nav-link router-link-active">Liên hệ</router-link>
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
          <router-link to="/customers" class="mobile-nav-link" @click="isMobileMenuOpen = false">Khách hàng</router-link>
          <router-link to="/contact" class="mobile-nav-link active" @click="isMobileMenuOpen = false">Liên hệ</router-link>
          <v-btn rounded="pill" class="mobile-login-btn mt-6" elevation="0" @click="goToLogin">Đăng nhập</v-btn>
        </div>
      </div>
    </header>
    <main>
      <section class="page-hero">
        <div class="page-hero-content">
          <div class="badge">📞 Sẵn sàng hỗ trợ bạn</div>
          <h1>Liên hệ với chúng tôi</h1>
          <p>Đội ngũ chuyên gia Adsup luôn sẵn sàng lắng nghe và tư vấn giải pháp phù hợp nhất cho bạn.</p>
        </div>
      </section>
      <section class="contact-section">
        <div class="container">
          <div class="contact-layout">
            <div class="contact-info">
              <h2>Kênh liên hệ</h2>
              <div class="contact-items">
                <div class="contact-item" v-for="c in contacts" :key="c.label">
                  <div class="contact-icon">{{ c.icon }}</div>
                  <div>
                    <div class="contact-label">{{ c.label }}</div>
                    <div class="contact-value">{{ c.value }}</div>
                  </div>
                </div>
              </div>
              <div class="office-info">
                <h3>Văn phòng</h3>
                <p>Tầng 7, Tòa nhà Adsup<br />123 Nguyễn Huệ, Q.1, TP.HCM<br />Giờ làm việc: T2 - T6, 8:00 - 18:00</p>
              </div>
            </div>
            <div class="contact-form-wrap">
              <h2>Gửi tin nhắn cho chúng tôi</h2>
              <div class="contact-form">
                <div class="form-row">
                  <div class="form-group">
                    <label>Họ và tên *</label>
                    <input v-model="form.name" type="text" placeholder="Nguyễn Văn A" />
                  </div>
                  <div class="form-group">
                    <label>Số điện thoại *</label>
                    <input v-model="form.phone" type="text" placeholder="0901 234 567" />
                  </div>
                </div>
                <div class="form-group">
                  <label>Email</label>
                  <input v-model="form.email" type="email" placeholder="email@congty.com" />
                </div>
                <div class="form-group">
                  <label>Bạn cần hỗ trợ về</label>
                  <select v-model="form.topic">
                    <option value="">Chọn chủ đề...</option>
                    <option>Tư vấn gói dịch vụ</option>
                    <option>Demo sản phẩm</option>
                    <option>Hỗ trợ kỹ thuật</option>
                    <option>Hợp tác & Đại lý</option>
                    <option>Khác</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Nội dung</label>
                  <textarea v-model="form.message" rows="4" placeholder="Mô tả nhu cầu của bạn..."></textarea>
                </div>
                <button class="submit-btn" @click="handleSubmit" :disabled="submitted">
                  <span v-if="!submitted">Gửi tin nhắn →</span>
                  <span v-else>✓ Đã gửi thành công!</span>
                </button>
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
const submitted = ref(false);
function handleScroll() { isScrolled.value = window.scrollY > 20; }
function goToLogin() { router.push('/login'); }
onMounted(() => window.addEventListener('scroll', handleScroll));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));

const form = ref({ name: '', phone: '', email: '', topic: '', message: '' });
function handleSubmit() { submitted.value = true; setTimeout(() => { submitted.value = false; form.value = { name: '', phone: '', email: '', topic: '', message: '' }; }, 3000); }

const contacts = [
  { icon: '📱', label: 'Hotline hỗ trợ', value: '1800 6868 (miễn phí)' },
  { icon: '✉️', label: 'Email', value: 'support@adsup.vn' },
  { icon: '💬', label: 'Zalo OA', value: 'Adsup CRM Official' },
  { icon: '🕐', label: 'Thời gian hỗ trợ', value: '7:00 - 22:00, tất cả các ngày' },
];
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800;900&display=swap');
.page { font-family: 'Be Vietnam Pro', sans-serif; background: #070f28; color: white; min-height: 100vh; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
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
.page-hero { min-height: 45vh; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 50%, rgba(0,213,255,0.1) 0%, transparent 60%), linear-gradient(135deg,#030b1e 0%,#081a42 100%); padding-top: 100px; }
.page-hero-content { text-align: center; max-width: 700px; padding: 72px 24px; }
.badge { display: inline-block; background: rgba(0,213,255,0.15); border: 1px solid rgba(0,213,255,0.3); color: #00d5ff; padding: 6px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; margin-bottom: 28px; }
.page-hero-content h1 { font-size: clamp(36px,4vw,56px); font-weight: 900; line-height: 1.15; margin-bottom: 20px; }
.page-hero-content p { font-size: 18px; color: rgba(255,255,255,0.75); line-height: 1.6; }
.contact-section { padding: 80px 0; }
.contact-layout { display: grid; grid-template-columns: 1fr 1.5fr; gap: 60px; align-items: start; }
.contact-info h2, .contact-form-wrap h2 { font-size: 26px; font-weight: 800; margin-bottom: 32px; }
.contact-items { display: flex; flex-direction: column; gap: 24px; margin-bottom: 40px; }
.contact-item { display: flex; align-items: flex-start; gap: 16px; }
.contact-icon { font-size: 24px; width: 52px; height: 52px; background: rgba(0,213,255,0.1); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.contact-label { font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 4px; }
.contact-value { font-size: 16px; font-weight: 600; }
.office-info h3 { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
.office-info p { font-size: 15px; color: rgba(255,255,255,0.65); line-height: 1.8; }
.contact-form { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 40px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.form-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.form-group label { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.7); }
.form-group input, .form-group select, .form-group textarea { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 14px 16px; color: white; font-size: 15px; font-family: 'Be Vietnam Pro', sans-serif; outline: none; transition: border-color 0.3s ease; resize: vertical; }
.form-group input::placeholder, .form-group textarea::placeholder { color: rgba(255,255,255,0.3); }
.form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: rgba(0,213,255,0.5); }
.form-group select option { background: #0a1940; }
.submit-btn { width: 100%; padding: 18px; background: linear-gradient(135deg,#00c2ff,#0072ff); color: white; font-size: 16px; font-weight: 700; border: none; border-radius: 14px; cursor: pointer; transition: all 0.3s ease; }
.submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,194,255,0.4); }
.submit-btn:disabled { background: linear-gradient(135deg,#00c26660,#0072ff60); cursor: default; }
.footer { padding: 40px 0; text-align: center; border-top: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); font-size: 14px; }
@media (max-width: 1024px) { .desktop-nav { display: none !important; } .mobile-menu-btn { display: block !important; } }
@media (max-width: 768px) {
  .header { padding: 0 20px; height: 80px; }
  .header-logo { width: 130px !important; }
  .login-btn { width: auto !important; padding: 0 16px; height: 40px !important; font-size: 14px; }
  .mobile-nav-overlay { top: 80px; height: calc(100vh - 80px); }
  .contact-layout { grid-template-columns: 1fr; }
  .form-row { grid-template-columns: 1fr; }
}
</style>
