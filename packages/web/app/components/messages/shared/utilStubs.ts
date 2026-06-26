/**
 * Utility stubs — placeholder functions for utilities not yet
 * migrated from the closer-front codebase.
 */
import type {
  BusinessSetupSchemaAPIType,
  ProductBusinessSetupSchemaAPIType,
  ProductStockType,
} from '@/app/types/business';
import type { MediaFileKind } from '@/app/types/media';

// ---------------------------------------------------------------------------
// Currency formatting
// ---------------------------------------------------------------------------
export const formatCurrency = (value: string, currency?: string): string => {
  void currency;
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

// ---------------------------------------------------------------------------
// Quill lazy-loader stub
// ---------------------------------------------------------------------------
export const loadQuill = async (): Promise<unknown> => await Promise.resolve(null);

// ---------------------------------------------------------------------------
// Sound stub
// ---------------------------------------------------------------------------
export const playSoundMessageSent = (): void => {
  /* no-op */
};

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------
export const getMediaKind = (filename: string): MediaFileKind => {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ext as MediaFileKind;
};

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------
export const getApiURL = (): string => process.env.NEXT_PUBLIC_API_URL || '';

export const isLocalDevelopment = (): boolean => process.env.NODE_ENV === 'development';

// ---------------------------------------------------------------------------
// Business info cache stubs
// ---------------------------------------------------------------------------
export const getBusinessInfoFromCache = (namespace: string): BusinessSetupSchemaAPIType | null => {
  void namespace;
  return null;
};

export const setBusinessInfoToCache = (namespace: string, info: BusinessSetupSchemaAPIType): void => {
  void namespace;
  void info;
  /* no-op */
};

// ---------------------------------------------------------------------------
// RBAC helpers
// ---------------------------------------------------------------------------
export enum APP_SECTION {
  MESSAGES = 'messages',
  METRICS = 'metrics',
  BILLING = 'billing',
  SETTINGS = 'settings',
  MEDIA = 'media',
  BOOKINGS = 'bookings',
  STORE = 'store',
  CRM = 'crm',
}

export const getRolePermissions = (role: string | null): APP_SECTION[] => {
  void role;
  return Object.values(APP_SECTION);
};

export const canAccessSection = (role: string | null, section: APP_SECTION): boolean => {
  void role;
  void section;
  return true;
};

export const getDefaultRouteForRole = (role: string | null, projectName: string): string => {
  void role;
  return `/${projectName}/messages`;
};

export const getDefaultSettingsRouteForRole = (role: string | null, projectName: string): string => {
  void role;
  return `/${projectName}/settings`;
};

// ---------------------------------------------------------------------------
// Stock helpers (used by AddToCartDialog)
// ---------------------------------------------------------------------------
interface PersonalizationOption {
  type: string;
  value: string;
}

export const isPersonalizationCombinationInStock = (
  productId: string,
  personalizations: PersonalizationOption[],
  stockData: ProductStockType[] | undefined
): boolean => {
  void productId;
  void personalizations;
  void stockData;
  return true;
};

export const getAvailableStock = (
  productId: string,
  personalizations: PersonalizationOption[],
  stockData: ProductStockType[] | undefined
): number | null => {
  void productId;
  void personalizations;
  void stockData;
  return null;
};

export const getAvailablePersonalizationValues = (
  productId: string,
  personalizationType: string,
  selectedPersonalizations: PersonalizationOption[],
  stockData: ProductStockType[] | undefined,
  products: ProductBusinessSetupSchemaAPIType[]
): string[] => {
  void productId;
  void personalizationType;
  void selectedPersonalizations;
  void stockData;
  void products;
  return [];
};

export const isQuantityExceedsStock = (
  productId: string,
  personalizations: PersonalizationOption[],
  quantity: number,
  stockData: ProductStockType[] | undefined
): boolean => {
  void productId;
  void personalizations;
  void quantity;
  void stockData;
  return false;
};
