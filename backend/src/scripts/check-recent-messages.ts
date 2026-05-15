import { prisma } from '../shared/database/prisma-client.js';

async function main() {
  console.log('--- KIỂM TRA TIN NHẮN MỚI NHẤT TRONG HỆ THỐNG ---');
  
  // 1. Tìm 10 tin nhắn mới được tạo nhất (bất kể của ai)
  const latestMsgs = await prisma.message.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      conversation: {
        include: {
          contact: true,
          zaloAccount: true
        }
      }
    }
  });

  if (latestMsgs.length === 0) {
    console.log('❌ KHÔNG tìm thấy bất kỳ tin nhắn nào mới được tạo!');
  } else {
    console.log(`✅ Tìm thấy ${latestMsgs.length} tin nhắn mới nhất:`);
    latestMsgs.forEach((m, i) => {
      console.log(`${i+1}. [Tạo lúc: ${m.createdAt.toISOString()}]`);
      console.log(`   - Nội dung: ${m.content}`);
      console.log(`   - Người gửi: ${m.senderName} (${m.senderType})`);
      console.log(`   - Khách hàng: ${m.conversation?.contact?.fullName || 'N/A'}`);
      console.log(`   - Tài khoản Zalo: ${m.conversation?.zaloAccount?.displayName || 'N/A'}`);
      console.log(`   - Org ID: ${m.orgId}`);
      console.log('   ---');
    });
  }

  // 2. Kiểm tra hàng chờ RabbitMQ (nếu có thể)
  console.log('-------------------------------------------');
}

main().catch(console.error).finally(() => prisma.$disconnect());
