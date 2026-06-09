<template>
  <div
    v-if="modelValue"
    class="context-menu-overlay"
    @click.self="close"
    @contextmenu.prevent="close"
  >
    <v-card
      class="context-menu"
      :style="{ top: `${position.y}px`, left: `${position.x}px` }"
      elevation="8"
      rounded="lg"
    >
      <v-list density="compact" nav min-width="180">
        <!-- Reply -->
        <v-list-item prepend-icon="mdi-reply" @click="emit('reply'); close()">
          <v-list-item-title>Trả lời</v-list-item-title>
        </v-list-item>

        <!-- Edit (self + text only) -->
        <v-list-item
          v-if="isSelf && message?.contentType === 'text'"
          prepend-icon="mdi-pencil"
          @click="emit('edit'); close()"
        >
          <v-list-item-title>Chỉnh sửa</v-list-item-title>
        </v-list-item>

        <!-- Copy (text only) -->
        <v-list-item
          v-if="message?.contentType === 'text'"
          prepend-icon="mdi-content-copy"
          @click="onCopy"
        >
          <v-list-item-title>Sao chép</v-list-item-title>
        </v-list-item>

        <!-- Forward -->
        <v-list-item prepend-icon="mdi-share" @click="emit('forward'); close()">
          <v-list-item-title>Chuyển tiếp</v-list-item-title>
        </v-list-item>

        <!-- Undo / Recall (self only) -->
        <v-list-item
          v-if="isSelf"
          prepend-icon="mdi-undo"
          @click="emit('undo'); close()"
        >
          <v-list-item-title>Thu hồi</v-list-item-title>
        </v-list-item>

        <v-divider v-if="isSelf || authStore.isAdmin" />

        <!-- Delete (self only OR admin/owner) -->
        <v-list-item
          v-if="isSelf || authStore.isAdmin"
          prepend-icon="mdi-delete"
          base-color="error"
          @click="emit('delete'); close()"
        >
          <v-list-item-title>Xóa</v-list-item-title>
        </v-list-item>

        <v-divider />

        <!-- Pin -->
        <v-list-item
          :prepend-icon="isPinned ? 'mdi-pin-off' : 'mdi-pin'"
          base-color="info"
          @click="emit('pin'); close()"
        >
          <v-list-item-title>{{ isPinned ? 'Bỏ ghim' : 'Ghim' }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import type { Message } from '@/composables/use-chat';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const props = defineProps<{
  message: Message | null;
  isSelf: boolean;
  isPinned?: boolean;
  position: { x: number; y: number };
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  reply: [];
  edit: [];
  delete: [];
  undo: [];
  forward: [];
  copy: [];
  pin: [];
}>();

function close() {
  emit('update:modelValue', false);
}

async function onCopy() {
  await navigator.clipboard.writeText(props.message?.content || '');
  emit('copy');
  close();
}
</script>

<style scoped>
.context-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
}

.context-menu {
  position: fixed;
  z-index: 101;
  min-width: 180px;
}
</style>
