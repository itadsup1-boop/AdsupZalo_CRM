import { prisma } from './dist/shared/database/prisma-client.js';

async function main() {
  try {
    const tokens = await prisma.fcmToken.findMany();
    console.log('FCM Tokens count:', tokens.length);
    console.log('Tokens:', tokens);
  } catch (err) {
    console.error('Error fetching FCM tokens:', err);
  }
  process.exit(0);
}

main();
