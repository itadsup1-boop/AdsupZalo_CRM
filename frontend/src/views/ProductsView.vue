<template>
  <div class="pa-4">
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold mb-1" style="color: #00F2FF;">Dịch vụ & Sản phẩm</h1>
        <p class="text-subtitle-1 text-grey-lighten-1">Quản lý danh mục, dịch vụ và liên kết Automation</p>
      </div>
      <div class="d-flex gap-2">
        <v-btn color="secondary" prepend-icon="mdi-folder-plus-outline" @click="showCategoryDialog = true" class="mr-2 rounded-lg" elevation="2">
          Thêm Danh Mục
        </v-btn>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openProductDialog()" class="rounded-lg bg-gradient" elevation="4">
          Thêm Sản Phẩm
        </v-btn>
      </div>
    </div>

    <!-- Stats Row -->
    <v-row class="mb-6">
      <v-col cols="12" md="4">
        <v-card class="glass-card rounded-xl pa-4 d-flex align-center">
          <v-avatar color="primary" variant="tonal" size="56" class="mr-4">
            <v-icon size="32">mdi-package-variant-closed</v-icon>
          </v-avatar>
          <div>
            <div class="text-h4 font-weight-bold">{{ products.length }}</div>
            <div class="text-caption text-grey-lighten-1 text-uppercase">Tổng Sản Phẩm/Dịch vụ</div>
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card class="glass-card rounded-xl pa-4 d-flex align-center">
          <v-avatar color="secondary" variant="tonal" size="56" class="mr-4">
            <v-icon size="32">mdi-folder-multiple-outline</v-icon>
          </v-avatar>
          <div>
            <div class="text-h4 font-weight-bold">{{ categories.length }}</div>
            <div class="text-caption text-grey-lighten-1 text-uppercase">Danh Mục</div>
          </div>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card class="glass-card rounded-xl pa-4 d-flex align-center">
          <v-avatar color="success" variant="tonal" size="56" class="mr-4">
            <v-icon size="32">mdi-robot-outline</v-icon>
          </v-avatar>
          <div>
            <div class="text-h4 font-weight-bold">{{ activeAutomationsCount }}</div>
            <div class="text-caption text-grey-lighten-1 text-uppercase">Luồng Automation Kích Hoạt</div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Main Content -->
    <v-card class="glass-card rounded-xl" elevation="0">
      <v-toolbar color="transparent" flat>
        <v-text-field
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          label="Tìm kiếm sản phẩm, dịch vụ..."
          variant="solo-filled"
          density="comfortable"
          hide-details
          class="mx-4"
          bg-color="rgba(255,255,255,0.05)"
          style="max-width: 400px; border-radius: 12px; overflow: hidden;"
        ></v-text-field>
        <v-spacer></v-spacer>
        <v-select
          v-model="categoryFilter"
          :items="[{ id: 'all', name: 'Tất cả danh mục' }, ...categories]"
          item-title="name"
          item-value="id"
          variant="solo-filled"
          density="comfortable"
          hide-details
          class="mr-4"
          bg-color="rgba(255,255,255,0.05)"
          style="max-width: 250px; border-radius: 12px; overflow: hidden;"
        ></v-select>
      </v-toolbar>

      <v-table class="bg-transparent mt-2">
        <thead>
          <tr>
            <th class="text-left font-weight-bold">Sản phẩm / Dịch vụ</th>
            <th class="text-left font-weight-bold">Danh mục</th>
            <th class="text-left font-weight-bold">Giá tham khảo</th>
            <th class="text-center font-weight-bold">Trạng thái</th>
            <th class="text-center font-weight-bold">Automations</th>
            <th class="text-right font-weight-bold">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredProducts" :key="item.id" class="hover-row">
            <td>
              <div class="d-flex align-center py-2">
                <v-avatar color="primary" variant="tonal" size="40" class="mr-3">
                  <span class="text-h6">{{ item.name.charAt(0).toUpperCase() }}</span>
                </v-avatar>
                <div>
                  <div class="font-weight-bold text-body-1">{{ item.name }}</div>
                  <div class="text-caption text-grey-lighten-1">{{ item.code || 'Chưa có mã' }}</div>
                </div>
              </div>
            </td>
            <td>
              <v-chip size="small" variant="outlined" color="secondary" v-if="item.category">
                {{ item.category.name }}
              </v-chip>
              <span v-else class="text-grey">-</span>
            </td>
            <td>
              <div class="font-weight-medium" style="color: #00F2FF;">{{ formatPrice(item.price) }}</div>
            </td>
            <td class="text-center">
              <v-chip size="small" :color="item.isActive ? 'success' : 'error'" variant="flat">
                {{ item.isActive ? 'Hoạt động' : 'Đã tắt' }}
              </v-chip>
            </td>
            <td class="text-center">
              <v-badge
                :content="item.productWorkflows?.length || 0"
                :color="item.productWorkflows?.length > 0 ? 'primary' : 'grey'"
                inline
              >
                <v-btn icon="mdi-sitemap" variant="text" size="small" color="primary" @click="openWorkflowDialog(item)"></v-btn>
              </v-badge>
            </td>
            <td class="text-right">
              <v-btn icon="mdi-pencil" variant="text" size="small" color="info" class="mr-1" @click="openProductDialog(item)"></v-btn>
              <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click="confirmDelete(item)"></v-btn>
            </td>
          </tr>
          <tr v-if="filteredProducts.length === 0">
            <td colspan="6" class="text-center py-8 text-grey">Không tìm thấy sản phẩm nào.</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Product Dialog -->
    <v-dialog v-model="showProductDialog" max-width="600px" persistent>
      <v-card class="glass-card rounded-xl">
        <v-card-title class="pa-4 d-flex align-center justify-space-between border-b border-white-10">
          <span class="text-h6 font-weight-bold">{{ editingProduct?.id ? 'Sửa Sản Phẩm' : 'Thêm Sản Phẩm Mới' }}</span>
          <v-btn icon="mdi-close" variant="text" @click="showProductDialog = false"></v-btn>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-form ref="form" @submit.prevent="saveProduct">
            <v-row>
              <v-col cols="12" md="8">
                <v-text-field v-model="formData.name" label="Tên sản phẩm / Dịch vụ (*)" variant="outlined" :rules="[v => !!v || 'Bắt buộc nhập']"></v-text-field>
              </v-col>
              <v-col cols="12" md="4">
                <v-text-field v-model="formData.code" label="Mã SP (Tùy chọn)" variant="outlined"></v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-select v-model="formData.categoryId" :items="categories" item-title="name" item-value="id" label="Danh mục" variant="outlined" clearable></v-select>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model.number="formData.price" label="Giá tham khảo (VNĐ)" type="number" variant="outlined"></v-text-field>
              </v-col>
              <v-col cols="12">
                <v-textarea v-model="formData.description" label="Mô tả ngắn" variant="outlined" rows="3"></v-textarea>
              </v-col>
              <v-col cols="12">
                <v-switch v-model="formData.isActive" label="Trạng thái hoạt động" color="success" hide-details></v-switch>
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0 border-t border-white-10">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="showProductDialog = false">Hủy</v-btn>
          <v-btn color="primary" variant="flat" class="px-6 rounded-lg bg-gradient" @click="saveProduct" :loading="saving">Lưu lại</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Category Dialog -->
    <v-dialog v-model="showCategoryDialog" max-width="400px">
      <v-card class="glass-card rounded-xl">
        <v-card-title class="pa-4 border-b border-white-10 font-weight-bold">Thêm Danh Mục</v-card-title>
        <v-card-text class="pa-4">
          <v-text-field v-model="newCategoryName" label="Tên danh mục" variant="outlined" autofocus @keyup.enter="saveCategory"></v-text-field>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="flat" class="rounded-lg bg-gradient" @click="saveCategory" :loading="savingCategory" :disabled="!newCategoryName">Thêm mới</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Workflow Link Dialog -->
    <v-dialog v-model="showWorkflowDialog" max-width="600px">
      <v-card class="glass-card rounded-xl">
        <v-card-title class="pa-4 border-b border-white-10">
          <span class="font-weight-bold">Liên kết Kịch bản Tự động</span>
          <div class="text-caption text-grey">Sản phẩm: <strong class="text-white">{{ selectedProduct?.name }}</strong></div>
        </v-card-title>
        <v-card-text class="pa-4">
          <div class="mb-4">
            <h3 class="text-subtitle-1 font-weight-bold mb-2">Thêm Kịch bản mới</h3>
            <v-row>
              <v-col cols="12" sm="7">
                <v-select
                  v-model="newWorkflow.workflowId"
                  :items="workflows"
                  item-title="name"
                  item-value="id"
                  label="Chọn kịch bản Automation"
                  variant="outlined"
                  density="compact"
                  hide-details
                ></v-select>
              </v-col>
              <v-col cols="12" sm="5">
                <v-btn color="primary" block class="rounded-lg bg-gradient" @click="addWorkflowLink" :disabled="!newWorkflow.workflowId" :loading="linkingWorkflow">
                  <v-icon left>mdi-link</v-icon> Gắn kịch bản
                </v-btn>
              </v-col>
            </v-row>
          </div>

          <v-divider class="my-4 border-white-10"></v-divider>

          <h3 class="text-subtitle-1 font-weight-bold mb-2">Các kịch bản đang áp dụng</h3>
          <v-list class="bg-transparent">
            <v-list-item v-for="link in selectedProduct?.productWorkflows || []" :key="link.id" class="glass-card mb-2 rounded-lg border border-white-10">
              <template v-slot:prepend>
                <v-icon color="success">mdi-robot-outline</v-icon>
              </template>
              <v-list-item-title class="font-weight-bold">{{ link.workflow?.name || 'Kịch bản không xác định' }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption text-grey">Kích hoạt: Khi gắn dịch vụ này</v-list-item-subtitle>
              <template v-slot:append>
                <v-btn icon="mdi-delete" variant="text" size="small" color="error" @click="removeWorkflowLink(link.workflowId)"></v-btn>
              </template>
            </v-list-item>
            <div v-if="!selectedProduct?.productWorkflows?.length" class="text-center py-4 text-grey">
              Chưa có kịch bản nào được gắn.
            </div>
          </v-list>
        </v-card-text>
        <v-card-actions class="pa-4 border-t border-white-10">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="showWorkflowDialog = false">Đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api';

const products = ref<any[]>([]);
const categories = ref<any[]>([]);
const workflows = ref<any[]>([]);

const search = ref('');
const categoryFilter = ref('all');

const showProductDialog = ref(false);
const showCategoryDialog = ref(false);
const showWorkflowDialog = ref(false);

const saving = ref(false);
const savingCategory = ref(false);
const linkingWorkflow = ref(false);

const editingProduct = ref<any>(null);
const selectedProduct = ref<any>(null);

const formData = ref({
  name: '',
  code: '',
  categoryId: null,
  description: '',
  price: null,
  isActive: true
});

const newCategoryName = ref('');
const newWorkflow = ref({ workflowId: '' });

const filteredProducts = computed(() => {
  return products.value.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.value.toLowerCase()) || (p.code && p.code.toLowerCase().includes(search.value.toLowerCase()));
    const matchCategory = categoryFilter.value === 'all' || p.categoryId === categoryFilter.value;
    return matchSearch && matchCategory;
  });
});

const activeAutomationsCount = computed(() => {
  return products.value.reduce((acc, p) => acc + (p.productWorkflows?.length || 0), 0);
});

async function fetchData() {
  try {
    const [resProd, resCat, resWf] = await Promise.all([
      api.get('/products'),
      api.get('/product-categories'),
      api.get('/automations/workflows')
    ]);
    products.value = resProd.data.data;
    categories.value = resCat.data.data;
    workflows.value = resWf.data.workflows || [];
  } catch (error) {
    console.error('Failed to fetch data', error);
  }
}

function formatPrice(val: number | null) {
  if (!val) return 'Liên hệ';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
}

function openProductDialog(product: any = null) {
  if (product) {
    editingProduct.value = product;
    formData.value = {
      name: product.name,
      code: product.code,
      categoryId: product.categoryId,
      description: product.description,
      price: product.price,
      isActive: product.isActive
    };
  } else {
    editingProduct.value = null;
    formData.value = { name: '', code: '', categoryId: null, description: '', price: null, isActive: true };
  }
  showProductDialog.value = true;
}

async function saveProduct() {
  if (!formData.value.name) return;
  saving.value = true;
  try {
    if (editingProduct.value) {
      await api.put(`/products/${editingProduct.value.id}`, formData.value);
    } else {
      await api.post('/products', formData.value);
    }
    showProductDialog.value = false;
    fetchData();
  } catch (error) {
    console.error(error);
    alert('Lưu thất bại');
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(product: any) {
  if (confirm(`Bạn có chắc muốn xóa dịch vụ ${product.name}?`)) {
    try {
      await api.delete(`/products/${product.id}`);
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Không thể xóa');
    }
  }
}

async function saveCategory() {
  savingCategory.value = true;
  try {
    await api.post('/product-categories', { name: newCategoryName.value });
    newCategoryName.value = '';
    showCategoryDialog.value = false;
    fetchData();
  } catch (error) {
    console.error(error);
  } finally {
    savingCategory.value = false;
  }
}

function openWorkflowDialog(product: any) {
  selectedProduct.value = product;
  newWorkflow.value.workflowId = '';
  showWorkflowDialog.value = true;
}

async function addWorkflowLink() {
  if (!newWorkflow.value.workflowId || !selectedProduct.value) return;
  linkingWorkflow.value = true;
  try {
    await api.post(`/products/${selectedProduct.value.id}/workflows`, {
      workflowId: newWorkflow.value.workflowId,
      triggerType: 'on_interest'
    });
    // Refresh product workflows locally for immediate UI update
    const wf = workflows.value.find(w => w.id === newWorkflow.value.workflowId);
    if (!selectedProduct.value.productWorkflows) selectedProduct.value.productWorkflows = [];
    selectedProduct.value.productWorkflows.push({ workflowId: wf.id, workflow: wf });
    
    newWorkflow.value.workflowId = '';
  } catch (error) {
    console.error(error);
  } finally {
    linkingWorkflow.value = false;
  }
}

async function removeWorkflowLink(workflowId: string) {
  try {
    await api.delete(`/products/${selectedProduct.value.id}/workflows/${workflowId}`);
    selectedProduct.value.productWorkflows = selectedProduct.value.productWorkflows.filter((w: any) => w.workflowId !== workflowId);
  } catch (error) {
    console.error(error);
  }
}

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.glass-card {
  background: rgba(30, 41, 59, 0.7) !important;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.bg-gradient {
  background: linear-gradient(135deg, #00F2FF 0%, #0088FF 100%) !important;
  color: white !important;
  border: none !important;
}
.border-white-10 {
  border-color: rgba(255, 255, 255, 0.1) !important;
}
.hover-row {
  transition: all 0.2s ease;
}
.hover-row:hover {
  background: rgba(255, 255, 255, 0.03);
}
</style>
