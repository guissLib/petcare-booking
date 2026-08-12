export const BOOKING_CONTEXT_ROUTING_KEYS = [
  'context.user.upserted',
  'context.pet.upserted',
  'context.provider.upserted',
  'context.promotion.upserted',
] as const;

export type BookingContextEventType =
  (typeof BOOKING_CONTEXT_ROUTING_KEYS)[number];

export interface BookingContextEvent {
  eventId: string;
  eventType: BookingContextEventType;
  schemaVersion: number;
  sourceService: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: string;
  data: Record<string, unknown>;
}

export function parseBookingContextEvent(
  value: unknown,
  routingKey?: string,
): BookingContextEvent {
  if (!value || typeof value !== 'object') {
    throw new Error('Context event envelope must be an object');
  }
  const candidate = value as Partial<BookingContextEvent>;
  const eventType = candidate.eventType;
  if (
    typeof candidate.eventId !== 'string' ||
    !candidate.eventId.trim() ||
    !BOOKING_CONTEXT_ROUTING_KEYS.includes(
      eventType as BookingContextEventType,
    ) ||
    (routingKey && eventType !== routingKey) ||
    !Number.isInteger(candidate.schemaVersion) ||
    Number(candidate.schemaVersion) <= 0 ||
    typeof candidate.sourceService !== 'string' ||
    !candidate.sourceService.trim() ||
    typeof candidate.aggregateType !== 'string' ||
    !candidate.aggregateType.trim() ||
    candidate.aggregateType !== eventType?.split('.')[1] ||
    typeof candidate.aggregateId !== 'string' ||
    !candidate.aggregateId.trim() ||
    !Number.isInteger(candidate.aggregateVersion) ||
    Number(candidate.aggregateVersion) < 0 ||
    typeof candidate.occurredAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.occurredAt)) ||
    !candidate.data ||
    typeof candidate.data !== 'object' ||
    Array.isArray(candidate.data)
  ) {
    throw new Error('Invalid booking context event envelope');
  }
  return candidate as BookingContextEvent;
}

export function contextTypeFromEvent(eventType: BookingContextEventType) {
  return eventType.split('.')[1] as 'user' | 'pet' | 'provider' | 'promotion';
}
