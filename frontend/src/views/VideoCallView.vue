<template>
  <div class="video-call-container bg-gray-900 h-screen w-screen flex flex-col">
    <!-- Header -->
    <div class="p-4 bg-gray-800 flex justify-between items-center z-10 shadow-md">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold shadow-lg">
          <i class="fas fa-video"></i>
        </div>
        <div>
          <h1 class="text-white text-lg font-semibold tracking-wide">ZaloCRM Video Call</h1>
          <p class="text-gray-400 text-sm flex items-center">
            <span class="w-2 h-2 rounded-full mr-2" :class="isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'"></span>
            {{ isConnected ? (peerConnected ? 'Connected securely' : 'Waiting for others...') : 'Connecting to server...' }}
          </p>
        </div>
      </div>
      <button @click="endCall" class="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-full font-medium transition-all shadow-lg hover:shadow-red-500/30 flex items-center">
        <i class="fas fa-phone-slash mr-2"></i> Kết thúc
      </button>
    </div>

    <!-- Video Grid -->
    <div class="flex-1 relative overflow-hidden bg-black flex items-center justify-center p-4 sm:p-8">
      
      <!-- Remote Video (Full Screen) -->
      <div class="w-full h-full relative rounded-2xl overflow-hidden shadow-2xl bg-gray-800/50 flex items-center justify-center border border-gray-700/50">
        <video 
          ref="remoteVideo" 
          autoplay 
          playsinline 
          class="w-full h-full object-cover"
          :class="{ 'hidden': !peerConnected }"
        ></video>
        
        <!-- Waiting State -->
        <div v-if="!peerConnected" class="flex flex-col items-center justify-center text-gray-400">
          <div class="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mb-6 shadow-inner border border-gray-700">
            <i class="fas fa-user-astronaut text-4xl text-gray-500 animate-bounce"></i>
          </div>
          <p class="text-xl font-medium tracking-wide">Đang đợi khách hàng tham gia...</p>
          <p class="text-sm mt-2 text-gray-500">Mã phòng: <span class="font-mono bg-gray-800 px-2 py-1 rounded text-gray-300">{{ roomId }}</span></p>
        </div>
      </div>

      <!-- Local Video (PiP) -->
      <div class="absolute bottom-8 right-8 w-48 sm:w-64 aspect-[3/4] sm:aspect-video rounded-xl overflow-hidden shadow-2xl border-2 border-gray-600 bg-gray-800 transition-transform hover:scale-105 z-20">
        <video 
          ref="localVideo" 
          autoplay 
          playsinline 
          muted 
          class="w-full h-full object-cover transform scale-x-[-1]"
        ></video>
        <div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white backdrop-blur-sm">
          Bạn
        </div>
      </div>
    </div>

    <!-- Controls -->
    <div class="p-6 bg-gradient-to-t from-gray-900 to-transparent flex justify-center space-x-6 z-10 absolute bottom-0 w-full">
      <button @click="toggleAudio" class="control-btn" :class="isAudioMuted ? 'bg-red-500/20 text-red-500 border-red-500/50' : 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'">
        <i class="fas" :class="isAudioMuted ? 'fa-microphone-slash' : 'fa-microphone'"></i>
      </button>
      <button @click="toggleVideo" class="control-btn" :class="isVideoMuted ? 'bg-red-500/20 text-red-500 border-red-500/50' : 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'">
        <i class="fas" :class="isVideoMuted ? 'fa-video-slash' : 'fa-video'"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const roomId = route.params.roomId as string;
const userId = authStore.user?.id || Math.random().toString(36).substring(7);
const userName = authStore.user?.fullName || 'Khách';

const localVideo = ref<HTMLVideoElement | null>(null);
const remoteVideo = ref<HTMLVideoElement | null>(null);

const isConnected = ref(false);
const peerConnected = ref(false);
const isAudioMuted = ref(false);
const isVideoMuted = ref(false);

let socket: Socket | null = null;
let localStream: MediaStream | null = null;
let peerConnection: RTCPeerConnection | null = null;

// STUN servers for WebRTC
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const setupMedia = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localVideo.value) {
      localVideo.value.srcObject = localStream;
    }
  } catch (err) {
    console.error('Lỗi truy cập camera/mic:', err);
    alert('Không thể truy cập camera và microphone. Vui lòng cấp quyền.');
  }
};

const setupSocket = () => {
  const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin;
  socket = io(wsUrl, {
    withCredentials: true,
  });

  socket.on('connect', () => {
    isConnected.value = true;
    socket?.emit('call:join-room', { roomId, userId, userName });
  });

  socket.on('disconnect', () => {
    isConnected.value = false;
  });

  // When another user joins, we (as the existing user) create an offer
  socket.on('call:user-joined', async (data: { userId: string, userName: string, socketId: string }) => {
    console.log('User joined:', data);
    createPeerConnection(data.socketId);
    
    try {
      const offer = await peerConnection!.createOffer();
      await peerConnection!.setLocalDescription(offer);
      socket?.emit('call:signal', {
        roomId,
        targetSocketId: data.socketId,
        signal: { type: 'offer', sdp: peerConnection!.localDescription },
        userId,
        userName
      });
    } catch (err) {
      console.error('Error creating offer:', err);
    }
  });

  // Handle incoming signaling messages
  socket.on('call:signal', async (data: { signal: any, userId: string, userName: string, socketId: string }) => {
    const { signal, socketId } = data;
    
    if (!peerConnection) {
      createPeerConnection(socketId);
    }

    try {
      if (signal.type === 'offer') {
        await peerConnection!.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await peerConnection!.createAnswer();
        await peerConnection!.setLocalDescription(answer);
        
        socket?.emit('call:signal', {
          roomId,
          targetSocketId: socketId,
          signal: { type: 'answer', sdp: peerConnection!.localDescription },
          userId,
          userName
        });
      } else if (signal.type === 'answer') {
        await peerConnection!.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signal.type === 'candidate') {
        await peerConnection!.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.error('Error handling signal:', err);
    }
  });

  socket.on('call:user-left', () => {
    peerConnected.value = false;
    if (remoteVideo.value) remoteVideo.value.srcObject = null;
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
  });
};

const createPeerConnection = (targetSocketId: string) => {
  if (peerConnection) return;
  
  peerConnection = new RTCPeerConnection(configuration);

  // Add local stream tracks to the connection
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection!.addTrack(track, localStream!);
    });
  }

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket?.emit('call:signal', {
        roomId,
        targetSocketId,
        signal: { type: 'candidate', candidate: event.candidate },
        userId,
        userName
      });
    }
  };

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    if (remoteVideo.value && event.streams[0]) {
      remoteVideo.value.srcObject = event.streams[0];
      peerConnected.value = true;
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection?.connectionState === 'disconnected' || peerConnection?.connectionState === 'failed') {
      peerConnected.value = false;
    }
  };
};

const toggleAudio = () => {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      isAudioMuted.value = !audioTrack.enabled;
    }
  }
};

const toggleVideo = () => {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      isVideoMuted.value = !videoTrack.enabled;
    }
  }
};

const endCall = () => {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (peerConnection) {
    peerConnection.close();
  }
  if (socket) {
    socket.emit('call:leave-room', { roomId, userId });
    socket.disconnect();
  }
  router.push('/chat');
};

onMounted(async () => {
  // Check if FontAwesome is loaded (optional fallback)
  if (!document.getElementById('fa-stylesheet')) {
    const link = document.createElement('link');
    link.id = 'fa-stylesheet';
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(link);
  }

  await setupMedia();
  setupSocket();
});

onUnmounted(() => {
  endCall();
});
</script>

<style scoped>
.control-btn {
  @apply w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all duration-300 border backdrop-blur-md shadow-lg;
}
.control-btn:hover {
  @apply transform scale-110;
}
</style>
