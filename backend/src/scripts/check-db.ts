import { prisma } from '../shared/database/prisma-client.js';

async function main() {
  console.log('--- KIỂM TRA CHI TIẾT LINH MY ---');
  
  // 1. Tìm Contact
  const contact = await prisma.contact.findFirst({
    where: { fullName: { contains: 'Linh My', mode: 'insensitive' } }
  });
  
  if (!contact) {
    console.log('❌ KHÔNG tìm thấy Contact Linh My');
    return;
  }
  
  console.log(`✅ Tìm thấy Contact: ${contact.fullName} (ID: ${contact.id})`);

  // 2. Tìm Hội thoại
  const convs = await prisma.conversation.findMany({
    where: { contactId: contact.id },
    include: { _count: { select: { messages: true } } }
  });
  
  console.log(`Tìm thấy ${convs.length} hội thoại.`);
  
  for (const conv of convs) {
    console.log(`- Hội thoại ID: ${conv.id}`);
    console.log(`  Thuộc Zalo Account ID: ${conv.zaloAccountId}`);
    console.log(`  Số tin nhắn: ${conv._count.messages}`);
    
    if (conv._count.messages > 0) {
      const msgs = await prisma.message.findMany({
        where: { conversationId: conv.id },
        take: 3,
        orderBy: { sentAt: 'desc' }
      });
      console.log('  3 tin nhắn mới nhất:');
      msgs.forEach(m => console.log(`    [${m.sentAt.toISOString()}] ${m.senderName}: ${m.content}`));
    }
  }
  console.log('---------------------------------');
}

main().catch(console.error).finally(() => prisma.$disconnect());
