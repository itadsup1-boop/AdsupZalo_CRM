/**
 * Shared composable for picking which Zalo account to operate on.
 * Used by Groups, Friends, and other account-scoped views.
 */
import { ref, onMounted } from 'vue';
import { useZaloAccounts } from './use-zalo-accounts';

export function useSelectedAccount() {
  const { accounts, fetchAccounts, loading, statusColor, statusText, setupSocket } = useZaloAccounts();
  const selectedAccountId = ref(localStorage.getItem('selected-zalo-account') || '');

  function selectAccount(id: string) {
    selectedAccountId.value = id;
    localStorage.setItem('selected-zalo-account', id);
  }

  onMounted(async () => {
    await fetchAccounts();
    setupSocket(); // Enable real-time status updates via Socket.IO
    if (!selectedAccountId.value && accounts.value.length > 0) {
      selectAccount(accounts.value[0].id);
    }
  });

  return { accounts, selectedAccountId, selectAccount, loading, statusColor, statusText, fetchAccounts, setupSocket };
}
