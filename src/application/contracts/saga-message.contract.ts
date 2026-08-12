import { randomUUID } from 'node:crypto';

export type SagaMessageName =
  | 'booking.requested'
  | 'payment.tokenized'
  | 'payment.intent.create'
  | 'payment.intent.created'
  | 'payment.intent.failed'
  | 'payment.capture-token'
  | 'payment.capture.failed'
  | 'payment.confirm-at-location'
  | 'payment.confirmed'
  | 'booking.confirm'
  | 'booking.confirmed'
  | 'booking.confirmation.failed'
  | 'booking.cancel'
  | 'booking.cancelled'
  | 'booking.cancellation.failed'
  | 'payment.refund'
  | 'payment.refunded'
  | 'payment.refund.failed'
  | 'notification.send-booking-confirmed'
  | 'notification.sent'
  | 'notification.failed';

export interface SagaMessage {
  eventId: string;
  eventName: SagaMessageName;
  occurredAt: string;
  sagaId?: string;
  bookingId?: string;
  paymentId?: string;
  userId?: string;
  providerId?: string;
  amount?: number;
  currency?: string;
  reason?: string;
  attempt?: number;
  paymentMethod?: 'online' | 'at-location';
  mockPaymentToken?: string;
  retryable?: boolean;
  [key: string]: unknown;
}

export type SagaMessageHandler = (message: SagaMessage) => Promise<void>;

export function createSagaMessage(
  eventName: SagaMessageName,
  sagaId: string | undefined,
  payload: Omit<SagaMessage, 'eventId' | 'eventName' | 'occurredAt' | 'sagaId'>,
): SagaMessage {
  return {
    ...payload,
    eventId: randomUUID(),
    eventName,
    occurredAt: new Date().toISOString(),
    sagaId,
  };
}
