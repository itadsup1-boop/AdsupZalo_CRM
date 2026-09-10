<template>
  <div class="workflow-builder-container">
    <v-app-bar flat border density="compact">
      <v-btn icon="mdi-arrow-left" @click="router.push('/admin/tag-automations')"></v-btn>
      <v-toolbar-title class="text-subtitle-1 font-weight-bold">
        Builder: {{ workflow?.name || 'Đang tải...' }}
      </v-toolbar-title>
      <v-spacer></v-spacer>
      
      <v-chip
        v-if="workflow?.status"
        :color="workflow.status === 'active' ? 'success' : 'warning'"
        size="small"
        class="mr-4"
      >
        {{ workflow.status === 'active' ? 'Đang chạy' : 'Tạm dừng' }}
      </v-chip>

      <v-btn
        prepend-icon="mdi-content-save"
        color="primary"
        variant="flat"
        size="small"
        @click="saveWorkflow"
        :loading="saving"
      >
        Lưu Sơ Đồ
      </v-btn>
    </v-app-bar>

    <div class="d-flex h-100" style="padding-top: 48px;">
      <!-- Sidebar Tools -->
      <div class="sidebar-nodes pa-3 bg-surface border-e" style="width: 250px;">
        <div class="text-subtitle-2 mb-3 text-grey">CÔNG CỤ KẾT NỐI</div>
        
        <div 
          class="node-item border rounded px-3 py-2 mb-2 bg-background d-flex align-center cursor-move"
          draggable="true"
          @dragstart="onDragStart($event, 'zaloMessage')"
        >
          <v-icon color="info" class="mr-2">mdi-message-text</v-icon>
          Gửi tin Zalo
        </div>

        <div 
          class="node-item border rounded px-3 py-2 mb-2 bg-background d-flex align-center cursor-move"
          draggable="true"
          @dragstart="onDragStart($event, 'delay')"
        >
          <v-icon color="warning" class="mr-2">mdi-clock-outline</v-icon>
          Chờ (Delay)
        </div>

        <div 
          class="node-item border rounded px-3 py-2 mb-2 bg-background d-flex align-center cursor-move"
          draggable="true"
          @dragstart="onDragStart($event, 'tagContact')"
        >
          <v-icon color="primary" class="mr-2">mdi-tag-plus</v-icon>
          Gắn / Xóa Thẻ
        </div>

        <div 
          class="node-item border rounded px-3 py-2 mb-2 bg-background d-flex align-center cursor-move"
          draggable="true"
          @dragstart="onDragStart($event, 'createTask')"
        >
          <v-icon color="error" class="mr-2">mdi-clipboard-check-outline</v-icon>
          Tạo nhắc nhở Sale
        </div>
      </div>

      <!-- Canvas -->
      <div class="flex-grow-1 position-relative" @drop="onDrop" @dragover.prevent @dragenter.prevent>
        <VueFlow 
          v-model:nodes="nodes" 
          v-model:edges="edges" 
          class="vue-flow-basic-example"
          :default-viewport="{ zoom: 1.5 }"
          :min-zoom="0.2"
          :max-zoom="4"
          @nodeDoubleClick="onNodeDoubleClick"
        >
          <Background pattern-color="#aaa" :gap="16" />
          <Controls />
          
          <template #node-default="{ data, label, selected, id }">
            <div 
              class="custom-node d-flex flex-column align-center justify-center pa-3 rounded-lg position-relative"
              :class="[
                `node-${data.type}`, 
                { 'node-selected': selected }
              ]"
            >
              <!-- Delete Button -->
              <v-btn
                v-show="selected"
                icon="mdi-close"
                size="x-small"
                color="error"
                variant="flat"
                class="node-delete-btn"
                @click.stop="deleteNode(id)"
              ></v-btn>

              <Handle type="target" :position="Position.Top" class="custom-handle" />
              
              <div class="node-icon-wrapper mb-2">
                <v-icon size="24" :color="getIconColorForType(data.type)">
                  {{ getIconForType(data.type) }}
                </v-icon>
              </div>
              <div class="text-caption font-weight-medium text-center text-truncate w-100 px-1" style="max-width: 120px;">
                {{ label }}
              </div>
              
              <Handle type="source" :position="Position.Bottom" class="custom-handle" />
            </div>
          </template>
        </VueFlow>
      </div>
    </div>

    <!-- Node Configuration Dialog -->
    <v-dialog v-model="nodeDialog" max-width="500px">
      <v-card v-if="selectedNode">
        <v-card-title>
          Cấu hình: {{ getLabelForType(selectedNode.data.type) }}
        </v-card-title>
        <v-card-text>
          <!-- Zalo Message -->
          <div v-if="selectedNode.data.type === 'zaloMessage'">
            <v-textarea
              v-model="nodeForm.content"
              label="Nội dung tin nhắn"
              hint="Hỗ trợ biến: {{customer_name}}, {{customer_phone}}"
              rows="4"
              autofocus
            ></v-textarea>
          </div>
          
          <!-- Delay -->
          <div v-if="selectedNode.data.type === 'delay'">
            <v-radio-group v-model="nodeForm.delayType" inline class="mb-2">
              <v-radio label="Chờ theo phút" value="relative"></v-radio>
              <v-radio label="Chờ đến ngày giờ" value="absolute"></v-radio>
            </v-radio-group>

            <v-text-field
              v-if="nodeForm.delayType === 'relative' || !nodeForm.delayType"
              v-model.number="nodeForm.delayMinutes"
              type="number"
              label="Thời gian chờ (phút)"
              min="1"
              autofocus
            ></v-text-field>

            <v-text-field
              v-if="nodeForm.delayType === 'absolute'"
              v-model="nodeForm.absoluteDateTime"
              type="datetime-local"
              label="Chọn ngày giờ"
              autofocus
            ></v-text-field>
          </div>

          <!-- Tag Contact -->
          <div v-if="selectedNode.data.type === 'tagContact'">
            <v-select
              v-model="nodeForm.tagName"
              :items="tags"
              item-title="name"
              item-value="name"
              label="Chọn thẻ cần gắn"
              hint="Chọn thẻ từ danh sách hiện có"
              clearable
              autofocus
            ></v-select>
          </div>

          <!-- Create Task -->
          <div v-if="selectedNode.data.type === 'createTask'">
            <v-text-field
              v-model="nodeForm.taskNote"
              label="Nội dung nhắc nhở"
              autofocus
            ></v-text-field>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="nodeDialog = false">Hủy</v-btn>
          <v-btn color="primary" @click="saveNodeConfig">Lưu cấu hình</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { VueFlow, useVueFlow, Handle, Position } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

import { api } from '@/api';
import { toast } from 'vue-sonner';

const route = useRoute();
const router = useRouter();
const workflowId = route.params.id as string;

const workflow = ref<any>(null);
const nodes = ref<any[]>([]);
const edges = ref<any[]>([]);
const tags = ref<any[]>([]);
const saving = ref(false);

const nodeDialog = ref(false);
const selectedNode = ref<any>(null);
const nodeForm = ref<any>({});

const { project, onConnect, addEdges, removeNodes } = useVueFlow();

onConnect((params) => {
  addEdges([params]);
});

function deleteNode(nodeId: string) {
  // Remove the node using useVueFlow's removeNodes helper
  removeNodes([nodeId]);
}

function onNodeDoubleClick(event: any) {
  selectedNode.value = event.node;
  nodeForm.value = { ...event.node.data };
  nodeDialog.value = true;
}

function saveNodeConfig() {
  if (!selectedNode.value) return;
  
  // Update node data
  selectedNode.value.data = { ...nodeForm.value };
  
  // Update visual label based on configured data
  const type = selectedNode.value.data.type;
  if (type === 'zaloMessage' && nodeForm.value.content) {
    const preview = nodeForm.value.content.length > 20 
      ? nodeForm.value.content.substring(0, 20) + '...' 
      : nodeForm.value.content;
    selectedNode.value.label = `💬 Gửi: ${preview}`;
  } else if (type === 'delay') {
    if (nodeForm.value.delayType === 'absolute' && nodeForm.value.absoluteDateTime) {
      const dt = new Date(nodeForm.value.absoluteDateTime);
      selectedNode.value.label = `⏳ Tới: ${dt.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`;
    } else if (nodeForm.value.delayMinutes) {
      selectedNode.value.label = `⏳ Chờ: ${nodeForm.value.delayMinutes} phút`;
    }
  } else if (type === 'tagContact' && nodeForm.value.tagName) {
    selectedNode.value.label = `🏷️ Gắn Thẻ: ${nodeForm.value.tagName}`;
  } else if (type === 'createTask' && nodeForm.value.taskNote) {
    selectedNode.value.label = `✅ Nhắc: ${nodeForm.value.taskNote}`;
  }

  nodeDialog.value = false;
}

function onDragStart(event: DragEvent, nodeType: string) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/vueflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }
}

function onDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData('application/vueflow');
  if (!type) return;

  const position = project({
    x: event.clientX - 250, // subtract sidebar width roughly
    y: event.clientY - 48,  // subtract appbar height roughly
  });

  const newNode = {
    id: `node_${Date.now()}`,
    type: 'default',
    position,
    label: getLabelForType(type),
    data: { type },
  };

  nodes.value.push(newNode);
}

function getLabelForType(type: string) {
  switch (type) {
    case 'zaloMessage': return 'Gửi tin Zalo';
    case 'delay': return 'Chờ thời gian';
    case 'tagContact': return 'Gắn Thẻ';
    case 'createTask': return 'Tạo Nhắc nhở';
    default: return 'Node mới';
  }
}

function getIconForType(type: string) {
  switch (type) {
    case 'zaloMessage': return 'mdi-message-text';
    case 'delay': return 'mdi-clock-outline';
    case 'tagContact': return 'mdi-tag-plus';
    case 'createTask': return 'mdi-clipboard-check-outline';
    default: return 'mdi-puzzle';
  }
}

function getIconColorForType(type: string) {
  switch (type) {
    case 'zaloMessage': return 'info';
    case 'delay': return 'warning';
    case 'tagContact': return 'primary';
    case 'createTask': return 'error';
    default: return 'grey';
  }
}

async function loadWorkflow() {
  try {
    const { data } = await api.get(`/automations/workflows/${workflowId}`);
    workflow.value = data;
    nodes.value = data.nodes && Array.isArray(data.nodes) ? data.nodes : [];
    edges.value = data.edges && Array.isArray(data.edges) ? data.edges : [];
  } catch (error) {
    toast.error('Không tải được Workflow');
    router.push('/admin/tag-automations');
  }
}

async function fetchTags() {
  try {
    const { data } = await api.get('/tags');
    tags.value = data.tags || [];
  } catch (error) {
    console.error('Lỗi khi tải danh sách thẻ:', error);
  }
}

async function saveWorkflow() {
  saving.value = true;
  try {
    await api.put(`/automations/workflows/${workflowId}`, {
      nodes: nodes.value,
      edges: edges.value,
    });
    toast.success('Đã lưu Sơ đồ thành công');
  } catch (error) {
    toast.error('Lỗi khi lưu sơ đồ');
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadWorkflow();
  fetchTags();
});
</script>

<style scoped>
.workflow-builder-container {
  height: calc(100vh - 64px);
  margin: -16px;
  display: flex;
  flex-direction: column;
}
.sidebar-nodes {
  background-color: var(--v-theme-surface);
  z-index: 4;
}
.node-item:hover {
  border-color: var(--v-primary-base) !important;
  color: var(--v-primary-base);
}

/* Override default VueFlow node styles using deep selector */
:deep(.vue-flow__node-default) {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
}

/* Custom Node Styles */
.custom-node {
  min-width: 140px;
  background: rgba(var(--v-theme-surface), 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(128, 128, 128, 0.2);
  box-shadow: 0 4px 15px rgba(0,0,0,0.05);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  color: #ffffff !important;
}

.custom-node:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0,0,0,0.1);
}

.node-selected {
  border: 2px solid var(--v-theme-primary);
  box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.15), 0 8px 25px rgba(0,0,0,0.1);
}

/* Delete button */
.node-delete-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  z-index: 10;
  border-radius: 50%;
  width: 20px;
  height: 20px;
}

.custom-node:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0,0,0,0.1);
}

.node-selected {
  border: 2px solid var(--v-theme-primary);
  box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.15), 0 8px 25px rgba(0,0,0,0.1);
}

/* Specific node type styles */
.node-zaloMessage .node-icon-wrapper { background: rgba(var(--v-theme-info), 0.1); padding: 8px; border-radius: 50%; }
.node-delay .node-icon-wrapper { background: rgba(var(--v-theme-warning), 0.1); padding: 8px; border-radius: 50%; }
.node-tagContact .node-icon-wrapper { background: rgba(var(--v-theme-primary), 0.1); padding: 8px; border-radius: 50%; }
.node-createTask .node-icon-wrapper { background: rgba(var(--v-theme-error), 0.1); padding: 8px; border-radius: 50%; }

/* Handle styles */
:deep(.custom-handle) {
  width: 14px !important;
  height: 14px !important;
  background: white !important;
  border: 3px solid #2196F3 !important;
  transition: all 0.2s ease;
  opacity: 1 !important;
  visibility: visible !important;
}
:deep(.custom-handle:hover) {
  background: #2196F3 !important;
  transform: scale(1.3);
}
</style>
