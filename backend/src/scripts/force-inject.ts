import { prisma } from '../shared/database/prisma-client.js';
import { handleIncomingMessage } from '../modules/chat/message-handler.js';

async function main() {
  const accountId = 'a7fd95d7-377e-4028-85ab-d9b91878242a'; // ID Beauty Aura
  const contactName = 'Linh My';
  
  console.log('--- ĐANG ÉP TIN NHẮN VÀO DB ---');
  
  // 1. Lấy thông tin Account
  const account = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: { orgId: true, ownerUserId: true }
  });
  
  if (!account) {
    console.log('❌ Không tìm thấy account!');
    return;
  }

  // 2. Lấy thông tin Contact Linh My để lấy zaloUid
  const contact = await prisma.contact.findFirst({
    where: { fullName: { contains: contactName, mode: 'insensitive' } }
  });

  if (!contact || !contact.zaloUid) {
    console.log('❌ Không tìm thấy zaloUid của Linh My!');
    return;
  }

  // 3. Giả lập tin nhắn
  const fakeMsg = {
    accountId: accountId,
    senderUid: contact.zaloUid,
    senderName: contactName,
    content: 'Tin nhắn thử nghiệm ép trực tiếp từ script ' + new Date().toLocaleTimeString(),
    contentType: 'text',
    msgId: 'force-' + Date.now(),
    timestamp: Date.now(),
    isSelf: false,
    threadId: contact.zaloUid,
    threadType: 'user' as const
  };

  console.log('Đang gọi handleIncomingMessage...');
  const result = await handleIncomingMessage(fakeMsg, account);
  
  if (result) {
    console.log('✅ THÀNH CÔNG! Đã ép được tin nhắn.');
    console.log('Hội thoại ID:', result.conversationId);
  } else {
    console.log('❌ THẤT BẠI khi gọi handleIncomingMessage.');
  }
  
  console.log('-------------------------------');
}

main().catch(console.error).finally(() => prisma.$disconnect());
