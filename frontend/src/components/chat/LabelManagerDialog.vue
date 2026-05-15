<template>
  <v-dialog v-model="open" max-width="480" persistent>
    <v-card rounded="xl">
      <!-- Header -->
      <v-card-title class="d-flex align-center justify-space-between pa-5 pb-3">
        <span class="text-h6 font-weight-bold">Quản lý thẻ phân loại</span>
        <v-btn icon variant="text" size="small" @click="open = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text class="pa-4 pt-0">
        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

        <div class="text-caption text-medium-emphasis mb-2 px-1">Danh sách thẻ phân loại</div>

        <!-- Label List -->
        <div v-if="labels.length" class="label-list">
          <div
            v-for="(label, i) in labels"
            :key="label.id"
            class="label-row d-flex align-center pa-3 rounded-lg mb-1"
            style="background: rgba(var(--v-theme-surface-variant), 0.4);"
          >
            <!-- Drag handle -->
            <v-icon size="18" color="grey" class="mr-3" style="cursor: grab;">mdi-drag-horizontal-variant</v-icon>

            <!-- Color circle -->
            <div
              class="label-color-dot mr-3"
              :style="{ background: getTagHex(label.color) }"
            ></div>

            <!-- Name (inline edit) -->
            <template v-if="editingId === label.id">
              <v-text-field
                v-model="editingText"
                density="compact"
                hide-details
                variant="outlined"
                autofocus
                class="flex-grow-1 mr-2"
                style="max-width: 180px;"
                @keyup.enter="saveEdit(label)"
                @keyup.escape="cancelEdit"
              />
              <!-- Color picker inline -->
              <div class="d-flex align-center mr-2">
                <div
                  v-for="c in colorOptions"
                  :key="c.value"
                  class="color-chip"
                  :style="{ background: c.hex, outline: editingColor === c.value ? '2px solid white' : 'none', outlineOffset: '1px' }"
                  @click="editingColor = c.value"
                ></div>
              </div>
              <v-btn icon size="x-small" color="success" variant="tonal" class="mr-1" @click="saveEdit(label)" :loading="saving === label.id">
                <v-icon size="14">mdi-check</v-icon>
              </v-btn>
              <v-btn icon size="x-small" variant="text" @click="cancelEdit">
                <v-icon size="14">mdi-close</v-icon>
              </v-btn>
            </template>
            <template v-else>
              <span class="flex-grow-1 text-body-2 font-weight-medium">{{ label.text }}</span>
              <!-- Actions -->
              <v-btn icon size="x-small" variant="text" class="mr-1" @click="startEdit(label)">
                <v-icon size="16" color="grey">mdi-pencil-outline</v-icon>
              </v-btn>
              <v-btn icon size="x-small" variant="text" @click="deleteLabel(label, i)" :loading="deleting === label.id">
                <v-icon size="16" color="error">mdi-delete-outline</v-icon>
              </v-btn>
            </template>
          </div>
        </div>

        <div v-else-if="!loading" class="text-center pa-6 text-medium-emphasis text-body-2">
          Chưa có thẻ phân loại nào
        </div>

        <!-- Add new label form -->
        <div v-if="showAddForm" class="add-form mt-3 pa-3 rounded-lg" style="border: 1px dashed rgba(var(--v-theme-primary), 0.4);">
          <div class="d-flex align-center mb-2">
            <v-text-field
              v-model="newLabelText"
              label="Tên thẻ phân loại"
              density="compact"
              hide-details
              variant="outlined"
              class="flex-grow-1 mr-2"
              autofocus
              @keyup.enter="addLabel"
            />
          </div>
          <div class="d-flex align-center mb-3">
            <span class="text-caption text-medium-emphasis mr-2">Màu sắc:</span>
            <div class="d-flex align-center flex-wrap" style="gap: 6px;">
              <div
                v-for="c in colorOptions"
                :key="c.value"
                class="color-chip-lg"
                :style="{ background: c.hex, outline: newLabelColor === c.value ? '3px solid white' : 'none', outlineOffset: '2px', boxShadow: newLabelColor === c.value ? `0 0 0 4px ${c.hex}55` : 'none' }"
                @click="newLabelColor = c.value"
              >
                <v-icon v-if="newLabelColor === c.value" size="12" color="white">mdi-check</v-icon>
              </div>
            </div>
          </div>
          <div class="d-flex justify-end" style="gap: 8px;">
            <v-btn variant="text" size="small" @click="showAddForm = false; newLabelText = ''">Hủy</v-btn>
            <v-btn color="primary" size="small" :loading="adding" :disabled="!newLabelText.trim()" @click="addLabel">Thêm</v-btn>
          </div>
        </div>

        <!-- Add button -->
        <v-btn
          v-if="!showAddForm"
          variant="text"
          color="primary"
          class="mt-2 pl-1"
          prepend-icon="mdi-plus"
          @click="showAddForm = true"
        >
          Thêm phân loại
        </v-btn>

        <v-alert v-if="errorMsg" type="error" density="compact" class="mt-3">{{ errorMsg }}</v-alert>
      </v-card-text>

      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn color="primary" variant="flat" rounded="lg" class="px-6" @click="open = false">Xong</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { api } from '@/api/index';

const props = defineProps<{
  modelValue: boolean;
  accountId: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'updated'): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

// ─── Color palette (matches Zalo) ─────────────────────────────────────────────
const colorOptions = [
  { value: '1', hex: '#F44336' }, // Red
  { value: '2', hex: '#E91E63' }, // Pink
  { value: '3', hex: '#FF9800' }, // Orange
  { value: '4', hex: '#FFEB3B' }, // Yellow
  { value: '5', hex: '#4CAF50' }, // Green
  { value: '6', hex: '#2196F3' }, // Blue
  { value: '7', hex: '#9C27B0' }, // Purple
  { value: '8', hex: '#607D8B' }, // Blue Grey
];

function getTagHex(color: string | number) {
  return colorOptions.find(c => c.value === String(color))?.hex || '#9E9E9E';
}

// ─── State ────────────────────────────────────────────────────────────────────
const labels = ref<any[]>([]);
const labelVersion = ref(0);
const loading = ref(false);
const errorMsg = ref('');

// Edit state
const editingId = ref<number | null>(null);
const editingText = ref('');
const editingColor = ref('1');
const saving = ref<number | null>(null);
const deleting = ref<number | null>(null);

// Add state
const showAddForm = ref(false);
const newLabelText = ref('');
const newLabelColor = ref('1');
const adding = ref(false);

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchLabels() {
  if (!props.accountId) return;
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await api.get(`/zalo-accounts/${props.accountId}/labels`);
    labels.value = res.data.labels || [];
    labelVersion.value = res.data.version || 0;
  } catch (e: any) {
    errorMsg.value = e.response?.data?.error || 'Không thể tải danh sách thẻ';
  } finally {
    loading.value = false;
  }
}

// ─── Sync helpers ──────────────────────────────────────────────────────────────
async function pushUpdate() {
  await api.put(`/zalo-accounts/${props.accountId}/labels`, {
    labelData: labels.value,
    version: labelVersion.value,
  });
  await fetchLabels(); // re-sync version
  emit('updated');
}

// ─── Edit ─────────────────────────────────────────────────────────────────────
function startEdit(label: any) {
  editingId.value = label.id;
  editingText.value = label.text;
  editingColor.value = String(label.color || '1');
}

function cancelEdit() {
  editingId.value = null;
}

async function saveEdit(label: any) {
  if (!editingText.value.trim()) return;
  saving.value = label.id;
  errorMsg.value = '';
  try {
    label.text = editingText.value.trim();
    label.color = editingColor.value;
    editingId.value = null;
    await pushUpdate();
  } catch (e: any) {
    errorMsg.value = e.response?.data?.error || 'Không thể lưu thẻ';
  } finally {
    saving.value = null;
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
async function deleteLabel(label: any, idx: number) {
  if (!confirm(`Xóa thẻ "${label.text}"?`)) return;
  deleting.value = label.id;
  errorMsg.value = '';
  try {
    labels.value.splice(idx, 1);
    await pushUpdate();
  } catch (e: any) {
    errorMsg.value = e.response?.data?.error || 'Không thể xóa thẻ';
    await fetchLabels();
  } finally {
    deleting.value = null;
  }
}

// ─── Add ──────────────────────────────────────────────────────────────────────
async function addLabel() {
  if (!newLabelText.value.trim()) return;
  adding.value = true;
  errorMsg.value = '';
  try {
    const maxId = labels.value.reduce((m: number, l: any) => Math.max(m, l.id || 0), 0);
    labels.value.push({
      id: maxId + 1,
      text: newLabelText.value.trim(),
      textKey: '',
      conversations: [],
      color: newLabelColor.value,
      offset: labels.value.length,
      emoji: '',
      createTime: Date.now(),
    });
    await pushUpdate();
    newLabelText.value = '';
    newLabelColor.value = '1';
    showAddForm.value = false;
  } catch (e: any) {
    errorMsg.value = e.response?.data?.error || 'Không thể thêm thẻ';
    await fetchLabels();
  } finally {
    adding.value = false;
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
watch(() => props.modelValue, (v) => {
  if (v) {
    errorMsg.value = '';
    showAddForm.value = false;
    editingId.value = null;
    fetchLabels();
  }
});
</script>

<style scoped>
.label-color-dot {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  flex-shrink: 0;
}

.color-chip {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.15s;
}
.color-chip:hover { transform: scale(1.2); }

.color-chip-lg {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s;
}
.color-chip-lg:hover { transform: scale(1.15); }

.label-row {
  transition: background 0.2s;
}
.label-row:hover {
  background: rgba(var(--v-theme-surface-variant), 0.7) !important;
}
</style>
