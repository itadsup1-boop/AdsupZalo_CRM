import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Nạp file .env để lấy cấu hình
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env') });

// Phải import sau khi config dotenv
const { prisma } = await import('./src/shared/database/prisma-client.js');

async function run() {
  const conversationId = process.argv[2];

  if (!conversationId) {
    console.error('❌ Lỗi: Bạn phải truyền ID của cuộc trò chuyện vào lệnh!');
    console.log('💡 Cách dùng: npx tsx test-sync.ts <ID_CUOC_TRO_CHUYEN>');
    process.exit(1);
  }

  console.log(`⏳ Đang tìm cuộc trò chuyện ${conversationId}...`);

  try {
    // 1. Tìm thông tin cuộc trò chuyện
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      console.error('❌ Không tìm thấy cuộc trò chuyện này trong Database!');
      process.exit(1);
    }

    // 2. Tìm 1 user thuộc đúng Org của cuộc trò chuyện để tạo Token giả lập
    const adminUser = await prisma.user.findFirst({
      where: { orgId: conversation.orgId }
    });

    if (!adminUser) {
      console.error('❌ Không tìm thấy tài khoản Admin nào trong hệ thống!');
      process.exit(1);
    }

    // 3. Tạo Token (Khóa bảo mật)
    const secret = process.env.JWT_SECRET || 'supersecret';
    const token = jwt.sign(
      { id: adminUser.id, orgId: adminUser.orgId, role: adminUser.role },
      secret,
      { expiresIn: '1h' }
    );

    console.log(`✅ Đã tạo Token cho Admin: ${adminUser.email}`);
    console.log(`⏳ Đang ra lệnh tải tin nhắn cũ cho Zalo (lùi lại 30 ngày)...`);

    // 4. Gửi yêu cầu qua API nội bộ của server đang chạy (Port 3080 - Docker)
    const response = await fetch(`http://localhost:3080/api/v1/conversations/${conversationId}/sync-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ lookbackHours: 720 }) // 720 giờ = 30 ngày
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('🎉 THÀNH CÔNG! Hệ thống đã tải tin nhắn cũ.');
      console.log('📊 Thống kê:', data.stats);
    } else {
      console.error('❌ LỖI TỪ SERVER:', data);
    }
  } catch (error) {
    console.error('❌ Lỗi hệ thống:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
