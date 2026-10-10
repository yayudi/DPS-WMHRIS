import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

NProgress.configure({ showSpinner: true, minimum: 0.1, speed: 400 });

export const useLoadingStore = defineStore('loading', () => {
  const activeRequests = ref(0);

  const isGlobalLoading = computed(() => activeRequests.value > 0);

  function startLoading() {
    if (activeRequests.value === 0) {
      NProgress.start();
    }
    activeRequests.value++;
  }

  function stopLoading() {
    if (activeRequests.value > 0) {
      activeRequests.value--;
      if (activeRequests.value === 0) {
        NProgress.done();
      }
    }
  }

  function resetLoading() {
    activeRequests.value = 0;
    NProgress.done();
  }

  return {
    activeRequests,
    isGlobalLoading,
    startLoading,
    stopLoading,
    resetLoading
  };
});
