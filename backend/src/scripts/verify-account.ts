import { prisma } from '../shared/database/prisma-client.js';

async function main() {
  const accountId = 'b4133eb1-de66-4cc9-be1d-dc3ec5c06093';
  const account = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: { displayName: true, orgId: true }
  });

  console.log('--- KIỂM TRA TÀI KHOẢN ĐÍCH ---');
  if (account) {
    console.log(`ID: ${accountId}`);
    console.log(`Tên hiển thị: ${account.displayName}`);
    console.log(`Org ID: ${account.orgId}`);
    
    const msgCount = await prisma.message.count({
      where: { conversation: { zaloAccountId: accountId } }
    });
    console.log(`Tổng số tin nhắn hiện có: ${msgCount}`);
  } else {
    console.log('❌ KHÔNG tìm thấy tài khoản này trong Database!');
  }
  console.log('-------------------------------');
}

main().catch(console.error).finally(() => prisma.$disconnect());
