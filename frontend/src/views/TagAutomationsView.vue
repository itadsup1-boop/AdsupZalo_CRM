<template>
  <div class="pa-4">
    <div class="d-flex justify-space-between align-center mb-6">
      <h2 class="text-h5 font-weight-bold">Automation Theo Thẻ</h2>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="dialog = true">Tạo Workflow</v-btn>
    </div>

    <v-card flat border>
      <v-data-table
        :headers="headers"
        :items="workflows"
        :loading="loading"
        hover
      >
        <template #item.status="{ item }">
          <v-chip
            :color="item.status === 'active' ? 'success' : item.status === 'paused' ? 'warning' : 'default'"
            size="small"
          >
            {{ item.status === 'active' ? 'Đang chạy' : item.status === 'paused' ? 'Tạm dừng' : 'Bản nháp' }}
          </v-chip>
        </template>
        <template #item.triggerTagId="{ item }">
          <v-chip v-if="item.triggerTag" size="small" :color="item.triggerTag.color || 'primary'" variant="flat">
            {{ item.triggerTag.name }}
          </v-chip>
          <span v-else class="text-caption text-grey">Chưa gán</span>
        </template>
        <template #item.actions="{ item }">
          <v-btn icon="mdi-sitemap" size="small" variant="text" color="info" @click="router.push(`/admin/tag-automations/${item.id}/builder`)" title="Thiết kế sơ đồ"></v-btn>
          <v-btn icon="mdi-pencil-outline" size="small" variant="text" color="primary" @click="editWorkflow(item)"></v-btn>
          <v-btn icon="mdi-play-pause" size="small" variant="text" color="warning" @click="toggleStatus(item)"></v-btn>
          <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" @click="deleteWorkflow(item.id)"></v-btn>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="dialog" max-width="600px">
      <v-card>
        <v-card-title>{{ isEditing ? 'Sửa Workflow' : 'Tạo Workflow Mới' }}</v-card-title>
        <v-card-text>
          <v-form @submit.prevent="saveWorkflow">
            <v-text-field v-model="form.name" label="Tên Workflow" required autofocus></v-text-field>
            <v-textarea v-model="form.description" label="Mô tả" rows="2"></v-textarea>
            
            <v-select
              v-model="form.triggerTagId"
              :items="tags"
              item-title="name"
              item-value="id"
              label="Tag kích hoạt"
              clearable
              hint="Khi khách hàng được gắn Tag này, Workflow sẽ bắt đầu chạy"
              persistent-hint
            ></v-select>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="dialog = false">Hủy</v-btn>
          <v-btn color="primary" @click="saveWorkflow">Lưu lại</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { api } from '@/api';

const router = useRouter();

const headers: any = [
  { title: 'Tên Workflow', key: 'name' },
  { title: 'Tag Kích Hoạt', key: 'triggerTagId' },
  { title: 'Khách Đang Chạy', key: '_count.runs', sortable: false },
  { title: 'Trạng thái', key: 'status' },
  { title: 'Thao tác', key: 'actions', sortable: false, align: 'end' },
];

const workflows = ref<any[]>([]);
const tags = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);
const isEditing = ref(false);

const form = ref({
  id: '',
  name: '',
  description: '',
  triggerTagId: null,
  status: 'draft',
});

async function fetchTags() {
  try {
    const { data } = await api.get('/tags');
    tags.value = data.tags || [];
  } catch (error) {
    console.error(error);
  }
}

async function fetchWorkflows() {
  loading.value = true;
  try {
    const { data } = await api.get('/automations/workflows');
    workflows.value = data.workflows || [];
  } catch (error) {
    toast.error('Lỗi khi tải danh sách');
  } finally {
    loading.value = false;
  }
}

function editWorkflow(item: any) {
  isEditing.value = true;
  form.value = { ...item };
  dialog.value = true;
}

async function saveWorkflow() {
  if (!form.value.name) return toast.error('Vui lòng nhập tên');
  try {
    if (isEditing.value) {
      await api.put(`/automations/workflows/${form.value.id}`, form.value);
      toast.success('Cập nhật thành công');
    } else {
      await api.post('/automations/workflows', form.value);
      toast.success('Tạo thành công');
    }
    dialog.value = false;
    fetchWorkflows();
  } catch (error: any) {
    toast.error(error.response?.data?.error || 'Lưu thất bại');
  }
}

async function toggleStatus(item: any) {
  const newStatus = item.status === 'active' ? 'paused' : 'active';
  try {
    await api.put(`/automations/workflows/${item.id}`, { status: newStatus });
    toast.success('Đã cập nhật trạng thái');
    fetchWorkflows();
  } catch (error) {
    toast.error('Cập nhật thất bại');
  }
}

async function deleteWorkflow(id: string) {
  if (!confirm('Bạn có chắc muốn xóa Workflow này? Mọi lịch sử chạy sẽ bị xóa.')) return;
  try {
    await api.delete(`/automations/workflows/${id}`);
    toast.success('Đã xóa');
    fetchWorkflows();
  } catch (error) {
    toast.error('Xóa thất bại');
  }
}

onMounted(() => {
  fetchWorkflows();
  fetchTags();
});
</script>
