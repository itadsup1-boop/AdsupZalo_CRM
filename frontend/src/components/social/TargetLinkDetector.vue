<template>
  <div class="target-link-detector">
    <!-- Header alert banner -->
    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      class="mb-4 text-body-2"
      icon="mdi-information-outline"
    >
      Bạn có thể chọn <strong>nhiều dịch vụ</strong> và điền <strong>nhiều Link</strong> (Acc cá nhân, Page, Group, Bài viết...) cùng lúc.
    </v-alert>

    <!-- SECTION 1: TARGET LINK INPUT & AUTO RECOGNITION -->
    <v-card variant="outlined" class="mb-4 pa-4 link-input-card">
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="d-flex align-center gap-2">
          <v-icon color="primary" class="mr-1">mdi-link-variant</v-icon>
          <span class="font-weight-bold text-subtitle-1">
            1. LINK MỤC TIÊU (TỰ ĐỘNG NHẬN DIỆN NỀN TẢNG & LOẠI TRANG)
          </span>
        </div>
        <v-btn
          size="small"
          variant="outlined"
          color="primary"
          prepend-icon="mdi-format-list-bulleted"
          @click="formatLinks"
        >
          Tách 1 link/dòng
        </v-btn>
      </div>

      <v-textarea
        v-model="rawLinksInput"
        rows="4"
        variant="outlined"
        density="compact"
        hide-details
        placeholder="Nhập hoặc dán danh sách link Facebook hoặc TikTok (Video, Channel, Bài viết, Nick cá nhân, Page, Group...), mỗi link một dòng hoặc cách nhau bằng dấu phẩy:
Ví dụ:
https://www.facebook.com/groups/100012345678/
https://www.facebook.com/100012345678/posts/10101010/
https://www.facebook.com/FanpageChinhThuc/
https://vt.tiktok.com/ZS.../"
        @input="onLinkInputChanged"
        class="custom-textarea"
      ></v-textarea>

      <!-- Description note below input -->
      <div class="text-caption text-grey-darken-1 mt-2">
        <v-icon size="small" color="grey">mdi-auto-fix</v-icon>
        Bạn có thể dán nhiều link cùng lúc (Acc cá nhân, Group, Page, Bài viết...). Hệ thống sẽ tự động phân tách, nhận diện loại trang (Group, Page, Profile, Post) và lọc các dịch vụ phù hợp tương ứng.
      </div>

      <!-- LINK DETECTION SUMMARY BADGES -->
      <div v-if="parsedLinks.length > 0" class="mt-3 pt-3 border-t">
        <div class="text-caption font-weight-medium text-grey-darken-2 mb-2 d-flex align-center">
          <v-icon size="small" class="mr-1" color="success">mdi-check-circle-outline</v-icon>
          Kết quả tự động nhận diện ({{ parsedLinks.length }} link):
        </div>

        <div class="d-flex flex-wrap gap-2 mb-2">
          <!-- Summary count chips -->
          <v-chip v-if="detectedCounts.group > 0" color="indigo" size="small" variant="flat">
            <v-icon start size="x-small">mdi-account-group</v-icon>
            {{ detectedCounts.group }} Group (Nhóm)
          </v-chip>

          <v-chip v-if="detectedCounts.page > 0" color="deep-purple" size="small" variant="flat">
            <v-icon start size="x-small">mdi-flag-variant</v-icon>
            {{ detectedCounts.page }} Fanpage
          </v-chip>

          <v-chip v-if="detectedCounts.profile > 0" color="teal" size="small" variant="flat">
            <v-icon start size="x-small">mdi-account-box</v-icon>
            {{ detectedCounts.profile }} Nick cá nhân
          </v-chip>

          <v-chip v-if="detectedCounts.post > 0" color="blue" size="small" variant="flat">
            <v-icon start size="x-small">mdi-post-outline</v-icon>
            {{ detectedCounts.post }} Bài viết / Video
          </v-chip>

          <v-chip v-if="detectedCounts.tiktok > 0" color="black" size="small" variant="flat">
            <v-icon start size="x-small">mdi-music-note</v-icon>
            {{ detectedCounts.tiktok }} TikTok
          </v-chip>
        </div>

        <!-- Detailed Parsed Links List -->
        <v-expansion-panels density="compact" variant="accordion" class="mt-2">
          <v-expansion-panel elevation="0" class="bg-grey-lighten-4 rounded">
            <v-expansion-panel-title class="py-1 px-3 text-caption font-weight-bold text-primary">
              Xem danh sách chi tiết {{ parsedLinks.length }} link & loại dịch vụ tương ứng
            </v-expansion-panel-title>
            <v-expansion-panel-text class="pa-2">
              <v-list density="compact" class="bg-transparent pa-0">
                <v-list-item
                  v-for="(item, idx) in parsedLinks"
                  :key="idx"
                  class="py-1 px-2 mb-1 bg-white rounded border"
                >
                  <template v-slot:prepend>
                    <v-chip :color="item.color" size="x-small" label class="mr-2">
                      <v-icon start size="x-small">{{ item.icon }}</v-icon>
                      {{ item.typeLabel }}
                    </v-chip>
                  </template>
                  <v-list-item-title class="text-caption font-mono text-truncate">
                    {{ item.url }}
                  </v-list-item-title>
                  <v-list-item-subtitle class="text-caption text-grey">
                    Nền tảng: <strong>{{ item.platform.toUpperCase() }}</strong> | Loại: <strong>{{ item.typeName }}</strong>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </div>
    </v-card>

    <!-- SECTION 2: SERVICE SELECTION FILTERED BY DETECTED TYPES -->
    <v-card variant="outlined" class="pa-4 service-selection-card">
      <div class="d-flex align-center justify-space-between mb-3">
        <div class="d-flex align-center">
          <v-icon color="primary" class="mr-2">mdi-cogs</v-icon>
          <span class="font-weight-bold text-subtitle-1">
            2. CHỌN DỊCH VỤ & CẤU HÌNH KPI
            <span class="text-primary ml-1">(ĐÃ CHỌN {{ selectedServices.length }}/{{ availableServices.length }})</span>
          </span>
        </div>
        <div>
          <v-btn size="small" variant="text" color="primary" @click="selectAllServices">Chọn tất cả</v-btn>
          <v-btn size="small" variant="text" color="grey" @click="clearServices">Bỏ chọn</v-btn>
        </div>
      </div>

      <!-- Active Filter Status Indicator -->
      <v-alert
        v-if="parsedLinks.length > 0"
        density="compact"
        variant="tonal"
        color="info"
        class="mb-3 py-2 text-caption d-flex align-center"
      >
        <v-icon start size="small">mdi-filter-check</v-icon>
        Đang hiển thị các dịch vụ tương ứng với loại link đã nhận diện:
        <strong class="ml-1">{{ activeTypeFilterNames.join(', ') }}</strong>
      </v-alert>
      <v-alert
        v-else
        density="compact"
        variant="tonal"
        color="warning"
        class="mb-3 py-2 text-caption"
      >
        <v-icon start size="small">mdi-alert-circle-outline</v-icon>
        Vui lòng dán link mục tiêu ở trên để hệ thống tự động lọc các dịch vụ khả dụng!
      </v-alert>

      <!-- SERVICES BY CATEGORY GRID -->
      <v-row v-if="availableServices.length > 0">
        <v-col
          v-for="service in availableServices"
          :key="service.id"
          cols="12"
          md="6"
          lg="4"
        >
          <v-card
            variant="outlined"
            class="service-item-card h-100 pa-3 transition-all"
            :class="{ 'selected-border': isServiceSelected(service.id), 'disabled-service': !service.compatible }"
          >
            <div class="d-flex align-start justify-space-between">
              <v-checkbox
                v-model="selectedServices"
                :value="service.id"
                density="compact"
                hide-details
                color="primary"
                :disabled="!service.compatible"
              >
                <template v-slot:label>
                  <div>
                    <span class="font-weight-bold text-body-2">{{ service.name }}</span>
                    <v-chip
                      :color="service.typeBadgeColor"
                      size="x-small"
                      class="ml-2"
                      variant="tonal"
                    >
                      {{ service.targetTypeLabel }}
                    </v-chip>
                  </div>
                </template>
              </v-checkbox>
            </div>

            <p class="text-caption text-grey-darken-1 mt-1 mb-2 ml-7">
              {{ service.description }}
            </p>

            <!-- KPI Configuration if selected -->
            <div v-if="isServiceSelected(service.id)" class="ml-7 mt-2 pt-2 border-t">
              <div class="text-caption font-weight-medium text-primary mb-1">Cấu hình KPI số lượng:</div>
              <v-text-field
                v-model.number="kpiConfigs[service.id]"
                type="number"
                density="compact"
                variant="outlined"
                hide-details
                prefix="Số lượng:"
                suffix="lượt"
                min="1"
                class="bg-white"
              ></v-text-field>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <div v-else class="text-center py-6 text-grey">
        Không tìm thấy dịch vụ nào phù hợp với các đường link đã nhập.
      </div>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

export type LinkTargetType = 'group' | 'page' | 'profile' | 'post' | 'tiktok_video' | 'tiktok_channel' | 'unknown';

export interface LinkItem {
  url: string;
  platform: 'facebook' | 'tiktok' | 'unknown';
  type: LinkTargetType;
  typeName: string;
  typeLabel: string;
  icon: string;
  color: string;
}

export interface ServiceDef {
  id: string;
  name: string;
  category: 'facebook' | 'tiktok';
  targetTypes: LinkTargetType[];
  targetTypeLabel: string;
  typeBadgeColor: string;
  description: string;
}

// 1. INPUT RELEVENT RECTS & STATE
const rawLinksInput = ref('');
const selectedServices = ref<string[]>([]);
const kpiConfigs = ref<Record<string, number>>({});

// Master List of Services & Supported Target Types
const allServices: ServiceDef[] = [
  // --- FACEBOOK GROUP SERVICES ---
  {
    id: 'fb_group_join',
    name: 'Tăng Member / Tham gia Group',
    category: 'facebook',
    targetTypes: ['group'],
    targetTypeLabel: 'Group',
    typeBadgeColor: 'indigo',
    description: 'Thêm thành viên thực vào Nhóm Facebook'
  },
  {
    id: 'fb_group_post_seeding',
    name: 'Đăng bài & Seeding Group',
    category: 'facebook',
    targetTypes: ['group'],
    targetTypeLabel: 'Group',
    typeBadgeColor: 'indigo',
    description: 'Tự động đăng bài truyền thông vào Nhóm Facebook'
  },

  // --- FACEBOOK FANPAGE SERVICES ---
  {
    id: 'fb_page_like',
    name: 'Tăng Like / Follow Fanpage',
    category: 'facebook',
    targetTypes: ['page'],
    targetTypeLabel: 'Fanpage',
    typeBadgeColor: 'deep-purple',
    description: 'Tăng lượt thích và người theo dõi cho Trang Fanpage'
  },
  {
    id: 'fb_page_review',
    name: 'Đánh giá 5 Sao Fanpage',
    category: 'facebook',
    targetTypes: ['page'],
    targetTypeLabel: 'Fanpage',
    typeBadgeColor: 'deep-purple',
    description: 'Đánh giá uy tín 5 sao kèm bình luận cho Fanpage'
  },

  // --- FACEBOOK PROFILE / NICK CÁ NHÂN SERVICES ---
  {
    id: 'fb_profile_follow',
    name: 'Tăng Sub / Follow Nick Cá Nhân',
    category: 'facebook',
    targetTypes: ['profile'],
    targetTypeLabel: 'Nick Cá Nhân',
    typeBadgeColor: 'teal',
    description: 'Tăng lượt theo dõi thực cho Trang cá nhân Facebook'
  },
  {
    id: 'fb_profile_friend',
    name: 'Kết bạn tự động Nick Cá Nhân',
    category: 'facebook',
    targetTypes: ['profile'],
    targetTypeLabel: 'Nick Cá Nhân',
    typeBadgeColor: 'teal',
    description: 'Gửi lời mời kết bạn đến mục tiêu từ danh sách nick seeding'
  },

  // --- FACEBOOK POST / VIDEO / REEL SERVICES ---
  {
    id: 'fb_post_like',
    name: 'Tăng Like / Cảm xúc Bài viết',
    category: 'facebook',
    targetTypes: ['post'],
    targetTypeLabel: 'Bài viết / Post',
    typeBadgeColor: 'blue',
    description: 'Tăng lượt thả tim, Like, Haha, Wow cho bài viết/ảnh/video'
  },
  {
    id: 'fb_post_comment',
    name: 'Tăng Comment / Bình luận Seeding',
    category: 'facebook',
    targetTypes: ['post'],
    targetTypeLabel: 'Bài viết / Post',
    typeBadgeColor: 'blue',
    description: 'Viết bình luận mồi theo kịch bản soạn sẵn'
  },
  {
    id: 'fb_post_share',
    name: 'Tăng Chia sẻ / Share Bài viết',
    category: 'facebook',
    targetTypes: ['post'],
    targetTypeLabel: 'Bài viết / Post',
    typeBadgeColor: 'blue',
    description: 'Chia sẻ bài viết lên tường cá nhân và các Nhóm lớn'
  },

  // --- TIKTOK SERVICES ---
  {
    id: 'tt_video_like',
    name: 'Tăng Tim / Like Video TikTok',
    category: 'tiktok',
    targetTypes: ['tiktok_video'],
    targetTypeLabel: 'TikTok Video',
    typeBadgeColor: 'black',
    description: 'Tăng lượt thả tim cho clip TikTok'
  },
  {
    id: 'tt_channel_follow',
    name: 'Tăng Follower Kênh TikTok',
    category: 'tiktok',
    targetTypes: ['tiktok_channel'],
    targetTypeLabel: 'TikTok Channel',
    typeBadgeColor: 'black',
    description: 'Tăng người theo dõi kênh TikTok'
  }
];

// Helper: Analyze a single URL & determine type
function parseSingleLink(rawUrl: string): LinkItem | null {
  const url = rawUrl.trim();
  if (!url) return null;

  // 1. TikTok Links
  if (url.includes('tiktok.com')) {
    if (url.includes('/video/') || url.includes('vt.tiktok.com') || url.includes('/v/')) {
      return {
        url,
        platform: 'tiktok',
        type: 'tiktok_video',
        typeName: 'TikTok Video / Clip',
        typeLabel: 'TikTok Video',
        icon: 'mdi-video',
        color: 'black'
      };
    }
    if (url.includes('/@')) {
      return {
        url,
        platform: 'tiktok',
        type: 'tiktok_channel',
        typeName: 'TikTok Channel / Kênh',
        typeLabel: 'TikTok Kênh',
        icon: 'mdi-account-music',
        color: 'black'
      };
    }
  }

  // 2. Facebook Links
  if (url.includes('facebook.com') || url.includes('fb.com') || url.includes('fb.watch')) {
    // 2a. Group links
    if (url.includes('/groups/')) {
      if (url.includes('/posts/') || url.includes('/permalink/')) {
        return {
          url,
          platform: 'facebook',
          type: 'post',
          typeName: 'Bài viết trong Nhóm (Group Post)',
          typeLabel: 'Bài viết Group',
          icon: 'mdi-post',
          color: 'blue'
        };
      }
      return {
        url,
        platform: 'facebook',
        type: 'group',
        typeName: 'Group / Nhóm Facebook',
        typeLabel: 'FB Group',
        icon: 'mdi-account-group',
        color: 'indigo'
      };
    }

    // 2b. Posts / Photos / Videos / Reels / Watch / Share links
    if (
      url.includes('/posts/') ||
      url.includes('/permalink.php') ||
      url.includes('/story.php') ||
      url.includes('/share/p/') ||
      url.includes('/share/v/') ||
      url.includes('/share/r/') ||
      url.includes('/photos/') ||
      url.includes('/videos/') ||
      url.includes('/reel/') ||
      url.includes('/watch') ||
      url.includes('fb.watch')
    ) {
      return {
        url,
        platform: 'facebook',
        type: 'post',
        typeName: 'Bài viết / Video / Reel Facebook',
        typeLabel: 'FB Bài viết',
        icon: 'mdi-post-outline',
        color: 'blue'
      };
    }

    // 2c. Personal Profile
    if (url.includes('/profile.php') || url.includes('/people/')) {
      return {
        url,
        platform: 'facebook',
        type: 'profile',
        typeName: 'Trang cá nhân / Nick cá nhân',
        typeLabel: 'FB Nick cá nhân',
        icon: 'mdi-account-box',
        color: 'teal'
      };
    }

    // 2d. Page links (/pages/ or /p/)
    if (url.includes('/pages/') || url.includes('/p/')) {
      return {
        url,
        platform: 'facebook',
        type: 'page',
        typeName: 'Trang Fanpage Facebook',
        typeLabel: 'FB Fanpage',
        icon: 'mdi-flag-variant',
        color: 'deep-purple'
      };
    }

    // Standard facebook.com/username (Default to Fanpage / Nick cá nhân)
    return {
      url,
      platform: 'facebook',
      type: 'page', // or profile
      typeName: 'Fanpage / Nick cá nhân',
      typeLabel: 'FB Page / Profile',
      icon: 'mdi-earth',
      color: 'deep-purple'
    };
  }

  return {
    url,
    platform: 'unknown',
    type: 'unknown',
    typeName: 'Chưa nhận diện',
    typeLabel: 'Khác',
    icon: 'mdi-help-circle',
    color: 'grey'
  };
}

// 2. PARSED LINKS COMPUTED
const parsedLinks = computed<LinkItem[]>(() => {
  if (!rawLinksInput.value.trim()) return [];
  const lines = rawLinksInput.value
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  return lines.map(parseSingleLink).filter(Boolean) as LinkItem[];
});

// Summary counts
const detectedCounts = computed(() => {
  const counts = { group: 0, page: 0, profile: 0, post: 0, tiktok: 0 };
  parsedLinks.value.forEach(item => {
    if (item.type === 'group') counts.group++;
    else if (item.type === 'page') counts.page++;
    else if (item.type === 'profile') counts.profile++;
    else if (item.type === 'post') counts.post++;
    else if (item.platform === 'tiktok') counts.tiktok++;
  });
  return counts;
});

// Active detected types set
const detectedTypesSet = computed<Set<LinkTargetType>>(() => {
  const types = new Set<LinkTargetType>();
  parsedLinks.value.forEach(link => {
    if (link.type !== 'unknown') types.add(link.type);
  });
  return types;
});

const activeTypeFilterNames = computed(() => {
  const names: string[] = [];
  if (detectedTypesSet.value.has('group')) names.push('Group (Nhóm)');
  if (detectedTypesSet.value.has('page')) names.push('Fanpage');
  if (detectedTypesSet.value.has('profile')) names.push('Nick cá nhân');
  if (detectedTypesSet.value.has('post')) names.push('Bài viết / Post');
  if (detectedTypesSet.value.has('tiktok_video')) names.push('TikTok Video');
  if (detectedTypesSet.value.has('tiktok_channel')) names.push('TikTok Channel');
  return names;
});

// 3. AVAILABLE SERVICES (FILTERED & COMPATIBILITY CHECKED)
const availableServices = computed(() => {
  const detected = detectedTypesSet.value;
  // If no links entered, show all services enabled
  if (detected.size === 0) {
    return allServices.map(s => ({ ...s, compatible: true }));
  }

  // Filter or flag compatibility
  return allServices.map(s => {
    const isCompatible = s.targetTypes.some(t => detected.has(t));
    return {
      ...s,
      compatible: isCompatible
    };
  });
});

// ACTIONS
function formatLinks() {
  if (!rawLinksInput.value) return;
  const links = rawLinksInput.value
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);
  rawLinksInput.value = links.join('\n');
}

function onLinkInputChanged() {
  // Auto deselect non-compatible services if user changed links
  const compatibleSet = new Set(
    availableServices.value.filter(s => s.compatible).map(s => s.id)
  );
  if (parsedLinks.value.length > 0) {
    selectedServices.value = selectedServices.value.filter(id => compatibleSet.has(id));
  }
}

function isServiceSelected(id: string) {
  return selectedServices.value.includes(id);
}

function selectAllServices() {
  selectedServices.value = availableServices.value
    .filter(s => s.compatible)
    .map(s => s.id);
}

function clearServices() {
  selectedServices.value = [];
}
</script>

<style scoped>
.link-input-card {
  border-color: rgba(var(--v-theme-primary), 0.3) !important;
  background-color: #fafafa;
}

.custom-textarea :deep(textarea) {
  font-family: monospace;
  font-size: 0.875rem;
  line-height: 1.4;
}

.service-item-card {
  transition: all 0.2s ease-in-out;
}

.service-item-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.selected-border {
  border-color: rgba(var(--v-theme-primary), 0.8) !important;
  background-color: rgba(var(--v-theme-primary), 0.02);
}

.disabled-service {
  opacity: 0.4;
  pointer-events: none;
  background-color: #f5f5f5;
}

.gap-2 {
  gap: 8px;
}
</style>
