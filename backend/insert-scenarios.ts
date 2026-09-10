import { prisma } from './dist/shared/database/prisma-client.js';

async function run() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.log("No organization found");
    return;
  }
  const orgId = org.id;
  console.log("Found organization:", org.name, "ID:", orgId);

  // Scenarios list
  const scenarios = [
    {
      name: "[US Americare] Chăm sóc khách mới cột sống & cơ xương khớp",
      description: "Bám đuổi khách mới để hẹn lịch tầm soát cột sống",
      category: "new_inbox",
      steps: [
        {
          content: "Chào anh/chị {{name}}, em là chuyên viên tư vấn của US Americare. Cảm ơn anh/chị đã quan tâm giải pháp điều trị cơ xương khớp và cột sống chuẩn Mỹ bên em.\n\nAnh/chị đang gặp tình trạng đau mỏi ở vùng nào (cổ vai gáy, lưng hay khớp gối...) và bị lâu chưa ạ để bác sĩ hỗ trợ tư vấn tốt nhất ạ?",
          delayType: "relative",
          delayMinutes: 5,
          orderIndex: 0
        },
        {
          content: "Dạ {{name}} ơi, tình trạng đau mỏi cột sống kéo dài dễ dẫn đến thoái hóa hoặc thoát vị đĩa đệm rất nguy hiểm ạ. \n\nHiện US Americare đang có chương trình tầm soát cột sống 1-1 cùng Bác sĩ nước ngoài miễn phí. Không biết tuần này mình rảnh buổi nào để em giữ suất khám cho mình nhé?",
          delayType: "relative",
          delayMinutes: 1440, // 1 day
          orderIndex: 1
        },
        {
          content: "Chào anh/chị {{name}}, em gửi mình một số hình ảnh khách hàng đã điều trị dứt điểm đau vai gáy chuẩn Mỹ bên em ạ. Trị liệu chuẩn y khoa, không dùng thuốc, không phẫu thuật.\n\nAnh/chị có muốn đăng ký khám thử để cải thiện sớm cơn đau của mình không ạ?",
          delayType: "relative",
          delayMinutes: 4320, // 3 days
          orderIndex: 2
        }
      ]
    },
    {
      name: "[US Americare] Nhắc hẹn thăm khám",
      description: "Nhắc nhở khách trước giờ hẹn khám tầm soát",
      category: "booked",
      steps: [
        {
          content: "Dạ US Americare chào anh/chị {{name}} ạ. \n\nEm xin phép nhắc lịch hẹn tầm soát cột sống của mình vào lúc {{time}} ngày {{date}} tại phòng khám US Americare. \n\nAnh/chị vui lòng đi đúng giờ để bác sĩ nước ngoài thăm khám chu đáo nhất nhé. Nếu có thay đổi gì anh/chị báo lại em nha!",
          delayType: "relative",
          delayMinutes: 10,
          orderIndex: 0
        }
      ]
    },
    {
      name: "[Beauty Aura] Chào khách mới hỏi điều trị da & mụn & nám",
      description: "Chăm sóc khách hàng quan tâm đến chăm sóc da",
      category: "new_inbox",
      steps: [
        {
          content: "Dạ Beauty Aura chào chị {{name}} ạ! Cảm ơn chị đã quan tâm đến dịch vụ chăm sóc & điều trị da chuẩn y khoa bên em.\n\nDa mình hiện tại đang gặp tình trạng mụn, nám hay muốn chăm sóc căng bóng da để em tư vấn phác đồ phù hợp nhất cho mình ạ?",
          delayType: "relative",
          delayMinutes: 5,
          orderIndex: 0
        },
        {
          content: "Chị {{name}} ơi, hiện tại Beauty Aura đang có chương trình Soi da 3D phân tích 10 chỉ số da miễn phí cùng bác sĩ da liễu. \n\nChị rảnh lúc nào để em hỗ trợ đặt lịch cho mình qua soi da xem tình trạng da cụ thể nhé?",
          delayType: "relative",
          delayMinutes: 1440, // 1 day
          orderIndex: 1
        },
        {
          content: "Dạ em gửi chị {{name}} hình ảnh khách hàng bên em trước và sau khi điều trị da bên em nha chị. Da căng bóng và sạch nám rõ rệt sau 1 liệu trình.\n\nChị có muốn sở hữu làn da khỏe đẹp như vậy không ạ? Nhắn em hỗ trợ đặt lịch soi da nha chị!",
          delayType: "relative",
          delayMinutes: 4320, // 3 days
          orderIndex: 2
        }
      ]
    },
    {
      name: "[Beauty Aura] Nhắc hẹn chăm sóc da",
      description: "Nhắc lịch hẹn chăm sóc da định kỳ",
      category: "booked",
      steps: [
        {
          content: "Dạ Beauty Aura chào chị {{name}} ạ. \n\nEm xin phép nhắc lịch hẹn chăm sóc da của mình vào lúc {{time}} ngày {{date}} tại Beauty Aura nhé ạ. \n\nChị sắp xếp thời gian qua đúng hẹn để bên em chuẩn bị phòng và phục vụ chu đáo nhất cho mình nha chị. Hẹn gặp chị ạ!",
          delayType: "relative",
          delayMinutes: 10,
          orderIndex: 0
        }
      ]
    },
    {
      name: "[Beauty Aura] Chăm sóc sau liệu trình da",
      description: "Hỏi thăm khách hàng sau khi làm dịch vụ tại spa",
      category: "after_consult",
      steps: [
        {
          content: "Dạ Beauty Aura chào chị {{name}} ạ. \n\nHôm qua mình làm liệu trình xong da mình về có bị đỏ hay rát nhiều không chị? Chị nhớ bôi kem dưỡng ẩm và kem chống nắng đầy đủ như bác sĩ dặn nhé ạ. Có bất kỳ hiện tượng gì chị cứ nhắn em ngay nha!",
          delayType: "relative",
          delayMinutes: 1440, // 1 day
          orderIndex: 0
        },
        {
          content: "Chị {{name}} ơi, da mình tuần này phục hồi và căng mịn hơn nhiều chưa ạ?\n\nTranh thủ tuần này đến buổi tiếp theo trong liệu trình để da được chăm sóc liên tục, đạt hiệu quả tốt nhất chị nhé. Chị đi được ngày nào để em đặt lịch hẹn trước cho mình ạ?",
          delayType: "relative",
          delayMinutes: 10080, // 7 days
          orderIndex: 1
        }
      ]
    }
  ];

  for (const s of scenarios) {
    // Check if scenario already exists
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
