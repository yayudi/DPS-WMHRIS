import { useMediaQuery } from '@vueuse/core';

/**
 * Composable to detect mobile viewports based on a breakpoint.
 * Reactively updates `isMobile` using VueUse's useMediaQuery (auto-cleaned up).
 * 
 * @param {number} breakpoint - The width in pixels below which the viewport is considered mobile. Default is 768px (Tailwind 'md').
 * @returns {{ isMobile: import('vue').Ref<boolean> }}
 */
export function useMobile(breakpoint = 768) {
  // Evaluates to true if viewport width is less than the breakpoint
  const isMobile = useMediaQuery(`(max-width: ${breakpoint - 1}px)`);

  return { isMobile };
}
