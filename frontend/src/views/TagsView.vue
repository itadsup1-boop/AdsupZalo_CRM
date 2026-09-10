<template>
  <v-container fluid>
    <v-row>
      <v-col cols="12" class="d-flex justify-space-between align-center">
        <h2>Quản lý thẻ khách hàng</h2>
        <v-btn color="primary" @click="openCreateDialog">Thêm thẻ mới</v-btn>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-data-table
          :headers="headers"
          :items="tags"
          :loading="loading"
          class="elevation-1"
        >
          <template v-slot:item.color="{ item }">
            <v-chip :color="item.color" text-color="white">{{ item.color }}</v-chip>
          </template>
          <template v-slot:item.isActive="{ item }">
            <v-switch
              v-model="item.isActive"
              color="success"
              hide-details
              @change="toggleStatus(item)"
            ></v-switch>
          </template>
          <template v-slot:item.actions="{ item }">
            <v-btn icon="mdi-pencil" size="small" variant="text" color="primary" @click="openEditDialog(item.raw || item)"></v-btn>
            <v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="deleteTag((item.raw || item).id)"></v-btn>
          </template>
        </v-data-table>
      </v-col>
    </v-row>

    <!-- Dialog Thêm/Sửa Thẻ -->
    <v-dialog v-model="dialog" max-width="500px">
      <v-card>
        <v-card-title>{{ isEdit ? 'Sửa thẻ khách hàng' : 'Thêm thẻ mới' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.name" label="Tên thẻ"></v-text-field>
          <v-text-field v-model="form.color" label="Màu sắc (HEX)" type="color"></v-text-field>
          <v-textarea v-model="form.description" label="Mô tả"></v-textarea>
          <v-switch v-model="form.isActive" label="Hoạt động" color="success"></v-switch>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey" text @click="dialog = false">Hủy</v-btn>
          <v-btn color="primary" @click="saveTag">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api';

const tags = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);
const isEdit = ref(false);
const editId = ref('');

const headers = [
  { title: 'Tên thẻ', key: 'name' },
  { title: 'Màu sắc', key: 'color' },
  { title: 'Mô tả', key: 'description' },
  { title: 'Trạng thái', key: 'isActive' },
  { title: 'Thao tác', key: 'actions', sortable: false }
];

const form = ref({ name: '', color: '#3B82F6', description: '', isActive: true });

const openCreateDialog = () => {
  isEdit.value = false;
  editId.value = '';
  form.value = { name: '', color: '#3B82F6', description: '', isActive: true };
  dialog.value = true;
};

const openEditDialog = (item: any) => {
  isEdit.value = true;
  editId.value = item.id;
  form.value = {
    name: item.name,
    color: item.color,
    description: item.description || '',
    isActive: item.isActive
  };
  dialog.value = true;
};

const fetchTags = async () => {
  loading.value = true;
  try {
    const res = await api.get('/tags');
    tags.value = res.data.tags;
  } catch (error) {
    console.error('Lỗi tải thẻ', error);
  } finally {
    loading.value = false;
  }
};

const saveTag = async () => {
  try {
    if (isEdit.value) {
      await api.put(`/tags/${editId.value}`, form.value);
    } else {
      await api.post('/tags', form.value);
    }
    dialog.value = false;
    fetchTags();
  } catch (error) {
    console.error('Lỗi lưu thẻ', error);
  }
};

const toggleStatus = async (item: any) => {
  try {
    await api.put(`/tags/${item.id}`, {
      isActive: item.isActive
    });
  } catch (error) {
    console.error('Lỗi cập nhật trạng thái', error);
    // revert
    item.isActive = !item.isActive;
  }
};

const deleteTag = async (id: string) => {
  if (!confirm('Bạn có chắc chắn muốn xóa thẻ này?')) return;
  try {
    await api.delete(`/tags/${id}`);
    fetchTags();
  } catch (error) {
    console.error('Lỗi xóa thẻ', error);
  }
};

onMounted(() => {
  fetchTags();
});
</script>
