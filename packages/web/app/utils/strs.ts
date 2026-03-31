/* eslint-disable no-useless-escape */
import { AddressSchemaType, PaymentItem } from '@/app/types/orders';
import crypto from 'crypto';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import calendar from 'dayjs/plugin/calendar';

dayjs.extend(calendar);
dayjs.locale('es');

/**
 * Minimal i18n stub – provides the `language` property used by formatTimestamp.
 * In the original app this came from i18next; here we default to 'es'.
 */
const i18n: { language: string } = { language: 'es' };

export const getHash = (obj: object) => {
  const jsonString = JSON.stringify(obj);
  const hash = crypto.createHash('sha256').update(jsonString).digest('hex');
  return hash;
};

/**
 * Country-specific phone number formatting for Latin American countries
 */
interface CountryFormat {
  code: string;
  name: string;
  length: number;
  format: (digits: string) => string;
}

const LATIN_AMERICAN_FORMATS: Record<string, CountryFormat> = {
  // Colombia: +57 XXX XXX XXXX
  '57': {
    code: '57',
    name: 'Colombia',
    length: 10,
    format: (digits: string) => {
      const area = digits.slice(0, 3);
      const first = digits.slice(3, 6);
      const second = digits.slice(6);
      return `${area} ${first} ${second}`;
    },
  },
  // Mexico: +52 XX XXXX XXXX
  '52': {
    code: '52',
    name: 'Mexico',
    length: 10,
    format: (digits: string) => {
      const area = digits.slice(0, 2);
      const first = digits.slice(2, 6);
      const second = digits.slice(6);
      return `${area} ${first} ${second}`;
    },
  },
  // Argentina: +54 XXX XXX XXXX
  '54': {
    code: '54',
    name: 'Argentina',
    length: 10,
    format: (digits: string) => {
      const area = digits.slice(0, 3);
      const first = digits.slice(3, 6);
      const second = digits.slice(6);
      return `${area} ${first} ${second}`;
    },
  },
  // Brazil: +55 XX XXXXX XXXX
  '55': {
    code: '55',
    name: 'Brazil',
    length: 11,
    format: (digits: string) => {
      const area = digits.slice(0, 2);
      const first = digits.slice(2, 7);
      const second = digits.slice(7);
      return `${area} ${first} ${second}`;
    },
  },
  // Chile: +56 X XXXX XXXX
  '56': {
    code: '56',
    name: 'Chile',
    length: 9,
    format: (digits: string) => {
      const area = digits.slice(0, 1);
      const first = digits.slice(1, 5);
      const second = digits.slice(5);
      return `${area} ${first} ${second}`;
    },
  },
  // Peru: +51 XXX XXX XXX
  '51': {
    code: '51',
    name: 'Peru',
    length: 9,
    format: (digits: string) => {
      const first = digits.slice(0, 3);
      const second = digits.slice(3, 6);
      const third = digits.slice(6);
      return `${first} ${second} ${third}`;
    },
  },
  // Venezuela: +58 XXX XXX XXXX
  '58': {
    code: '58',
    name: 'Venezuela',
    length: 10,
    format: (digits: string) => {
      const area = digits.slice(0, 3);
      const first = digits.slice(3, 6);
      const second = digits.slice(6);
      return `${area} ${first} ${second}`;
    },
  },
  // Ecuador: +593 XX XXX XXXX
  '593': {
    code: '593',
    name: 'Ecuador',
    length: 9,
    format: (digits: string) => {
      const area = digits.slice(0, 2);
      const first = digits.slice(2, 5);
      const second = digits.slice(5);
      return `${area} ${first} ${second}`;
    },
  },
  // Guatemala: +502 XXXX XXXX
  '502': {
    code: '502',
    name: 'Guatemala',
    length: 8,
    format: (digits: string) => {
      const first = digits.slice(0, 4);
      const second = digits.slice(4);
      return `${first} ${second}`;
    },
  },
  // Costa Rica: +506 XXXX XXXX
  '506': {
    code: '506',
    name: 'Costa Rica',
    length: 8,
    format: (digits: string) => {
      const first = digits.slice(0, 4);
      const second = digits.slice(4);
      return `${first} ${second}`;
    },
  },
  // Panama: +507 XXXX XXXX
  '507': {
    code: '507',
    name: 'Panama',
    length: 8,
    format: (digits: string) => {
      const first = digits.slice(0, 4);
      const second = digits.slice(4);
      return `${first} ${second}`;
    },
  },
};

/**
 * Detects country code from phone number
 */
function detectCountryCode(digits: string): string | null {
  // Try 3-digit codes first, then 2-digit codes
  const codes = Object.keys(LATIN_AMERICAN_FORMATS).sort((a, b) => b.length - a.length);

  for (const code of codes) {
    if (digits.startsWith(code)) {
      return code;
    }
  }

  return null;
}

/**
 * Enhanced phone number formatter with Latin American support
 * @param phoneNumber - Raw phone number string
 * @param format - Format type
 * @param countryCode - Optional country code override
 * @returns Formatted phone number string or null if invalid
 */
function formatPhoneNumber(
  phoneNumber: string,
  format: 'us' | 'international' | 'local' | 'dots' | 'dashes' = 'international',
  countryCode?: string
): string | null {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');

  // Handle US numbers (10 or 11 digits)
  if (!countryCode && (digits.length === 10 || (digits.length === 11 && digits.startsWith('1')))) {
    const cleanDigits = digits.startsWith('1') ? digits.slice(1) : digits;
    const areaCode = cleanDigits.slice(0, 3);
    const exchange = cleanDigits.slice(3, 6);
    const number = cleanDigits.slice(6);

    switch (format) {
      case 'us':
      case 'local':
        return `(${areaCode}) ${exchange}-${number}`;
      case 'international':
        return `+1 ${areaCode} ${exchange} ${number}`;
      case 'dots':
        return `${areaCode}.${exchange}.${number}`;
      case 'dashes':
        return `${areaCode}-${exchange}-${number}`;
    }
  }

  // Detect or use provided country code
  const detectedCode = countryCode || detectCountryCode(digits);

  if (detectedCode && LATIN_AMERICAN_FORMATS[detectedCode]) {
    const config = LATIN_AMERICAN_FORMATS[detectedCode];
    const localDigits = digits.startsWith(detectedCode) ? digits.slice(detectedCode.length) : digits;

    // Validate length
    if (localDigits.length !== config.length) {
      return null;
    }

    const formatted = config.format(localDigits);

    switch (format) {
      case 'international':
        return `+${config.code} ${formatted}`;
      case 'local':
        return formatted;
      case 'dots':
        return formatted.replace(/\s/g, '.');
      case 'dashes':
        return formatted.replace(/\s/g, '-');
      default:
        return `+${config.code} ${formatted}`;
    }
  }

  // Fallback for other international numbers
  if (digits.length >= 7 && digits.length <= 15) {
    if (format === 'international') {
      return `+${digits}`;
    }
  }

  return null;
}

/**
 * Chat source type - identifies the messaging platform
 */
export type ChatSource = 'whatsapp' | 'instagram' | 'unknown';

/**
 * Parsed chat ID containing source platform and display information
 */
export interface ParsedChatId {
  source: ChatSource;
  identifier: string;
  displayName: string;
}

/**
 * Parses a chat ID to extract the source platform and formatted display name
 * @param chatId - The raw chat ID (e.g., "whatsapp:+573013189707" or "instagram:username")
 * @returns ParsedChatId with source, identifier, and displayName
 */
export function parseChatId(chatId: string): ParsedChatId {
  if (chatId.startsWith('instagram:')) {
    const username = chatId.substring('instagram:'.length);
    return {
      source: 'instagram',
      identifier: username,
      displayName: `@${username}`,
    };
  }

  if (chatId.startsWith('whatsapp:')) {
    const phone = chatId.substring('whatsapp:'.length);
    const cleanedPhone = phone.replace(/\D/g, '');
    return {
      source: 'whatsapp',
      identifier: phone,
      displayName: formatPhone(cleanedPhone) || phone,
    };
  }

  // Fallback for unknown formats - try to format as phone
  const cleanedId = chatId.replace(/\D/g, '');
  return {
    source: 'unknown',
    identifier: chatId,
    displayName: formatPhone(cleanedId) || chatId,
  };
}

export function formatPhone(phoneNumber: string): string | null {
  const digits = phoneNumber.replace(/\D/g, '');

  // US numbers
  if (digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))) {
    return formatPhoneNumber(digits, 'us');
  }

  // Try Latin American countries
  const countryCode = detectCountryCode(digits);
  if (countryCode) {
    return formatPhoneNumber(digits, 'international');
  }

  // Generic international
  if (digits.length >= 7 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

export const getNameInitials = (name: string) => {
  const res = name
    .split(' ')
    .map((parts) => parts.substring(0, 1).toUpperCase())
    .join('')
    .replaceAll(/[^A-Za-z]/g, '');
  const initials = res.length > 0 ? res : '?';
  return initials.length <= 2 ? initials : initials.substring(0, 2);
};

export const getNameFromLastMessage = (name: string | null | undefined, phone: string) => {
  return name && name.length > 1 ? name : phone;
};

export const formatTimestamp = (
  timestamp: number,
  alwaysShowTime: boolean = false,
  alwaysUseRelativeDate: boolean = false
) => {
  const date = new Date(timestamp);
  const current = new Date();

  // Get current language from i18next
  const currentLanguage = i18n.language || 'es';

  // Set dayjs locale dynamically
  dayjs.locale(currentLanguage);

  if ((date.getDay() === current.getDay() || alwaysShowTime) && !alwaysUseRelativeDate) {
    return new Date(timestamp).toLocaleTimeString([currentLanguage], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Calendar strings for Spanish and English
  const calendarStrings = {
    es: {
      sameDay: '[Hoy]',
      lastDay: '[Ayer]',
      lastWeek: 'dddd',
      sameElse: 'DD/MM/YYYY',
    },
    en: {
      sameDay: '[Today]',
      lastDay: '[Yesterday]',
      lastWeek: 'dddd',
      sameElse: 'DD/MM/YYYY',
    },
  };

  const strings = calendarStrings[currentLanguage as keyof typeof calendarStrings] || calendarStrings.es;

  const res = dayjs(date).calendar(null, strings);

  return res.substring(0, 1).toUpperCase() + res.substring(1);
};

export const formatWhatsapp = (str: string) => {
  if (!str || str.length === 0) return '';
  let result = str;

  // Escape HTML to prevent XSS
  result = result
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Handle blockquotes first (> at the start of a line)
  result = result.replace(/^&gt;\s(.+)$/gm, '<blockquote>$1</blockquote>');

  // Handle triple backticks (code blocks) - must be done before single backticks
  result = result.replace(/```([^`]+)```/g, '<tt>$1</tt>');

  // Handle single backticks (inline code)
  result = result.replace(/`([^`]+)`/g, '<tt>$1</tt>');

  // Handle bold (*text*)
  result = result.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');

  // Handle strikethrough (~text~)
  result = result.replace(/~([^~]+)~/g, '<s>$1</s>');

  // Handle italic (_text_)
  result = result.replace(/_([^_]+)_/g, '<i>$1</i>');

  // Handle URLs - match common URL patterns
  result = result.replace(
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
    '<a href="$&" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">$&</a>'
  );

  // Handle line breaks
  result = result.replace(/\n/g, '<br>');

  return result;
};

/**
 * Converts HTML (especially Quill-generated HTML) to WhatsApp text format
 * This is the reverse of formatWhatsapp function
 */
export const htmlToWhatsappFormat = (html: string): string => {
  if (!html || html.length === 0) return '';
  let result = html;

  // Remove Quill UI elements (non-visible span elements)
  result = result.replace(/<span class="ql-ui"[^>]*>.*?<\/span>/g, '');

  // Handle ordered lists (must be done before removing li tags)
  // We need to track the counter for ordered lists
  result = result.replace(/<ol>([\s\S]*?)<\/ol>/g, (_match, content) => {
    let counter = 1;
    const items = content.replace(
      /<li data-list="ordered"[^>]*>([\s\S]*?)<\/li>/g,
      (_liMatch: string, itemContent: string) => {
        const cleaned = itemContent.trim();
        return `${counter++}. ${cleaned}\n`;
      }
    );
    return items + '\n';
  });

  // Handle bullet lists
  result = result.replace(/<li data-list="bullet"[^>]*>([\s\S]*?)<\/li>/g, (_match, content) => {
    const cleaned = content.trim();
    return `- ${cleaned}\n`;
  });

  // Remove any remaining list tags
  result = result.replace(/<\/?[uo]l>/g, '');
  result = result.replace(/<\/?li[^>]*>/g, '');

  // Handle blockquotes
  result = result.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_match, content) => {
    return `> ${content.trim()}\n`;
  });

  // Handle code blocks (tt or code tags)
  result = result.replace(/<tt>([\s\S]*?)<\/tt>/g, (_match, content) => {
    // If content has newlines, use triple backticks
    if (content.includes('\n')) {
      return '```' + content + '```';
    }
    return '`' + content + '`';
  });
  result = result.replace(/<code>([\s\S]*?)<\/code>/g, (_match, content) => {
    return '`' + content + '`';
  });

  // Handle bold (strong or b tags)
  result = result.replace(/<strong>([\s\S]*?)<\/strong>/g, (_match, content) => {
    const trimmed = content.trimEnd();
    const trailingSpace = content.slice(trimmed.length);
    return `*${trimmed}*${trailingSpace}`;
  });
  result = result.replace(/<b>([\s\S]*?)<\/b>/g, (_match, content) => {
    const trimmed = content.trimEnd();
    const trailingSpace = content.slice(trimmed.length);
    return `*${trimmed}*${trailingSpace}`;
  });

  // Handle italic (em or i tags)
  result = result.replace(/<em>([\s\S]*?)<\/em>/g, (_match, content) => {
    const trimmed = content.trimEnd();
    const trailingSpace = content.slice(trimmed.length);
    return `_${trimmed}_${trailingSpace}`;
  });
  result = result.replace(/<i>([\s\S]*?)<\/i>/g, (_match, content) => {
    const trimmed = content.trimEnd();
    const trailingSpace = content.slice(trimmed.length);
    return `_${trimmed}_${trailingSpace}`;
  });

  // Handle strikethrough (s or del tags)
  result = result.replace(/<s>([\s\S]*?)<\/s>/g, (_match, content) => {
    const trimmed = content.trimEnd();
    const trailingSpace = content.slice(trimmed.length);
    return `~${trimmed}~${trailingSpace}`;
  });
  result = result.replace(/<del>([\s\S]*?)<\/del>/g, (_match, content) => {
    const trimmed = content.trimEnd();
    const trailingSpace = content.slice(trimmed.length);
    return `~${trimmed}~${trailingSpace}`;
  });

  // Handle underline (u tag) - WhatsApp doesn't support underline, so keep as is
  result = result.replace(/<u>([\s\S]*?)<\/u>/g, (_match, content) => content);

  // Handle paragraphs - add double newline after each
  result = result.replace(/<p>([\s\S]*?)<\/p>/g, (_match, content) => {
    const cleaned = content.trim();
    return cleaned ? cleaned + '\n' : '\n';
  });

  // Handle line breaks
  result = result.replace(/<br\s*\/?>/g, '\n');

  // Decode HTML entities
  result = result
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");

  // Remove any remaining HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Clean up excessive newlines (more than 2 consecutive)
  result = result.replace(/\n{3,}/g, '\n\n');

  // Trim leading/trailing whitespace
  result = result.trim();

  return result;
};

export const toFirstLetterUppercase = (str?: string | null) => {
  if (!str) return '';
  const parts = str.split(' ');
  let result = '';
  parts.forEach((part) => (result += part.substring(0, 1).toUpperCase() + part.substring(1) + ' '));
  return result.trim();
};

export const formatAddress = (mAddress: AddressSchemaType) => {
  const cityDisplay = toFirstLetterUppercase(mAddress.cityName);
  const neighbor = toFirstLetterUppercase(mAddress.barrio);
  const address = toFirstLetterUppercase(mAddress.direccion);
  const detail = toFirstLetterUppercase(mAddress.detalle);

  const [mCity, mState] = cityDisplay.startsWith('Bogotá')
    ? ['Bogotá D.C.', 'Bogotá D.C.']
    : cityDisplay.split(',');

  return `${address}${detail.length > 0 ? ', ' + detail : ''},\n${neighbor}\n${mCity ? mCity.trim() : ''}\n${mState ? mState.trim() : ''}`;
};

export const formatItems = (items: PaymentItem[]): string[] => {
  return items.map((item) => {
    const name = item.productName;
    const personalizationsText = item.personalizations
      ? ` (${item.personalizations.map((p) => `${p.type}: ${p.value}`).join(', ')})`
      : '';
    return `${item.quantity}x ${name}${personalizationsText}`;
  });
};

/**
 * Formats items with structured data for better rendering
 * Returns an array of objects with separated product info and personalizations
 */
export interface FormattedItemData {
  productName: string;
  quantity: number;
  personalizations: Array<{ type: string; value: string }>;
}

export const formatItemsStructured = (items: PaymentItem[]): FormattedItemData[] => {
  return items.map((item) => ({
    productName: item.productName,
    quantity: item.quantity,
    personalizations: item.personalizations || [],
  }));
};
