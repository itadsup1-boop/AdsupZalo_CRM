<template>
  <div>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

    <!-- Đã nhận -->
    <div class="text-subtitle-2 font-weight-bold mb-2 mt-2">
      Đã nhận ({{ receivedRequests?.length || 0 }})
    </div>
    <v-list v-if="receivedRequests?.length" lines="two">
      <v-list-item
        v-for="req in receivedRequests"
        :key="req.userId ?? req.id"
        class="px-2"
      >
        <template #prepend>
          <v-avatar color="blue-grey-lighten-4" size="40">
            <v-img v-if="req.avatar" :src="req.avatar" />
            <v-icon v-else color="blue-grey">mdi-account</v-icon>
          </v-avatar>
        </template>
        <v-list-item-title class="font-weight-medium">
          {{ req.displayName ?? req.name ?? req.userId }}
        </v-list-item-title>
        <v-list-item-subtitle v-if="req.phone" class="text-caption">
          {{ req.phone }}
        </v-list-item-subtitle>
        <template #append>
          <div class="d-flex gap-2">
            <v-btn
              size="small"
              color="primary"
              @click="emit('accept', String(req.userId ?? req.id))"
            >
              Chấp nhận
            </v-btn>
            <v-btn
              size="small"
              variant="outlined"
              color="error"
              @click="emit('reject', String(req.userId ?? req.id))"
            >
              Từ chối
            </v-btn>
          </div>
        </template>
      </v-list-item>
    </v-list>
    <div v-else-if="!loading" class="text-center text-grey py-4">
      <div class="text-body-2">Không có lời mời nào đã nhận</div>
    </div>

    <v-divider class="my-4"></v-divider>

    <!-- Đã gửi -->
    <div class="text-subtitle-2 font-weight-bold mb-2">
      Đã gửi ({{ sentRequests?.length || 0 }})
    </div>
    <v-list v-if="sentRequests?.length" lines="two">
      <v-list-item
        v-for="req in sentRequests"
        :key="req.userId ?? req.id"
        class="px-2"
      >
        <template #prepend>
          <v-avatar color="blue-grey-lighten-4" size="40">
            <v-img v-if="req.avatar" :src="req.avatar" />
            <v-icon v-else color="blue-grey">mdi-account</v-icon>
          </v-avatar>
        </template>

        <v-list-item-title class="font-weight-medium">
          {{ req.displayName ?? req.name ?? req.userId }}
        </v-list-item-title>
        <v-list-item-subtitle v-if="req.phone" class="text-caption">
          {{ req.phone }}
        </v-list-item-subtitle>

        <template #append>
          <v-btn
            size="small"
            variant="outlined"
            color="error"
            prepend-icon="mdi-close"
            @click="emit('cancel', String(req.userId ?? req.id))"
          >
            Hủy
          </v-btn>
        </template>
      </v-list-item>
    </v-list>

    <div v-else-if="!loading" class="text-center text-grey py-4">
      <div class="text-body-2">Không có lời mời nào đã gửi</div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  receivedRequests?: any[];
  sentRequests?: any[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  cancel: [userId: string];
  accept: [userId: string];
  reject: [userId: string];
}>();
</script>

<style scoped>
</style>
