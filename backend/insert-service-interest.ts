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
      name: "[US Americare] Chăm sóc khách quan tâm dịch vụ cột sống Chiropractic",
      description: "Tư vấn & giới thiệu phương pháp Chiropractic chuẩn Mỹ và các ưu đãi",
      category: "service_interest",
      steps: [
        {
          content: "Chào anh/chị {{name}} ạ. Chiropractic là phương pháp nắn chỉnh cột sống chuẩn Mỹ giúp giải nén dây thần kinh, điều trị tận gốc cơn đau cổ vai gáy/lưng mà hoàn toàn KHÔNG dùng thuốc, KHÔNG phẫu thuật.\n\nTại US Americare, 100% bác sĩ nước ngoài trực tiếp thăm khám và thực hiện nắn chỉnh cho mình. Hiện tại mình đang gặp khó khăn trong việc vận động hay bị đau mỏi nhiều không để em hỗ trợ bác sĩ tư vấn chuyên sâu cho mình ạ?",
          delayType: "relative",
          delayMinutes: 5,
          orderIndex: 0
        },
        {
          content: "Dạ anh/chị {{name}} ơi, trị liệu sớm xương khớp sẽ giúp mình lấy lại vóc dáng cột sống khỏe mạnh và tránh các biến chứng bại liệt đĩa đệm. Hôm nay em gửi anh/chị quy trình điều trị 5 bước chuẩn Mỹ bên em nha!\n\nBên em đang có suất ưu đãi 35% cho liệu trình đầu tiên đặt lịch hẹn qua Zalo. Anh/chị có muốn đăng ký trải nghiệm thử dịch vụ nắn chỉnh Chiropractic bên em tuần này không ạ?",
          delayType: "relative",
          delayMinutes: 1440, // 1 day
          orderIndex: 1
        }
      ]
    },
    {
      name: "[Beauty Aura] Chăm sóc khách quan tâm liệu trình căng bóng da trẻ hóa",
      description: "Tư vấn & giới thiệu công nghệ căng bóng trẻ hóa da và ưu đãi trải nghiệm",
      category: "service_interest",
      steps: [
        {
          content: "Dạ Beauty Aura chào chị {{name}} ạ. Liệu trình Căng bóng da trẻ hóa bên em sử dụng công nghệ Mesotherapy/Laser chuẩn y khoa giúp bổ sung dưỡng chất sâu dưới da, thu nhỏ lỗ chân lông và làm da căng mịn tức thì sau buổi đầu tiên ạ.\n\nDa mình hiện tại có đang gặp tình trạng khô sạm, nếp nhăn hay lỗ chân lông to không chị? Em tư vấn cụ thể phác đồ phù hợp nhất cho da mình nhé ạ!",
          delayType: "relative",
          delayMinutes: 5,
          orderIndex: 0
        },
        {
          content: "Chị {{name}} ơi, chăm sóc da sớm để giữ mãi nét thanh xuân và ngăn ngừa lão hóa cực kỳ quan trọng ạ. Em gửi chị một số hình ảnh sự thay đổi rõ rệt của làn da khách hàng sau buổi liệu trình căng bóng bên em nhé ạ.\n\nTuần này Beauty Aura đang áp dụng chương trình ưu đãi Trải nghiệm buổi đầu tiên chỉ với 299k (Giá gốc 800k). Chị có muốn giữ suất ưu đãi trải nghiệm đặc biệt này vào cuối tuần này không ạ?",
          delayType: "relative",
          delayMinutes: 1440, // 1 day
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
