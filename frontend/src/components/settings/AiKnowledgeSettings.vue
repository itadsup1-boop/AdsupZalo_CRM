<template>
  <div>
    <!-- Top actions: Search and Add New -->
    <v-row class="mb-4 align-center">
      <v-col cols="12" sm="6" md="4">
        <v-text-field
          v-model="searchQuery"
          label="Tìm kiếm kiến thức..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
        />
      </v-col>
      <v-col cols="12" sm="6" md="5">
        <v-chip-group v-model="selectedCategoryFilter" mandatory class="category-chips">
          <v-chip
            v-for="cat in filterCategories"
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
      <v-col cols="12" md="3" class="text-right">
        <v-btn
          v-if="authStore.isAdmin"
          color="primary"
          prepend-icon="mdi-plus"
          @click="openCreateDialog"
        >
          Thêm kiến thức
        </v-btn>
      </v-col>
    </v-row>

    <!-- Error alert -->
    <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4" closable @click:close="errorMessage = ''">
      {{ errorMessage }}
    </v-alert>

    <!-- Knowledge Base Data Table -->
    <v-card>
      <v-data-table
        :headers="headers"
        :items="filteredItems"
        :loading="loading"
        no-data-text="Không tìm thấy kiến thức nào"
        class="elevation-0"
      >
        <!-- Category Column -->
        <template #item.category="{ item }">
          <v-chip
            :color="getCategoryInfo(item.category).color"
            size="small"
            variant="flat"
            prepend-icon="mdi-folder-outline"
          >
            <v-icon start size="14">{{ getCategoryInfo(item.category).icon }}</v-icon>
            {{ getCategoryInfo(item.category).label }}
          </v-chip>
        </template>

        <!-- Content Preview Column -->
        <template #item.content="{ item }">
          <div class="text-truncate" style="max-width: 300px;" :title="item.content">
            {{ item.content }}
          </div>
        </template>

        <!-- Active Status Toggle Column -->
        <template #item.isActive="{ item }">
          <v-switch
            v-model="item.isActive"
            color="success"
            hide-details
            density="compact"
            :disabled="!authStore.isAdmin || savingId === item.id"
            @change="toggleItemStatus(item)"
          />
        </template>

        <!-- Actions Column -->
        <template #item.actions="{ item }">
          <div class="d-flex align-center justify-end" style="gap: 4px;">
            <v-btn
              v-if="authStore.isAdmin"
              icon
              size="small"
              variant="text"
              color="primary"
              title="Chỉnh sửa"
              @click="openEditDialog(item)"
            >
              <v-icon>mdi-pencil</v-icon>
            </v-btn>
            <v-btn
              v-if="authStore.isAdmin"
              icon
              size="small"
              variant="text"
              color="error"
              title="Xóa"
              @click="confirmDelete(item)"
            >
              <v-icon>mdi-delete-outline</v-icon>
            </v-btn>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Create/Edit Form Dialog -->
    <v-dialog v-model="showDialog" max-width="600">
      <v-card class="pa-2">
        <v-card-title class="text-h6 font-weight-bold">
          {{ isEdit ? 'Chỉnh sửa kiến thức AI' : 'Thêm kiến thức AI mới' }}
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.category"
                :items="categories"
                item-title="label"
                item-value="value"
                label="Danh mục *"
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="12" sm="6" class="d-flex align-center">
              <v-switch
                v-model="form.isActive"
                label="Kích hoạt sử dụng"
                color="success"
                hide-details
                class="mt-n2"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model="form.title"
                label="Tiêu đề gợi nhớ *"
                placeholder="Ví dụ: Giờ làm việc, Chi nhánh 1, Bảng giá mụn..."
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model="form.content"
                label="Nội dung chi tiết *"
                placeholder="Nhập thông tin chi tiết để huấn luyện cho AI..."
                rows="6"
                variant="outlined"
                hide-details
              />
            </v-col>
          </v-row>
          <v-alert v-if="dialogError" type="error" density="compact" class="mt-4" variant="tonal">
            {{ dialogError }}
          </v-alert>
        </v-card-text>
        <v-card-actions class="px-6 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="showDialog = false">Hủy</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="saving"
            :disabled="!isFormValid"
            @click="saveItem"
          >
            {{ isEdit ? 'Cập nhật' : 'Thêm mới' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirm Dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card class="pa-2">
        <v-card-title class="text-h6 text-error font-weight-bold">Xác nhận xóa kiến thức</v-card-title>
        <v-card-text>
          Bạn có chắc chắn muốn xóa kiến thức <strong>"{{ selectedItem?.title }}"</strong>?
          Hành động này không thể hoàn tác và AI sẽ không còn truy cập được thông tin này.
        </v-card-text>
        <v-card-actions class="px-6 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="showDeleteDialog = false">Hủy</v-btn>
          <v-btn color="error" variant="flat" :loading="saving" @click="handleDelete">Xóa</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Success/Info Snackbars -->
    <v-snackbar v-model="snackbar" timeout="2500" color="success">
      {{ snackbarText }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';

interface AiKnowledgeItem {
  id: string;
  category: string;
  title: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const authStore = useAuthStore();

// UI State
const loading = ref(false);
const saving = ref(false);
const savingId = ref<string | null>(null);
const snackbar = ref(false);
const snackbarText = ref('');
const errorMessage = ref('');
const dialogError = ref('');

// Dialog states
const showDialog = ref(false);
const showDeleteDialog = ref(false);
const isEdit = ref(false);

// Query & Filter states
const searchQuery = ref('');
const selectedCategoryFilter = ref('all');
const items = ref<AiKnowledgeItem[]>([]);
const selectedItem = ref<AiKnowledgeItem | null>(null);

// Form state
const form = ref({
  id: '',
  category: 'clinic_info',
  title: '',
  content: '',
  isActive: true
});

const categories = [
  { value: 'clinic_info', label: 'Thông tin phòng khám', icon: 'mdi-home-map-marker', color: 'info' },
  { value: 'service', label: 'Dịch vụ', icon: 'mdi-medical-bag', color: 'teal' },
  { value: 'price', label: 'Bảng giá', icon: 'mdi-currency-usd', color: 'success' },
  { value: 'promotion', label: 'Khuyến mãi', icon: 'mdi-tag-percent-outline', color: 'warning' },
  { value: 'faq', label: 'Câu hỏi thường gặp', icon: 'mdi-help-circle-outline', color: 'purple' }
];

const filterCategories = computed(() => {
  return [
    { value: 'all', label: 'Tất cả', icon: 'mdi-format-list-bulleted' },
    ...categories
  ];
});

const headers = [
  { title: 'Tiêu đề', key: 'title', sortable: true },
  { title: 'Danh mục', key: 'category', sortable: true },
  { title: 'Nội dung', key: 'content', sortable: false },
  { title: 'Hoạt động', key: 'isActive', sortable: true, width: '120px' },
  { title: 'Thao tác', key: 'actions', sortable: false, align: 'end' as const, width: '100px' }
];

const isFormValid = computed(() => {
  return form.value.category && form.value.title.trim() && form.value.content.trim();
});

function getCategoryInfo(catValue: string) {
  return categories.find(c => c.value === catValue) || {
    label: catValue,
    icon: 'mdi-help-circle-outline',
    color: 'grey'
  };
}

// Filter and search logic
const filteredItems = computed(() => {
  let result = items.value;

  if (selectedCategoryFilter.value !== 'all') {
    result = result.filter(item => item.category === selectedCategoryFilter.value);
  }

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase().trim();
    result = result.filter(item => 
      item.title.toLowerCase().includes(q) || 
      item.content.toLowerCase().includes(q)
    );
  }

  return result;
});

// Fetch all knowledge items
async function fetchItems() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await api.get('/ai/knowledge');
    items.value = res.data?.data || [];
  } catch (err: any) {
    console.error('Error fetching AI knowledge items:', err);
    errorMessage.value = err.response?.data?.error || 'Lỗi tải danh sách cơ sở kiến thức AI.';
  } finally {
    loading.value = false;
  }
}

// Open Dialogs
function openCreateDialog() {
  isEdit.value = false;
  dialogError.value = '';
  form.value = {
    id: '',
    category: 'clinic_info',
    title: '',
    content: '',
    isActive: true
  };
  showDialog.value = true;
}

function openEditDialog(item: AiKnowledgeItem) {
  isEdit.value = true;
  dialogError.value = '';
  form.value = {
    id: item.id,
    category: item.category,
    title: item.title,
    content: item.content,
    isActive: item.isActive
  };
  showDialog.value = true;
}

function confirmDelete(item: AiKnowledgeItem) {
  selectedItem.value = item;
  showDeleteDialog.value = true;
}

// Save Item (Create/Update)
async function saveItem() {
  if (!isFormValid.value) return;
  saving.value = true;
  dialogError.value = '';

  try {
    const payload = {
      category: form.value.category,
      title: form.value.title.trim(),
      content: form.value.content.trim(),
      isActive: form.value.isActive
    };

    if (isEdit.value) {
      const res = await api.put(`/ai/knowledge/${form.value.id}`, payload);
      const updated = res.data?.data;
      const index = items.value.findIndex(i => i.id === form.value.id);
      if (index !== -1 && updated) {
        items.value[index] = updated;
      }
      snackbarText.value = 'Cập nhật kiến thức AI thành công!';
    } else {
      const res = await api.post('/ai/knowledge', payload);
      const created = res.data?.data;
      if (created) {
        items.value.unshift(created);
      }
      snackbarText.value = 'Thêm kiến thức AI mới thành công!';
    }
    
    showDialog.value = false;
    snackbar.value = true;
  } catch (err: any) {
    console.error('Error saving AI knowledge item:', err);
    dialogError.value = err.response?.data?.error || 'Không thể lưu kiến thức AI. Vui lòng kiểm tra lại.';
  } finally {
    saving.value = false;
  }
}

// Toggle status directly from the switch
async function toggleItemStatus(item: AiKnowledgeItem) {
  savingId.value = item.id;
  try {
    const res = await api.put(`/ai/knowledge/${item.id}`, {
      isActive: item.isActive
    });
    const updated = res.data?.data;
    if (updated) {
      item.isActive = updated.isActive;
      snackbarText.value = `Đã ${item.isActive ? 'kích hoạt' : 'vô hiệu hóa'} kiến thức AI: "${item.title}"`;
      snackbar.value = true;
    }
  } catch (err: any) {
    console.error('Error toggling AI knowledge item status:', err);
    // rollback switch value
    item.isActive = !item.isActive;
    snackbarText.value = err.response?.data?.error || 'Lỗi thay đổi trạng thái hoạt động.';
    snackbar.value = true;
  } finally {
    savingId.value = null;
  }
}

// Delete Item
async function handleDelete() {
  if (!selectedItem.value) return;
  saving.value = true;
  try {
    await api.delete(`/ai/knowledge/${selectedItem.value.id}`);
    items.value = items.value.filter(i => i.id !== selectedItem.value!.id);
    
    showDeleteDialog.value = false;
    snackbarText.value = 'Đã xóa kiến thức AI thành công!';
    snackbar.value = true;
  } catch (err: any) {
    console.error('Error deleting AI knowledge item:', err);
    snackbarText.value = err.response?.data?.error || 'Lỗi khi xóa kiến thức AI.';
    snackbar.value = true;
  } finally {
    saving.value = false;
    selectedItem.value = null;
  }
}

onMounted(fetchItems);
</script>

<style scoped>
.category-chips {
  flex-wrap: nowrap;
  overflow-x: auto;
}
</style>
