<template>
  <v-container fluid>
    <v-row>
      <v-col cols="12" class="d-flex justify-space-between align-center">
        <h2>Quản lý kịch bản gửi tin</h2>
        <v-btn color="primary" @click="openCreateDialog">Tạo kịch bản</v-btn>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-data-table
          :headers="headers"
          :items="scenarios"
          :loading="loading"
          class="elevation-1"
        >
          <template v-slot:item.isActive="{ item }">
            <v-switch
              v-model="item.isActive"
              color="success"
              hide-details
              @change="toggleStatus(item)"
            ></v-switch>
          </template>
          <template v-slot:item.triggerTag="{ item }">
            <v-chip v-if="item.triggerTag" :color="item.triggerTag.color" text-color="white">{{ item.triggerTag.name }}</v-chip>
            <span v-else class="text-grey">Không có</span>
          </template>
          <template v-slot:item.stepsCount="{ item }">
            {{ item.steps ? item.steps.length : 0 }} bước
          </template>
          <template v-slot:item.actions="{ item }">
            <v-btn icon="mdi-pencil" size="small" variant="text" color="primary" @click="openEditDialog(item)"></v-btn>
            <v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="deleteScenario(item.id)"></v-btn>
          </template>
        </v-data-table>
      </v-col>
    </v-row>

    <!-- Dialog Tạo/Sửa Kịch Bản -->
    <v-dialog v-model="dialog" max-width="800px" scrollable>
      <v-card>
        <v-card-title>{{ isEdit ? 'Sửa kịch bản' : 'Tạo kịch bản mới' }}</v-card-title>
        <v-divider></v-divider>
        <v-card-text style="max-height: 70vh;">
          <v-text-field v-model="form.name" label="Tên kịch bản" class="mb-2"></v-text-field>
          <v-textarea v-model="form.description" label="Mô tả" rows="2" class="mb-2"></v-textarea>
          
          <v-row>
            <v-col cols="6">
              <v-select
                v-model="form.triggerTagId"
                :items="tags"
                item-title="name"
                item-value="id"
                label="Thẻ kích hoạt tự động (Không bắt buộc)"
                clearable
              ></v-select>
            </v-col>
            <v-col cols="6">
              <v-switch v-model="form.isActive" label="Kích hoạt kịch bản" color="success" class="mt-2"></v-switch>
            </v-col>
          </v-row>

          <v-divider class="my-4"></v-divider>
          <div class="d-flex justify-space-between align-center mb-3">
            <h3>Danh sách các bước gửi tin</h3>
            <v-btn color="secondary" size="small" prepend-icon="mdi-plus" @click="addStep">Thêm bước</v-btn>
          </div>

          <v-card v-for="(step, index) in form.steps" :key="index" variant="outlined" class="mb-3 pa-3 position-relative">
            <div class="d-flex justify-space-between align-center mb-2">
              <span class="font-weight-bold">Bước {{ index + 1 }}</span>
              <v-btn icon="mdi-close" size="x-small" variant="text" color="error" @click="removeStep(index)"></v-btn>
            </div>
            <v-textarea v-model="step.content" label="Nội dung tin nhắn" rows="3" class="mb-2"></v-textarea>
            
            <v-radio-group v-model="step.delayType" inline class="mb-2">
              <v-radio label="Chờ theo phút" value="relative"></v-radio>
              <v-radio label="Chờ đến ngày giờ" value="absolute"></v-radio>
            </v-radio-group>

            <v-text-field 
              v-if="step.delayType === 'relative' || !step.delayType"
              v-model.number="step.delayMinutes" 
              label="Thời gian chờ gửi (phút)" 
              type="number" 
              suffix="phút"
            ></v-text-field>

            <v-text-field
              v-if="step.delayType === 'absolute'"
              v-model="step.absoluteTime"
              type="datetime-local"
              label="Chọn ngày giờ"
            ></v-text-field>
          </v-card>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey" text @click="dialog = false">Hủy</v-btn>
          <v-btn color="primary" @click="saveScenario">Lưu kịch bản</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api';

const scenarios = ref<any[]>([]);
const tags = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);
const isEdit = ref(false);
const editId = ref('');

const headers = [
  { title: 'Tên kịch bản', key: 'name' },
  { title: 'Thẻ kích hoạt', key: 'triggerTag' },
  { title: 'Số bước', key: 'stepsCount' },
  { title: 'Trạng thái', key: 'isActive' },
  { title: 'Thao tác', key: 'actions', sortable: false }
];

const form = ref({
  name: '',
  description: '',
  triggerTagId: null as string | null,
  isActive: true,
  steps: [] as Array<{ content: string; delayType: string; delayMinutes: number; absoluteTime?: string; orderIndex: number }>
});

const formatToLocalDatetime = (dateString: string) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const openCreateDialog = () => {
  isEdit.value = false;
  editId.value = '';
  form.value = {
    name: '',
    description: '',
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
    triggerTagId: item.triggerTagId,
    isActive: item.isActive,
    steps: item.steps ? item.steps.map((s: any) => ({
      content: s.content,
      delayType: s.delayType || 'relative',
      delayMinutes: s.delayMinutes || 0,
      absoluteTime: s.absoluteTime ? formatToLocalDatetime(s.absoluteTime) : '',
      orderIndex: s.orderIndex
    })) : []
  };
  dialog.value = true;
};

const addStep = () => {
  form.value.steps.push({
    content: '',
    delayType: 'relative',
    delayMinutes: 0,
    absoluteTime: '',
    orderIndex: form.value.steps.length
  });
};

const removeStep = (index: number) => {
  form.value.steps.splice(index, 1);
  form.value.steps.forEach((s, idx) => s.orderIndex = idx);
};

const fetchScenarios = async () => {
  loading.value = true;
  try {
    const res = await api.get('/scenarios');
    scenarios.value = res.data.scenarios;
  } catch (error) {
    console.error('Lỗi tải kịch bản', error);
  } finally {
    loading.value = false;
  }
};

const fetchTags = async () => {
  try {
    const res = await api.get('/tags');
    tags.value = res.data.tags;
  } catch (error) {
    console.error('Lỗi tải danh sách thẻ', error);
  }
};

const saveScenario = async () => {
  try {
    if (isEdit.value) {
      await api.put(`/scenarios/${editId.value}`, form.value);
    } else {
      await api.post('/scenarios', form.value);
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
