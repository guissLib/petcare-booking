import { randomUUID } from 'node:crypto';
import type {
  Booking,
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  ServiceType,
  VisitMode,
} from '../../domain/booking.entity';
import type { SagaMessage } from './saga-message.contract';

export type BookingEventName =
  | 'booking.requested'
  | 'booking.created'
  | 'booking.snapshot'
  | 'booking.payment-processing'
  | 'booking.payment-tokenized'
  | 'booking.status-changed'
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'booking.expired';

export interface BookingEventSnapshot {
  id: string;
  aggregateVersion: number;
  userId: string;
  petId: string;
  providerId: string;
  serviceType: ServiceType;
  visitMode: VisitMode;
  scheduledAt: string;
  status: BookingStatus;
  originalTotal: number;
  total: number;
  discountAmount: number;
  currency: 'COP';
  paymentMethod: PaymentMethod;
  paymentId: string;
  paymentStatus: PaymentStatus;
  paymentReference?: string;
  paymentExpiresAt?: string;
  promotionId?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface BookingEvent {
  eventId: string;
  eventType: BookingEventName;
  schemaVersion: number;
  sourceService: 'booking-service';
  aggregateType: 'Booking';
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: string;
  correlationId?: string;
  causationId?: string;
  integrationMessage?: SagaMessage;
  data: BookingEventSnapshot;
}

export interface BookingEventMetadata {
  correlationId?: string;
  causationId?: string;
  integrationMessage?: SagaMessage;
}

export function createBookingEvent(
  booking: Booking,
  eventType: BookingEventName,
  metadata: BookingEventMetadata = {},
): BookingEvent {
  const data = booking.toPrimitives();
  return {
    eventId: randomUUID(),
    eventType,
    schemaVersion: 1,
    sourceService: 'booking-service',
    aggregateType: 'Booking',
    aggregateId: data.id,
    aggregateVersion: data.aggregateVersion,
    occurredAt: new Date().toISOString(),
    ...metadata,
    data: {
      id: data.id,
      aggregateVersion: data.aggregateVersion,
      userId: data.userId,
      petId: data.petId,
      providerId: data.providerId,
      serviceType: data.serviceType,
      visitMode: data.visitMode,
      scheduledAt: data.scheduledAt,
      status: data.status,
      originalTotal: data.originalTotal,
      total: data.total,
      discountAmount: data.discountAmount,
      currency: data.currency,
      paymentMethod: data.paymentMethod,
      paymentId: data.paymentId,
      paymentStatus: data.paymentStatus,
      paymentReference: data.paymentReference,
      paymentExpiresAt: data.paymentExpiresAt,
      promotionId: data.promotionId,
      rejectionReason: data.rejectionReason,
      createdAt: data.createdAt,
    },
  };
}
