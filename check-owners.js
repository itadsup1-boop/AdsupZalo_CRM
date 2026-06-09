import { prisma } from './shared/database/prisma-client.js';

async function main() {
  const owners = await prisma.user.findMany({
    where: { role: 'owner' }
  });
  console.log(`Number of owners (lowercase): ${owners.length}`);
  
  const ownersUpper = await prisma.user.findMany({
    where: { role: 'OWNER' }
  });
  console.log(`Number of owners (uppercase): ${ownersUpper.length}`);
  
  const ownersCap = await prisma.user.findMany({
    where: { role: 'Owner' }
  });
  console.log(`Number of owners (capitalized): ${ownersCap.length}`);
  
  const allRoles = await prisma.user.groupBy({
    by: ['role'],
    _count: true
  });
  console.log('All roles:', allRoles);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
