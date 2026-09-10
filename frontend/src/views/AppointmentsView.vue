<template>
  <div class="appointments-page">
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="text-h5 mr-4">Lịch hẹn</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="showCreateDialog = true">Tạo lịch hẹn</v-btn>
    </div>

    <v-sheet class="pa-3 mb-4" border rounded>
      <v-row dense>
        <v-col cols="12" md="3">
          <v-text-field v-model="filters.q" label="Tìm tên, SĐT, dịch vụ" prepend-inner-icon="mdi-magnify" clearable hide-details @keyup.enter="fetchAppointments" />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model="filters.from" label="Từ ngày" type="date" hide-details />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model="filters.to" label="Đến ngày" type="date" hide-details />
        </v-col>
        <v-col cols="12" md="2">
          <v-select v-model="filters.branchId" :items="teams" item-title="name" item-value="id" label="Cơ sở" clearable hide-details />
        </v-col>
        <v-col cols="12" md="2">
          <v-select v-model="filters.status" :items="APPOINTMENT_STATUS_OPTIONS" item-title="text" item-value="value" label="Trạng thái" clearable hide-details />
        </v-col>
        <v-col cols="12" md="1" class="d-flex">
          <v-btn block color="primary" variant="tonal" prepend-icon="mdi-filter" @click="fetchAppointments">Lọc</v-btn>
        </v-col>
      </v-row>
    </v-sheet>

    <v-data-table :headers="headers" :items="appointments" :loading="loading" item-value="id" hover>
      <template #item.appointmentDate="{ item }">
        <div class="font-weight-medium">{{ formatDateTime(item.appointmentDate) }}</div>
        <div class="text-caption text-grey">{{ item.appointmentTime }}</div>
      </template>

      <template #item.customer="{ item }">
        <div>{{ item.customerName || item.contact?.fullName || item.contact?.crmName || '—' }}</div>
        <div class="text-caption text-grey">{{ item.phone || item.contact?.phone || '' }}</div>
      </template>

      <template #item.serviceName="{ item }">
        {{ item.serviceName || item.type || '—' }}
      </template>

      <template #item.branch="{ item }">
        {{ item.branch?.name || '—' }}
      </template>

      <template #item.status="{ item }">
        <v-select
          :model-value="item.status"
          :items="APPOINTMENT_STATUS_OPTIONS"
          item-title="text"
          item-value="value"
          density="compact"
          hide-details
          variant="outlined"
          style="min-width: 150px"
          @update:model-value="(status) => onStatusChange(item.id, status as string)"
        >
          <template #selection="{ item: statusItem }">
            <v-chip :color="statusChipColor(String(statusItem.value))" size="small" variant="tonal">{{ statusLabel(String(statusItem.value)) }}</v-chip>
          </template>
        </v-select>
      </template>

      <template #item.reminders="{ item }">
        <div class="text-caption">24h: {{ item.reminder24hSentAt ? 'Đã gửi' : 'Chưa' }}</div>
        <div class="text-caption">2h: {{ item.reminder2hSentAt ? 'Đã gửi' : 'Chưa' }}</div>
      </template>

      <template #item.note="{ item }">
        <span class="text-body-2">{{ item.note || item.notes || '—' }}</span>
      </template>

      <template #item.actions="{ item }">
        <div class="d-flex gap-1">
          <v-btn size="small" variant="text" color="success" icon="mdi-check" title="Hoàn thành" @click.stop="onStatusChange(item.id, 'completed')" />
          <v-btn size="small" variant="text" color="grey" icon="mdi-cancel" title="Huỷ" @click.stop="onCancel(item.id)" />
        </div>
      </template>
    </v-data-table>

    <v-dialog v-model="showCreateDialog" max-width="640" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          Tạo lịch hẹn
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="showCreateDialog = false" />
        </v-card-title>
        <v-divider />
        <v-card-text>
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field v-model="createForm.customerName" label="Tên khách hàng" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="createForm.phone" label="Số điện thoại" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-combobox v-model="createForm.serviceName" :items="products.map(p => p.name)" label="Dịch vụ" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select v-model="createForm.branchId" :items="teams" item-title="name" item-value="id" label="Cơ sở" clearable />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="createForm.date" label="Ngày hẹn" type="date" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="createForm.time" label="Giờ hẹn" type="time" />
            </v-col>
            <v-col cols="12">
              <v-textarea v-model="createForm.note" label="Ghi chú" rows="2" auto-grow />
            </v-col>
          </v-row>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCreateDialog = false">Huỷ</v-btn>
          <v-btn color="primary" :loading="saving" @click="onCreateSave">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '@/api/index';
import {
  APPOINTMENT_STATUS_OPTIONS,
  statusChipColor,
  statusLabel,
  useAppointments,
} from '@/composables/use-appointments';

interface Team { id: string; name: string }
interface Product { id: string; name: string }

const {
  appointments,
  loading,
  saving,
  filters,
  fetchAppointments,
  createAppointment,
  updateAppointment,
  cancelAppointment,
} = useAppointments();

const teams = ref<Team[]>([]);
const products = ref<Product[]>([]);
const showCreateDialog = ref(false);

const createForm = ref({
  customerName: '',
  phone: '',
  serviceName: '',
  branchId: '',
  date: '',
  time: '',
  note: '',
});

const headers = [
  { title: 'Thời gian', key: 'appointmentDate', sortable: true },
  { title: 'Khách hàng', key: 'customer', sortable: false },
  { title: 'Dịch vụ', key: 'serviceName', sortable: false },
  { title: 'Cơ sở', key: 'branch', sortable: false },
  { title: 'Trạng thái', key: 'status', sortable: false },
  { title: 'Nhắc lịch', key: 'reminders', sortable: false },
  { title: 'Ghi chú', key: 'note', sortable: false },
  { title: '', key: 'actions', sortable: false, width: '100px' },
];

function formatDateTime(date: string) {
  if (!date) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(date));
}

async function loadLookups() {
  const [teamRes, productRes] = await Promise.all([
    api.get('/teams'),
    api.get('/products'),
  ]);
  teams.value = teamRes.data.teams || [];
  products.value = productRes.data.data || [];
}

async function onStatusChange(id: string, status: string) {
  await updateAppointment(id, { status } as any);
  fetchAppointments();
}

async function onCancel(id: string) {
  await cancelAppointment(id);
  fetchAppointments();
}

async function onCreateSave() {
  const appointmentDate = createForm.value.date && createForm.value.time
    ? new Date(`${createForm.value.date}T${createForm.value.time}:00+07:00`).toISOString()
    : '';
  const result = await createAppointment({
    customerName: createForm.value.customerName,
    phone: createForm.value.phone,
    serviceName: createForm.value.serviceName,
    branchId: createForm.value.branchId || null,
    appointmentDate,
    note: createForm.value.note || null,
    source: 'manual',
    createdBy: 'staff',
  } as any);
  if (result) {
    showCreateDialog.value = false;
    createForm.value = { customerName: '', phone: '', serviceName: '', branchId: '', date: '', time: '', note: '' };
    fetchAppointments();
  }
}

onMounted(async () => {
  await Promise.all([loadLookups(), fetchAppointments()]);
});
</script>
