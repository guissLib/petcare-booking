import { randomUUID } from 'node:crypto';

export type SagaMessageName =
  | 'payment.confirmed'
  | 'booking.confirm'
  | 'booking.cancel'
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'booking.confirmation.failed'
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
