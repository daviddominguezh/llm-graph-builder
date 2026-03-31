import type { QuickReply } from '@globalTypes/quickReplies';

// Predefined categories for organization
export const PREDEFINED_CATEGORIES = [
  'Greetings',
  'Support',
  'Business Info',
  'Products',
  'Closing',
  'FAQ',
  'General',
] as const;

export type PredefinedCategory = (typeof PREDEFINED_CATEGORIES)[number];

/**
 * Get Spanish time of day greeting based on current hour
 * 5:00 - 11:59 = Buenos días
 * 12:00 - 18:59 = Buenas tardes
 * 19:00 - 4:59 = Buenas noches
 */
export const getTimeOfDayGreeting = (): string => {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return 'Buenos días';
  } else if (hour >= 12 && hour < 19) {
    return 'Buenas tardes';
  } else {
    return 'Buenas noches';
  }
};

/**
 * Replace variables in quick reply text with actual values
 * Supported variables:
 * - {{userName}} - Contact's name
 * - {{userEmail}} - Contact's email
 * - {{userNIC}} - Contact's NIC/ID
 * - {{userAddress}} - Contact's address
 * - {{userPhone}} - Contact's phone number
 * - {{businessName}} - Business name
 * - {{businessDescription}} - Business description
 * - {{businessAddress}} - Business address
 * - {{today}} - Current date
 * - {{time}} - Current time
 * - {{timeOfDay}} - Time of day greeting in Spanish
 */
export const replaceVariables = (
  text: string,
  context: {
    userName?: string;
    userEmail?: string;
    userNIC?: string;
    userAddress?: string;
    userPhone?: string;
    businessName?: string;
    businessDescription?: string;
    businessAddress?: string;
  }
): string => {
  let result = text;

  // Replace user variables
  if (context.userName) {
    result = result.replace(/\{\{userName\}\}/gi, context.userName);
  }

  if (context.userEmail) {
    result = result.replace(/\{\{userEmail\}\}/gi, context.userEmail);
  }

  if (context.userNIC) {
    result = result.replace(/\{\{userNIC\}\}/gi, context.userNIC);
  }

  if (context.userAddress) {
    result = result.replace(/\{\{userAddress\}\}/gi, context.userAddress);
  }

  if (context.userPhone) {
    result = result.replace(/\{\{userPhone\}\}/gi, context.userPhone);
  }

  // Replace business variables
  if (context.businessName) {
    result = result.replace(/\{\{businessName\}\}/gi, context.businessName);
  }

  if (context.businessDescription) {
    result = result.replace(/\{\{businessDescription\}\}/gi, context.businessDescription);
  }

  if (context.businessAddress) {
    result = result.replace(/\{\{businessAddress\}\}/gi, context.businessAddress);
  }

  // Replace today with formatted date
  const today = new Date().toLocaleDateString();
  result = result.replace(/\{\{today\}\}/gi, today);

  // Replace time with formatted time
  const time = new Date().toLocaleTimeString();
  result = result.replace(/\{\{time\}\}/gi, time);

  // Replace timeOfDay with Spanish greeting
  const timeOfDay = getTimeOfDayGreeting();
  result = result.replace(/\{\{timeOfDay\}\}/gi, timeOfDay);

  return result;
};

/**
 * Validate if a shortcut is valid
 * Rules:
 * - Must start with "/"
 * - Must be at least 2 characters (/ + at least 1 character)
 * - Must be one word only (no spaces)
 * - Can only contain letters, numbers, and hyphens after the /
 */
export const isShortcutValid = (shortcut: string): boolean => {
  if (!shortcut) return true; // Empty shortcuts are valid (optional field)
  if (!shortcut.trim().startsWith('/')) return false;
  if (shortcut.trim().length < 2) return false;

  // Check for spaces (must be one word only)
  if (shortcut.includes(' ')) return false;

  // Check if contains only valid characters (letters, numbers, hyphens after the /)
  const shortcutContent = shortcut.slice(1);
  return /^[a-zA-Z0-9-]+$/.test(shortcutContent);
};

/**
 * Group quick replies by category
 */
export const groupByCategory = (quickReplies: QuickReply[]): Record<string, QuickReply[]> => {
  const grouped: Record<string, QuickReply[]> = {};

  quickReplies.forEach((qr) => {
    const category = qr.category || 'General';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(qr);
  });

  return grouped;
};

/**
 * Extract variables from text
 * Returns an array of variable names found in the text
 */
export const extractVariables = (text: string): string[] => {
  const regex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  return variables;
};

/**
 * Get supported variables list
 */
export const SUPPORTED_VARIABLES = [
  { name: 'userName', description: "Contact's name" },
  { name: 'userEmail', description: "Contact's email" },
  { name: 'userNIC', description: "Contact's NIC/ID" },
  { name: 'userAddress', description: "Contact's address" },
  { name: 'userPhone', description: "Contact's phone number" },
  { name: 'businessName', description: 'Business name' },
  { name: 'businessDescription', description: 'Business description' },
  { name: 'businessAddress', description: 'Business address' },
  { name: 'timeOfDay', description: 'Time of day greeting (Spanish)' },
] as const;
