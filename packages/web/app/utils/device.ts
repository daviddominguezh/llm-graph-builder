import { useEffect, useState } from 'react';

/**
 * Utility functions for device detection
 */

/**
 * Hook to get current device type with reactive updates on window resize
 * Uses 150ms debouncing to prevent excessive re-renders during resize
 * @returns {boolean} True if mobile device (< 1200px), false otherwise
 */
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1200; // lg breakpoint in Tailwind
  });

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsMobile(window.innerWidth < 1200);
      }, 150); // Debounce 150ms
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return isMobile;
};
