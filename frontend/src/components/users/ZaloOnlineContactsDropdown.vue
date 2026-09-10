<template>
  <v-card width="350" class="online-users-dropdown rounded-lg elevation-3">
    <v-card-title class="d-flex align-center bg-primary text-white py-3 px-4">
      <v-icon start>mdi-account-group</v-icon>
      <span class="text-subtitle-1 font-weight-bold">Khách Zalo Online ({{ activeCount }})</span>
      <v-spacer />
      <v-btn icon="mdi-close" variant="text" size="small" density="comfortable" @click="emit('close')" />
    </v-card-title>

    <v-card-text class="pa-2">
      <!-- Search -->
      <v-text-field
        v-model="searchQuery"
        placeholder="Tìm khách hàng..."
        prepend-inner-icon="mdi-magnify"
        variant="solo-filled"
        density="compact"
        hide-details
        class="mb-2"
        flat
        clearable
      />

      <!-- List -->
      <v-list lines="two" bg-color="transparent" class="pa-0 overflow-y-auto" style="max-height: 400px;">
        <template v-if="filteredContacts.length > 0">
          <v-list-item
            v-for="contact in filteredContacts"
            :key="contact.contactId"
            class="px-2 rounded-lg mb-1"
            :class="{ 'bg-grey-lighten-4': !isDark, 'bg-grey-darken-3': isDark }"
            @click="openChat(contact)"
          >
            <template #prepend>
              <v-badge
                dot
                location="bottom right"
                :color="contact.isOnline ? 'success' : 'grey'"
                offset-x="2"
                offset-y="2"
              >
                <v-avatar color="primary" size="40">
                  <v-img v-if="contact.avatar" :src="contact.avatar" />
                  <span v-else class="text-white text-caption font-weight-bold">
                    {{ getInitials(contact.displayName) }}
                  </span>
                </v-avatar>
              </v-badge>
            </template>

            <v-list-item-title class="font-weight-medium text-body-2 d-flex justify-space-between">
              <span>{{ contact.displayName }}</span>
            </v-list-item-title>
            
            <v-list-item-subtitle class="text-caption d-flex flex-column gap-1 mt-1">
              <div class="d-flex align-center">
                <v-chip size="x-small" color="blue" variant="flat" class="mr-1">
                  {{ contact.zaloAccountName || 'Zalo Account' }}
                </v-chip>
                <span v-if="contact.phone" class="text-grey ml-1">{{ contact.phone }}</span>
              </div>
              <div :class="contact.isOnline ? 'text-success' : 'text-grey'">
                {{ getStatusText(contact) }}
              </div>
            </v-list-item-subtitle>
          </v-list-item>
        </template>
        <div v-else class="text-center pa-6 text-grey">
          <v-icon size="40" color="grey-lighten-2" class="mb-2">mdi-account-off-outline</v-icon>
          <div class="text-body-2">Không tìm thấy khách hàng nào.</div>
        </div>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTheme } from 'vuetify';
import { useRouter } from 'vue-router';
import type { ZaloOnlineContact } from '@/composables/use-zalo-online-contacts';

const props = defineProps<{
  contacts: ZaloOnlineContact[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const theme = useTheme();
const router = useRouter();
const isDark = computed(() => theme.global.current.value.dark);
const searchQuery = ref('');

const activeCount = computed(() => props.contacts.filter(c => c.isOnline).length);

const filteredContacts = computed(() => {
  let list = props.contacts;
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(c => 
      c.displayName.toLowerCase().includes(q) || 
      (c.phone && c.phone.includes(q)) ||
      (c.zaloAccountName && c.zaloAccountName.toLowerCase().includes(q))
    );
  }
  
  // Sort online first, then by last active
  return list.sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    return b.lastActiveAt - a.lastActiveAt;
  });
});

function getInitials(name: string) {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function getStatusText(contact: ZaloOnlineContact) {
  if (contact.isOnline) return 'Đang online';
  if (contact.presenceText) return contact.presenceText;
  
  const now = Date.now();
  const mins = Math.floor((now - contact.lastActiveAt) / 60000);
  if (mins < 60) return `Hoạt động ${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hoạt động ${hours} giờ trước`;
  return `Hoạt động ${Math.floor(hours / 24)} ngày trước`;
}

function openChat(contact: ZaloOnlineContact) {
  emit('close');
  if (contact.conversationId) {
    router.push(`/chat?conversationId=${contact.conversationId}`);
  } else {
    // Navigate to chat with just contactId if conversationId is missing
    router.push(`/chat?contactId=${contact.contactId}`);
  }
}
</script>

<style scoped>
.online-users-dropdown {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  backdrop-filter: blur(10px);
}
</style>
