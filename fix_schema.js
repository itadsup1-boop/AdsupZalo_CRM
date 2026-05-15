const fs = require('fs');

let schema = fs.readFileSync('backend/prisma/schema.prisma', 'utf-8');

// SyncLog is missing orgId
schema = schema.replace(
  '  integrationId String   @map("integration_id")',
  '  orgId         String   @map("org_id")\n  integrationId String   @map("integration_id")'
);

// We need to add orgId to SyncLog's relation to Organization
schema = schema.replace(
  '  integration Integration @relation(fields: [orgId, integrationId], references: [orgId, id], onDelete: Cascade)',
  '  org         Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)\n  integration Integration @relation(fields: [orgId, integrationId], references: [orgId, id], onDelete: Cascade)'
);

// We need to add syncLogs SyncLog[] to Organization
schema = schema.replace(
  'zaloAccountAccess ZaloAccountAccess[]',
  'zaloAccountAccess ZaloAccountAccess[]\n  syncLogs        SyncLog[]'
);

fs.writeFileSync('backend/prisma/schema.prisma', schema);
