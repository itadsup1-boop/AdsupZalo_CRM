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
      name: "[US Americare] Khách hỏi chi phí điều trị cơ xương khớp",
      description: "Tư vấn & bám đuổi khi khách hỏi giá điều trị thoái hóa/thoát vị cột sống",
      category: "ask_price",
      steps: [
        {
          content: "Dạ chào anh/chị {{name}} ạ. Chi phí điều trị cơ xương khớp tại US Americare sẽ phụ thuộc vào mức độ đau và phác đồ điều trị cụ thể của bác sĩ nước ngoài thiết kế riêng cho mình ạ (thông thường dao động từ vài trăm nghìn cho 1 buổi trị liệu công nghệ cao chuẩn Mỹ).\n\nĐể hỗ trợ tốt nhất, anh/chị có thể cho em biết mình đang bị đau ở vùng nào và tình trạng này kéo dài bao lâu rồi không ạ? Em sẽ báo mức chi phí dự kiến phù hợp nhất cho mình nhé.",
          delayType: "relative",
          delayMinutes: 5,
          orderIndex: 0
        },
        {
          content: "Dạ anh/chị {{name}} ơi, hiện tại phòng khám đang có chương trình Đăng ký sớm - Tặng suất chụp X-quang cột sống và Thăm khám 1-1 cùng Bác sĩ nước ngoài trị giá 1.500.000đ (Hoàn toàn miễn phí).\n\nNếu mình sắp xếp được thời gian qua thăm khám, bác sĩ sẽ kiểm tra trực tiếp khớp xương và đưa ra chi phí điều trị chính xác nhất cho mình. Anh/chị có muốn em hỗ trợ đăng ký giữ suất quà tặng này cho mình tuần này không ạ?",
          delayType: "relative",
          delayMinutes: 1440, // 1 day
          orderIndex: 1
        }
      ]
    },
    {
      name: "[Beauty Aura] Khách hỏi giá dịch vụ chăm sóc & điều trị da",
      description: "Tư vấn & bám đuổi khi khách hỏi giá liệu trình spa chăm sóc da, trị mụn, trị nám",
      category: "ask_price",
      steps: [
        {
          content: "Dạ Beauty Aura chào chị {{name}} ạ. Chi phí dịch vụ chăm sóc da bên em dao động từ 199k cho buổi chăm sóc da chuyên sâu, và có các liệu trình điều trị mụn/nám chuyên sâu theo phác đồ bác sĩ da liễu thiết kế riêng cho từng nền da ạ.\n\nChị {{name}} đang quan tâm dịch vụ chăm sóc da thư giãn hay muốn điều trị tình trạng mụn, nám, tàn nhang cụ thể ạ? Chị chia sẻ để em gửi bảng giá chi tiết phù hợp nhất cho mình nhé ạ.",
          delayType: "relative",
          delayMinutes: 5,
          orderIndex: 0
        },
        {
          content: "Chị {{name}} ơi, trong tháng này Beauty Aura đang áp dụng ưu đãi Giảm đến 30% cho khách hàng đăng ký đặt lịch hẹn trước qua Zalo ạ.\n\nNgoài ra mình còn được miễn phí Soi da 3D và bác sĩ da liễu khám da trực tiếp nữa ạ. Chị rảnh ngày nào để em hỗ trợ đặt lịch giữ ưu đãi 30% cho mình nhé ạ?",
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
