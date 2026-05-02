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
        <div class="d-flex align-center mb-4">
          <v-btn v-if="authStore.isAdmin" color="primary" prepend-icon="mdi-plus" @click="openCreate">
            Thêm nhân viên
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
              <v-chip :color="item.isActive ? 'success' : 'default'" size="small" variant="flat">
                {{ item.isActive ? 'Hoạt động' : 'Vô hiệu' }}
              </v-chip>
            </template>
              <template #item.actions="{ item }">
                <div class="d-flex align-center justify-end" style="gap: 4px;">
                  <v-btn v-if="authStore.isAdmin" icon size="small" variant="text" title="Chỉnh sửa" @click="openEdit(item)">
                    <v-icon>mdi-pencil</v-icon>
                  </v-btn>
                  <v-btn v-if="authStore.isAdmin" icon size="small" variant="text" title="Đặt lại mật khẩu" @click="openPassword(item)">
                    <v-icon>mdi-lock-reset</v-icon>
                  </v-btn>
                  <!-- Vô hiệu hóa / Kích hoạt -->
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
                  <!-- Xóa vĩnh viễn -->
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

        <!-- Delete Forever confirm dialog -->
        <v-dialog v-model="showRealDelete" max-width="400">
          <v-card>
            <v-card-title class="text-error">Xóa vĩnh viễn nhân viên</v-card-title>
            <v-card-text>
              Bạn có chắc muốn <strong>XÓA VĨNH VIỄN</strong> nhân viên "{{ selectedUser?.fullName }}"?
              <div class="text-caption text-error mt-2">
                * Hành động này không thể hoàn tác. Mọi dữ liệu liên quan đến tài khoản này sẽ bị xóa.
              </div>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showRealDelete = false">Hủy</v-btn>
              <v-btn color="error" variant="flat" :loading="saving" @click="handleRealDelete">Xóa vĩnh viễn</v-btn>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useUsers, type OrgUser } from '@/composables/use-users';
import { useAuthStore } from '@/stores/auth';
import TeamManagement from '@/components/settings/TeamManagement.vue';
import OrgSettings from '@/components/settings/OrgSettings.vue';

const { users, loading, error, fetchUsers, createUser, updateUser, resetPassword, deleteUser } = useUsers();
const authStore = useAuthStore();

const tab = ref('users');
const showCreate = ref(false);
const showEdit = ref(false);
const showPassword = ref(false);
const showToggleStatus = ref(false);
const showRealDelete = ref(false);
const saving = ref(false);
const dialogError = ref('');
const newPassword = ref('');
const selectedUser = ref<OrgUser | null>(null);

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
