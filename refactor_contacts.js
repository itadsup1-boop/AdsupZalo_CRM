const fs = require('fs');

let content = fs.readFileSync('backend/src/modules/contacts/contact-routes.ts', 'utf8');

// 1. Add ownership logic to list
content = content.replace(
  `if (assignedUserId) where.assignedUserId = assignedUserId;`,
  `if (user.role === 'member') {\n        where.assignedUserId = user.id;\n      } else if (assignedUserId) {\n        where.assignedUserId = assignedUserId;\n      }`
);

// 2. Add ownership to pipeline root
content = content.replace(
  `const pipeline = await db.contact.groupBy({\n        by: ['status'],\n        where: { status: { not: null }, mergedInto: null },\n        _count: true,\n      });`,
  `const whereBase: any = { status: { not: null }, mergedInto: null };\n      if (user.role === 'member') whereBase.assignedUserId = user.id;\n      const pipeline = await db.contact.groupBy({\n        by: ['status'],\n        where: whereBase,\n        _count: true,\n      });`
);

// 3. Add ownership to pipeline items
content = content.replace(
  `const where: any = { status: st ?? null, mergedInto: null };`,
  `const where: any = { status: st ?? null, mergedInto: null };\n          if (user.role === 'member') where.assignedUserId = user.id;`
);

// 4. Detail ownership check
content = content.replace(
  `if (!contact) return reply.status(404).send({ error: 'Contact not found' });\n      return contact;`,
  `if (!contact) return reply.status(404).send({ error: 'Contact not found' });\n      if (user.role === 'member' && contact.assignedUserId !== user.id) {\n        return reply.status(403).send({ error: 'Forbidden: You do not have access to this contact' });\n      }\n      return contact;`
);

// 5. Create ownership
content = content.replace(
  `assignedUserId: body.assignedUserId,`,
  `assignedUserId: user.role === 'member' ? user.id : body.assignedUserId,`
);

// 6. Update ownership
content = content.replace(
  `const contact = await db.contact.update({`,
  `const existing = await db.contact.findUnique({ where: { id } });\n      if (!existing) return reply.status(404).send({ error: 'Contact not found' });\n      if (user.role === 'member' && existing.assignedUserId !== user.id) {\n        return reply.status(403).send({ error: 'Forbidden: You do not own this contact' });\n      }\n\n      const contact = await db.contact.update({`
);

// 7. Delete ownership
content = content.replace(
  `await db.contact.delete({ where: { id } });`,
  `const existing = await db.contact.findUnique({ where: { id } });\n      if (!existing) return reply.status(404).send({ error: 'Contact not found' });\n      if (user.role === 'member' && existing.assignedUserId !== user.id) {\n        return reply.status(403).send({ error: 'Forbidden: You do not own this contact' });\n      }\n\n      await db.contact.delete({ where: { id } });`
);

// 8. Pipeline Update ownership
content = content.replace(
  `const contact = await db.contact.update({\n        where: { id },\n        data: { status },\n      });`,
  `const existing = await db.contact.findUnique({ where: { id } });\n      if (!existing) return reply.status(404).send({ error: 'Contact not found' });\n      if (user.role === 'member' && existing.assignedUserId !== user.id) {\n        return reply.status(403).send({ error: 'Forbidden: You do not own this contact' });\n      }\n\n      const contact = await db.contact.update({\n        where: { id },\n        data: { status },\n      });`
);

// 9. Add Tag ownership
content = content.replace(
  `const contact = await db.contact.findFirst({ where: { id } });\n      if (!contact) return reply.status(404).send({ error: 'Contact not found' });`,
  `const contact = await db.contact.findFirst({ where: { id } });\n      if (!contact) return reply.status(404).send({ error: 'Contact not found' });\n      if (user.role === 'member' && contact.assignedUserId !== user.id) {\n        return reply.status(403).send({ error: 'Forbidden: You do not own this contact' });\n      }`
);

// 10. Remove Tag ownership
content = content.replace(
  `const contact = await db.contact.findFirst({ where: { id } });\n      if (!contact) return reply.status(404).send({ error: 'Contact not found' });\n\n      const tags = contact.tags as string[];`,
  `const contact = await db.contact.findFirst({ where: { id } });\n      if (!contact) return reply.status(404).send({ error: 'Contact not found' });\n      if (user.role === 'member' && contact.assignedUserId !== user.id) {\n        return reply.status(403).send({ error: 'Forbidden: You do not own this contact' });\n      }\n\n      const tags = contact.tags as string[];`
);

// 11. Merge ownership
// If user is member, they can only merge contacts they own.
content = content.replace(
  `const result = await mergeContacts(db, primaryId, duplicateId);`,
  `if (user.role === 'member') {\n        const [c1, c2] = await Promise.all([\n          db.contact.findUnique({ where: { id: primaryId }, select: { assignedUserId: true } }),\n          db.contact.findUnique({ where: { id: duplicateId }, select: { assignedUserId: true } })\n        ]);\n        if (!c1 || !c2 || c1.assignedUserId !== user.id || c2.assignedUserId !== user.id) {\n          return reply.status(403).send({ error: 'Forbidden: You can only merge contacts assigned to you' });\n        }\n      }\n\n      const result = await mergeContacts(db, primaryId, duplicateId);`
);

fs.writeFileSync('backend/src/modules/contacts/contact-routes.ts', content);
