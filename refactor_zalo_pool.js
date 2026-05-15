const fs = require('fs');

let content = fs.readFileSync('backend/src/modules/zalo/zalo-pool.ts', 'utf8');

// 1. loginQR
content = content.replace(
  `async loginQR(accountId: string): Promise<void> {`,
  `async loginQR(accountId: string): Promise<void> {\n    const acc = await prisma.zaloAccount.findUnique({ where: { id: accountId }, select: { orgId: true } });\n    if (!acc) throw new Error("Account not found");\n    const orgId = acc.orgId;\n    const db = getTenantPrisma(orgId);`
);

content = content.replace(
  /this\.saveCredentials\(accountId, {/g,
  `this.saveCredentials(accountId, orgId, {`
);

content = content.replace(
  /await prisma\.zaloAccount\.update\({/g,
  `await db.zaloAccount.update({`
);

content = content.replace(
  /this\.attachListener\(accountId, api\);/g,
  `this.attachListener(accountId, orgId, api);`
);

content = content.replace(
  /await this\.updateAccountDB\(accountId, 'connected', ownId\);/g,
  `await this.updateAccountDB(accountId, orgId, 'connected', ownId);`
);

content = content.replace(
  /prisma\.zaloAccount\.findUnique\(\{ where: \{ id: accountId \}, select: \{ orgId: true \} \}\)\n\s*\.then\(\(rec\) => rec && emitWebhook\(rec\.orgId, 'zalo\.connected', \{ accountId \}\)\)/g,
  `emitWebhook(orgId, 'zalo.connected', { accountId })`
);

// 2. reconnect
content = content.replace(
  `async reconnect(accountId: string, credentials: ZaloCredentials): Promise<void> {`,
  `async reconnect(accountId: string, orgId: string, credentials: ZaloCredentials): Promise<void> {\n    const db = getTenantPrisma(orgId);`
);

content = content.replace(
  /await this\.updateAccountDB\(accountId, 'qr_pending', null\);/g,
  `await this.updateAccountDB(accountId, orgId, 'qr_pending', null);`
);

// 3. attachListener
content = content.replace(
  `private attachListener(accountId: string, api: any): void {`,
  `private attachListener(accountId: string, orgId: string, api: any): void {`
);
content = content.replace(
  `accountId,\n      api,`,
  `accountId,\n      orgId,\n      api,`
);
content = content.replace(
  /this\.updateAccountDB\(id, 'disconnected', null\);/g,
  `this.updateAccountDB(id, orgId, 'disconnected', null);`
);
content = content.replace(
  /prisma\.zaloAccount\.findUnique\(\{ where: \{ id \}, select: \{ orgId: true \} \}\)\n\s*\.then\(\(rec\) => rec && emitWebhook\(rec\.orgId, 'zalo\.disconnected', \{ accountId: id \}\)\)/g,
  `emitWebhook(orgId, 'zalo.disconnected', { accountId: id })`
);
content = content.replace(
  /this\.updateAccountDB\(id, 'qr_pending', null\);/g,
  `this.updateAccountDB(id, orgId, 'qr_pending', null);`
);
content = content.replace(
  /setTimeout\(\(\) => this\.autoReconnect\(id\), 30_000\);/g,
  `setTimeout(() => this.autoReconnect(id), 30_000);`
);

// 4. saveCredentials
content = content.replace(
  `private saveCredentials(accountId: string, credentials: ZaloCredentials): void {`,
  `private saveCredentials(accountId: string, orgId: string, credentials: ZaloCredentials): void {\n    const db = getTenantPrisma(orgId);`
);
content = content.replace(
  `prisma.zaloAccount\n      .update({ where: { id: accountId }, data: { sessionData: credentials as any } })`,
  `db.zaloAccount\n      .update({ where: { id: accountId }, data: { sessionData: credentials as any } })`
);

// 5. updateAccountDB
content = content.replace(
  `private async updateAccountDB(accountId: string, status: string, zaloUid: string | null): Promise<void> {`,
  `private async updateAccountDB(accountId: string, orgId: string, status: string, zaloUid: string | null): Promise<void> {\n    const db = getTenantPrisma(orgId);`
);

// 6. autoReconnect
content = content.replace(
  `async autoReconnect(accountId: string): Promise<void> {`,
  `async autoReconnect(accountId: string): Promise<void> {`
);
content = content.replace(
  `const account = await prisma.zaloAccount.findUnique({`,
  `const account = await prisma.zaloAccount.findUnique({`
);
content = content.replace(
  `select: { sessionData: true },`,
  `select: { orgId: true, sessionData: true },`
);
content = content.replace(
  `await this.reconnect(accountId, session);`,
  `await this.reconnect(accountId, account!.orgId, session);`
);

// Remove the global prisma calls entirely from autoReconnect if we can, but we need it to look up orgId.
// The manual replace above should be fine.

fs.writeFileSync('backend/src/modules/zalo/zalo-pool.ts', content);
