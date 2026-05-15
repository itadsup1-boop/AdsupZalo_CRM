<template>
  <v-dialog v-model="show" max-width="680" persistent scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <span>{{ isNew ? 'Thêm khách hàng' : 'Chi tiết khách hàng' }}</span>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="close" />
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-row dense>
          <!-- CRM name (real name) -->
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.crmName" label="Tên CRM (tên thật)" hint="Dùng cho automation" persistent-hint />
          </v-col>

          <!-- Full name (Zalo display name) -->
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.fullName" label="Tên hiển thị Zalo" :rules="[required]" />
          </v-col>

          <!-- Phone -->
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.phone" label="Số điện thoại" />
          </v-col>

          <!-- Email -->
          <v-col cols="12" sm="6">
            <v-text-field v-model="form.email" label="Email" type="email" />
          </v-col>

          <!-- Source -->
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.source"
              :items="SOURCE_OPTIONS"
              item-title="text"
              item-value="value"
              label="Nguồn"
              clearable
            />
          </v-col>

          <!-- Status -->
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.status"
              :items="STATUS_OPTIONS"
              item-title="text"
              item-value="value"
              label="Trạng thái"
              clearable
            />
          </v-col>

          <!-- Next appointment date -->
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.nextAppointmentDate"
              label="Ngày tái khám"
              type="date"
            />
          </v-col>

          <!-- First contact date -->
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.firstContactDate"
              label="Ngày tiếp nhận"
              type="date"
            />
          </v-col>

          <!-- Zalo Labels (Phân loại) -->
          <v-col cols="12" sm="6">
            <div class="text-caption text-grey mb-1 ml-1 d-flex align-center">
              <v-icon size="14" class="mr-1">mdi-label-outline</v-icon>
              Phân loại (Zalo)
            </div>
            <v-menu v-model="showLabelMenu" :close-on-content-click="false" location="bottom start">
              <template #activator="{ props: menuProps }">
                <div 
                  v-bind="menuProps"
                  class="d-flex flex-wrap gap-1 pa-2 rounded cursor-pointer" 
                  style="border: 1px solid rgba(0,0,0,0.12); min-height: 40px; background: rgba(0,0,0,0.03);"
                >
                  <v-chip
                    v-for="tagText in form.tags"
                    :key="tagText"
                    size="x-small"
                    :color="getLabelColor(tagText)"
                    variant="elevated"
                    class="ma-0"
                    style="color: white; font-weight: 500;"
                    closable
                    @click:close.stop="removeTag(tagText)"
                  >
                    {{ tagText }}
                  </v-chip>
                  <div v-if="form.tags.length === 0" class="text-caption text-grey-lighten-1">Chọn phân loại...</div>
                  <v-spacer />
                  <v-icon size="20" color="grey">mdi-chevron-down</v-icon>
                </div>
              </template>
              <v-card width="280">
                <v-list density="compact" class="pa-0">
                  <v-list-subheader>Chọn phân loại Zalo</v-list-subheader>
                  <div v-if="loadingLabels" class="pa-4 d-flex justify-center">
                    <v-progress-circular indeterminate size="24" color="primary" />
                  </div>
                  <template v-else>
                    <v-list-item
                      v-for="label in availableLabels"
                      :key="label.id"
                      @click="toggleLabel(label.text)"
                    >
                      <template #prepend>
                        <v-checkbox-btn
                          :model-value="form.tags.includes(label.text)"
                          color="primary"
                          class="mr-1"
                          style="pointer-events: none;"
                        />
                        <div class="label-dot-small mr-2" :style="{ background: getZaloColor(label.color) }"></div>
                      </template>
                      <v-list-item-title class="text-body-2">{{ label.text }}</v-list-item-title>
                    </v-list-item>
                    <v-divider />
                    <v-list-item v-if="availableLabels.length === 0">
                      <v-list-item-title class="text-caption text-grey">Không có dữ liệu phân loại</v-list-item-title>
                    </v-list-item>
                  </template>
                </v-list>
              </v-card>
            </v-menu>
          </v-col>
          
          <!-- Assigned User -->
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.assignedUserId"
              :items="users"
              item-title="fullName"
              item-value="id"
              label="Nhân viên phụ trách"
              clearable
              :loading="usersLoading"
            />
          </v-col>

          <!-- Notes -->
          <v-col cols="12">
            <v-textarea
              v-model="form.notes"
              label="Ghi chú"
              rows="3"
              auto-grow
            />
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-btn
          v-if="!isNew"
          color="error"
          variant="text"
          :loading="deleting"
          @click="onDelete"
        >
          Xoá
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="close">Huỷ</v-btn>
        <v-btn color="primary" :loading="saving" @click="onSave">Lưu</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { api } from '@/api/index';
import type { Contact } from '@/composables/use-contacts';
import { SOURCE_OPTIONS, STATUS_OPTIONS, useContacts } from '@/composables/use-contacts';
import { useUsers } from '@/composables/use-users';

const props = defineProps<{
  modelValue: boolean;
  contact: Contact | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [contact: Contact];
  deleted: [id: string];
}>();

const { saving, deleting, createContact, updateContact, deleteContact } = useContacts();
const { users, fetchUsers, loading: usersLoading } = useUsers();

const availableLabels = ref<any[]>([]);
const loadingLabels = ref(false);
const showLabelMenu = ref(false);

async function fetchLabels() {
  // Try to get accountId from contact metadata or find a conversation
  let accountId = (props.contact as any)?.zaloAccountId;
  
  if (!accountId && props.contact?.id) {
    try {
      // Find any conversation for this contact to get the account context
      const res = await api.get('/conversations', { params: { contactId: props.contact.id, limit: 1 } });
      if (res.data.conversations?.length > 0) {
        accountId = res.data.conversations[0].zaloAccountId;
      }
    } catch (e) {
      console.error('Failed to find conversation for contact labels', e);
    }
  }

  // Fallback: If still no accountId, fetch the first available Zalo account
  if (!accountId) {
    try {
      const res = await api.get('/zalo-accounts');
      if (res.data && res.data.length > 0) {
        accountId = res.data[0].id;
      }
    } catch (e) {
      console.error('Failed to fetch fallback Zalo account for labels', e);
    }
  }

  if (!accountId) {
    availableLabels.value = [];
    return;
  }
  loadingLabels.value = true;
  try {
    const res = await api.get(`/zalo-accounts/${accountId}/labels`);
    availableLabels.value = res.data.labels || [];
  } catch (e) {
    console.error('Failed to fetch labels in dialog', e);
  } finally {
    loadingLabels.value = false;
  }
}

onMounted(() => {
  fetchUsers();
  fetchLabels();
});

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    fetchLabels();
  }
});


function getZaloColor(c: string | number) {
  const map: Record<string, string> = {
    '1': '#F44336', '2': '#E91E63', '3': '#FF9800', '4': '#FFEB3B',
    '5': '#4CAF50', '6': '#2196F3', '7': '#9C27B0', '8': '#607D8B', '9': '#009688'
  };
  return map[String(c)] || '#9E9E9E';
}

function getLabelColor(text: string) {
  const label = availableLabels.value.find(l => l.text === text);
  return label ? getZaloColor(label.color) : 'primary';
}

function toggleLabel(text: string) {
  const idx = form.value.tags.indexOf(text);
  if (idx === -1) {
    form.value.tags.push(text);
  } else {
    form.value.tags.splice(idx, 1);
  }
}

function removeTag(text: string) {
  const idx = form.value.tags.indexOf(text);
  if (idx !== -1) form.value.tags.splice(idx, 1);
}

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isNew = computed(() => !props.contact?.id);

interface FormState {
  fullName: string;
  crmName: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  nextAppointmentDate: string;
  firstContactDate: string;
  notes: string;
  tags: string[];
  assignedUserId: string | null;
}

const form = ref<FormState>(emptyForm());

function emptyForm(): FormState {
  return {
    fullName: '',
    crmName: '',
    phone: '',
    email: '',
    source: '',
    status: '',
    nextAppointmentDate: '',
    firstContactDate: '',
    notes: '',
    tags: [],
    assignedUserId: null,
  };
}

watch(() => props.contact, (c) => {
  if (c) {
    form.value = {
      fullName: c.fullName ?? '',
      crmName: c.crmName ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      source: c.source ?? '',
      status: c.status ?? '',
      nextAppointmentDate: c.nextAppointment
        ? new Date(c.nextAppointment).toISOString().split('T')[0]
        : '',
      firstContactDate: c.firstContactDate
        ? new Date(c.firstContactDate).toISOString().split('T')[0]
        : '',
      notes: c.notes ?? '',
      tags: c.tags ?? [],
      assignedUserId: c.assignedUserId ?? null,
    };
  } else {
    form.value = emptyForm();
  }
}, { immediate: true, deep: true });

function required(v: string) {
  return !!v || 'Bắt buộc';
}

async function onSave() {
  const payload: Partial<Contact> = {
    fullName: form.value.fullName || null,
    crmName: form.value.crmName || null,
    phone: form.value.phone || null,
    email: form.value.email || null,
    source: form.value.source || null,
    status: form.value.status || null,
    nextAppointment: form.value.nextAppointmentDate
      ? new Date(form.value.nextAppointmentDate + 'T00:00:00').toISOString()
      : null,
    firstContactDate: form.value.firstContactDate
      ? new Date(form.value.firstContactDate + 'T00:00:00').toISOString()
      : null,
    notes: form.value.notes || null,
    tags: form.value.tags,
    assignedUserId: form.value.assignedUserId || null,
  };

  let result: Contact | null;
  if (isNew.value) {
    result = await createContact(payload);
  } else {
    result = await updateContact(props.contact!.id, payload);
  }
  if (result) {
    emit('saved', result);
    close();
  }
}

async function onDelete() {
  if (!props.contact?.id) return;
  const ok = await deleteContact(props.contact.id);
  if (ok) {
    emit('deleted', props.contact.id);
    close();
  }
}

function close() {
  emit('update:modelValue', false);
}
</script>

<style scoped>
.label-dot-small {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cursor-pointer {
  cursor: pointer;
}
</style>
