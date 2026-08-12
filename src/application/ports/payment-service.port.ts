import type { PaymentMethod } from '../../domain/booking.entity';

export const PAYMENT_SERVICE = Symbol('PAYMENT_SERVICE');

export interface PaymentCardInput {
  cardholderName: string;
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
}

export interface PaymentServiceResponse {
  id: string;
  userId?: string;
  method: PaymentMethod;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  amount: number;
  currency: string;
  provider: 'mock';
  reference: string;
  createdAt: string;
  failureReason?: string;
}

export interface PaymentServicePort {
  createIntent(input: {
    bookingId: string;
    userId: string;
    amount: number;
    method: PaymentMethod;
  }): Promise<PaymentServiceResponse>;
  charge(input: {
    bookingId: string;
    userId: string;
    providerId: string;
    paymentId: string;
    amount: number;
    card: PaymentCardInput;
  }): Promise<PaymentServiceResponse>;
  publishConfirmed(input: {
    bookingId: string;
    userId: string;
    providerId: string;
    paymentId: string;
    amount: number;
  }): Promise<void>;
  confirmAtLocation(input: {
    bookingId: string;
    userId: string;
    providerId: string;
    paymentId: string;
    amount: number;
  }): Promise<void>;
  cancelPending(paymentId: string): Promise<void>;
}
