<template>
  <div>
    <h1 class="text-h4 mb-4">
      <v-icon class="mr-2" style="color: #00F2FF;">mdi-cog-outline</v-icon>
      Cài đặt
    </h1>

    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="users">Nhân viên</v-tab>
      <v-tab value="teams">Đội nhóm</v-tab>
      <v-tab value="org">Tổ chức</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- Tab 1: User management -->
      <v-window-item value="users">
        <!-- Secure Join Token Section -->
        <v-card v-if="authStore.isAdmin" class="mb-6 pa-4" variant="tonal" color="primary">
          <div class="d-flex align-center flex-wrap" style="gap: 16px;">
            <div>
              <div class="text-subtitle-2 font-weight-bold mb-1">Mã tham gia bảo mật (Join Token)</div>
              <div class="text-caption">Gửi mã 15 phút này cho nhân viên để họ vào thẳng tổ chức.</div>
            </div>
            <v-spacer />
            
            <v-btn 
              v-if="!currentInviteToken" 
              color="primary" 
              prepend-icon="mdi-shield-key-outline" 
              @click="handleGenerateToken" 
              :loading="generatingToken"
            >
              Tạo mã tham gia (15p)
            </v-btn>

            <div v-else class="d-flex align-center" style="background: rgba(var(--v-theme-primary), 0.1); padding: 8px 16px; border-radius: 8px; border: 1px dashed currentColor;">
              <div class="mr-4">
                <span class="text-caption d-block" style="line-height: 1;">Mã đã sẵn sàng</span>
                <span class="text-body-2 font-weight-bold">Hết hạn sau 15 phút</span>
              </div>
              <v-btn color="primary" variant="flat" size="small" @click:click="copyInviteToken" prepend-icon="mdi-content-copy">
                Sao chép mã
              </v-btn>
              <v-btn icon size="small" variant="text" @click:click="currentInviteToken = ''" class="ml-2" title="Hủy">
                <v-icon size="small">mdi-close</v-icon>
              </v-btn>
            </div>
          </div>
        </v-card>

        <!-- Pending Requests Section -->
        <v-alert v-if="pendingUsers.length > 0" type="info" variant="tonal" class="mb-6 border-info">
          <template #prepend>
            <v-icon color="info" size="large">mdi-account-clock-outline</v-icon>
          </template>
          <div class="d-flex align-center justify-space-between w-100">
            <div>
              <div class="text-subtitle-1 font-weight-bold">Yêu cầu tham gia mới ({{ pendingUsers.length }})</div>
              <div class="text-caption">Có nhân viên đang chờ bạn phê duyệt để tham gia vào tổ chức.</div>
            </div>
            <v-btn color="info" @click="scrollToPending" variant="flat" size="small">Xem danh sách</v-btn>
          </div>
        </v-alert>

        <div class="d-flex align-center mb-4">
          <v-btn v-if="authStore.isAdmin" color="primary" prepend-icon="mdi-plus" @click="openCreate">
            Thêm nhân viên thủ công
          </v-btn>
        </div>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
          {{ error }}
        </v-alert>

        <v-card>
          <v-data-table :headers="headers" :items="users" :loading="loading" no-data-text="Chưa có nhân viên nào">
            <template #item.role="{ item }">
              <v-chip :color="roleColor(item.role)" size="small" variant="flat">{{ roleLabel(item.role) }}</v-chip>
            </template>
            <template #item.isActive="{ item }">
              <v-chip v-if="item.isPending" color="warning" size="small" variant="flat" prepend-icon="mdi-clock-outline">
                Chờ duyệt
              </v-chip>
              <v-chip v-else :color="item.isActive ? 'success' : 'default'" size="small" variant="flat">
                {{ item.isActive ? 'Hoạt động' : 'Vô hiệu' }}
              </v-chip>
            </template>
              <template #item.actions="{ item }">
                <div class="d-flex align-center justify-end" style="gap: 4px;">
                  <template v-if="item.isPending">
                    <v-btn icon size="small" color="success" variant="tonal" title="Chấp nhận" @click="handleApprove(item)">
                      <v-icon>mdi-check</v-icon>
                    </v-btn>
                    <v-btn icon size="small" color="error" variant="tonal" title="Từ chối" @click="confirmRealDelete(item)">
                      <v-icon>mdi-close</v-icon>
                    </v-btn>
                  </template>
                  <template v-else>
                    <v-btn v-if="authStore.isAdmin || item.id === authStore.user?.id" icon size="small" variant="text" title="Chỉnh sửa" @click="openEdit(item)">
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                    <v-btn v-if="authStore.isAdmin || item.id === authStore.user?.id" icon size="small" variant="text" title="Đặt lại mật khẩu" @click="openPassword(item)">
                      <v-icon>mdi-lock-reset</v-icon>
                    </v-btn>
                    <v-btn 
                      v-if="authStore.isAdmin && item.id !== authStore.user?.id" 
                      icon 
                      size="small" 
                      variant="text" 
                      :color="item.isActive ? 'warning' : 'success'" 
                      :title="item.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'" 
                      @click="confirmToggleStatus(item)"
                    >
                      <v-icon>{{ item.isActive ? 'mdi-account-cancel-outline' : 'mdi-account-check-outline' }}</v-icon>
                    </v-btn>
                    <v-btn 
                      v-if="authStore.isOwner && item.id !== authStore.user?.id" 
                      icon 
                      size="small" 
                      variant="text" 
                      color="error" 
                      title="Xóa vĩnh viễn" 
                      @click="confirmRealDelete(item)"
                    >
                      <v-icon>mdi-delete-forever</v-icon>
                    </v-btn>
                  </template>
                </div>
              </template>
          </v-data-table>
        </v-card>

        <!-- Create dialog -->
        <v-dialog v-model="showCreate" max-width="440">
          <v-card>
            <v-card-title>Thêm nhân viên</v-card-title>
            <v-card-text>
              <v-text-field v-model="form.fullName" label="Họ tên *" class="mb-2" />
              <v-text-field v-model="form.email" label="Email *" type="email" class="mb-2" />
              <v-text-field v-model="form.password" label="Mật khẩu *" type="password" class="mb-2" />
              <v-select v-model="form.role" :items="roleOptions" item-title="label" item-value="value" label="Vai trò" />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showCreate = false">Hủy</v-btn>
              <v-btn color="primary" :loading="saving" @click="handleCreate">Tạo</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Edit dialog -->
        <v-dialog v-model="showEdit" max-width="440">
          <v-card>
            <v-card-title>Chỉnh sửa nhân viên</v-card-title>
            <v-card-text>
              <v-text-field v-model="form.fullName" label="Họ tên" class="mb-2" />
              <v-text-field v-model="form.email" label="Email" type="email" class="mb-2" />
              <v-select v-if="authStore.isOwner" v-model="form.role" :items="roleOptions" item-title="label" item-value="value" label="Vai trò" />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showEdit = false">Hủy</v-btn>
              <v-btn color="primary" :loading="saving" @click="handleUpdate">Lưu</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Reset password dialog -->
        <v-dialog v-model="showPassword" max-width="400">
          <v-card>
            <v-card-title>Đặt lại mật khẩu</v-card-title>
            <v-card-text>
              <v-text-field v-model="newPassword" label="Mật khẩu mới *" type="password" />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showPassword = false">Hủy</v-btn>
              <v-btn color="primary" :loading="saving" @click="handlePassword">Đặt lại</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Disable/Enable confirm dialog -->
        <v-dialog v-model="showToggleStatus" max-width="400">
          <v-card>
            <v-card-title>{{ selectedUser?.isActive ? 'Xác nhận vô hiệu hóa' : 'Xác nhận kích hoạt' }}</v-card-title>
            <v-card-text>
              Bạn có chắc muốn {{ selectedUser?.isActive ? 'vô hiệu hóa' : 'kích hoạt lại' }} nhân viên "{{ selectedUser?.fullName }}"?
              <div v-if="selectedUser?.isActive" class="text-caption text-grey mt-2">
                * Nhân viên bị vô hiệu hóa sẽ không thể đăng nhập vào hệ thống.
              </div>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showToggleStatus = false">Hủy</v-btn>
              <v-btn :color="selectedUser?.isActive ? 'warning' : 'success'" :loading="saving" @click="handleToggleStatus">
                {{ selectedUser?.isActive ? 'Vô hiệu hóa' : 'Kích hoạt' }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Delete Forever / Reject confirm dialog -->
        <v-dialog v-model="showRealDelete" max-width="400">
          <v-card>
            <v-card-title :class="selectedUser?.isPending ? 'text-info' : 'text-error'">
              {{ selectedUser?.isPending ? 'Từ chối yêu cầu tham gia' : 'Xóa vĩnh viễn nhân viên' }}
            </v-card-title>
            <v-card-text>
              Bạn có chắc muốn {{ selectedUser?.isPending ? 'TỪ CHỐI' : 'XÓA VĨNH VIỄN' }} nhân viên "{{ selectedUser?.fullName }}"?
              <div v-if="!selectedUser?.isPending" class="text-caption text-error mt-2">
                * Hành động này không thể hoàn tác. Mọi dữ liệu liên quan đến tài khoản này sẽ bị xóa.
              </div>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showRealDelete = false">Hủy</v-btn>
              <v-btn :color="selectedUser?.isPending ? 'info' : 'error'" variant="flat" :loading="saving" @click="handleRealDelete">
                {{ selectedUser?.isPending ? 'Từ chối' : 'Xóa vĩnh viễn' }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-window-item>

      <!-- Tab 2: Team management -->
      <v-window-item value="teams">
        <TeamManagement />
      </v-window-item>

      <!-- Tab 3: Organization settings -->
      <v-window-item value="org">
        <OrgSettings />
      </v-window-item>
    </v-window>

    <v-snackbar v-model="snackbar" timeout="2000">
      {{ snackbarText }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useUsers, type OrgUser } from '@/composables/use-users';
import { useAuthStore } from '@/stores/auth';
import TeamManagement from '@/components/settings/TeamManagement.vue';
import OrgSettings from '@/components/settings/OrgSettings.vue';

const { users, loading, error, fetchUsers, createUser, approveUser, updateUser, resetPassword, deleteUser } = useUsers();
const authStore = useAuthStore();

const tab = ref('users');
const showCreate = ref(false);
const showEdit = ref(false);
const showPassword = ref(false);
const showToggleStatus = ref(false);
const showRealDelete = ref(false);
const saving = ref(false);
const generatingToken = ref(false);
const currentInviteToken = ref('');
const dialogError = ref('');
const newPassword = ref('');
const selectedUser = ref<OrgUser | null>(null);
const snackbar = ref(false);
const snackbarText = ref('');

const pendingUsers = computed(() => users.value.filter(u => u.isPending));

const form = ref({ fullName: '', email: '', password: '', role: 'member' });

const roleOptions = [
  { label: 'Nhân viên', value: 'member' },
  { label: 'Quản trị viên', value: 'admin' },
];

const headers = [
  { title: 'Họ tên', key: 'fullName', sortable: true },
  { title: 'Email', key: 'email' },
  { title: 'Vai trò', key: 'role', sortable: true },
  { title: 'Trạng thái', key: 'isActive', sortable: true },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

function roleColor(role: string) {
  if (role === 'owner') return 'primary';
  if (role === 'admin') return 'info';
  return 'default';
}

function roleLabel(role: string) {
  if (role === 'owner') return 'Chủ sở hữu';
  if (role === 'admin') return 'Quản trị viên';
  return 'Nhân viên';
}

async function handleGenerateToken() {
  generatingToken.value = true;
  try {
    currentInviteToken.value = await authStore.generateInviteToken();
    snackbarText.value = 'Đã tạo mã tham gia thành công';
    snackbar.value = true;
  } catch (err) {
    snackbarText.value = 'Lỗi khi tạo mã';
    snackbar.value = true;
  } finally {
    generatingToken.value = false;
  }
}

function copyInviteToken() {
  if (!currentInviteToken.value) return;
  navigator.clipboard.writeText(currentInviteToken.value);
  snackbarText.value = 'Đã sao chép token tham gia!';
  snackbar.value = true;
}

function scrollToPending() {
  // Simple scroll to the first pending user in table (could be improved with a filter)
  window.scrollTo({ top: 400, behavior: 'smooth' });
}

async function handleApprove(user: OrgUser) {
  saving.value = true;
  const res = await approveUser(user.id);
  saving.value = false;
  if (res.ok) {
    snackbarText.value = `Đã chấp nhận nhân viên ${user.fullName}`;
    snackbar.value = true;
  } else {
    snackbarText.value = res.error || 'Lỗi khi phê duyệt';
    snackbar.value = true;
  }
}

function openCreate() {
  form.value = { fullName: '', email: '', password: '', role: 'member' };
  dialogError.value = '';
  showCreate.value = true;
}

function openEdit(user: OrgUser) {
  selectedUser.value = user;
  form.value = { fullName: user.fullName, email: user.email, password: '', role: user.role };
  dialogError.value = '';
  showEdit.value = true;
}

function openPassword(user: OrgUser) {
  selectedUser.value = user;
  newPassword.value = '';
  dialogError.value = '';
  showPassword.value = true;
}

function confirmToggleStatus(user: OrgUser) {
  selectedUser.value = user;
  showToggleStatus.value = true;
}

function confirmRealDelete(user: OrgUser) {
  selectedUser.value = user;
  showRealDelete.value = true;
}

async function handleCreate() {
  saving.value = true;
  dialogError.value = '';
  const res = await createUser(form.value);
  saving.value = false;
  if (res.ok) { showCreate.value = false; } else { dialogError.value = res.error || ''; }
}

async function handleUpdate() {
  if (!selectedUser.value) return;
  saving.value = true;
  dialogError.value = '';
  const res = await updateUser(selectedUser.value.id, { fullName: form.value.fullName, email: form.value.email, role: form.value.role });
  saving.value = false;
  if (res.ok) { showEdit.value = false; } else { dialogError.value = res.error || ''; }
}

async function handlePassword() {
  if (!selectedUser.value) return;
  saving.value = true;
  dialogError.value = '';
  const res = await resetPassword(selectedUser.value.id, newPassword.value);
  saving.value = false;
  if (res.ok) { showPassword.value = false; } else { dialogError.value = res.error || ''; }
}

async function handleToggleStatus() {
  if (!selectedUser.value) return;
  saving.value = true;
  const res = await updateUser(selectedUser.value.id, { isActive: !selectedUser.value.isActive });
  saving.value = false;
  if (res.ok) { showToggleStatus.value = false; }
}

async function handleRealDelete() {
  if (!selectedUser.value) return;
  saving.value = true;
  const res = await deleteUser(selectedUser.value.id);
  saving.value = false;
  if (res.ok) { showRealDelete.value = false; }
}

onMounted(fetchUsers);
</script>
