import { ref, onMounted, onUnmounted } from 'vue';

// Reactive mobile flag via matchMedia. Mobile-first: default assumes mobile
// until mounted so the first paint is the small-screen layout.
export function useIsMobile(maxWidth = 900) {
  const mq = window.matchMedia(`(max-width: ${maxWidth - 1}px)`);
  const isMobile = ref(mq.matches);
  const onChange = (e) => { isMobile.value = e.matches; };
  onMounted(() => mq.addEventListener('change', onChange));
  onUnmounted(() => mq.removeEventListener('change', onChange));
  return isMobile;
}
