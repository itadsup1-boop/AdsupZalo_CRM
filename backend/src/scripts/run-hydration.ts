import puppeteer from 'puppeteer';
import { ZaloHydrator } from '../modules/zalo/zalo-hydrator.js';
import { logger } from '../shared/utils/logger.js';
import { humanizer } from '../shared/utils/humanizer.js';
import { queueService } from '../shared/queue/queue-service.js';

async function runTest() {
  try {
    // Khởi động RabbitMQ
    await queueService.init(); 
  } catch (err) {
    logger.error('❌ Không thể kết nối RabbitMQ. Hãy đảm bảo bạn đã chạy RabbitMQ (Docker hoặc Service).');
  }

  const accountId = 'test-account';
  logger.info('🚀 Đang khởi động trình duyệt thử nghiệm...');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    userDataDir: `./browser-profiles/${accountId}`
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  logger.info('🌐 Đang truy cập Zalo Web...');
  await page.goto('https://chat.zalo.me', { waitUntil: 'networkidle2' });

  const isLoginPage = await page.evaluate(() => document.querySelector('.qr-container'));
  if (isLoginPage) {
    logger.info('📸 Vui lòng quét mã QR...');
    await page.waitForSelector('.conv-item, [class*="conv-item"]', { timeout: 300000 });
    logger.info('✅ Đăng nhập thành công!');
  }

  logger.info('🤖 Robot bắt đầu chiến dịch "Vét và Lưu" lịch sử...');
  // Find a real account in DB to hydrate into
  const { prisma } = await import('../shared/database/prisma-client.js');
  const realAccount = await prisma.zaloAccount.findFirst({
    where: { displayName: { contains: 'Beauty Aura', mode: 'insensitive' } }
  });
  
  if (!realAccount) {
    logger.warn('❌ KHÔNG tìm thấy tài khoản Beauty Aura trong DB. Sẽ dùng tài khoản mặc định.');
  }

  const targetAccountId = realAccount?.id || 'test-account';
  const targetOrgId = realAccount?.orgId || 'test-org';
  
  logger.info(`[hydrator] 🎯 Đích đến: Org [${targetOrgId}], Account [${targetAccountId}]`);

  const hydrator = new ZaloHydrator(page, targetOrgId, targetAccountId);
  // FORCIBLY start hydration and ensure it waits
  logger.info('⏳ Đang đợi trang Zalo tải ổn định (10s)...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  await hydrator.startFullHydration();

  logger.info('🎉 Hoàn tất. Bạn có thể kiểm tra trên CRM!');
}

runTest().catch(err => {
  console.error('❌ Lỗi thử nghiệm:', err);
});
