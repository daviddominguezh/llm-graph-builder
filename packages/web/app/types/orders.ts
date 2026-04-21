export interface AddressSchemaType {
  ciudadId: string;
  cityName: string;
  barrio: string;
  direccion: string;
  detalle?: string | null;
}

export interface PaymentItem {
  id: string;
  quantity: number;
  productName: string;
  personalizations?: Array<{
    type: string;
    value: string;
  }>;
}

export type StatusType =
  | 'unpaid'
  | 'paid'
  | 'confirmed'
  | 'sent'
  | 'received'
  | 'cancelled'
  | 'payment-failed';

export interface Order {
  id: string;
  address: AddressSchemaType;
  paymentMethod?: string;
  paidOnDelivery?: boolean;
  phone: string;
  items: PaymentItem[];
  amount: number;
  status: StatusType;
  name: string;
  email: string;
  userNationalId: string;
  createdAt: number;
  updatedAt: number;
  trackingReceipt?: string;
  trackingId?: string;
}

export type Orders = Record<string, Order>;

export interface OrdersAPIResponse {
  orders: Orders;
}

export interface PersonalizationOrder {
  id: string;
  quantity: number;
  personalizations?: Array<{ type: string; value: string }>;
  originalId?: string;
}

export type PersonalizationOrderDB = PersonalizationOrder[];

export interface PersonalizationOrderDBType {
  businessSetup: import('./business').BusinessSetupSchemaAPIType;
  order: PersonalizationOrderDB;
  done?: boolean;
}

export type OrdersFilterTabs =
  | 'all'
  | 'unconfirmed'
  | 'unpaid'
  | 'paid'
  | 'sent'
  | 'completed'
  | 'cancelled'
  | 'confirmed';

export type OrderStatusType = StatusType;

export type OrderItem = PaymentItem;
