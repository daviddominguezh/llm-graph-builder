export interface Booking {
  id: string;
  clientName: string;
  date: string;
  startService: string;
  endService: string;
  serviceId: string;
  serviceDuration: number;
  price: number;
  targetId: string;
  phone: string;
  email: string;
  notes?: string | null;
  status: 'confirmed' | 'canceled' | 'created';
  createdAt: string;
}

interface ErrorResponse {
  type: 'error';
  error: {
    status: number;
    message: string;
  };
}

interface GetBookingsSuccessResponse {
  type: 'succes';
  data: Booking[];
}

export type GetBookingResponse = GetBookingsSuccessResponse | ErrorResponse;
