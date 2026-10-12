<!-- front/src/components/ui/BaseQrScanner.vue -->
<script setup>
import { ref, watch, onMounted, onUnmounted, shallowRef, computed } from 'vue'
import { useDevicesList, useUserMedia } from '@vueuse/core'
import jsQR from 'jsqr'

const props = defineProps({
  /**
   * Pause scanning (useful when processing a detected code)
   */
  paused: {
    type: Boolean,
    default: false
  },
  /**
   * Scan interval in milliseconds (default: 300ms to save CPU)
   */
  interval: {
    type: Number,
    default: 300
  }
})

const emit = defineEmits(['detect', 'error', 'ready'])

const videoRef = shallowRef(null)
const canvasRef = shallowRef(null)

// Get available video inputs (cameras)
const { videoInputs, ensurePermissions } = useDevicesList({
  requestPermissions: true,
  onUpdated() {
    // If no camera is selected, select the first back camera or just the first camera
    if (!currentCamera.value && videoInputs.value.length > 0) {
      const backCamera = videoInputs.value.find(
        c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('environment')
      )
      currentCamera.value = backCamera ? backCamera.deviceId : videoInputs.value[0].deviceId
    }
  }
})

const currentCamera = ref(undefined)
const hasMultipleCameras = computed(() => videoInputs.value.length > 1)

const switchCamera = () => {
  if (videoInputs.value.length < 2) return
  const currentIndex = videoInputs.value.findIndex(c => c.deviceId === currentCamera.value)
  const nextIndex = (currentIndex + 1) % videoInputs.value.length
  currentCamera.value = videoInputs.value[nextIndex].deviceId
}

// Start media stream
const { stream, start, stop, isSupported } = useUserMedia({
  constraints: computed(() => ({
    video: {
      deviceId: currentCamera.value ? { exact: currentCamera.value } : undefined,
      facingMode: currentCamera.value ? undefined : 'environment' // fallback
    },
    audio: false
  }))
})

const isReady = ref(false)
const errorMsg = ref('')

watch(stream, newStream => {
  if (videoRef.value && newStream) {
    videoRef.value.srcObject = newStream
    // Need to play it (sometimes required on mobile)
    videoRef.value.play().catch(e => {
      console.error('Error playing video:', e)
    })
  }
})

let scanIntervalId = null

const scan = () => {
  if (props.paused || !isReady.value) return

  if (videoRef.value && videoRef.value.readyState === videoRef.value.HAVE_ENOUGH_DATA) {
    const canvas = canvasRef.value
    const context = canvas.getContext('2d', { willReadFrequently: true })

    // Set canvas dimensions to match video
    canvas.width = videoRef.value.videoWidth
    canvas.height = videoRef.value.videoHeight

    // Draw current video frame to canvas
    context.drawImage(videoRef.value, 0, 0, canvas.width, canvas.height)

    // Extract image data
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

    // Scan with jsQR
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert' // faster
    })

    if (code) {
      emit('detect', code.data)
    }
  }
}

const handleVideoPlay = () => {
  isReady.value = true
  emit('ready')
}

onMounted(async () => {
  if (!isSupported.value) {
    errorMsg.value = 'Browser tidak mendukung akses kamera.'
    emit('error', new Error('MediaDevices not supported'))
    return
  }

  try {
    const hasPerms = await ensurePermissions()
    if (hasPerms) {
      await start()
      scanIntervalId = setInterval(scan, props.interval)
    } else {
      errorMsg.value = 'Izin kamera ditolak.'
      emit('error', new Error('Camera permission denied'))
    }
  } catch (err) {
    errorMsg.value = 'Gagal mengakses kamera.'
    emit('error', err)
  }
})

onUnmounted(() => {
  stop()
  if (scanIntervalId) clearInterval(scanIntervalId)
})
</script>

<template>
  <div
    class="relative w-full max-w-md mx-auto overflow-hidden bg-slate-900 rounded-2xl shadow-xl border border-slate-700/50 aspect-square sm:aspect-[4/3]"
  >
    <!-- Error State -->
    <div
      v-if="errorMsg"
      class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-20 bg-slate-900"
    >
      <div class="w-16 h-16 mb-4 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
        <i class="fa-solid fa-video-slash text-2xl"></i>
      </div>
      <p class="text-slate-200 font-medium">{{ errorMsg }}</p>
    </div>

    <!-- Loading State -->
    <div v-else-if="!isReady" class="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900">
      <div class="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-slate-400 text-sm mt-4 animate-pulse">Menyiapkan kamera...</p>
    </div>

    <!-- Video Feed -->
    <video
      ref="videoRef"
      class="w-full h-full object-cover transition-opacity duration-300"
      :class="isReady ? 'opacity-100' : 'opacity-0'"
      autoplay
      playsinline
      muted
      @play="handleVideoPlay"
    ></video>

    <!-- Hidden Canvas for Processing -->
    <canvas ref="canvasRef" class="hidden"></canvas>

    <!-- UI Overlay -->
    <div v-if="isReady && !errorMsg" class="absolute inset-0 z-10 pointer-events-none">
      <!-- Darkened Mask with clear center -->
      <div class="absolute inset-0 border-[60px] sm:border-[80px] border-black/40"></div>

      <!-- Scanner Frame -->
      <div class="absolute inset-0 m-[60px] sm:m-[80px]">
        <!-- Corner brackets -->
        <div class="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-lg"></div>
        <div class="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-lg"></div>
        <div class="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-lg"></div>
        <div class="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-lg"></div>

        <!-- Scanning line animation (paused when props.paused is true) -->
        <div
          class="w-full h-0.5 bg-indigo-500 shadow-[0_0_8px_2px_rgba(99,102,241,0.6)] animate-[scan_2s_ease-in-out_infinite]"
          :class="{ hidden: paused }"
        ></div>
      </div>
    </div>

    <!-- Controls -->
    <div v-if="isReady && !errorMsg" class="absolute bottom-4 left-0 right-0 flex justify-center gap-4 z-30">
      <!-- Camera Switcher -->
      <button
        v-if="hasMultipleCameras"
        @click.stop.prevent="switchCamera"
        class="flex items-center justify-center w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-all border border-white/10 active:scale-95"
        title="Tukar Kamera"
      >
        <i class="fa-solid fa-camera-rotate"></i>
      </button>

      <!-- Pause Indicator -->
      <div
        v-if="paused"
        class="flex items-center gap-2 px-4 h-12 rounded-full bg-amber-500/90 text-white font-medium backdrop-blur-sm shadow-lg shadow-amber-500/20"
      >
        <i class="fa-solid fa-pause"></i>
        <span>Jeda</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes scan {
  0%,
  100% {
    top: 0;
  }
  50% {
    top: calc(100% - 2px);
  }
}
.animate-\[scan_2s_ease-in-out_infinite\] {
  position: absolute;
  animation: scan 2s ease-in-out infinite;
}
</style>
