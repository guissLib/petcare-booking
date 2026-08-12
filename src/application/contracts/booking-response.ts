import type {
  BookingPrimitives,
  PaymentStatus,
  ServiceType,
  VisitMode,
} from '../../domain/booking.entity';
import type { BookingContextPromotion } from '../ports/booking-context.port';

export interface BookingPaymentSummary {
  id: string;
  method: BookingPrimitives['paymentMethod'];
  amount: number;
  currency: BookingPrimitives['currency'];
  status: PaymentStatus;
  provider: 'mock';
  reference: string;
  createdAt: string;
}

export type BookingResponse = Omit<
  BookingPrimitives,
  | 'address'
  | 'latitude'
  | 'longitude'
  | 'addressReference'
  | 'notes'
  | 'mockPaymentToken'
> & {
  payment: BookingPaymentSummary;
  projectedAt?: string;
};

export interface BookingQuoteResponse {
  currency: 'COP';
  serviceType: ServiceType;
  visitMode: VisitMode;
  originalTotal: number;
  discountAmount: number;
  total: number;
  promotion?: BookingContextPromotion;
  promotionId?: string;
  vaccinationRequired: boolean;
  vaccinationValid: boolean;
  vaccinationMessage?: string;
}

export interface BookingAvailabilityResponse {
  providerId: string;
  date: string;
  available: boolean;
  capacity: number;
  booked: number;
  slots: { start: string; end: string; remaining: number }[];
}

export interface BookingPaymentResponse {
  booking: BookingResponse;
  payment: {
    id: string;
    status: 'tokenized';
    mockPaymentToken: string;
  };
  confirmationStatus: 'payment-processing';
}
