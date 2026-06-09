import { prisma } from './shared/database/prisma-client.js';
import { getTenantPrisma } from './shared/database/prisma-tenant.js';

async function main() {
  const orgs = [
    '19a1c417-f6ac-4990-b1b2-0d5fb5e2647d',
    'b2db7caa-b9a0-4146-8d6e-c517987d6dcf',
    'ac3fe4af-7a95-43d8-aa1c-b4b3bb267496',
    '25ad93f6-2010-4852-9e22-70c56f3f4cb2'
  ];

  for (const orgId of orgs) {
    const db = getTenantPrisma(orgId);
    const setting = await db.appSetting.findFirst({
      where: { settingKey: 'ai_auto_reply_enabled', valuePlain: 'true' }
    });
    console.log(`Org: ${orgId}`);
    console.log('  with valuePlain true:', setting);
    
    const settingAny = await db.appSetting.findFirst({
      where: { settingKey: 'ai_auto_reply_enabled' }
    });
    console.log('  any:', settingAny);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
