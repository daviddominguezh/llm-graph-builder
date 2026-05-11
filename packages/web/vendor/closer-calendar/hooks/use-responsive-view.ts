import { TCalendarView } from '@cc/calendar/types';
import { useEffect, useState } from 'react';

export const useResponsiveView = (
  defaultDesktopView: TCalendarView = 'week',
  defaultMobileView: TCalendarView = 'day'
) => {
  const [view, setView] = useState<TCalendarView>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 ? defaultMobileView : defaultDesktopView;
    }
    return defaultDesktopView;
  });

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      setView((current) => {
        // Only change view if it's still the default for the current screen size
        if (isMobile && current === defaultDesktopView) {
          return defaultMobileView;
        } else if (!isMobile && current === defaultMobileView) {
          return defaultDesktopView;
        }
        return current;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [defaultDesktopView, defaultMobileView]);

  return [view, setView] as const;
};
