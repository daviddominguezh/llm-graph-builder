// Country identification types mapping
export const IDENTIFICATION_TYPES = {
  Colombia: ['C.C.', 'C.E.', 'NIT'],
  Brasil: ['CPF', 'CNPJ'],
  Argentina: ['DNI', 'Cedula', 'L.C.', 'L.E.'],
  Mexico: [],
  Uruguay: ['CI'],
  Chile: ['RUT'],
  Peru: ['DNI', 'C.E', 'RUC'],
} as const;

export type Country = keyof typeof IDENTIFICATION_TYPES;

export interface BillingAddressFormData {
  email: string;
  first_name: string;
  last_name: string;
  phone: {
    area_code: string;
    number: string;
  };
  identification: {
    type?: string;
    number?: string;
  };
  address: {
    zip_code?: string;
    street_name: string;
    street_number: number;
    city: {
      name: string;
    };
    country: string;
  };
}

export interface BillingAddress extends BillingAddressFormData {
  id: string;
}

export interface CreateBillingAddressPayload {
  email: string;
  first_name: string;
  last_name: string;
  phone: {
    area_code: string;
    number: string;
  };
  identification: {
    type?: string;
    number?: string;
  };
  address: {
    zip_code?: string;
    street_name: string;
    street_number: number;
    city: {
      name: string;
    };
    country: string;
  };
}

export interface GetBillingAddressesResponse {
  addresses: Record<string, BillingAddressFormData>;
}

export enum CARD_ISSUER {
  MASTER = 'master',
  VISA = 'visa',
}

export interface PaymentCard {
  firstSix: string;
  id: string;
  isPrimary: boolean;
  lastFour: string;
  name: string;
}

export interface GetPaymentCardsResponse {
  cards: PaymentCard[];
}

export interface PaymentMethodFormData {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
}

export interface CreatePaymentMethodPayload {
  token: string;
  cardholder_name: string;
}

export interface CloserCreditsFees {
  from: number;
  to?: number;
  pricePerCredit: number;
}

export interface GetBillingFeesResponse {
  fees: CloserCreditsFees[];
}

export interface CalculateBillingFeesResponse {
  price: number;
}

export interface GetPurchasedCreditsResponse {
  purchasedCredits: number;
}

// Convenience aliases requested by consumer code
export type Plan = string;

export interface Subscription {
  id: string;
  plan: Plan;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodStart: number;
  currentPeriodEnd: number;
}

export interface BillingInfo {
  address: BillingAddress;
  subscription: Subscription | null;
}

export interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'draft';
  createdAt: number;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_transfer';
  card?: PaymentCard;
  isDefault: boolean;
}
