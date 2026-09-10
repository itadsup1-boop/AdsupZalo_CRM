<template>
  <v-row dense class="mb-2 align-center">
    <!-- Search -->
    <v-col cols="12" sm="3">
      <v-text-field
        v-model="filters.search"
        prepend-inner-icon="mdi-magnify"
        label="Tìm kiếm tên / SĐT / email"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- Source filter -->
    <v-col cols="6" sm="3">
      <v-select
        v-model="filters.source"
        :items="sourceOptions"
        item-title="text"
        item-value="value"
        label="Nguồn"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- Status filter -->
    <v-col cols="6" sm="3">
      <v-select
        v-model="filters.status"
        :items="statusOptions"
        item-title="text"
        item-value="value"
        label="Trạng thái"
        clearable
        hide-details
        @update:model-value="emit('search')"
      />
    </v-col>

    <!-- Tag filter -->
    <v-col cols="12" sm="3">
      <v-select
        v-model="filters.tagId"
        :items="tags"
        item-title="name"
        item-value="id"
        label="Lọc theo Thẻ (CRM)"
        clearable
        hide-details
        @update:model-value="emit('search')"
      >
        <template #selection="{ item }">
          <div class="d-flex align-center" v-if="item && item.raw">
            <div 
              class="tag-dot mr-2" 
              :style="{ backgroundColor: item.raw.color || '#3B82F6', width: '12px', height: '12px', borderRadius: '50%' }"
            />
            <span class="text-truncate">{{ item.raw.name }}</span>
          </div>
        </template>
        <template #item="{ props, item }">
          <v-list-item v-bind="props" :title="item.raw.name">
            <template #prepend>
              <div 
                class="tag-dot mr-2" 
                :style="{ backgroundColor: item.raw.color || '#3B82F6', width: '12px', height: '12px', borderRadius: '50%' }"
              />
            </template>
          </v-list-item>
        </template>
      </v-select>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/index';
import type { ContactFilters } from '@/composables/use-contacts';
import { SOURCE_OPTIONS, STATUS_OPTIONS } from '@/composables/use-contacts';

defineProps<{ filters: ContactFilters }>();
const emit = defineEmits<{ search: [] }>();

const sourceOptions = SOURCE_OPTIONS;
const statusOptions = STATUS_OPTIONS;
const tags = ref<any[]>([]);

const fetchTags = async () => {
  try {
    const res = await api.get('/tags');
    tags.value = (res.data.tags || []).filter((t: any) => t.isActive);
  } catch (error) {
    console.error('Lỗi tải danh sách thẻ lọc', error);
  }
};

onMounted(() => {
  fetchTags();
});
</script>

