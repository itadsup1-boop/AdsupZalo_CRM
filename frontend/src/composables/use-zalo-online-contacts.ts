import { ref } from 'vue';
import { api } from '@/api/index';
import type { Socket } from 'socket.io-client';

export interface ZaloOnlineContact {
  contactId: string;
  zaloAccountId: string;
  zaloAccountName: string;
  displayName: string;
  avatar: string | null;
  phone: string | null;
  conversationId: string | null;
  isOnline: boolean;
  lastActiveAt: number;
  presenceText: string;
}

const onlineContacts = ref<ZaloOnlineContact[]>([]);
const initialized = ref(false);

export function useZaloOnlineContacts() {
  
  async function fetchOnlineContacts() {
    try {
      const { data } = await api.get('/zalo-accounts/online-contacts');
      onlineContacts.value = data.onlineContacts;
      initialized.value = true;
    } catch (err) {
      console.error('Failed to fetch online Zalo contacts', err);
    }
  }

  function updateContactState(payload: any, isOnline: boolean) {
    const idx = onlineContacts.value.findIndex(c => c.contactId === payload.contactId);
    if (idx !== -1) {
      onlineContacts.value[idx].isOnline = isOnline;
      onlineContacts.value[idx].lastActiveAt = payload.lastActiveAt;
      onlineContacts.value[idx].presenceText = isOnline ? 'Đang online' : 'Vừa mới truy cập';
    } else if (isOnline) {
      // If we don't have this contact in our list and they just came online, we might miss their
      // full details (name, avatar, etc) unless the payload includes it. 
      // The backend socket payload from `zaloOnlineContactsService` only has:
      // { contactId, zaloUid, zaloAccountId, isOnline, lastActiveAt }
      // So we should re-fetch the list to get full details.
      fetchOnlineContacts();
    }
  }

  function setupSocketListeners(s: Socket) {
    s.on('zalo:contact:online', (payload: any) => {
      updateContactState(payload, true);
    });

    s.on('zalo:contact:offline', (payload: any) => {
      updateContactState(payload, false);
    });
  }

  function removeSocketListeners(s: Socket) {
    s.off('zalo:contact:online');
    s.off('zalo:contact:offline');
  }

  return {
    onlineContacts,
    initialized,
    fetchOnlineContacts,
    setupSocketListeners,
    removeSocketListeners
  };
}
