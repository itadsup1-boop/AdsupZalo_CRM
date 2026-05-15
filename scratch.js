const fs = require('fs');
const file = '/home/hai-anh/Code /ZaloCRM-main/backend/src/modules/contacts/contact-routes.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "const pipeline = await prisma.contact.groupBy({",
  "const db = getTenantPrisma(orgId);\n      const pipeline = await db.contact.groupBy({"
);
content = content.replace(
  "where: { orgId, status: { not: null }, mergedInto: null },",
  "where: { status: { not: null }, mergedInto: null },"
);
content = content.replace(
  "const where: any = { orgId, status: st ?? null, mergedInto: null };\n          const contacts = await prisma.contact.findMany({",
  "const where: any = { status: st ?? null, mergedInto: null };\n          const contacts = await db.contact.findMany({"
);

content = content.replace(
  "const contact = await prisma.contact.findFirst({\n        where: { id, orgId: user.orgId },",
  "const db = getTenantPrisma(user.orgId);\n      const contact = await db.contact.findFirst({\n        where: { id },"
);

content = content.replace(
  "const contact = await prisma.contact.create({\n        data: {\n          orgId: user.orgId,",
  "const db = getTenantPrisma(user.orgId);\n      const contact = await db.contact.create({\n        data: {"
);

content = content.replace(
  "const org = await prisma.organization.findUnique({",
  "const org = await db.organization.findUnique({"
);
content = content.replace(
  "const org = await prisma.organization.findUnique({",
  "const org = await db.organization.findUnique({"
);

content = content.replace(
  "const existing = await prisma.contact.findFirst({\n        where: { id, orgId: user.orgId },",
  "const db = getTenantPrisma(user.orgId);\n      const existing = await db.contact.findFirst({\n        where: { id },"
);
content = content.replace(
  "const updated = await prisma.contact.update({",
  "const updated = await db.contact.update({"
);

content = content.replace(
  "const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });",
  "const db = getTenantPrisma(user.orgId);\n      const existing = await db.contact.findFirst({ where: { id }, select: { id: true } });"
);
content = content.replace(
  "const updated = await prisma.contact.update({ where: { id }, data: { tags } });",
  "const updated = await db.contact.update({ where: { id }, data: { tags } });"
);

content = content.replace(
  "const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });",
  "const db = getTenantPrisma(user.orgId);\n      const existing = await db.contact.findFirst({ where: { id }, select: { id: true } });"
);
content = content.replace(
  "await prisma.contact.delete({ where: { id } });",
  "await db.contact.delete({ where: { id } });"
);

content = content.replace(
  "const where = { orgId: user.orgId, resolved: resolved === 'true' };",
  "const db = getTenantPrisma(user.orgId);\n      const where = { resolved: resolved === 'true' };"
);
content = content.replace(
  "prisma.duplicateGroup.findMany({",
  "db.duplicateGroup.findMany({"
);
content = content.replace(
  "prisma.duplicateGroup.count({ where }),",
  "db.duplicateGroup.count({ where }),"
);
content = content.replace(
  "const contacts = await prisma.contact.findMany({",
  "const contacts = await db.contact.findMany({"
);

content = content.replace(
  "const group = await prisma.duplicateGroup.findFirst({\n        where: { id: groupId, orgId: user.orgId, resolved: false },",
  "const db = getTenantPrisma(user.orgId);\n      const group = await db.duplicateGroup.findFirst({\n        where: { id: groupId, resolved: false },"
);
content = content.replace(
  "await prisma.duplicateGroup.update({ where: { id: groupId }, data: { resolved: true } });",
  "await db.duplicateGroup.update({ where: { id: groupId }, data: { resolved: true } });"
);

fs.writeFileSync(file, content);
