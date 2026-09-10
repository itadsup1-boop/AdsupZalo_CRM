import { prisma } from '../shared/database/prisma-client.js';

async function main() {
  console.log('--- KIỂM TRA BẢNG ZALO ACCOUNT ACCESS ---');

  const accesses = await prisma.zaloAccountAccess.findMany({
    include: {
      user: { select: { fullName: true, email: true, teamId: true } },
      zaloAccount: { select: { displayName: true, teamId: true } }
    }
  });

  console.log(`Tìm thấy ${accesses.length} bản ghi phân quyền truy cập:`);
  for (const a of accesses) {
    console.log(`- Quyền ID: ${a.id}`);
    console.log(`  User: "${a.user?.fullName}" (${a.user?.email}) [Team ID: ${a.user?.teamId || 'NULL'}]`);
    console.log(`  Zalo Account: "${a.zaloAccount?.displayName}" [Team ID: ${a.zaloAccount?.teamId || 'NULL'}]`);
    console.log(`  Quyền: ${a.permission}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
