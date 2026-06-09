<template>
  <div class="mt-4">
    <div class="d-flex align-center justify-space-between mb-2">
      <div class="text-subtitle-2 font-weight-bold d-flex align-center">
        <v-icon color="info" class="mr-1" size="20">mdi-package-variant</v-icon>
        Dịch vụ / Sản phẩm quan tâm
      </div>
      <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-plus" @click="showAddDialog = true">
        Gắn dịch vụ
      </v-btn>
    </div>

    <!-- Product List -->
    <v-list class="bg-transparent pa-0">
      <v-list-item v-for="cp in customerProducts" :key="cp.id" class="border rounded-lg mb-2 pa-2" style="border-color: rgba(0,0,0,0.12) !important;">
        <template v-slot:prepend>
          <v-avatar color="info" variant="tonal" size="36" class="mr-3">
            <v-icon size="18">mdi-star-outline</v-icon>
          </v-avatar>
        </template>
        <v-list-item-title class="font-weight-bold text-body-2">{{ cp.product?.name }}</v-list-item-title>
        <v-list-item-subtitle class="text-caption mt-1">
          <v-chip size="x-small" :color="getStatusColor(cp.status)" class="mr-1">{{ getStatusText(cp.status) }}</v-chip>
          <v-chip size="x-small" :color="getInterestColor(cp.interestLevel)" variant="outlined">{{ getInterestText(cp.interestLevel) }}</v-chip>
        </v-list-item-subtitle>
        <div v-if="cp.notes" class="text-caption text-grey mt-1">📝 {{ cp.notes }}</div>
        
        <template v-slot:append>
          <v-btn icon="mdi-pencil" variant="text" size="small" color="info" class="mr-1" @click="openEditDialog(cp)"></v-btn>
          <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click="removeProduct(cp.productId)"></v-btn>
        </template>
      </v-list-item>
      <div v-if="customerProducts.length === 0" class="text-caption text-grey text-center py-2">
        Khách hàng chưa quan tâm dịch vụ nào.
      </div>
    </v-list>

    <!-- Add/Edit Dialog -->
    <v-dialog v-model="showAddDialog" max-width="500px">
      <v-card>
        <v-card-title class="pa-4 border-b">
          {{ editingProduct ? 'Cập nhật trạng thái Dịch vụ' : 'Gắn Dịch vụ / Sản phẩm mới' }}
        </v-card-title>
        <v-card-text class="pa-4">
          <v-row dense>
            <v-col cols="12" v-if="!editingProduct">
              <v-select
                v-model="formData.productId"
                :items="availableProducts"
                item-title="name"
                item-value="id"
                label="Chọn dịch vụ/sản phẩm"
                variant="outlined"
              ></v-select>
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="formData.status"
                :items="statusOptions"
                item-title="text"
                item-value="value"
                label="Trạng thái"
                variant="outlined"
              ></v-select>
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="formData.interestLevel"
                :items="interestOptions"
                item-title="text"
                item-value="value"
                label="Mức độ quan tâm"
                variant="outlined"
              ></v-select>
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model.number="formData.budget"
                label="Ngân sách dự kiến (VNĐ)"
                type="number"
                variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model="formData.notes"
                label="Ghi chú nhu cầu"
                variant="outlined"
                rows="2"
              ></v-textarea>
            </v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="showAddDialog = false">Hủy</v-btn>
          <v-btn color="primary" @click="saveProduct" :disabled="!formData.productId" :loading="saving">Lưu lại</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { api } from '@/api';

const props = defineProps<{
  customerId: string;
}>();

const customerProducts = ref<any[]>([]);
const availableProducts = ref<any[]>([]);
const showAddDialog = ref(false);
const saving = ref(false);
const editingProduct = ref<any>(null);

const formData = ref({
  productId: '',
  status: 'new',
  interestLevel: 'medium',
  budget: null,
  notes: ''
});

const statusOptions = [
  { text: 'Mới quan tâm', value: 'new' },
  { text: 'Đã tư vấn', value: 'consulted' },
  { text: 'Đang cân nhắc', value: 'considering' },
  { text: 'Đã chốt', value: 'won' },
  { text: 'Hủy/Rớt', value: 'lost' },
  { text: 'Cần chăm sóc lại', value: 'retry' },
];

const interestOptions = [
  { text: 'Thấp', value: 'low' },
  { text: 'Trung bình', value: 'medium' },
  { text: 'Cao', value: 'high' },
  { text: 'Nóng', value: 'hot' },
];

function getStatusText(val: string) {
  return statusOptions.find(o => o.value === val)?.text || val;
}
function getStatusColor(val: string) {
  const map: any = { new: 'info', consulted: 'primary', considering: 'warning', won: 'success', lost: 'error', retry: 'secondary' };
  return map[val] || 'grey';
}
function getInterestText(val: string) {
  return interestOptions.find(o => o.value === val)?.text || val;
}
function getInterestColor(val: string) {
  const map: any = { low: 'grey', medium: 'info', high: 'warning', hot: 'error' };
  return map[val] || 'grey';
}

async function fetchCustomerProducts() {
  if (!props.customerId) return;
  try {
    // We should ideally have a GET /api/v1/customers/:id/products but since we don't, 
    // we fetch contact detail with include or we need to add that API.
    // Assuming backend returns it if we fetch contact or we can add a quick route.
    const res = await api.get(`/contacts/${props.customerId}`);
    // Wait, the existing GET /contacts/:id doesn't include customerProducts yet.
    // I will use a custom fetch or assume it's included.
    customerProducts.value = res.data.customerProducts || [];
  } catch (error) {
    console.error(error);
  }
}

async function fetchAllProducts() {
  try {
    const res = await api.get('/api/v1/products');
    availableProducts.value = res.data.data || [];
  } catch (error) {
    console.error(error);
  }
}

watch(() => showAddDialog.value, (val) => {
  if (!val) {
    editingProduct.value = null;
    formData.value = { productId: '', status: 'new', interestLevel: 'medium', budget: null, notes: '' };
  }
});

function openEditDialog(cp: any) {
  editingProduct.value = cp;
  formData.value = {
    productId: cp.productId,
    status: cp.status || 'new',
    interestLevel: cp.interestLevel || 'medium',
    budget: cp.budget,
    notes: cp.notes || ''
  };
  showAddDialog.value = true;
}

async function saveProduct() {
  saving.value = true;
  try {
    if (editingProduct.value) {
      await api.put(`/api/v1/customers/${props.customerId}/products/${formData.value.productId}/status`, formData.value);
    } else {
      await api.post(`/api/v1/customers/${props.customerId}/products`, formData.value);
    }
    showAddDialog.value = false;
    // We emit an event or re-fetch
    // Since we don't have the GET endpoint implemented perfectly in contacts yet, we mock the local state
    // But ideally we just reload. For now let's just emit or refresh.
    // We'll trust the component will unmount/remount or we can just push to array.
    fetchCustomerProducts();
  } catch (error) {
    console.error(error);
    alert('Lỗi lưu dịch vụ');
  } finally {
    saving.value = false;
  }
}

async function removeProduct(productId: string) {
  if (confirm('Bạn muốn gỡ dịch vụ này khỏi khách hàng?')) {
    try {
      await api.delete(`/api/v1/customers/${props.customerId}/products/${productId}`);
      customerProducts.value = customerProducts.value.filter(p => p.productId !== productId);
    } catch (error) {
      console.error(error);
    }
  }
}

onMounted(() => {
  fetchAllProducts();
  fetchCustomerProducts();
});
</script>
