export enum PAYMENT_METHOD {
  ON_DELIVERY = 'ON-DELIVERY',
  ONLINE = 'ONLINE',
}

export enum PAYMENT_STATUS_DETAIL {
  OTHER = 'cc_rejected_other_reason',
  PENDING = 'pending_contingency',
  CALL = 'cc_rejected_call_for_authorize',
  FUND = 'cc_rejected_insufficient_amount',
  CVV = 'cc_rejected_bad_filled_security_code',
  EXPI = 'cc_rejected_bad_filled_date',
  FORM = 'cc_rejected_bad_filled_other',
}

export type PAYMENT_STATUS = 'approved' | 'pending' | 'rejected' | 'unpaid';

export interface PaymentDetail {
  amount: number;
  namespace: string;
  status: PAYMENT_STATUS;
}

export interface CheckoutItemMedia {
  url: string;
  description: string;
  id: string;
  personalizations: Array<{ type: string; values: string[] }>;
}

export interface CheckoutItem {
  description: string;
  id: string;
  name: string;
  personalizations: Array<{ type: string; value: string }>;
  price: number;
  quantity: number;
  media: CheckoutItemMedia[];
  discount?: number;
}

export interface PaymentCheckout {
  amount: number;
  shippingCost: number;
  paymentMethodCost: number;
  subtotal: number;
  items: CheckoutItem[];
}
