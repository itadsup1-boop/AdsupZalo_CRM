import { sendPushNotification } from './dist/modules/notifications/push-service.js';
import { prisma } from './dist/shared/database/prisma-client.js';

async function main() {
  const userId = "001c8aef-60af-48dc-aa2f-ef59695c55fd";
  const orgId = "b2db7caa-b9a0-4146-8d6e-c517987d6dcf";
  
  console.log(`Sending test push notification to user ${userId} in org ${orgId}...`);
  
  try {
    await sendPushNotification(userId, orgId, {
      title: "Test Notification",
      body: "This is a test notification from the Zalo CRM backend.",
      data: {
        conversationId: "d4742a8c-7afb-4eb9-8673-18ce6e07c601",
        url: "/chat/d4742a8c-7afb-4eb9-8673-18ce6e07c601"
      }
    });
    console.log("Successfully ran sendPushNotification!");
  } catch (err) {
    console.error("Failed to send push notification:", err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();
