<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4">Tài khoản Zalo</h1>
      <v-spacer />
      <v-btn
        class="mr-2"
        icon="mdi-refresh"
        variant="tonal"
        :loading="loading"
        title="Làm mới trạng thái"
        @click="fetchAccounts()"
      />
      <v-btn v-if="authStore.isAdmin" color="primary" prepend-icon="mdi-plus" @click="showAddDialog = true">Thêm Zalo</v-btn>
    </div>

    <v-alert v-if="fetchError" type="warning" density="compact" variant="tonal" class="mb-3">
      {{ fetchError }}
    </v-alert>

    <v-card class="zalo-account-card">
      <v-data-table
        class="zalo-account-table"
        :headers="headers"
        :items="accounts"
        :loading="loading"
        :items-per-page="10"
        fixed-header
        no-data-text="Chưa có tài khoản Zalo nào"
      >
        <template #item.displayName="{ item }">
          <span class="text-truncate d-inline-block account-name">{{ item.displayName || 'Chưa đặt tên' }}</span>
        </template>
        <template #item.zaloUid="{ item }">
          <span class="text-medium-emphasis">{{ item.zaloUid || '-' }}</span>
        </template>
        <template #item.phone="{ item }">
          <span class="text-medium-emphasis">{{ item.phone || '-' }}</span>
        </template>
        <template #item.status="{ item }">
          <v-chip :color="statusColor(displayStatus(item))" size="small" variant="flat" class="status-chip">
            {{ statusText(displayStatus(item)) }}
          </v-chip>
        </template>
        <template #item.aiEnabled="{ item }">
          <v-switch
            v-if="authStore.isAdmin"
            v-model="item.aiEnabled"
            :true-value="true"
            :false-value="false"
            @change="toggleAi(item.id, item.aiEnabled)"
            hide-details
            density="compact"
            color="primary"
            class="mt-2"
            :label="item.aiEnabled ? 'Bật' : 'Tắt'"
          />
          <span v-else>{{ item.aiEnabled ? 'Bật' : 'Tắt' }}</span>
        </template>
        <template #item.actions="{ item }">
          <div class="action-buttons">
            <v-btn
              v-if="authStore.isAdmin"
              icon
              size="small"
              color="cyan"
              title="Phân quyền truy cập"
              :disabled="isBusy(item.id)"
              @click="openAccess(item)"
            >
              <v-icon>mdi-shield-account</v-icon>
            </v-btn>
            <v-btn
              icon
              size="small"
              color="success"
              title="Đồng bộ danh bạ Zalo"
              :loading="syncing === item.id"
              :disabled="isBusy(item.id)"
              @click="syncContacts(item.id)"
            >
              <v-icon>mdi-account-sync</v-icon>
            </v-btn>
            <v-btn
              icon
              size="small"
              color="deep-purple"
              title="Đồng bộ toàn bộ danh bạ & nhóm"
              :loading="syncingFull === item.id"
              :disabled="isBusy(item.id)"
              @click="syncFull(item.id)"
            >
              <v-icon>mdi-history</v-icon>
            </v-btn>
            <v-btn
              icon
              size="small"
              color="orange"
              title="Đồng bộ lại tin nhắn 24 giờ gần nhất"
              :loading="syncingMessages === item.id"
              :disabled="isBusy(item.id)"
              @click="syncMessages(item.id)"
            >
              <v-icon>mdi-sync</v-icon>
            </v-btn>
            <v-btn
              v-if="canLogin(item)"
              icon
              size="small"
              color="primary"
              title="Đăng nhập QR"
              :loading="loginLoading === item.id"
              :disabled="isBusy(item.id)"
              @click="loginAccount(item.id)"
            >
              <v-icon>mdi-qrcode</v-icon>
            </v-btn>
            <v-btn
              v-if="canReconnect(item)"
              icon
              size="small"
              color="info"
              title="Kết nối lại"
              :loading="reconnectLoading === item.id"
              :disabled="isBusy(item.id)"
              @click="reconnectAccount(item.id)"
            >
              <v-icon>mdi-refresh</v-icon>
            </v-btn>
            <v-btn
              v-if="authStore.isAdmin"
              icon
              size="small"
              color="error"
              title="Xóa"
              :disabled="isBusy(item.id)"
              @click="confirmDelete(item)"
            >
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Add account dialog -->
    <v-dialog v-model="showAddDialog" max-width="400">
      <v-card>
        <v-card-title>Thêm tài khoản Zalo</v-card-title>
        <v-card-text>
          <v-text-field v-model="newAccountName" label="Tên hiển thị (VD: Zalo Sale Hương)" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showAddDialog = false">Hủy</v-btn>
          <v-btn color="primary" :loading="adding" @click="handleAddAccount">Thêm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- QR Code dialog -->
    <v-dialog v-model="showQRDialog" max-width="400" persistent>
      <v-card class="text-center pa-4">
        <v-card-title>Quét QR để đăng nhập Zalo</v-card-title>
        <v-card-text>
          <div v-if="qrImage" class="mb-4">
            <img :src="'data:image/png;base64,' + qrImage" alt="QR Code" style="max-width: 280px;" />
          </div>
          <div v-else-if="qrScanned" class="mb-4">
            <v-icon icon="mdi-check-circle" size="64" color="success" />
            <p class="text-h6 mt-2">Đã quét! Xác nhận trên điện thoại...</p>
            <p v-if="scannedName" class="text-body-2">{{ scannedName }}</p>
          </div>
          <div v-else class="mb-4">
            <v-progress-circular indeterminate color="primary" size="64" />
            <p class="mt-2">Đang tạo QR code...</p>
          </div>
          <v-alert v-if="qrError" type="error" density="compact" class="mt-2">{{ qrError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="cancelQR">Đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete confirm dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card>
        <v-card-title>Xác nhận xóa</v-card-title>
        <v-card-text>Bạn có chắc muốn xóa tài khoản "{{ deleteTarget?.displayName || deleteTarget?.id }}"?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDeleteDialog = false">Hủy</v-btn>
          <v-btn color="error" :loading="deleting" @click="handleDeleteAccount">Xóa</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Access control dialog -->
    <ZaloAccessDialog
      v-model="showAccessDialog"
      :account-id="accessTarget?.id ?? ''"
      :account-name="accessTarget?.displayName ?? accessTarget?.id ?? ''"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useZaloAccounts, type ZaloAccount } from '@/composables/use-zalo-accounts';
import { useAuthStore } from '@/stores/auth';
import ZaloAccessDialog from '@/components/settings/ZaloAccessDialog.vue';
import { api } from '@/api/index';

const {
  accounts, loading, adding, deleting, loginLoading, reconnectLoading, fetchError,
  showQRDialog, qrImage, qrScanned, scannedName, qrError,
  displayStatus, statusColor, statusText,
  fetchAccounts, addAccount, loginAccount, reconnectAccount, deleteAccount, toggleAi,
  cancelQR, setupSocket, startAutoRefresh,
} = useZaloAccounts();

const authStore = useAuthStore();

const showAddDialog = ref(false);
const syncing = ref<string | null>(null);
const syncingFull = ref<string | null>(null);
const syncingMessages = ref<string | null>(null);
const showDeleteDialog = ref(false);
const showAccessDialog = ref(false);
const newAccountName = ref('');
const deleteTarget = ref<ZaloAccount | null>(null);
const accessTarget = ref<ZaloAccount | null>(null);

const headers = [
  { title: 'Tên', key: 'displayName', sortable: true },
  { title: 'Zalo UID', key: 'zaloUid' },
  { title: 'SĐT', key: 'phone' },
  { title: 'Trạng thái', key: 'status', sortable: true },
  { title: 'AI', key: 'aiEnabled', sortable: false, align: 'center' as const, width: 100 },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const, width: 310 },
];

function isBusy(accountId: string) {
  return (
    syncing.value === accountId ||
    syncingFull.value === accountId ||
    syncingMessages.value === accountId ||
    loginLoading.value === accountId ||
    reconnectLoading.value === accountId
  );
}

function canLogin(account: ZaloAccount) {
  return authStore.isAdmin && displayStatus(account) !== 'connected';
}

function canReconnect(account: ZaloAccount) {
  return authStore.isAdmin && displayStatus(account) !== 'connected' && Boolean(account.hasSession);
}

async function syncContacts(accountId: string) {
  syncing.value = accountId;
  try {
    const res = await api.post(`/zalo-accounts/${accountId}/sync-contacts`, {});
    alert(`Đồng bộ danh bạ thành công: ${res.data.created} mới, ${res.data.updated} cập nhật`);
  } catch (err: any) {
    alert('Đồng bộ thất bại: ' + (err.response?.data?.error || err.message));
  } finally {
    syncing.value = null;
    await fetchAccounts({ silent: true });
  }
}

async function syncFull(accountId: string) {
  syncingFull.value = accountId;
  try {
    const res = await api.post(`/zalo-accounts/${accountId}/sync-full`, {});
    const s = res.data.stats;
    alert(`Đồng bộ lịch sử thành công!\n+${s.contactsCreated} liên hệ\n+${s.groupsCreated} nhóm\n+${s.messagesSynced} tin nhắn`);
  } catch (err: any) {
    alert('Đồng bộ thất bại: ' + (err.response?.data?.error || err.message));
  } finally {
    syncingFull.value = null;
    await fetchAccounts({ silent: true });
  }
}

async function syncMessages(accountId: string) {
  syncingMessages.value = accountId;
  try {
    const res = await api.post(`/zalo-accounts/${accountId}/sync-messages`, { lookbackHours: 24 });
    const s = res.data.stats;
    alert(`Đồng bộ tin nhắn xong!\nQuét ${s.conversationsScanned} hội thoại\n+${s.messagesImported} tin nhắn\nBỏ qua trùng: ${s.duplicatesSkipped}\nLỗi: ${s.errors?.length || 0}`);
  } catch (err: any) {
    alert('Đồng bộ tin nhắn thất bại: ' + (err.response?.data?.error || err.message));
  } finally {
    syncingMessages.value = null;
    await fetchAccounts({ silent: true });
  }
}

async function handleAddAccount() {
  const ok = await addAccount(newAccountName.value);
  if (ok) {
    showAddDialog.value = false;
    newAccountName.value = '';
  }
}

function confirmDelete(account: ZaloAccount) {
  deleteTarget.value = account;
  showDeleteDialog.value = true;
}

function openAccess(account: ZaloAccount) {
  accessTarget.value = account;
  showAccessDialog.value = true;
}

async function handleDeleteAccount() {
  if (!deleteTarget.value) return;
  const ok = await deleteAccount(deleteTarget.value);
  if (ok) {
    showDeleteDialog.value = false;
    deleteTarget.value = null;
  }
}

onMounted(() => {
  fetchAccounts();
  setupSocket();
  startAutoRefresh();
});
</script>

<style scoped>
.zalo-account-card {
  overflow-x: auto;
}

.zalo-account-table {
  min-width: 860px;
}

.account-name {
  max-width: 240px;
}

.status-chip {
  min-width: 112px;
  justify-content: center;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  min-width: 292px;
}
</style>
