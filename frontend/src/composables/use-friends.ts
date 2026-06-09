import { ref, computed } from 'vue';
import { api } from '@/api/index';
import { io, Socket } from 'socket.io-client';

export function useFriends() {
  const friends = ref<any[]>([]);
  const onlineUserIds = ref<string[]>([]);
  let socket: Socket | null = null;

  const isFriendOnline = (friend: any) => {
    const id = String(friend?.userId ?? friend?.uid ?? friend?.id ?? friend?.zaloId ?? '');
    return (
      friend?.online === true ||
      friend?.isOnline === true ||
      friend?.is_online === true ||
      friend?.online === 1 ||
      friend?.is_online === 1 ||
      String(friend?.status || '').toLowerCase() === 'online' ||
      String(friend?.presence || '').toLowerCase() === 'online' ||
      (id && onlineUserIds.value.includes(id))
    );
  };

  const onlineFriends = computed(() => {
    return friends.value.filter(isFriendOnline);
  });

  const sentRequests = ref<any[]>([]);
  const recommendations = ref<any[]>([]);
  const searchResults = ref<any[]>([]);
  const loading = ref(false);

  function base(accountId: string) {
    return `/zalo-accounts/${accountId}/friends`;
  }

  async function fetchFriends(accountId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}`);
      friends.value = res.data?.data ?? res.data ?? [];
    } catch (err) {
      console.error('fetchFriends failed:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchOnlineFriends(accountId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/online`);
      const payload = res.data?.data ?? res.data;
      const onlinesRaw: any[] = payload?.onlines ?? [];

      // Update onlineUserIds so computed property onlineFriends will update automatically
      onlineUserIds.value = onlinesRaw.map((o: any) => String(o.userId));

      // Also directly assign online status properties on friends.value objects so both checks pass
      friends.value = friends.value.map((f: any) => {
        const isOnline = onlineUserIds.value.includes(String(f.userId));
        return {
          ...f,
          isOnline,
          online: isOnline,
          status: isOnline ? 'online' : f.status,
          presence: isOnline ? 'online' : (f.presence || '')
        };
      });

      console.log('[Friends] All friends count:', friends.value.length);
      console.log('[Friends] Online raw count:', onlinesRaw.length,
                  '| Computed online friends:', onlineFriends.value.length);
      if (friends.value.length > 0) {
        console.log('[Friends] Sample friends (first 5):', friends.value.slice(0, 5));
      }
    } catch (err) {
      console.error('fetchOnlineFriends failed:', err);
    } finally {
      loading.value = false;
    }
  }

  function setupSocket() {
    if (socket) return;
    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('online_users', (ids: any) => {
      if (Array.isArray(ids)) {
        onlineUserIds.value = ids.map(String);
        console.log('[Socket] Received online_users. Count:', onlineUserIds.value.length);
      }
    });

    socket.on('presence:update', (payload: any) => {
      if (payload && !Array.isArray(payload)) {
        const id = String(payload.userId || payload.uid || payload.id || '');
        if (id) {
          const isOnline = payload.online === true || payload.status === 'online';
          console.log('[Socket] Received presence:update for:', id, 'online:', isOnline);
          if (isOnline) {
            if (!onlineUserIds.value.includes(id)) onlineUserIds.value.push(id);
          } else {
            onlineUserIds.value = onlineUserIds.value.filter(x => x !== id);
          }
        }
      }
    });

    socket.on('user:online', (data: any) => {
      const id = String(data?.userId ?? data?.uid ?? data?.id ?? data ?? '');
      console.log('[Socket] Received user:online for:', id);
      if (id && !onlineUserIds.value.includes(id)) {
        onlineUserIds.value.push(id);
      }
    });

    socket.on('friend:online', (data: any) => {
      const id = String(data?.userId ?? data?.uid ?? data?.id ?? data ?? '');
      console.log('[Socket] Received friend:online for:', id);
      if (id && !onlineUserIds.value.includes(id)) {
        onlineUserIds.value.push(id);
      }
    });

    socket.on('zalo:presence', (data: any) => {
      const id = String(data?.userId ?? data?.uid ?? data?.id ?? data?.zaloId ?? '');
      if (id) {
        const isOnline = data?.online === true || data?.status === 'online' || data?.presence === 'online';
        console.log('[Socket] Received zalo:presence for:', id, 'online:', isOnline);
        if (isOnline) {
          if (!onlineUserIds.value.includes(id)) onlineUserIds.value.push(id);
        } else {
          onlineUserIds.value = onlineUserIds.value.filter(x => x !== id);
        }
      }
    });
  }

  function destroySocket() {
    if (socket) {
      socket.disconnect();
      socket = null;
      console.log('[Socket] Disconnected and destroyed');
    }
  }


  async function fetchRecommendations(accountId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/recommendations`);
      const payload = res.data?.data ?? res.data;

      // API returns { recommItems: [{ recommItemType, dataInfo: { userId, displayName, avatar, ... } }] }
      const items: any[] = payload?.recommItems ?? [];
      recommendations.value = items
        .filter((item: any) => item?.dataInfo)
        .map((item: any) => ({
          ...item.dataInfo,
          // Normalize field names
          userId: item.dataInfo.userId,
          displayName: item.dataInfo.displayName ?? item.dataInfo.zaloName,
          avatar: item.dataInfo.avatar,
          phone: item.dataInfo.phoneNumber ?? null,
          recommType: item.dataInfo.recommType,
        }));
    } catch (err) {
      console.error('fetchRecommendations failed:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchSentRequests(accountId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/requests/sent`);
      sentRequests.value = res.data?.data ?? res.data ?? [];
    } catch (err) {
      console.error('fetchSentRequests failed:', err);
    } finally {
      loading.value = false;
    }
  }

  async function getRequestStatus(accountId: string, userId: string) {
    try {
      const res = await api.get(`${base(accountId)}/requests/${userId}/status`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('getRequestStatus failed:', err);
      return null;
    }
  }

  async function searchFriends(accountId: string, query: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}/find`, { params: { q: query } });
      const raw = res.data?.data ?? res.data;

      // findUser API returns a single user object, not an array.
      // Normalize field names to match the component's expected shape.
      const normalize = (u: any) => ({
        ...u,
        userId: u.userId ?? u.uid,          // uid → userId
        displayName: u.displayName ?? u.display_name ?? u.zalo_name,  // snake_case → camelCase
        name: u.name ?? u.display_name ?? u.zalo_name,
        avatar: u.avatar,
        phone: u.phone ?? u.phoneNumber ?? null,
      });

      if (Array.isArray(raw)) {
        searchResults.value = raw.map(normalize);
      } else if (raw && (raw.uid || raw.userId)) {
        searchResults.value = [normalize(raw)];
      } else {
        searchResults.value = [];
      }

      console.log('[Search] query:', query, '| raw:', raw, '| results:', searchResults.value);
    } catch (err) {
      console.error('searchFriends failed:', err);
      searchResults.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function sendRequest(accountId: string, userId: string, message?: string) {
    try {
      const res = await api.post(`${base(accountId)}/requests`, { userId, message });
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('sendRequest failed:', err);
      return null;
    }
  }

  async function acceptRequest(accountId: string, userId: string) {
    try {
      const res = await api.post(`${base(accountId)}/requests/${userId}/accept`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('acceptRequest failed:', err);
      return null;
    }
  }

  async function rejectRequest(accountId: string, userId: string) {
    try {
      const res = await api.post(`${base(accountId)}/requests/${userId}/reject`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('rejectRequest failed:', err);
      return null;
    }
  }

  async function cancelRequest(accountId: string, userId: string) {
    try {
      const res = await api.delete(`${base(accountId)}/requests/${userId}`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('cancelRequest failed:', err);
      return null;
    }
  }

  async function removeFriend(accountId: string, userId: string) {
    try {
      const res = await api.delete(`${base(accountId)}/${userId}`);
      await fetchFriends(accountId);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('removeFriend failed:', err);
      return null;
    }
  }

  async function setAlias(accountId: string, userId: string, alias: string) {
    try {
      const res = await api.put(`${base(accountId)}/${userId}/alias`, { alias });
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('setAlias failed:', err);
      return null;
    }
  }

  async function removeAlias(accountId: string, userId: string) {
    try {
      const res = await api.delete(`${base(accountId)}/${userId}/alias`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('removeAlias failed:', err);
      return null;
    }
  }

  async function blockUser(accountId: string, userId: string) {
    try {
      const res = await api.post(`${base(accountId)}/${userId}/block`);
      await fetchFriends(accountId);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('blockUser failed:', err);
      return null;
    }
  }

  async function unblockUser(accountId: string, userId: string) {
    try {
      const res = await api.delete(`${base(accountId)}/${userId}/block`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('unblockUser failed:', err);
      return null;
    }
  }

  async function blockFeed(accountId: string, userId: string) {
    try {
      const res = await api.post(`${base(accountId)}/${userId}/block-feed`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('blockFeed failed:', err);
      return null;
    }
  }

  async function unblockFeed(accountId: string, userId: string) {
    try {
      const res = await api.delete(`${base(accountId)}/${userId}/block-feed`);
      return res.data?.data ?? res.data;
    } catch (err) {
      console.error('unblockFeed failed:', err);
      return null;
    }
  }

  return {
    friends,
    onlineFriends,
    sentRequests,
    recommendations,
    searchResults,
    loading,
    fetchFriends,
    fetchOnlineFriends,
    fetchRecommendations,
    fetchSentRequests,
    getRequestStatus,
    searchFriends,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    removeFriend,
    setAlias,
    removeAlias,
    blockUser,
    unblockUser,
    blockFeed,
    unblockFeed,
    setupSocket,
    destroySocket,
  };
}
