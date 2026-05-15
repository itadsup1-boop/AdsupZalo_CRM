const fs = require('fs');
let schema = fs.readFileSync('backend/prisma/schema.prisma', 'utf-8');

const mapReplacements = {
  '@@map("teams")': '@@unique([orgId, id])\n  @@map("teams")',
  '@@map("users")': '@@unique([orgId, id])\n  @@map("users")', // Wait, I already added @@unique([orgId, email]) for users, so replacing @@map("users") might duplicate.
  '@@map("zalo_accounts")': '@@unique([orgId, id])\n  @@map("zalo_accounts")',
  '@@map("contacts")': '@@unique([orgId, id])\n  @@map("contacts")',
  '@@map("conversations")': '@@unique([orgId, id])\n  @@map("conversations")',
  '@@map("messages")': '@@unique([orgId, id])\n  @@map("messages")',
  '@@map("appointments")': '@@unique([orgId, id])\n  @@map("appointments")',
  '@@map("integrations")': '@@unique([orgId, id])\n  @@map("integrations")',
  '@@map("message_templates")': '@@unique([orgId, id])\n  @@map("message_templates")'
};

for (const [key, value] of Object.entries(mapReplacements)) {
  if (schema.includes(key) && !schema.includes('@@unique([orgId, id])\\n  ' + key)) {
     // Check if it already has the unique constraint directly above it to avoid double
     const idx = schema.indexOf(key);
     const context = schema.substring(Math.max(0, idx - 50), idx);
     if (!context.includes('@@unique([orgId, id])')) {
        schema = schema.replace(key, value);
     }
  }
}

fs.writeFileSync('backend/prisma/schema.prisma', schema);
