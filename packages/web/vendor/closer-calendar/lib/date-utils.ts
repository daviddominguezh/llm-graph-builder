import { enUS, es } from 'date-fns/locale';
import { format, startOfWeek, addDays } from 'date-fns';
import { useTranslation } from 'react-i18next';

export const getDateFnsLocale = (language?: string) => {
  switch (language) {
    case 'es':
      return es;
    case 'en':
    default:
      return enUS;
  }
};

export const formatDateWithLocale = (date: Date, formatStr: string, language?: string) => {
  return format(date, formatStr, { locale: getDateFnsLocale(language) });
};

// Helper function to capitalize first letter
export const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

// Hook for components that need localized date formatting
export const useDateFormatting = () => {
  const { i18n } = useTranslation();
  
  return {
    formatDate: (date: Date, formatStr: string, shouldCapitalize: boolean = false) => {
      const formatted = format(date, formatStr, { locale: getDateFnsLocale(i18n.language) });
      return shouldCapitalize ? capitalize(formatted) : formatted;
    },
    locale: getDateFnsLocale(i18n.language)
  };
};

export const getLocalizedWeekDays = (formatStr: string = 'EEE', language?: string, shouldCapitalize: boolean = true) => {
  const locale = getDateFnsLocale(language);
  const weekStart = startOfWeek(new Date(), { locale, weekStartsOn: 1 }); // Monday = 1
  
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart, i);
    const formatted = format(day, formatStr, { locale });
    return shouldCapitalize ? capitalize(formatted) : formatted;
  });
};

// Hook to trigger re-renders when language changes
export const useLocalizedWeekDays = (formatStr: string = 'EEE', shouldCapitalize: boolean = true) => {
  const { i18n } = useTranslation();
  
  // This will re-compute when language changes and trigger re-render
  return getLocalizedWeekDays(formatStr, i18n.language, shouldCapitalize);
};