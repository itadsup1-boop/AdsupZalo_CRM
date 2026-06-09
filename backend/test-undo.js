import { zaloPool } from './src/modules/zalo/zalo-pool.js';
import { prisma } from './src/shared/database/prisma-client.js';

async function test() {
  const msg = await prisma.message.findFirst({ where: { senderType: 'self', isDeleted: false }, orderBy: { sentAt: 'desc' } });
  if (!msg) return console.log('no msg');
  const conv = await prisma.conversation.findUnique({ where: { id: msg.conversationId }});
  
  const instance = zaloPool.getInstance(conv.zaloAccountId);
  if (!instance || !instance.api) return console.log('not connected');
  
  const threadType = conv.threadType === 'group' ? 1 : 0;
  console.log('undoing', msg.zaloMsgId);
  try {
    const res = await instance.api.undo(msg.zaloMsgId, msg.zaloMsgId, msg.senderUid, conv.externalThreadId, threadType);
    console.log('res', res);
  } catch (e) {
    console.error('err', e);
  }
}
test().then(() => process.exit(0));
