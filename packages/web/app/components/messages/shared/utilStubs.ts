/**
 * Utility stubs — placeholder functions for utilities not yet
 * migrated from the closer-front codebase.
 */
import type {
  BusinessSetupSchemaAPIType,
  ProductBusinessSetupSchemaAPIType,
  ProductStockType,
} from '@/app/types/business';
import { MediaFileKind } from '@/app/types/media';

// ---------------------------------------------------------------------------
// Currency formatting
// ---------------------------------------------------------------------------
export const formatCurrency = (value: string, _currency?: string): string => {
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
export const loadQuill = async (): Promise<unknown> => {
  return Promise.resolve(null);
};

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
export const getApiURL = (): string => '';

export const isLocalDevelopment = (): boolean => {
  return process.env.NODE_ENV === 'development';
};

// ---------------------------------------------------------------------------
// Business info cache stubs
// ---------------------------------------------------------------------------
export const getBusinessInfoFromCache = (_namespace: string): BusinessSetupSchemaAPIType | null => {
  return null;
};

export const setBusinessInfoToCache = (_namespace: string, _info: BusinessSetupSchemaAPIType): void => {
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

export const getRolePermissions = (_role: string | null): APP_SECTION[] => {
  return Object.values(APP_SECTION);
};

export const canAccessSection = (_role: string | null, _section: APP_SECTION): boolean => {
  return true;
};

export const getDefaultRouteForRole = (_role: string | null, projectName: string): string => {
  return `/${projectName}/messages`;
};

export const getDefaultSettingsRouteForRole = (_role: string | null, projectName: string): string => {
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
  _productId: string,
  _personalizations: PersonalizationOption[],
  _stockData: ProductStockType[] | undefined
): boolean => {
  return true;
};

export const getAvailableStock = (
  _productId: string,
  _personalizations: PersonalizationOption[],
  _stockData: ProductStockType[] | undefined
): number | null => {
  return null;
};

export const getAvailablePersonalizationValues = (
  _productId: string,
  _personalizationType: string,
  _selectedPersonalizations: PersonalizationOption[],
  _stockData: ProductStockType[] | undefined,
  _products: ProductBusinessSetupSchemaAPIType[]
): string[] => {
  return [];
};

export const isQuantityExceedsStock = (
  _productId: string,
  _personalizations: PersonalizationOption[],
  _quantity: number,
  _stockData: ProductStockType[] | undefined
): boolean => {
  return false;
};
