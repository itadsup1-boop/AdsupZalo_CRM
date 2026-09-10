<template>
  <v-container fluid>
    <v-row>
      <v-col cols="12" class="d-flex justify-space-between align-center">
        <h2>Quản lý chiến dịch gửi tin</h2>
        <v-btn color="primary" @click="openCreateDialog">Tạo chiến dịch</v-btn>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-data-table
          :headers="headers"
          :items="campaigns"
          :loading="loading"
          class="elevation-1"
        >
          <template v-slot:item.status="{ item }">
            <v-chip :color="getStatusColor(item.status)" text-color="white">{{ item.status }}</v-chip>
          </template>
          <template v-slot:item.targetTags="{ item }">
            <v-chip v-for="tagId in item.targetTags" :key="tagId" size="small" class="mr-1" color="indigo" text-color="white">
              {{ getTagName(tagId) }}
            </v-chip>
            <span v-if="!item.targetTags || !item.targetTags.length" class="text-grey">Tất cả khách hàng</span>
          </template>
          <template v-slot:item.actions="{ item }">
            <v-btn v-if="item.status === 'draft' || item.status === 'paused'" icon="mdi-play" size="small" variant="text" color="success" @click="startCampaign((item.raw || item).id)"></v-btn>
            <v-btn v-if="item.status === 'running'" icon="mdi-pause" size="small" variant="text" color="warning" @click="pauseCampaign((item.raw || item).id)"></v-btn>
            <v-btn icon="mdi-pencil" size="small" variant="text" color="primary" @click="openEditDialog(item.raw || item)"></v-btn>
            <v-btn icon="mdi-delete" size="small" variant="text" color="error" @click="deleteCampaign((item.raw || item).id)"></v-btn>
          </template>
        </v-data-table>
      </v-col>
    </v-row>

    <!-- Dialog Tạo/Sửa Chiến Dịch -->
    <v-dialog v-model="dialog" max-width="600px">
      <v-card>
        <v-card-title>{{ isEdit ? 'Sửa chiến dịch' : 'Tạo chiến dịch mới' }}</v-card-title>
        <v-divider></v-divider>
        <v-card-text>
          <v-text-field v-model="form.name" label="Tên chiến dịch" class="mb-2"></v-text-field>
          
          <v-select
            v-model="form.scenarioId"
            :items="scenarios"
            item-title="name"
            item-value="id"
            label="Kịch bản gửi tin"
            class="mb-2"
          ></v-select>

          <v-select
            v-model="form.zaloAccountId"
            :items="zaloAccounts"
            item-title="displayName"
            item-value="id"
            label="Tài khoản Zalo gửi tin"
            class="mb-2"
          ></v-select>

          <v-select
            v-model="form.targetTags"
            :items="tags"
            item-title="name"
            item-value="id"
            label="Gửi đến khách hàng có thẻ (Bỏ trống để gửi tất cả)"
            multiple
            chips
            clearable
          ></v-select>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey" text @click="dialog = false">Hủy</v-btn>
          <v-btn color="primary" @click="saveCampaign">Lưu chiến dịch</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api';

const campaigns = ref<any[]>([]);
const scenarios = ref<any[]>([]);
const zaloAccounts = ref<any[]>([]);
const tags = ref<any[]>([]);
const loading = ref(false);
const dialog = ref(false);
const isEdit = ref(false);
const editId = ref('');

const headers = [
  { title: 'Tên chiến dịch', key: 'name' },
  { title: 'Kịch bản', key: 'scenario.name' },
  { title: 'Nick gửi', key: 'zaloAccount.displayName' },
  { title: 'Thẻ mục tiêu', key: 'targetTags' },
  { title: 'Trạng thái', key: 'status' },
  { title: 'Thao tác', key: 'actions', sortable: false }
];

const form = ref({
  name: '',
  scenarioId: '',
  zaloAccountId: '',
  targetTags: [] as string[]
});

const openCreateDialog = () => {
  isEdit.value = false;
  editId.value = '';
  form.value = {
    name: '',
    scenarioId: '',
    zaloAccountId: '',
    targetTags: []
  };
  dialog.value = true;
};

const openEditDialog = (item: any) => {
  isEdit.value = true;
  editId.value = item.id;
  form.value = {
    name: item.name,
    scenarioId: item.scenarioId,
    zaloAccountId: item.zaloAccountId,
    targetTags: item.targetTags || []
  };
  dialog.value = true;
};

const fetchCampaigns = async () => {
  loading.value = true;
  try {
    const res = await api.get('/campaigns');
    campaigns.value = res.data.campaigns;
  } catch (error) {
    console.error('Lỗi tải chiến dịch', error);
  } finally {
    loading.value = false;
  }
};

const fetchScenarios = async () => {
  try {
    const res = await api.get('/scenarios');
    scenarios.value = res.data.scenarios;
  } catch (error) {
    console.error('Lỗi tải kịch bản', error);
  }
};

const fetchZaloAccounts = async () => {
  try {
    const res = await api.get('/zalo-accounts');
    zaloAccounts.value = res.data.accounts || res.data;
  } catch (error) {
    console.error('Lỗi tải tài khoản Zalo', error);
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

const getTagName = (tagId: string) => {
  const t = tags.value.find((x: any) => x.id === tagId);
  return t ? t.name : tagId;
};

const getStatusColor = (status: string) => {
  if (status === 'draft') return 'grey';
  if (status === 'running') return 'success';
  if (status === 'paused') return 'warning';
  if (status === 'completed') return 'primary';
  return 'grey';
};

const saveCampaign = async () => {
  try {
    if (isEdit.value) {
      await api.put(`/campaigns/${editId.value}`, form.value);
    } else {
      await api.post('/campaigns', form.value);
    }
    dialog.value = false;
    fetchCampaigns();
  } catch (error) {
    console.error('Lỗi lưu chiến dịch', error);
  }
};

const startCampaign = async (id: string) => {
  try {
    await api.post(`/campaigns/${id}/start`, {});
    fetchCampaigns();
  } catch (error) {
    console.error('Lỗi bắt đầu chiến dịch', error);
  }
};

const pauseCampaign = async (id: string) => {
  try {
    await api.post(`/campaigns/${id}/pause`, {});
    fetchCampaigns();
  } catch (error) {
    console.error('Lỗi tạm dừng chiến dịch', error);
  }
};

const deleteCampaign = async (id: string) => {
  if (!confirm('Bạn có chắc chắn muốn xóa chiến dịch này?')) return;
  try {
    await api.delete(`/campaigns/${id}`);
    fetchCampaigns();
  } catch (error) {
    console.error('Lỗi xóa chiến dịch', error);
  }
};

onMounted(() => {
  fetchCampaigns();
  fetchScenarios();
  fetchZaloAccounts();
  fetchTags();
});
</script>
