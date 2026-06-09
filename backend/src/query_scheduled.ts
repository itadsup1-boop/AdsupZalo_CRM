import 'dotenv/config';
import { prisma } from './shared/database/prisma-client.js';

async function main() {
  const contactId = '1cb08577-006d-40b0-a281-5710fad881bb'; // Beauty Aura
  
  // Clean up
  await prisma.scheduledMessage.deleteMany({
    where: { contactId }
  });
  await prisma.contactTag.deleteMany({
    where: { contactId }
  });
  console.log('Cleanup completed for contact:', contactId);
}

main().catch(console.error).finally(() => prisma.$disconnect());
