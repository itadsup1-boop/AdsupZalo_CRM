import { prisma } from '../shared/database/prisma-client.js';

async function main() {
  console.log('🚀 Bắt đầu script seeding và backfill teamId...');

  // 1. Lấy tất cả organization
  const orgs = await prisma.organization.findMany();
  console.log(`Tìm thấy ${orgs.length} tổ chức.`);

  for (const org of orgs) {
    console.log(`\n--- Xử lý Org: ${org.name} (ID: ${org.id}) ---`);

    // 2. Tạo hoặc lấy Team "Beauty Aura"
    let teamBeauty = await prisma.team.findFirst({
      where: { orgId: org.id, name: 'Beauty Aura' }
    });
    if (!teamBeauty) {
      teamBeauty = await prisma.team.create({
        data: {
          orgId: org.id,
          name: 'Beauty Aura'
        }
      });
      console.log(`✅ Đã tạo Team Beauty Aura: ${teamBeauty.id}`);
    } else {
      console.log(`ℹ️ Team Beauty Aura đã tồn tại: ${teamBeauty.id}`);
    }

    // 3. Tạo hoặc lấy Team "Us Americare"
    let teamUs = await prisma.team.findFirst({
      where: { orgId: org.id, name: 'Us Americare' }
    });
    if (!teamUs) {
      teamUs = await prisma.team.create({
        data: {
          orgId: org.id,
          name: 'Us Americare'
        }
      });
      console.log(`✅ Đã tạo Team Us Americare: ${teamUs.id}`);
    } else {
      console.log(`ℹ️ Team Us Americare đã tồn tại: ${teamUs.id}`);
    }

    // 4. Phân bổ ZaloAccount vào đúng Team
    const zaloAccounts = await prisma.zaloAccount.findMany({
      where: { orgId: org.id }
    });
    console.log(`Tìm thấy ${zaloAccounts.length} ZaloAccount.`);

    for (const acc of zaloAccounts) {
      let targetTeamId = null;
      const displayName = acc.displayName || '';
      
      if (displayName.toLowerCase().includes('beauty') || displayName.toLowerCase().includes('aura')) {
        targetTeamId = teamBeauty.id;
      } else if (displayName.toLowerCase().includes('us') || displayName.toLowerCase().includes('americare')) {
        targetTeamId = teamUs.id;
      }

      if (targetTeamId) {
        await prisma.zaloAccount.update({
          where: { id: acc.id },
          data: { teamId: targetTeamId }
        });
        console.log(`✅ Đã gán ZaloAccount "${acc.displayName}" (ID: ${acc.id}) vào Team ID: ${targetTeamId}`);
      } else {
        console.log(`⚠️ ZaloAccount "${acc.displayName}" (ID: ${acc.id}) không tự động khớp team nào.`);
      }
    }

    // 5. Phân bổ Users vào đúng Team (dựa trên email hoặc tên)
    const users = await prisma.user.findMany({
      where: { orgId: org.id }
    });
    console.log(`Tìm thấy ${users.length} Users.`);

    for (const u of users) {
      if (u.role === 'owner' || u.role === 'admin') {
        console.log(`ℹ️ Bỏ qua User ${u.fullName} (${u.email}) vì vai trò là ${u.role}.`);
        continue;
      }

      let targetTeamId = null;
      const email = u.email.toLowerCase();
      const fullName = u.fullName.toLowerCase();

      if (email.includes('beauty') || fullName.includes('beauty') || fullName.includes('aura')) {
        targetTeamId = teamBeauty.id;
      } else if (email.includes('us') || email.includes('tele') || fullName.includes('us') || fullName.includes('americare')) {
        targetTeamId = teamUs.id;
      }

      if (targetTeamId) {
        await prisma.user.update({
          where: { id: u.id },
          data: { teamId: targetTeamId }
        });
        console.log(`✅ Đã gán User "${u.fullName}" (${u.email}) vào Team ID: ${targetTeamId}`);
      } else {
        console.log(`⚠️ User "${u.fullName}" (${u.email}) không tự động khớp team nào.`);
      }
    }

    // 6. Backfill Conversations
    console.log('🔄 Đang backfill teamId cho Conversations...');
    const conversations = await prisma.conversation.findMany({
      where: { orgId: org.id },
      include: { zaloAccount: true }
    });

    let convUpdatedCount = 0;
    for (const conv of conversations) {
      if (conv.zaloAccount?.teamId) {
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { teamId: conv.zaloAccount.teamId }
        });
        convUpdatedCount++;
      }
    }
    console.log(`✅ Đã cập nhật teamId cho ${convUpdatedCount}/${conversations.length} Conversations.`);

    // 7. Backfill Contacts
    console.log('🔄 Đang backfill teamId cho Contacts...');
    const contacts = await prisma.contact.findMany({
      where: { orgId: org.id },
      include: {
        conversations: {
          include: {
            zaloAccount: true
          }
        }
      }
    });

    let contactUpdatedCount = 0;
    let contactWarningCount = 0;
    for (const contact of contacts) {
      // Tìm teamId phù hợp từ các cuộc hội thoại của contact
      let resolvedTeamId: string | null = null;
      for (const conv of contact.conversations) {
        if (conv.zaloAccount?.teamId) {
          if (!resolvedTeamId) {
            resolvedTeamId = conv.zaloAccount.teamId;
          } else if (resolvedTeamId !== conv.zaloAccount.teamId) {
            console.warn(`⚠️ Cảnh báo: Contact "${contact.fullName}" (ID: ${contact.id}) có nhiều cuộc trò chuyện thuộc các team khác nhau! Resolved: ${resolvedTeamId}, Gặp thêm: ${conv.zaloAccount.teamId}`);
            contactWarningCount++;
          }
        }
      }

      if (resolvedTeamId) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { teamId: resolvedTeamId }
        });
        contactUpdatedCount++;
      }
    }
    console.log(`✅ Đã cập nhật teamId cho ${contactUpdatedCount}/${contacts.length} Contacts (Cảnh báo xung đột: ${contactWarningCount}).`);
  }

  console.log('\n🎉 Hoàn thành xong seeding và backfill teamId thành công!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
