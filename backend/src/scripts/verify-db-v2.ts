import { prisma } from '../shared/database/prisma-client.js';

async function main() {
  console.log('--- KIỂM TRA TRẠNG THÁI PHÂN CHIA CHI NHÁNH (TEAM) ---');

  const teams = await prisma.team.findMany();
  console.log(`\n1. Tổng số Team trong DB: ${teams.length}`);
  for (const t of teams) {
    console.log(`   - Team: "${t.name}" (ID: ${t.id}, Org: ${t.orgId})`);
  }

  const accounts = await prisma.zaloAccount.findMany({
    include: { team: true }
  });
  console.log(`\n2. Zalo Accounts (${accounts.length} tổng số):`);
  for (const a of accounts) {
    console.log(`   - Account: "${a.displayName}" (ID: ${a.id}) -> Team: ${a.team?.name || 'NULL'}`);
  }

  const users = await prisma.user.findMany({
    include: { team: true }
  });
  console.log(`\n3. Users (${users.length} tổng số):`);
  for (const u of users) {
    console.log(`   - User: "${u.fullName}" (Email: ${u.email}, Role: ${u.role}) -> Team: ${u.team?.name || 'NULL'}`);
  }

  const convCount = await prisma.conversation.count();
  const convWithTeam = await prisma.conversation.count({ where: { teamId: { not: null } } });
  console.log(`\n4. Conversations: ${convWithTeam}/${convCount} cuộc hội thoại đã được gán teamId.`);

  const contactCount = await prisma.contact.count();
  const contactWithTeam = await prisma.contact.count({ where: { teamId: { not: null } } });
  console.log(`\n5. Contacts: ${contactWithTeam}/${contactCount} liên hệ đã được gán teamId.`);

  // In thử 5 conversation và contact có teamId để xem chi tiết
  const sampleConvs = await prisma.conversation.findMany({
    where: { teamId: { not: null } },
    take: 5,
    include: { team: true, zaloAccount: true }
  });
  if (sampleConvs.length > 0) {
    console.log('\n6. Mẫu hội thoại đã được phân Team:');
    for (const c of sampleConvs) {
      console.log(`   - Conv ID: ${c.id} (ZaloAccount: ${c.zaloAccount?.displayName}) -> Team: ${c.team?.name}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
