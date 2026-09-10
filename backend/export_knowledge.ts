import { prisma } from './src/shared/database/prisma-client.js';
import * as fs from 'fs';

async function main() {
  console.log('Exporting AI Knowledge...');
  const knowledge = await prisma.aiKnowledge.findMany();
  fs.writeFileSync('knowledge_export.json', JSON.stringify(knowledge, null, 2));
  console.log(`Exported ${knowledge.length} AI knowledge items to knowledge_export.json`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
