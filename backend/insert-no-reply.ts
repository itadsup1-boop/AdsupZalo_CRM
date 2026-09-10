import { prisma } from './dist/shared/database/prisma-client.js';

async function run() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.log("No organization found");
    return;
  }
  const orgId = org.id;
  console.log("Found organization:", org.name, "ID:", orgId);

  const scenarios = [
    {
      name: "[US Americare] Bám đuổi khách chưa phản hồi tư vấn xương khớp",
      description: "Gửi tin nhắn kích hoạt lại tương tác với khách im lặng sau khi tư vấn xương khớp",
      category: "no_reply",
      steps: [
        {
          content: "Dạ anh/chị {{name}} ơi, không biết tình trạng đau mỏi xương khớp của mình hôm nay có đỡ hơn chút nào chưa ạ? \n\nXương khớp nếu không được trị liệu sớm rất dễ chuyển biến xấu sang thoái hóa hoặc chèn ép dây thần kinh nặng hơn. Anh/chị rảnh lúc nào để em hỗ trợ kết nối tư vấn nhanh cùng bác sĩ nước ngoài giúp mình nhé?",
          delayType: "relative",
          delayMinutes: 1440, // 1 day
          orderIndex: 0
        },
        {
          content: "Chào anh/chị {{name}} ạ. Em xin phép gửi tặng anh/chị 1 phiếu khám cột sống MIỄN PHÍ trực tiếp với Bác sĩ nước ngoài chuẩn Mỹ bên em (áp dụng duy nhất tuần này cho khách đăng ký qua Zalo). \n\nAnh/chị muốn đặt lịch vào thứ Bảy hay Chủ Nhật tuần này để em hỗ trợ ghi nhận thông tin nha?",
          delayType: "relative",
          delayMinutes: 4320, // 3 days
          orderIndex: 1
        }
      ]
    },
    {
      name: "[Beauty Aura] Bám đuổi khách chưa phản hồi tư vấn liệu trình da",
      description: "Kích hoạt lại tương tác với khách hàng im lặng sau khi nhận báo giá/tư vấn da",
      category: "no_reply",
      steps: [
        {
          content: "Chị {{name}} ơi, hôm nay da mình thế nào rồi ạ? Chị có cần em hỗ trợ giải đáp thêm thắc mắc nào về liệu trình chăm sóc da bên em không ạ?\n\nNếu chị bận chưa qua được, em có thể hỗ trợ gửi thêm một số hướng dẫn chăm sóc da tại nhà chuẩn y khoa phù hợp với tình trạng da hiện tại của chị nhé!",
          delayType: "relative",
          delayMinutes: 1440, // 1 day
          orderIndex: 0
        },
        {
          content: "Dạ chị {{name}} ơi, tuần này Beauty Aura đang có chương trình tri ân đặc biệt, tặng ngay 1 buổi chăm sóc da chuyên sâu 8 bước trị giá 500k khi chị đăng ký bất kỳ liệu trình điều trị nào bên em trong tuần này đó ạ. \n\nChị sắp xếp qua soi da và nhận quà tặng này vào ngày nào được để em đặt lịch hẹn trước cho mình nhé ạ?",
          delayType: "relative",
          delayMinutes: 4320, // 3 days
          orderIndex: 1
        }
      ]
    }
  ];

  for (const s of scenarios) {
    const existing = await prisma.messageScenario.findFirst({
      where: { orgId, name: s.name }
    });

    if (existing) {
      console.log(`Scenario "${s.name}" already exists, skipping...`);
      continue;
    }

    const created = await prisma.messageScenario.create({
      data: {
        orgId,
        name: s.name,
        description: s.description,
        category: s.category,
        isActive: true,
        steps: {
          create: s.steps.map(step => ({
            content: step.content,
            delayType: step.delayType,
            delayMinutes: step.delayMinutes,
            orderIndex: step.orderIndex,
            isActive: true
          }))
        }
      }
    });
    console.log(`Created scenario: "${created.name}"`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
