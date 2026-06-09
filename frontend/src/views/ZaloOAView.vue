<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/index';
import { toast } from 'vue-sonner';

const loading = ref(false);
const accounts = ref<any[]>([]);

const showDialog = ref(false);
const connectForm = ref({ appId: '', appSecret: '' });
const isConnecting = ref(false);

const fetchAccounts = async () => {
  loading.value = true;
  try {
    const res = await api.get('/zalo-oa/accounts');
    accounts.value = res.data;
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to fetch Zalo OA accounts');
  } finally {
    loading.value = false;
  }
};

const openConnectDialog = () => {
  connectForm.value = { appId: '1570964420323611634', appSecret: '' };
  showDialog.value = true;
};

const handleConnect = async () => {
  if (!connectForm.value.appId || !connectForm.value.appSecret) {
    toast.error('Vui lòng nhập đầy đủ App ID và App Secret');
    return;
  }
  
  isConnecting.value = true;
  try {
    // 1. Create account in DB
    const createRes = await api.post('/zalo-oa/accounts', connectForm.value);
    const accountId = createRes.data.id;
    
    // 2. Get authorize URL from backend (which generates the correct state)
    const authRes = await api.get(`/zalo-oa/authorize/${accountId}`);
    
    // 3. Redirect to Zalo
    window.location.href = authRes.data.authUrl;
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Lỗi khi tạo kết nối');
    isConnecting.value = false;
  }
};

const handleDisconnect = async (id: string) => {
  if (!confirm('Bạn có chắc chắn muốn ngắt kết nối tài khoản OA này?')) return;
  try {
    await api.delete(`/zalo-oa/accounts/${id}`);
    toast.success('Đã ngắt kết nối thành công');
    fetchAccounts();
  } catch (err: any) {
    toast.error(err.response?.data?.error || 'Failed to disconnect');
  }
};

onMounted(() => {
  fetchAccounts();
  // Check if there's an error from the callback redirect
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('oa_status') === 'error') {
    toast.error('Lỗi kết nối Zalo: ' + urlParams.get('message'));
  } else if (urlParams.get('oa_status') === 'success') {
    toast.success('Kết nối Zalo OA thành công!');
  }
});
</script>

<template>
  <v-container fluid class="pa-6">
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold mb-1">Zalo Official Account</h1>
        <p class="text-grey">Kết nối và quản lý các tài khoản Zalo OA của doanh nghiệp</p>
      </div>
      <v-btn 
        color="primary" 
        prepend-icon="mdi-plus" 
        @click="openConnectDialog"
        size="large"
      >
        Kết nối OA mới
      </v-btn>
    </div>

    <div v-if="loading" class="d-flex justify-center py-12">
      <v-progress-circular indeterminate color="primary" size="48"></v-progress-circular>
    </div>

    <v-card v-else-if="accounts.length === 0" class="text-center pa-12 mx-auto mt-8" max-width="600" variant="outlined" style="border-style: dashed; border-width: 2px;">
      <div class="d-flex align-center justify-center mx-auto mb-4" style="width: 80px; height: 80px; border-radius: 50%; background-color: rgba(30, 58, 138, 0.2);">
        <v-icon size="40" color="primary">mdi-message-text-outline</v-icon>
      </div>
      <h3 class="text-h5 font-weight-bold mb-3">Chưa có Zalo OA nào được kết nối</h3>
      <p class="text-grey mb-6">
        Hãy kết nối Zalo Official Account của bạn để bắt đầu quản lý tin nhắn và chăm sóc khách hàng tập trung ngay trên Adsup CRM.
      </p>
      <v-btn 
        color="primary"
        variant="tonal"
        size="large"
        @click="openConnectDialog"
      >
        Bắt đầu kết nối ngay
      </v-btn>
    </v-card>

    <v-row v-else>
      <v-col v-for="oa in accounts" :key="oa.id" cols="12" md="6" lg="4">
        <v-card class="h-100 d-flex flex-column" elevation="2">
          <v-card-text class="flex-grow-1">
            <div class="d-flex align-start mb-4">
              <v-avatar size="64" class="mr-4" style="border: 2px solid #333">
                <v-img :src="oa.avatarUrl || '/default-avatar.png'" alt="OA Avatar"></v-img>
              </v-avatar>
              <div>
                <h2 class="text-h6 font-weight-bold mb-1">{{ oa.name }}</h2>
                <div class="text-caption text-grey mb-2">ID: {{ oa.oaId }}</div>
                <v-chip color="success" size="small" prepend-icon="mdi-check-circle" variant="flat">
                  Đang hoạt động
                </v-chip>
              </div>
            </div>

            <v-divider class="my-4"></v-divider>

            <div class="d-flex justify-space-between mb-2">
              <span class="text-grey text-body-2">App ID:</span>
              <span class="text-body-2 font-weight-medium">{{ oa.appId }}</span>
            </div>
            <div class="d-flex justify-space-between">
              <span class="text-grey text-body-2">Kết nối lúc:</span>
              <span class="text-body-2">{{ new Date(oa.createdAt).toLocaleDateString('vi-VN') }}</span>
            </div>
          </v-card-text>

          <v-card-actions class="pa-4 pt-0">
            <v-btn 
              color="error" 
              variant="tonal" 
              class="flex-grow-1 mr-2"
              @click="handleDisconnect(oa.id)"
            >
              Ngắt kết nối
            </v-btn>
            <v-btn 
              color="primary" 
              variant="flat" 
              class="flex-grow-1 ml-2"
              to="/chat"
            >
              Vào Chat
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <!-- Connect Dialog -->
    <v-dialog v-model="showDialog" max-width="500">
      <v-card>
        <v-card-title class="text-h6 font-weight-bold pt-4 px-6">Nhập thông tin Zalo App</v-card-title>
        <v-card-text class="px-6 pb-2 pt-2">
          <v-alert type="info" variant="tonal" class="mb-6" density="compact">
            Để bảo mật kết nối, bạn cần cung cấp App ID và App Secret của ứng dụng Zalo. Bạn có thể tìm thấy chúng trong phần <strong>Thiết lập chung</strong> trên trang Zalo Developers.
          </v-alert>
          
          <v-text-field
            v-model="connectForm.appId"
            label="App ID"
            variant="outlined"
            density="comfortable"
            class="mb-2"
          ></v-text-field>
          
          <v-text-field
            v-model="connectForm.appSecret"
            label="App Secret"
            type="password"
            variant="outlined"
            density="comfortable"
            placeholder="Nhập App Secret..."
          ></v-text-field>
        </v-card-text>
        <v-card-actions class="px-6 pb-6 pt-0">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="showDialog = false" :disabled="isConnecting">Hủy</v-btn>
          <v-btn 
            color="primary" 
            variant="flat" 
            @click="handleConnect" 
            :loading="isConnecting"
          >
            Tiếp tục
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
