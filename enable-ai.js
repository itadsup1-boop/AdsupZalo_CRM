const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const db = new PrismaClient();
async function run() {
  const orgs = await db.organization.findMany();
  for (const org of orgs) {
     const exists = await db.appSetting.findFirst({ where: { orgId: org.id, settingKey: 'ai_auto_reply_enabled' } });
     if (exists) {
        await db.appSetting.update({ where: { id: exists.id }, data: { valuePlain: 'true' }});
     } else {
        await db.appSetting.create({ data: { orgId: org.id, settingKey: 'ai_auto_reply_enabled', valuePlain: 'true' }});
     }
  }
  console.log('done');
}
run();
