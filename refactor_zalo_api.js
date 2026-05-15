const fs = require('fs');

function processFile(file, replacements) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(
    "import { prisma } from '../../shared/database/prisma-client.js';",
    "import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';"
  );
  content = content.replace(
    "import { prisma } from '../../shared/database/prisma-client.js';",
    "import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';"
  );
  
  for (const [oldStr, newStr] of replacements) {
    content = content.split(oldStr).join(newStr);
  }
  fs.writeFileSync(file, content);
}

processFile('backend/src/modules/zalo/zalo-access-routes.ts', [
  [
    "const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });",
    "const db = getTenantPrisma(user.orgId);\n    const account = await db.zaloAccount.findFirst({ where: { id } });"
  ],
  [
    "const accessList = await prisma.zaloAccountAccess.findMany({",
    "const accessList = await db.zaloAccountAccess.findMany({"
  ],
  [
    "const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });",
    "const db = getTenantPrisma(user.orgId);\n      const account = await db.zaloAccount.findFirst({ where: { id } });"
  ],
  [
    "const targetUser = await prisma.user.findFirst({ where: { id: userId, orgId: user.orgId } });",
    "const targetUser = await db.user.findFirst({ where: { id: userId } });"
  ],
  [
    "const access = await prisma.zaloAccountAccess.create({",
    "const access = await db.zaloAccountAccess.create({"
  ],
  [
    "const access = await prisma.zaloAccountAccess.update({",
    "const access = await db.zaloAccountAccess.update({"
  ],
  [
    "await prisma.zaloAccountAccess.delete({ where: { id: accessId, zaloAccountId: id } });",
    "await db.zaloAccountAccess.delete({ where: { id: accessId, zaloAccountId: id } });"
  ]
]);

processFile('backend/src/modules/zalo/credential-routes.ts', [
  [
    "const account = await prisma.zaloAccount.findFirst({",
    "const db = getTenantPrisma(user.orgId);\n    const account = await db.zaloAccount.findFirst({"
  ],
  [
    "where: { id: accountId, orgId: user.orgId },",
    "where: { id: accountId },"
  ],
  [
    "const access = await prisma.zaloAccountAccess.findFirst({",
    "const access = await db.zaloAccountAccess.findFirst({"
  ],
  [
    "await prisma.zaloAccount.update({",
    "await db.zaloAccount.update({"
  ]
]);

processFile('backend/src/modules/zalo/zalo-access-middleware.ts', [
  [
    "const conv = await prisma.conversation.findFirst({",
    "const db = getTenantPrisma(user.orgId);\n        const conv = await db.conversation.findFirst({"
  ],
  [
    "where: { id: conversationId, orgId: user.orgId },",
    "where: { id: conversationId },"
  ],
  [
    "const access = await prisma.zaloAccountAccess.findFirst({",
    "const db = getTenantPrisma(user.orgId);\n      const access = await db.zaloAccountAccess.findFirst({"
  ]
]);

processFile('backend/src/modules/zalo/zalo-route-helpers.ts', [
  [
    "const account = await prisma.zaloAccount.findFirst({ where: { id: accountId, orgId } });",
    "const db = getTenantPrisma(orgId);\n  const account = await db.zaloAccount.findFirst({ where: { id: accountId } });"
  ],
  [
    "const access = await prisma.zaloAccountAccess.findFirst({",
    "const db = getTenantPrisma(orgId);\n    const access = await db.zaloAccountAccess.findFirst({"
  ]
]);

