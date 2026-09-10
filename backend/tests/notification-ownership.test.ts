import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getContactAccessWhere,
  getAppointmentAccessWhere,
  getZaloAccountAccessWhere,
  getConversationAccessWhere,
  canAccessContact,
  canAccessZaloAccount,
  getConversationTargetRooms
} from '../src/shared/utils/permission-scope.js';
import { prisma } from '../src/shared/database/prisma-client.js';

// Mock prisma client
vi.mock('../src/shared/database/prisma-client.js', () => {
  return {
    prisma: {
      contact: {
        count: vi.fn(),
        findFirst: vi.fn(),
      },
      zaloAccount: {
        count: vi.fn(),
        findUnique: vi.fn(),
      },
      zaloAccountAccess: {
        findMany: vi.fn(),
      },
      conversation: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      }
    },
  };
});

describe('Notification & Scope Scoping Authorization — Permission Scope Tests', () => {
  const orgId = 'org-123';
  
  // Test users
  const adminUser = { id: 'admin-1', role: 'admin', orgId, teamId: null };
  const memberNoTeam = { id: 'member-no-team', role: 'member', orgId, teamId: null };
  const memberTeamA = { id: 'member-team-a', role: 'member', orgId, teamId: 'team-a' };
  const memberTeamB = { id: 'member-team-b', role: 'member', orgId, teamId: 'team-b' };

  describe('getContactAccessWhere', () => {
    it('Admin/Owner bypasses filter and sees all contacts in their organization', () => {
      const result = getContactAccessWhere(adminUser);
      expect(result).toEqual({ orgId });
    });

    it('Member without teamId only sees contacts with conversation access OR assigned to themselves', () => {
      const result = getContactAccessWhere(memberNoTeam);
      expect(result).toEqual({
        orgId,
        OR: [
          {
            conversations: {
              some: {
                zaloAccount: {
                  access: {
                    some: {
                      userId: memberNoTeam.id
                    }
                  }
                }
              }
            }
          },
          { assignedUserId: memberNoTeam.id }
        ]
      });
    });

    it('Member with teamId sees contacts with conversation access OR assigned to themselves', () => {
      const result = getContactAccessWhere(memberTeamA);
      expect(result).toEqual({
        orgId,
        OR: [
          {
            conversations: {
              some: {
                zaloAccount: {
                  access: {
                    some: {
                      userId: memberTeamA.id
                    }
                  }
                }
              }
            }
          },
          { assignedUserId: memberTeamA.id }
        ]
      });
    });
  });

  describe('getAppointmentAccessWhere', () => {
    it('Admin/Owner bypasses filter and sees all appointments', () => {
      const result = getAppointmentAccessWhere(adminUser);
      expect(result).toEqual({ orgId });
    });

    it('Member without teamId only sees appointments assigned to themselves or related to their assigned contacts', () => {
      const result = getAppointmentAccessWhere(memberNoTeam);
      expect(result).toEqual({
        orgId,
        OR: [
          { assignedUserId: memberNoTeam.id },
          { contact: getContactAccessWhere(memberNoTeam) }
        ]
      });
    });

    it('Member with teamId sees appointments assigned to themselves or related contacts', () => {
      const result = getAppointmentAccessWhere(memberTeamA);
      expect(result).toEqual({
        orgId,
        OR: [
          { assignedUserId: memberTeamA.id },
          { contact: getContactAccessWhere(memberTeamA) }
        ]
      });
    });
  });

  describe('getZaloAccountAccessWhere', () => {
    it('Admin/Owner bypasses filter and sees all Zalo accounts', () => {
      const result = getZaloAccountAccessWhere(adminUser);
      expect(result).toEqual({ orgId });
    });

    it('Member without teamId only sees Zalo accounts they have explicit access to', () => {
      const result = getZaloAccountAccessWhere(memberNoTeam);
      expect(result).toEqual({
        orgId,
        access: {
          some: {
            userId: memberNoTeam.id
          }
        }
      });
    });

    it('Member with teamId sees Zalo accounts they have explicit access to', () => {
      const result = getZaloAccountAccessWhere(memberTeamA);
      expect(result).toEqual({
        orgId,
        access: {
          some: {
            userId: memberTeamA.id
          }
        }
      });
    });
  });

  describe('canAccessContact', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('Admin bypasses access check and count query is not run', async () => {
      const result = await canAccessContact(adminUser, 'contact-id');
      expect(result).toBe(true);
      expect(prisma.contact.count).not.toHaveBeenCalled();
    });

    it('Returns true if count is greater than 0 for Member', async () => {
      vi.mocked(prisma.contact.count).mockResolvedValueOnce(1);
      const result = await canAccessContact(memberTeamA, 'contact-id');
      expect(result).toBe(true);
      expect(prisma.contact.count).toHaveBeenCalledWith({
        where: {
          id: 'contact-id',
          orgId,
          ...getContactAccessWhere(memberTeamA)
        }
      });
    });

    it('Returns false if count is 0 for Member', async () => {
      vi.mocked(prisma.contact.count).mockResolvedValueOnce(0);
      const result = await canAccessContact(memberTeamA, 'contact-id');
      expect(result).toBe(false);
    });
  });

  describe('canAccessZaloAccount', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('Admin bypasses check and count query is not run', async () => {
      const result = await canAccessZaloAccount(adminUser, 'zalo-id');
      expect(result).toBe(true);
      expect(prisma.zaloAccount.count).not.toHaveBeenCalled();
    });

    it('Returns true if count is greater than 0 for Member', async () => {
      vi.mocked(prisma.zaloAccount.count).mockResolvedValueOnce(1);
      const result = await canAccessZaloAccount(memberTeamA, 'zalo-id');
      expect(result).toBe(true);
      expect(prisma.zaloAccount.count).toHaveBeenCalledWith({
        where: {
          id: 'zalo-id',
          orgId,
          ...getZaloAccountAccessWhere(memberTeamA)
        }
      });
    });
  });

  describe('Socket.IO Room Scoping & Target Rooms', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('Returns correct rooms list for a conversation containing only authorized users, excluding branch rooms', async () => {
      // Mock conversation find
      vi.mocked(prisma.conversation.findFirst).mockResolvedValueOnce({
        zaloAccountId: 'zalo-acct-1'
      } as any);

      // Mock ZaloAccountAccess accesses
      vi.mocked(prisma.zaloAccountAccess.findMany).mockResolvedValueOnce([
        { userId: 'user-shared-1' },
        { userId: 'user-shared-2' }
      ] as any);

      // Mock ZaloAccount owner
      vi.mocked(prisma.zaloAccount.findUnique).mockResolvedValueOnce({
        ownerUserId: 'user-owner'
      } as any);

      // Mock owner's role is not admin
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        role: 'member'
      } as any);

      const rooms = await getConversationTargetRooms('conv-1', orgId);

      // Verify targeted rooms
      expect(rooms).toContain(`org_${orgId}_user_user-shared-1`);
      expect(rooms).toContain(`org_${orgId}_user_user-shared-2`);
      expect(rooms).toContain(`org_${orgId}_user_user-owner`);

      // ROOMS MUST NOT contain branch rooms or admins room
      expect(rooms).not.toContain(`org_${orgId}_branch_team-owner`);
      expect(rooms).not.toContain(`org_${orgId}_admins`);
    });
  });

  describe('Explicit Checklist Scenarios', () => {
    const orgId = 'org-123';
    const memberA = { id: 'member-A', orgId, role: 'member', teamId: 'team-A' };
    const memberB = { id: 'member-B', orgId, role: 'member', teamId: 'team-B' };
    const admin = { id: 'admin-1', orgId, role: 'admin', teamId: null };

    it('Member A does not see notification / data of Member B (unassigned / diff branch)', () => {
      const contactAccessA = getContactAccessWhere(memberA);
      expect(contactAccessA.OR).toContainEqual({
        conversations: {
          some: {
            zaloAccount: {
              access: {
                some: {
                  userId: 'member-A'
                }
              }
            }
          }
        }
      });
      expect(contactAccessA.OR).not.toContainEqual({
        conversations: {
          some: {
            zaloAccount: {
              access: {
                some: {
                  userId: 'member-B'
                }
              }
            }
          }
        }
      });
    });

    it('Member A does not see dashboard count of Branch B', () => {
      const contactAccessA = getContactAccessWhere(memberA);
      const contactAccessB = getContactAccessWhere(memberB);

      // User A where filter
      expect(contactAccessA.OR).toContainEqual({
        conversations: {
          some: {
            zaloAccount: {
              access: {
                some: {
                  userId: 'member-A'
                }
              }
            }
          }
        }
      });
      expect(contactAccessA.OR).not.toContainEqual({
        conversations: {
          some: {
            zaloAccount: {
              access: {
                some: {
                  userId: 'member-B'
                }
              }
            }
          }
        }
      });

      // User B where filter
      expect(contactAccessB.OR).toContainEqual({
        conversations: {
          some: {
            zaloAccount: {
              access: {
                some: {
                  userId: 'member-B'
                }
              }
            }
          }
        }
      });
      expect(contactAccessB.OR).not.toContainEqual({
        conversations: {
          some: {
            zaloAccount: {
              access: {
                some: {
                  userId: 'member-A'
                }
              }
            }
          }
        }
      });
    });

    it('Member A does not see conversations/counts of Branch B', () => {
      const contactAccessA = getContactAccessWhere(memberA);
      const zaloAccessA = getZaloAccountAccessWhere(memberA);

      expect(contactAccessA.OR).toContainEqual({
        conversations: {
          some: {
            zaloAccount: {
              access: {
                some: {
                  userId: 'member-A'
                }
              }
            }
          }
        }
      });
      expect(zaloAccessA).toEqual({
        orgId,
        access: {
          some: {
            userId: 'member-A'
          }
        }
      });
    });

    it('Member A cannot view contact detail of Branch B', async () => {
      vi.mocked(prisma.contact.count).mockResolvedValueOnce(0);
      const canAccess = await canAccessContact(memberA, 'contact-of-B');
      expect(canAccess).toBe(false);
      
      // Admin bypasses and gets true
      const adminCanAccess = await canAccessContact(admin, 'contact-of-B');
      expect(adminCanAccess).toBe(true);
    });

    it('Member A does not receive socket chat:message of Branch B', async () => {
      // Mock conversation find
      vi.mocked(prisma.conversation.findFirst).mockResolvedValueOnce({
        zaloAccountId: 'zalo-B'
      } as any);

      // Mock ZaloAccountAccess accesses for B's account
      vi.mocked(prisma.zaloAccountAccess.findMany).mockResolvedValueOnce([
        { userId: 'member-B' }
      ] as any);

      // Mock ZaloAccount owner
      vi.mocked(prisma.zaloAccount.findUnique).mockResolvedValueOnce({
        ownerUserId: 'member-B'
      } as any);

      // Mock owner's role is not admin
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        role: 'member'
      } as any);

      const targetRooms = await getConversationTargetRooms('conv-in-B', orgId);

      // Verify targeted rooms include member-B room but NOT member-A room
      expect(targetRooms).toContain(`org_${orgId}_user_member-B`);
      expect(targetRooms).not.toContain(`org_${orgId}_user_member-A`);
      expect(targetRooms).not.toContain(`org_${orgId}_branch_team-B`);
    });

    it('Admin/Owner still sees everything in the same orgId', () => {
      const contactAccess = getContactAccessWhere(admin);
      const zaloAccess = getZaloAccountAccessWhere(admin);
      const convAccess = getConversationAccessWhere(admin);
      const aptAccess = getAppointmentAccessWhere(admin);

      expect(contactAccess).toEqual({ orgId });
      expect(zaloAccess).toEqual({ orgId });
      expect(convAccess).toEqual({ orgId });
      expect(aptAccess).toEqual({ orgId });
    });
  });

  describe('Zalo Accounts Sharing Owner but Different Teams', () => {
    const orgId = 'org-123';
    const sharedOwnerId = 'common-owner-id';
    
    // Members of different branches
    const memberBeauty = { id: 'member-beauty', orgId, role: 'member', teamId: 'team-beauty' };
    const memberUs = { id: 'member-us', orgId, role: 'member', teamId: 'team-us' };

    it('Member of Team US cannot see Beauty Account via getZaloAccountAccessWhere query condition', () => {
      const accessUs = getZaloAccountAccessWhere(memberUs);
      
      expect(accessUs).toEqual({
        orgId,
        access: {
          some: {
            userId: memberUs.id
          }
        }
      });
    });

    it('canAccessZaloAccount resolves correctly despite shared ownerUserId', async () => {
      vi.mocked(prisma.zaloAccount.count).mockImplementationOnce(async (args: any) => {
        expect(args.where.access.some.userId).toBe('member-beauty');
        return 1; // Found
      });
      const beautyCanAccess = await canAccessZaloAccount(memberBeauty, 'beauty-acct');
      expect(beautyCanAccess).toBe(true);

      vi.mocked(prisma.zaloAccount.count).mockImplementationOnce(async (args: any) => {
        expect(args.where.access.some.userId).toBe('member-us');
        return 0; // Not found under member-us
      });
      const usCanAccess = await canAccessZaloAccount(memberUs, 'beauty-acct');
      expect(usCanAccess).toBe(false);
    });

    it('Realtime message room routing targets only the respective branch, avoiding leaks', async () => {
      // Mock conversation find
      vi.mocked(prisma.conversation.findFirst).mockResolvedValueOnce({
        zaloAccountId: 'beauty-acct'
      } as any);

      // Mock ZaloAccountAccess accesses for Beauty (only memberBeauty has access)
      vi.mocked(prisma.zaloAccountAccess.findMany).mockResolvedValueOnce([
        { userId: 'member-beauty' }
      ] as any);

      // Mock ZaloAccount owner (the common admin/owner)
      vi.mocked(prisma.zaloAccount.findUnique).mockResolvedValueOnce({
        ownerUserId: sharedOwnerId
      } as any);

      // Mock owner's role is admin (so it should not be automatically added to routing list!)
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        role: 'admin'
      } as any);
      
      const targetRooms = await getConversationTargetRooms('beauty-conv-1', orgId);

      // Room should include member-beauty
      expect(targetRooms).toContain(`org_${orgId}_user_member-beauty`);

      // ROOM MUST NOT INCLUDE the common admin ownerUserId or member-us
      expect(targetRooms).not.toContain(`org_${orgId}_user_${sharedOwnerId}`);
      expect(targetRooms).not.toContain(`org_${orgId}_user_member-us`);
    });
  });
});
