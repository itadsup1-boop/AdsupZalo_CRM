const fs = require('fs');

const file = 'backend/src/modules/zalo/zalo-routes.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "import { prisma } from '../../shared/database/prisma-client.js';",
  "import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';"
);

content = content.replace(
  "const accounts = await prisma.zaloAccount.findMany({\n      where: { orgId: user.orgId },",
  "const db = getTenantPrisma(user.orgId);\n    const accounts = await db.zaloAccount.findMany({\n      where: {},"
);

content = content.replace(
  "const account = await prisma.zaloAccount.create({\n        data: {\n          orgId: user.orgId,",
  "const db = getTenantPrisma(user.orgId);\n      const account = await db.zaloAccount.create({\n        data: {"
);

content = content.replace(
  "const account = await prisma.zaloAccount.findFirst({\n        where: { id, orgId: user.orgId },",
  "const db = getTenantPrisma(user.orgId);\n      const account = await db.zaloAccount.findFirst({\n        where: { id },"
);

content = content.replace(
  "const account = await prisma.zaloAccount.findFirst({\n        where: { id, orgId: user.orgId },",
  "const db = getTenantPrisma(user.orgId);\n      const account = await db.zaloAccount.findFirst({\n        where: { id },"
);

content = content.replace(
  "const account = await prisma.zaloAccount.findFirst({\n        where: { id, orgId: user.orgId },",
  "const db = getTenantPrisma(user.orgId);\n      const account = await db.zaloAccount.findFirst({\n        where: { id },"
);

content = content.replace(
  "await prisma.zaloAccount.delete({ where: { id } });",
  "await db.zaloAccount.delete({ where: { id } });"
);

content = content.replace(
  "const account = await prisma.zaloAccount.findFirst({\n        where: { id, orgId: user.orgId },",
  "const db = getTenantPrisma(user.orgId);\n      const account = await db.zaloAccount.findFirst({\n        where: { id },"
);

fs.writeFileSync(file, content);
