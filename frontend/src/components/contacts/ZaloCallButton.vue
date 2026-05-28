<template>
  <v-btn
    color="info"
    variant="flat"
    prepend-icon="mdi-phone"
    @click="handleCall"
    :loading="loading"
    v-bind="$attrs"
  >
    Gọi Zalo
  </v-btn>

  <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
    {{ snackbarText }}
  </v-snackbar>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  phone?: string | null;
}>();

const loading = ref(false);
const snackbar = ref(false);
const snackbarText = ref('');
const snackbarColor = ref('error');

function showMessage(text: string, color = 'error') {
  snackbarText.value = text;
  snackbarColor.value = color;
  snackbar.value = true;
}

function handleCall() {
  if (!props.phone) {
    showMessage('Khách hàng chưa có số điện thoại', 'warning');
    return;
  }

  const phoneNumber = props.phone.replace(/[^0-9+]/g, '');
  loading.value = true;

  // Custom scheme for Zalo
  const schemeUrl = `zalo://search?q=${phoneNumber}`; // Or zalo://chat?phone=...
  
  // Try to open custom scheme
  const start = Date.now();
  
  // Create an iframe to attempt opening the scheme without navigating away
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = schemeUrl;
  document.body.appendChild(iframe);

  setTimeout(() => {
    document.body.removeChild(iframe);
    loading.value = false;
    
    // Check if the page is still active/visible after 2 seconds
    // If the app was launched, the browser might have been put in background
    if (Date.now() - start < 2500 && !document.hidden) {
      // Fallback: Copy phone and show message
      copyToClipboard(phoneNumber);
      showMessage('Vui lòng cài Zalo hoặc mở Zalo thủ công (đã copy số điện thoại).', 'info');
    }
  }, 2000);
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error('Failed to copy', err);
  }
}
</script>
