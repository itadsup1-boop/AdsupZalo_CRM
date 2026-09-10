import { ref } from 'vue';
import { api } from '@/api/index';

export function useFriends() {
  const friends = ref<any[]>([]);

  const normalizeArrayPayload = (payload: any): any[] => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.friends)) return payload.friends;
    if (Array.isArray(payload.profiles)) return payload.profiles;
    if (payload.profiles && typeof payload.profiles === 'object') return Object.values(payload.profiles);
    if (payload.data && typeof payload.data === 'object') return Object.values(payload.data);
    if (typeof payload === 'object') return Object.values(payload);
    return [];
  };

  const sentRequests = ref<any[]>([]);
  const receivedRequests = ref<any[]>([]);
  const recommendations = ref<any[]>([]);
  const searchResults = ref<any[]>([]);
  const loading = ref(false);
  const searchLoading = ref(false);

  function base(accountId: string) {
    return `/zalo-accounts/${accountId}/friends`;
  }

  function normalizePhone(value: string) {
    return String(value || '').replace(/\D/g, '');
  }

  function getPhoneVariants(value: string) {
    const digits = normalizePhone(value);
    const variants = new Set([digits]);
    if (digits.startsWith('84') && digits.length >= 11) {
      variants.add(`0${digits.slice(2)}`);
    } else if (digits.startsWith('0') && digits.length >= 10) {
      variants.add(`84${digits.slice(1)}`);
    } else if (digits.length === 9) {
      variants.add(`0${digits}`);
      variants.add(`84${digits}`);
    }
    return Array.from(variants).filter(Boolean);
  }

  function flattenFindUserPayload(payload: any): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && typeof payload.data === 'object') return flattenFindUserPayload(payload.data);
    if (payload.userInfo) return flattenFindUserPayload(payload.userInfo);
    if (payload.profile) return flattenFindUserPayload(payload.profile);
    if (payload.dataInfo) return flattenFindUserPayload(payload.dataInfo);
    if (payload.profiles && typeof payload.profiles === 'object') return Object.values(payload.profiles);
    if (payload.changed_profiles && typeof payload.changed_profiles === 'object') return Object.values(payload.changed_profiles);
    if (payload.uid || payload.userId || payload.id || payload.zaloId) return [payload];
    return [];
  }

  async function fetchFriends(accountId: string) {
    loading.value = true;
    try {
      const res = await api.get(`${base(accountId)}`);
      friends.value = normalizeArrayPayload(res.data?.data ?? res.data).map((friend: any) => ({
        ...friend,
        userId: friend.userId ?? friend.uid ?? friend.uId ?? friend.id ?? friend.zaloId ?? friend.zaloUid,
        displayName: friend.displayName ?? friend.zaloName ?? friend.zalo_name ?? friend.name ?? friend.display_name,
        phone: friend.phone ?? friend.phoneNumber ?? friend.mobile,
      }));
    } catch (err) {
      console.error('fetchFriends failed:', err);
    } finally {
      loading.value = false;
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
      
      // Separate received requests from recommendations (recommType === 2)
      receivedRequests.value = recommendations.value.filter(r => r.recommType === 2 || r.recommItemType === 2);
      recommendations.value = recommendations.value.filter(r => r.recommType !== 2 && r.recommItemType !== 2);
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
    if (!query) {
      searchResults.value = [];
      return;
    }
    searchLoading.value = true;
    try {
      const q = query.toLowerCase().trim();
      // Search local friends first
      const qPhoneVariants = getPhoneVariants(query);
      const localMatches = friends.value.filter((f: any) => {
        const name = (f.displayName || f.name || '').toLowerCase();
        const phone = normalizePhone(f.phone || f.phoneNumber || '');
        return name.includes(q) || (!!phone && qPhoneVariants.some(v => phone.includes(v) || v.includes(phone)));
      });

      // Format local matches for search results panel
      const localResults = localMatches.map((u: any) => ({
        ...u,
        status: 'friend'
      }));

      searchResults.value = localResults;

      // If query looks like a phone number, also try global findUser
      const isPhone = normalizePhone(query).length >= 9;
      if (isPhone) {
        try {
          const res = await api.get(`${base(accountId)}/find`, {
            params: { q: query },
            timeout: 12000,
          });
          const raw = res.data?.data ?? res.data;

          const normalize = (u: any) => ({
            ...u,
            userId: u.userId ?? u.uid ?? u.id ?? u.zaloId,
            displayName: u.displayName ?? u.display_name ?? u.zalo_name ?? u.zaloName ?? u.name,
            name: u.name ?? u.display_name ?? u.zalo_name ?? u.zaloName,
            avatar: u.avatar ?? u.avatarUrl,
            phone: u.phone ?? u.phoneNumber ?? u.mobile ?? query,
          });

          const remoteResults = flattenFindUserPayload(raw)
            .map(normalize)
            .filter(u => u.userId && !localResults.some(l => String(l.userId) === String(u.userId)));
          searchResults.value = [...searchResults.value, ...remoteResults];
        } catch (findErr) {
          console.warn('[Search] Global findUser failed, continuing with local results', findErr);
        }
      }
      
      console.log('[Search] query:', query, '| results:', searchResults.value.length);
    } catch (err) {
      console.error('searchFriends failed:', err);
    } finally {
      searchLoading.value = false;
    }
  }

  async function sendRequest(accountId: string, userId: string, message?: string) {
    const res = await api.post(`${base(accountId)}/requests`, { userId, message });
    return res.data?.data ?? res.data;
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
    sentRequests,
    receivedRequests,
    recommendations,
    searchResults,
    loading,
    searchLoading,
    fetchFriends,
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
  };
}
