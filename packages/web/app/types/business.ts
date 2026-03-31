// Plain TypeScript equivalents of Zod-inferred types from the original business.ts

export interface TimeRange {
  start: string;
  end: string;
}

export interface ServiceType {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  availableDays?: {
    monday?: boolean;
    tuesday?: boolean;
    wednesday?: boolean;
    thursday?: boolean;
    friday?: boolean;
    saturday?: boolean;
    sunday?: boolean;
  };
  availableHours: TimeRange;
}

export interface BookingTargetType {
  id: string;
  name: string;
  type: 'human' | 'asset';
  services: string[];
  quantity: number;
  schedule: {
    monday?: TimeRange[];
    tuesday?: TimeRange[];
    wednesday?: TimeRange[];
    thursday?: TimeRange[];
    friday?: TimeRange[];
    saturday?: TimeRange[];
    sunday?: TimeRange[];
  };
  daysOff?: string[];
  isActive?: boolean;
}

export interface PersonalizationType {
  type: string;
  emoji: string;
  values: Array<{
    value: string;
    addedPrice: number;
  }>;
}

export interface CategoryType {
  id: string;
  name: string;
  parentCategories?: string[];
  isHeader?: boolean;
}

export interface ProductPersonalizationType {
  type: string;
  values: string[];
}

export interface MediaPersonalizationAssociationType {
  type: string;
  values: string[];
}

export interface ProductMediaWithPersonalizationsType {
  id: string;
  personalizations?: MediaPersonalizationAssociationType[];
}

export interface ProductPersonalizationCombinationPricingType {
  name?: string;
  combination: Array<{ type: string; value: string }>;
  customPrice: number;
}

export interface ProductStockType {
  id: string;
  name?: string;
  personalizations: Array<{
    stock: number;
    available?: boolean;
    withStock?: boolean;
    options?: Array<{ type: string; value: string }>;
  }>;
}

export interface BankTransferenceType {
  bank: string;
  accountType: 'savings' | 'checking';
  bankAccount: string;
}

export type CountryCode = 'COL' | 'MEX' | 'ARG' | 'CHL' | 'PER' | 'ECU' | 'VEN';
export type Tone = 'neutral' | 'formal' | 'friendly';

export interface InfoType {
  businessName: string;
  businessDescription: string;
  address: string;
  countryCode: CountryCode;
  city: string;
  website: string;
  tone: Tone;
  botName: string;
  allowedEmojis?: string;
  adjectives?: string;
}

export interface ShippingConfig {
  international?: {
    enabled?: boolean;
    price?: number;
  };
  domestic?: {
    allCitiesEnabled?: boolean;
    sameCityPrice?: number;
    sameCountryPrice?: number;
    availableCities?: string[];
    unavailableCities?: string[];
    cityGroups?: Array<{
      name: string;
      cities: string[];
      price: number;
    }>;
  };
}

export interface PoliciesType {
  shipping?: ShippingConfig;
  productPolicy?: string;
  shippingPolicy?: string;
  returnPolicy?: string;
  warranty: string;
}

export interface PaymentMethodConfig {
  value: string;
  addedPrice: {
    percentage?: number;
    fixed?: number;
  };
}

export interface ProductMediaAPI {
  url: string;
  description: string;
  id: string;
  personalizations?: MediaPersonalizationAssociationType[];
}

export interface ProductBusinessSetupSchemaAPIType {
  id: string;
  name: string;
  description: string;
  price: number;
  categories: string[];
  dimensions: {
    height: number;
    width: number;
    length: number;
    weight: number;
  };
  deliveryTime?: string;
  shippingAddedPrice?: number;
  upSelling?: string[];
  crossSelling?: string[];
  personalizations?: ProductPersonalizationType[];
  personalizationCombinationPricing?: ProductPersonalizationCombinationPricingType[];
  media?: ProductMediaAPI[];
  hasUsageInstructions?: boolean;
  usageInstructions?: string;
}

export type ProductType = ProductBusinessSetupSchemaAPIType;

export interface ProductsType {
  catalog?: {
    url: string;
    description: string;
    id: string;
  };
  products: ProductBusinessSetupSchemaAPIType[];
}

export interface TimeSettingsType {
  workInHolidays?: boolean;
  holidaySchedule?: TimeRange;
  notWorkingDays?: string[];
  workingDays?: {
    monday?: boolean;
    tuesday?: boolean;
    wednesday?: boolean;
    thursday?: boolean;
    friday?: boolean;
    saturday?: boolean;
    sunday?: boolean;
  };
  schedule: {
    monday?: TimeRange;
    tuesday?: TimeRange;
    wednesday?: TimeRange;
    thursday?: TimeRange;
    friday?: TimeRange;
    saturday?: TimeRange;
    sunday?: TimeRange;
  };
  slotDuration: number;
}

export interface DiscountConditionType {
  type:
    | 'none'
    | 'minimumPurchase'
    | 'mustPurchaseProducts'
    | 'firstPurchase'
    | 'moreThanNPurchases'
    | 'mustPurchaseNUnits'
    | 'mustPurchaseProductsWithPersonalizations'
    | 'mustPurchaseNUnitsWithPersonalizations';
  minimumValue?: number;
  products?: string[];
  purchaseCount?: number;
  productId?: string;
  unitCount?: number;
  personalizationUnitCount?: number;
}

export interface DiscountValueType {
  applyOn: 'wholeOrder' | 'specificProducts' | 'specificProductPersonalizations';
  products?: string[];
  hasFreeShipping?: boolean;
  hasSpecificAmount?: boolean;
  specificAmount?: {
    percentage?: number;
    fixed?: number;
  };
}

export interface DiscountType {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  priority: 'low' | 'medium' | 'high';
  mutuallyExclusive?: boolean;
  canOnlyApplyOnce?: boolean;
  value: DiscountValueType;
  conditions: DiscountConditionType[];
}

export interface BusinessSetupSchemaAPIType {
  info: InfoType;
  products?: ProductsType;
  services: ServiceType[];
  bookingTargets: BookingTargetType[];
  businessPolicies: PoliciesType;
  paymentMethods: {
    acceptedMethods: PaymentMethodConfig[];
    transferences?: BankTransferenceType[];
  };
  timeSetting: TimeSettingsType;
  personalizations?: {
    categories?: CategoryType[];
    personalizations?: PersonalizationType[];
  };
  discounts?: {
    discounts?: DiscountType[];
  };
  stock: {
    stock?: ProductStockType[];
  };
}

// BusinessSetupSchema stub (used as a Zod-like shape for .parse/.safeParse in api.ts)
export const BusinessSetupSchema = {
  parse: (data: unknown): BusinessSetupSchemaAPIType => data as BusinessSetupSchemaAPIType,
  safeParse: (data: unknown): { success: boolean; data: BusinessSetupSchemaAPIType } => ({
    success: true,
    data: data as BusinessSetupSchemaAPIType,
  }),
};

export interface StoreData {
  products: ProductsType | undefined;
  services: ServiceType[];
  policies: PoliciesType;
  info: InfoType;
}

export interface ProductsListResponse {
  products: ProductBusinessSetupSchemaAPIType[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

export interface ProductDetailResponse {
  product: ProductBusinessSetupSchemaAPIType;
  stock: ProductStockType | null;
}

export interface EcommerceBusinessInfoResponse {
  info: InfoType;
  policies: PoliciesType;
  personalizations: {
    personalizations: PersonalizationType[];
    categories: CategoryType[];
  };
}

// Convenience aliases requested in the stub spec
export type Personalization = PersonalizationType;
export type GlobalPersonalization = PersonalizationType;

export interface ShippingCity {
  name: string;
  price: number;
}

export type BusinessSetup = BusinessSetupSchemaAPIType;
