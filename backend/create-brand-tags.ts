import { prisma } from './dist/shared/database/prisma-client.js';

async function run() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.log("No organization found");
    return;
  }
  const orgId = org.id;

  const tags = [
    { name: "Hỏi giá - US Americare", color: "#1E3A8A", description: "Khách hỏi giá cơ xương khớp US Americare" },
    { name: "Hỏi giá - Beauty Aura", color: "#EC4899", description: "Khách hỏi giá dịch vụ spa Beauty Aura" },
    { name: "Khách mới - US Americare", color: "#3B82F6", description: "Khách mới inbox US Americare" },
    { name: "Khách mới - Beauty Aura", color: "#F472B6", description: "Khách mới inbox Beauty Aura" },
    { name: "Đặt lịch - US Americare", color: "#1D4ED8", description: "Khách đã hẹn lịch khám US Americare" },
    { name: "Đặt lịch - Beauty Aura", color: "#DB2777", description: "Khách đã hẹn lịch làm da Beauty Aura" },
    { name: "Sau liệu trình - Beauty Aura", color: "#9333EA", description: "Khách sau khi làm liệu trình da Beauty Aura" }
  ];

  for (const t of tags) {
    const existing = await prisma.tag.findFirst({
      where: { orgId, name: t.name }
    });

    if (existing) {
      console.log(`Tag "${t.name}" already exists, skipping...`);
      continue;
    }

    const created = await prisma.tag.create({
      data: {
        orgId,
        name: t.name,
        color: t.color,
        description: t.description,
        isActive: true
      }
    });
    console.log(`Created tag: "${created.name}"`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
