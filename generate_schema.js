const fs = require('fs');

let schema = fs.readFileSync('backend/prisma/schema.prisma', 'utf-8');

// 1. Add orgId to models that don't have it
schema = schema.replace(
  '  userId        String   @map("user_id")',
  '  orgId         String   @map("org_id")\n  userId        String   @map("user_id")'
);
schema = schema.replace(
  '  conversationId  String    @map("conversation_id")',
  '  orgId           String    @map("org_id")\n  conversationId  String    @map("conversation_id")'
);
schema = schema.replace(
  '  messageId String   @map("message_id")',
  '  orgId     String   @map("org_id")\n  messageId String   @map("message_id")'
);

// 2. Add @@unique([orgId, id]) to primary models
const modelsToUpdate = ['Team', 'User', 'ZaloAccount', 'Contact', 'Conversation', 'Message', 'Appointment', 'Integration', 'MessageTemplate'];
for (const model of modelsToUpdate) {
  const regex = new RegExp(`(model ${model} \\{[^}]*?)(@@map\\(".*?\\"\\))`, 's');
  schema = schema.replace(regex, `$1@@unique([orgId, id])\n  $2`);
}

// 3. Fix existing @unique that should be composite with orgId
schema = schema.replace('email        String   @unique', 'email        String');
schema = schema.replace(/zaloUid\s+String\?\s+@unique\s+@map\("zalo_uid"\)/, 'zaloUid         String?   @map("zalo_uid")');

schema = schema.replace(
  '@@map("users")',
  '@@unique([orgId, email])\n  @@map("users")'
);
schema = schema.replace(
  '@@map("zalo_accounts")',
  '@@unique([orgId, zaloUid])\n  @@map("zalo_accounts")'
);

// 4. Update Relations to use composite keys
const replacements = [
  // Team -> Organization (stays the same, org is root)
  // User -> Team
  ['fields: [teamId], references: [id]', 'fields: [orgId, teamId], references: [orgId, id]'],
  // ZaloAccount -> User
  ['fields: [ownerUserId], references: [id]', 'fields: [orgId, ownerUserId], references: [orgId, id]'],
  // ZaloAccountAccess -> ZaloAccount, User
  ['fields: [zaloAccountId], references: [id], onDelete: Cascade', 'fields: [orgId, zaloAccountId], references: [orgId, id], onDelete: Cascade'],
  ['fields: [userId], references: [id], onDelete: Cascade', 'fields: [orgId, userId], references: [orgId, id], onDelete: Cascade'],
  // Contact -> User
  ['fields: [assignedUserId], references: [id]', 'fields: [orgId, assignedUserId], references: [orgId, id]'],
  // Contact -> Contact
  ['fields: [mergedInto], references: [id]', 'fields: [orgId, mergedInto], references: [orgId, id]'],
  // Conversation -> ZaloAccount, Contact
  // ['fields: [zaloAccountId], references: [id], onDelete: Cascade', 'fields: [orgId, zaloAccountId], references: [orgId, id], onDelete: Cascade'], // already handled above
  ['fields: [contactId], references: [id]', 'fields: [orgId, contactId], references: [orgId, id]'],
  // Message -> Conversation, User
  ['fields: [conversationId], references: [id], onDelete: Cascade', 'fields: [orgId, conversationId], references: [orgId, id], onDelete: Cascade'],
  ['fields: [repliedByUserId], references: [id]', 'fields: [orgId, repliedByUserId], references: [orgId, id]'],
  // MessageReaction -> Message
  ['fields: [messageId], references: [id], onDelete: Cascade', 'fields: [orgId, messageId], references: [orgId, id], onDelete: Cascade'],
  // Appointment -> Contact, User
  ['fields: [contactId], references: [id], onDelete: Cascade', 'fields: [orgId, contactId], references: [orgId, id], onDelete: Cascade'],
  // ActivityLog -> User
  // DailyMessageStat -> ZaloAccount
  // SyncLog -> Integration
  ['fields: [integrationId], references: [id], onDelete: Cascade', 'fields: [orgId, integrationId], references: [orgId, id], onDelete: Cascade'],
  // AiSuggestion -> Conversation
  // PinnedConversation -> Conversation
  // GroupPoll -> ZaloAccount
];

for (const [oldStr, newStr] of replacements) {
  // Global replace
  schema = schema.split(oldStr).join(newStr);
}

// Add Organization relation to models that just got orgId (Message, MessageReaction, ZaloAccountAccess)
schema = schema.replace(
  '@@unique([zaloAccountId, userId])',
  'org         Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)\n\n  @@unique([zaloAccountId, userId])'
);
schema = schema.replace(
  '@@unique([conversationId, zaloMsgId])',
  'org          Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)\n\n  @@unique([conversationId, zaloMsgId])'
);
schema = schema.replace(
  '@@unique([messageId, reactorId])',
  'org      Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)\n\n  @@unique([messageId, reactorId])'
);

// We need to add `messages Message[]` to Organization? It's fine if we don't, but Prisma might complain.
// Actually Prisma doesn't strictly require back-relations if we don't need them, wait, it DOES require back-relations for one-to-many.
schema = schema.replace(
  'appointments    Appointment[]',
  'appointments    Appointment[]\n  messages        Message[]\n  messageReactions MessageReaction[]\n  zaloAccountAccess ZaloAccountAccess[]'
);

// Fix duplicate groups unique constraints if needed.

fs.writeFileSync('backend/prisma/schema.prisma', schema);
