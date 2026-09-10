import { prisma } from '../shared/database/prisma-client.js';

async function main() {
  console.log('🚀 Bắt đầu dọn dẹp và phân bổ lại quyền truy cập ZaloAccountAccess...');

  // 1. Lấy thông tin 2 Team đích
  const teamBeauty = await prisma.team.findFirst({
    where: { name: 'Beauty Aura' }
  });
  const teamUs = await prisma.team.findFirst({
    where: { name: 'Us Americare' }
  });

  if (!teamBeauty || !teamUs) {
    console.error('❌ Không tìm thấy các team chi nhánh trong DB. Hãy chạy seed-teams-v2.ts trước.');
    return;
  }

  console.log(`Team Beauty Aura ID: ${teamBeauty.id}`);
  console.log(`Team Us Americare ID: ${teamUs.id}`);

  // 2. Lấy thông tin các ZaloAccount
  const accBeauty = await prisma.zaloAccount.findFirst({
    where: { displayName: { contains: 'Beauty Aura', mode: 'insensitive' } }
  });
  const accUs = await prisma.zaloAccount.findFirst({
    where: { displayName: { contains: 'Us Americare', mode: 'insensitive' } }
  });

  if (!accBeauty || !accUs) {
    console.error('❌ Không tìm thấy ZaloAccount Beauty Aura hoặc Us Americare.');
    return;
  }

  // 3. Phân bổ teamId cho các User đang có teamId = null dựa vào quyền truy cập của họ
  const accesses = await prisma.zaloAccountAccess.findMany({
    include: { user: true }
  });

  for (const access of accesses) {
    const user = access.user;
    if (!user || user.role !== 'member') continue;

    let targetTeamId = null;
    if (access.zaloAccountId === accBeauty.id) {
      targetTeamId = teamBeauty.id;
    } else if (access.zaloAccountId === accUs.id) {
      targetTeamId = teamUs.id;
    }

    if (targetTeamId && !user.teamId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { teamId: targetTeamId }
      });
      console.log(`✅ Đã bổ sung Team cho User "${user.fullName}" (${user.email}) -> Team ID: ${targetTeamId}`);
    }
  }

  // 4. Kiểm tra và xóa các bản ghi phân quyền chéo (cross-access)
  const allAccesses = await prisma.zaloAccountAccess.findMany({
    include: {
      user: true,
      zaloAccount: true
    }
  });

  for (const a of allAccesses) {
    const user = a.user;
    const account = a.zaloAccount;
    if (!user || !account) continue;

    // Chỉ áp dụng giới hạn nghiêm ngặt cho member
    if (user.role === 'member') {
      const userTeamId = user.teamId;
      const accountTeamId = account.teamId;

      // Nếu có chi nhánh khác nhau hoặc email của user Us Americare truy cập Beauty Aura (hoặc ngược lại)
      const isCrossAccess = 
        (userTeamId && accountTeamId && userTeamId !== accountTeamId) ||
        (user.email.toLowerCase().includes('us') && account.displayName?.toLowerCase().includes('beauty')) ||
        (user.email.toLowerCase().includes('beauty') && account.displayName?.toLowerCase().includes('us'));

      if (isCrossAccess) {
        await prisma.zaloAccountAccess.delete({
          where: { id: a.id }
        });
        console.log(`🗑️ Đã XÓA quyền truy cập chéo không hợp lệ:`);
        console.log(`   User: "${user.fullName}" (${user.email}) [Team ID: ${userTeamId}]`);
        console.log(`   Zalo Account: "${account.displayName}" [Team ID: ${accountTeamId}]`);
      }
    }
  }

  console.log('🎉 Hoàn thành dọn dẹp phân quyền chéo!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
