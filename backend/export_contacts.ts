import { prisma } from './src/shared/database/prisma-client.js';
import * as fs from 'fs';

async function main() {
  console.log('Exporting contacts...');
  const contacts = await prisma.contact.findMany();
  fs.writeFileSync('contacts_export.json', JSON.stringify(contacts, null, 2));
  console.log(`Exported ${contacts.length} contacts to contacts_export.json`);

  console.log('Exporting conversations...');
  const conversations = await prisma.conversation.findMany();
  fs.writeFileSync('conversations_export.json', JSON.stringify(conversations, null, 2));
  console.log(`Exported ${conversations.length} conversations to conversations_export.json`);

  console.log('Exporting messages...');
  const messages = await prisma.message.findMany();
  fs.writeFileSync('messages_export.json', JSON.stringify(messages, null, 2));
  console.log(`Exported ${messages.length} messages to messages_export.json`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
