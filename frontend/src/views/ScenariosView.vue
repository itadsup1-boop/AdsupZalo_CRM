<template>
  <v-container fluid>
    <!-- Header -->
    <v-row class="mb-2">
      <v-col cols="12" class="d-flex justify-space-between align-center">
        <h2>Quản lý kịch bản gửi tin</h2>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">Tạo kịch bản</v-btn>
      </v-col>
    </v-row>

    <!-- Tabs: Scenarios & Send History -->
    <v-tabs v-model="activeTab" class="mb-4" color="primary">
      <v-tab value="scenarios">Danh sách kịch bản</v-tab>
      <v-tab value="history" @click="fetchLogs">Lịch sử gửi tin</v-tab>
    </v-tabs>

    <v-window v-model="activeTab">
      <v-window-item value="scenarios">
        <!-- Category Filter Chips -->
        <v-row class="mb-4">
          <v-col cols="12">
            <v-chip-group v-model="selectedCategoryFilter" mandatory>
              <v-chip
                v-for="cat in categoryFilters"
                :key="cat.value"
                :value="cat.value"
                variant="tonal"
                color="primary"
                size="small"
              >
                <v-icon start size="16">{{ cat.icon }}</v-icon>
                {{ cat.label }}
              </v-chip>
            </v-chip-group>
          </v-col>
        </v-row>

        <!-- Data Table -->
        <v-row>
          <v-col cols="12">
            <v-card>
              <v-data-table
                :headers="headers"
                :items="filteredScenarios"
                :loading="loading"
                no-data-text="Không có kịch bản nào thuộc danh mục này"
                class="elevation-0"
              >
                <!-- Category Column -->
                <template v-slot:item.category="{ item }">
                  <v-chip
                    v-if="item.category"
                    :color="getCategoryInfo(item.category).color"
                    size="small"
                    variant="flat"
                  >
                    <v-icon start size="14">{{ getCategoryInfo(item.category).icon }}</v-icon>
                    {{ getCategoryInfo(item.category).label }}
                  </v-chip>
                  <span v-else class="text-grey text-caption">Chưa phân loại</span>
                </template>

                <!-- Trigger Tag Column -->
                <template v-slot:item.triggerTag="{ item }">
                  <v-chip v-if="item.triggerTag" :color="item.triggerTag.color" text-color="white" size="small">
                    {{ item.triggerTag.name }}
                  </v-chip>
                  <span v-else class="text-grey text-caption">Không có</span>
                </template>

                <!-- Steps Count Column -->
                <template v-slot:item.stepsCount="{ item }">
                  <v-chip variant="outlined" size="small" density="comfortable">
                    {{ item.steps ? item.steps.length : 0 }} bước
                  </v-chip>
                </template>

                <!-- Active Switch Column -->
                <template v-slot:item.isActive="{ item }">
                  <v-switch
                    v-model="item.isActive"
                    color="success"
                    hide-details
                    density="compact"
                    @change="toggleStatus(item)"
                  ></v-switch>
                </template>

                <!-- Actions Column -->
                <template v-slot:item.actions="{ item }">
                  <div class="d-flex align-center" style="gap: 4px;">
                    <v-btn icon="mdi-pencil" size="small" variant="text" color="primary" @click="openEditDialog(item.raw || item)"></v-btn>
                    <v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="deleteScenario((item.raw || item).id)"></v-btn>
                  </div>
                </template>
              </v-data-table>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>

      <v-window-item value="history">
        <!-- Logs Table -->
        <v-card>
          <v-data-table
            :headers="logHeaders"
            :items="logs"
            :loading="logsLoading"
            no-data-text="Không có lịch sử gửi tin nào"
            class="elevation-0"
          >
            <!-- Recipient contact name -->
            <template v-slot:item.contact="{ item }">
              <div v-if="item.contact" class="py-2">
                <div class="font-weight-medium text-subtitle-2">{{ item.contact.fullName || '—' }}</div>
                <div class="text-caption text-grey">{{ item.contact.phone || '—' }}</div>
              </div>
              <span v-else class="text-grey">—</span>
            </template>

            <!-- Scenario name / Step index -->
            <template v-slot:item.scenarioStep="{ item }">
              <div class="py-2">
                <div class="font-weight-medium text-subtitle-2">{{ item.scenario?.name || 'Chiến dịch' }}</div>
                <div class="text-caption text-grey" v-if="item.step">Nội dung mẫu: <span class="text-truncate d-inline-block" style="max-width: 150px; vertical-align: bottom;">{{ item.step.content }}</span></div>
              </div>
            </template>

            <!-- Message content -->
            <template v-slot:item.content="{ item }">
              <div class="text-truncate py-2" style="max-width: 300px; white-space: pre-line;" :title="item.content">
                {{ item.content }}
              </div>
            </template>

            <!-- Scheduled / Sent At -->
            <template v-slot:item.time="{ item }">
              <div class="py-2">
                <div class="text-caption text-grey">Hẹn gửi: {{ item.scheduledAt ? formatDateTime(item.scheduledAt) : '—' }}</div>
                <div v-if="item.sentAt" class="text-caption text-success font-weight-medium">Đã gửi: {{ formatDateTime(item.sentAt) }}</div>
              </div>
            </template>

            <!-- Status Column -->
            <template v-slot:item.status="{ item }">
              <div class="py-2">
                <v-chip
                  :color="item.status === 'sent' ? 'success' : item.status === 'failed' ? 'error' : 'warning'"
                  size="small"
                  variant="flat"
                  class="mb-1"
                >
                  {{ item.status === 'sent' ? 'Đã gửi' : item.status === 'failed' ? 'Thất bại' : 'Đang chờ' }}
                </v-chip>
                <div v-if="item.errorReason" class="text-caption text-error font-weight-medium" :title="item.errorReason" style="max-width: 180px; font-size: 0.75rem;">
                  Lỗi: {{ item.errorReason }}
                </div>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- Create/Edit Dialog -->
    <v-dialog v-model="dialog" max-width="800px" scrollable>
      <v-card class="pa-2">
        <v-card-title class="font-weight-bold">{{ isEdit ? 'Cập nhật kịch bản' : 'Tạo kịch bản mới' }}</v-card-title>
        <v-divider></v-divider>
        <v-card-text style="max-height: 70vh;">
          <v-text-field v-model="form.name" label="Tên kịch bản *" variant="outlined" density="compact" class="mb-2"></v-text-field>
          <v-textarea v-model="form.description" label="Mô tả kịch bản" rows="2" variant="outlined" density="compact" class="mb-2"></v-textarea>
          
          <v-row>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.category"
                :items="categories"
                item-title="label"
                item-value="value"
                label="Danh mục kịch bản"
                variant="outlined"
                density="compact"
                clearable
              ></v-select>
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.triggerTagId"
                :items="tags"
                item-title="name"
                item-value="id"
                label="Thẻ kích hoạt tự động (Tag)"
                variant="outlined"
                density="compact"
                clearable
              ></v-select>
            </v-col>
          </v-row>
          <v-row class="mt-0 mb-2">
            <v-col cols="12" class="d-flex align-center">
              <v-switch v-model="form.isActive" label="Kích hoạt kịch bản ngay" color="success" hide-details class="mt-n2"></v-switch>
            </v-col>
          </v-row>

          <v-divider class="my-4"></v-divider>
          <div class="d-flex justify-space-between align-center mb-3">
            <h3 class="text-subtitle-1 font-weight-bold">Danh sách các bước gửi tin</h3>
            <v-btn color="secondary" size="small" prepend-icon="mdi-plus" @click="addStep">Thêm bước</v-btn>
          </div>

          <v-card v-for="(step, index) in form.steps" :key="index" variant="outlined" class="mb-3 pa-3 position-relative">
            <div class="d-flex justify-space-between align-center mb-2">
              <span class="font-weight-bold">Bước {{ index + 1 }}</span>
              <v-btn icon="mdi-close" size="x-small" variant="text" color="error" @click="removeStep(index)"></v-btn>
            </div>

            <!-- Quick insert placeholders -->
            <div class="d-flex flex-wrap gap-1 mb-2 align-center">
              <span class="text-caption text-grey mr-2">Chèn nhanh:</span>
              <v-btn size="x-small" variant="tonal" color="primary" class="mr-1" @click="insertPlaceholder(index, '{{name}}')">
                + Tên khách
              </v-btn>
              <v-btn size="x-small" variant="tonal" color="primary" class="mr-1" @click="insertPlaceholder(index, '{{service}}')">
                + Dịch vụ quan tâm
              </v-btn>
              <v-btn size="x-small" variant="tonal" color="primary" class="mr-1" @click="insertPlaceholder(index, '{{branch}}')">
                + Cơ sở
              </v-btn>
              <v-btn size="x-small" variant="tonal" color="primary" class="mr-1" @click="insertPlaceholder(index, '{{phone}}')">
                + SĐT
              </v-btn>
            </div>

            <v-textarea v-model="step.content" label="Nội dung tin nhắn *" rows="3" variant="outlined" density="compact" class="mb-2" hide-details></v-textarea>
            
            <v-radio-group v-model="step.delayType" inline class="mb-2" hide-details>
              <v-radio label="Chờ theo thời gian (tương đối)" value="relative"></v-radio>
              <v-radio label="Chờ đến ngày giờ cụ thể (tuyệt đối)" value="absolute"></v-radio>
            </v-radio-group>

            <!-- Relative delay selector with value and unit -->
            <v-row v-if="step.delayType === 'relative' || !step.delayType" class="mt-n1 mb-1">
              <v-col cols="6">
                <v-text-field
                  v-model.number="step.delayValue"
                  label="Thời gian chờ"
                  type="number"
                  variant="outlined"
                  density="compact"
                  hide-details
                ></v-text-field>
              </v-col>
              <v-col cols="6">
                <v-select
                  v-model="step.delayUnit"
                  :items="[
                    { value: 'minutes', label: 'Phút' },
                    { value: 'hours', label: 'Giờ' },
                    { value: 'days', label: 'Ngày' }
                  ]"
                  item-title="label"
                  item-value="value"
                  label="Đơn vị"
                  variant="outlined"
                  density="compact"
                  hide-details
                ></v-select>
              </v-col>
            </v-row>

            <v-text-field
              v-if="step.delayType === 'absolute'"
              v-model="step.absoluteTime"
              type="datetime-local"
              variant="outlined"
              density="compact"
              label="Chọn ngày giờ gửi"
              class="mt-1"
              hide-details
            ></v-text-field>
          </v-card>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions class="px-6 py-3">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="dialog = false">Hủy</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!form.name.trim()" @click="saveScenario">Lưu kịch bản</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api';

const scenarios = ref<any[]>([]);
const tags = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);
const isEdit = ref(false);
const editId = ref('');

// Tab settings
const activeTab = ref('scenarios');
const logs = ref<any[]>([]);
const logsLoading = ref(false);

const logHeaders = [
  { title: 'Khách hàng', key: 'contact', sortable: false },
  { title: 'Kịch bản / Bước', key: 'scenarioStep', sortable: false },
  { title: 'Nội dung tin nhắn', key: 'content', sortable: false },
  { title: 'Thời gian', key: 'time', sortable: true },
  { title: 'Trạng thái', key: 'status', sortable: true },
];

// Category settings
const selectedCategoryFilter = ref('all');

const categories = [
  { value: 'new_inbox', label: 'Khách mới inbox', icon: 'mdi-email-outline', color: 'info' },
  { value: 'ask_price', label: 'Khách hỏi giá', icon: 'mdi-currency-usd', color: 'success' },
  { value: 'service_interest', label: 'Quan tâm dịch vụ', icon: 'mdi-heart-outline', color: 'teal' },
  { value: 'no_reply', label: 'Khách chưa phản hồi', icon: 'mdi-message-alert-outline', color: 'warning' },
  { value: 'booked', label: 'Khách đã đặt lịch', icon: 'mdi-calendar-check', color: 'purple' },
  { value: 'after_consult', label: 'Khách sau tư vấn', icon: 'mdi-account-voice', color: 'blue' }
];

const categoryFilters = computed(() => {
  return [
    { value: 'all', label: 'Tất cả', icon: 'mdi-format-list-bulleted' },
    ...categories
  ];
});

function getCategoryInfo(catValue: string) {
  return categories.find(c => c.value === catValue) || {
    label: catValue || 'Chưa phân loại',
    icon: 'mdi-help-circle-outline',
    color: 'grey'
  };
}

const filteredScenarios = computed(() => {
  if (selectedCategoryFilter.value === 'all') return scenarios.value;
  return scenarios.value.filter(s => s.category === selectedCategoryFilter.value);
});

const headers = [
  { title: 'Tên kịch bản', key: 'name', sortable: true },
  { title: 'Danh mục', key: 'category', sortable: true },
  { title: 'Thẻ kích hoạt', key: 'triggerTag', sortable: true },
  { title: 'Số bước', key: 'stepsCount', sortable: false },
  { title: 'Trạng thái', key: 'isActive', sortable: true },
  { title: 'Thao tác', key: 'actions', sortable: false }
];

const form = ref({
  name: '',
  description: '',
  category: null as string | null,
  triggerTagId: null as string | null,
  isActive: true,
  steps: [] as Array<{
    content: string;
    delayType: string;
    delayMinutes: number;
    delayValue?: number;
    delayUnit?: string;
    absoluteTime?: string;
    orderIndex: number;
  }>
});

const formatToLocalDatetime = (dateString: string) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const formatDateTime = (dateString: string) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString('vi-VN');
};

const openCreateDialog = () => {
  isEdit.value = false;
  editId.value = '';
  form.value = {
    name: '',
    description: '',
    category: null,
    triggerTagId: null,
    isActive: true,
    steps: []
  };
  dialog.value = true;
};

const openEditDialog = (item: any) => {
  isEdit.value = true;
  editId.value = item.id;
  form.value = {
    name: item.name,
    description: item.description || '',
    category: item.category || null,
    triggerTagId: item.triggerTagId,
    isActive: item.isActive,
    steps: item.steps ? item.steps.map((s: any) => {
      let unit = 'minutes';
      let val = s.delayMinutes || 0;
      if (val > 0 && val % 1440 === 0) {
        unit = 'days';
        val = val / 1440;
      } else if (val > 0 && val % 60 === 0) {
        unit = 'hours';
        val = val / 60;
      }
      return {
        content: s.content,
        delayType: s.delayType || 'relative',
        delayMinutes: s.delayMinutes || 0,
        delayValue: val,
        delayUnit: unit,
        absoluteTime: s.absoluteTime ? formatToLocalDatetime(s.absoluteTime) : '',
        orderIndex: s.orderIndex
      };
    }) : []
  };
  dialog.value = true;
};

const addStep = () => {
  form.value.steps.push({
    content: '',
    delayType: 'relative',
    delayMinutes: 0,
    delayValue: 10,
    delayUnit: 'minutes',
    absoluteTime: '',
    orderIndex: form.value.steps.length
  });
};

const removeStep = (index: number) => {
  form.value.steps.splice(index, 1);
  form.value.steps.forEach((s, idx) => s.orderIndex = idx);
};

const insertPlaceholder = (index: number, placeholder: string) => {
  const step = form.value.steps[index];
  if (!step) return;
  if (step.content === undefined || step.content === null) {
    step.content = '';
  }
  step.content += placeholder;
};

const fetchScenarios = async () => {
  loading.value = true;
  try {
    const res = await api.get('/scenarios');
    scenarios.value = res.data.scenarios || [];
  } catch (error) {
    console.error('Lỗi tải kịch bản', error);
  } finally {
    loading.value = false;
  }
};

const fetchLogs = async () => {
  logsLoading.value = true;
  try {
    const res = await api.get('/scenarios/scheduled-logs');
    logs.value = res.data.logs || [];
  } catch (error) {
    console.error('Lỗi tải lịch sử gửi tin', error);
  } finally {
    logsLoading.value = false;
  }
};

const fetchTags = async () => {
  try {
    const res = await api.get('/tags');
    tags.value = res.data.tags || [];
  } catch (error) {
    console.error('Lỗi tải danh sách thẻ', error);
  }
};

const saveScenario = async () => {
  try {
    const payload = {
      ...form.value,
      steps: form.value.steps.map((s: any) => {
        const val = Number(s.delayValue) || 0;
        const unit = s.delayUnit || 'minutes';
        let delayMinutes = val;
        if (unit === 'days') delayMinutes = val * 1440;
        else if (unit === 'hours') delayMinutes = val * 60;
        
        return {
          content: s.content,
          delayType: s.delayType || 'relative',
          delayMinutes: delayMinutes,
          absoluteTime: s.delayType === 'absolute' && s.absoluteTime ? new Date(s.absoluteTime).toISOString() : null,
          orderIndex: s.orderIndex
        };
      })
    };
    if (isEdit.value) {
      await api.put(`/scenarios/${editId.value}`, payload);
    } else {
      await api.post('/scenarios', payload);
    }
    dialog.value = false;
    fetchScenarios();
  } catch (error) {
    console.error('Lỗi lưu kịch bản', error);
  }
};

const toggleStatus = async (item: any) => {
  try {
    await api.put(`/scenarios/${item.id}`, {
      isActive: item.isActive
    });
  } catch (error) {
    console.error('Lỗi cập nhật trạng thái kịch bản', error);
    item.isActive = !item.isActive;
  }
};

const deleteScenario = async (id: string) => {
  if (!confirm('Bạn có chắc chắn muốn xóa kịch bản này?')) return;
  try {
    await api.delete(`/scenarios/${id}`);
    fetchScenarios();
  } catch (error) {
    console.error('Lỗi xóa kịch bản', error);
  }
};

onMounted(() => {
  fetchScenarios();
  fetchTags();
});
</script>

<style scoped>
</style>
