import { prisma } from './src/shared/database/prisma-client.js';
import { zaloPool } from './src/modules/zalo/zalo-pool.js';

async function run() {
  const account = await prisma.zaloAccount.findFirst({
    where: { displayName: 'Anh Rio' }
  });
  if (!account) return console.log('account not found');
  
  await zaloPool.init();
  const instance = zaloPool.getInstance(account.id);
  
  // Find the exact message "test thu hồi"
  const msg = await prisma.message.findFirst({
    where: { content: 'test thu hồi' }
  });
  
  if (!msg) return console.log('msg not found');
  console.log('Found msg:', msg.zaloMsgId);
  
  const conv = await prisma.conversation.findUnique({ where: { id: msg.conversationId } });
  const threadType = conv.threadType === 'group' ? 1 : 0;
  
  try {
    const res = await instance.api.undo(msg.zaloMsgId, msg.zaloMsgId, msg.senderUid, conv.externalThreadId, threadType);
    console.log('Undo result:', res);
  } catch (e) {
    console.log('Undo threw error:', e);
  }
}
run().then(() => process.exit(0));
