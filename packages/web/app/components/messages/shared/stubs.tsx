/**
 * Shared stubs — placeholder types, components, and utilities for
 * features not yet migrated from the closer-front codebase.
 */
import React from 'react';

import type { MediaFileDetailList } from '@/app/types/media';

// ---------------------------------------------------------------------------
// Re-exported types from business (convenience aliases)
// ---------------------------------------------------------------------------
export type {
  BusinessSetupSchemaAPIType as BusinessSetup,
  ProductBusinessSetupSchemaAPIType as Product,
} from '@/app/types/business';

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------
export interface Address {
  ciudadId: string;
  cityName: string;
  barrio: string;
  direccion: string;
  detalle?: string;
}

// ---------------------------------------------------------------------------
// AddressForm component stub
// ---------------------------------------------------------------------------
interface AddressFormProps {
  address: Address;
  onAddressChange: (address: Address) => void;
  showTitle?: boolean;
}

export const AddressForm: React.FC<AddressFormProps> = () => {
  return React.createElement('div');
};

// ---------------------------------------------------------------------------
// DiscountAwareSummary component stub
// ---------------------------------------------------------------------------
interface OrderCalculationResult {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
}

interface DiscountAwareSummaryProps {
  result: OrderCalculationResult;
}

export const DiscountAwareSummary: React.FC<
  DiscountAwareSummaryProps
> = () => {
  return null;
};

// ---------------------------------------------------------------------------
// calculateOrderTotal stub
// ---------------------------------------------------------------------------
export const calculateOrderTotal = (
  ...args: unknown[]
): OrderCalculationResult => {
  void args;
  return { subtotal: 0, shipping: 0, discount: 0, total: 0 };
};

// ---------------------------------------------------------------------------
// MultiSelect
// ---------------------------------------------------------------------------
export interface MultiSelectOption {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  onValueChange: (value: string[]) => void;
  defaultValue?: string[];
  placeholder?: string;
  searchable?: boolean;
  maxCount?: number;
  variant?: string;
  className?: string;
}

export const MultiSelect: React.FC<MultiSelectProps> = () => {
  return React.createElement('div');
};

// ---------------------------------------------------------------------------
// APIError
// ---------------------------------------------------------------------------
export const APIErrorCodes = {
  DEFAULT: 'default',
  NAME_TAKEN: 'name_taken',
  UNAUTHORIZED: 'unauthorized',
  NOT_FOUND: 'not_found',
} as const;

type APIErrorCode =
  (typeof APIErrorCodes)[keyof typeof APIErrorCodes];

interface APIErrorOptions {
  code: APIErrorCode;
  message: string;
}

export class APIError extends Error {
  code: APIErrorCode;

  constructor(options: APIErrorOptions) {
    super(options.message);
    this.code = options.code;
    this.name = 'APIError';
  }
}

// ---------------------------------------------------------------------------
// MediaFileList component stub (default export)
// ---------------------------------------------------------------------------
interface MediaFileListProps {
  files?: MediaFileDetailList;
  fromUploader?: boolean;
  onRemovefile?: (id: string) => void;
}

const MediaFileList: React.FC<MediaFileListProps> = () => {
  return null;
};

export default MediaFileList;
