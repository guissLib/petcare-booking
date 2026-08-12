import 'dotenv/config';
import { createHash } from 'node:crypto';
import {
  parseBookingContextEvent,
  type BookingContextEvent,
  type BookingContextEventType,
} from '../../application/contracts/booking-context-event.contract';
import { BookingProjectionWatermarkOrmEntity } from './entities/booking-projection-watermark.orm-entity';
import { BookingReadDataSource } from './read-data-source';
import { projectBookingContextEvent } from './repositories/booking-context.repository';

async function backfill() {
  await BookingReadDataSource.initialize();
  try {
    const watermarks = BookingReadDataSource.getRepository(
      BookingProjectionWatermarkOrmEntity,
    );
    const previous = await watermarks.findOneBy({
      projectionName: 'booking_context',
    });
    const response = await fetchSnapshots(previous?.watermarkAt);
    const events = eventsFromResponse(response);
    let projected = 0;
    for (const event of events) {
      const result = await projectBookingContextEvent(
        BookingReadDataSource,
        event,
      );
      if (result === 'projected') {
        projected += 1;
      }
    }
    const watermark = responseWatermark(response) ?? new Date();
    await watermarks.save({
      projectionName: 'booking_context',
      watermarkAt: watermark,
    });
    process.stdout.write(
      `Booking context backfill complete: received=${events.length} projected=${projected} watermark=${watermark.toISOString()}\n`,
    );
  } finally {
    await BookingReadDataSource.destroy();
  }
}

async function fetchSnapshots(watermark?: Date) {
  const baseUrl = (
    process.env.PETCARE_BACKEND_URL ?? 'http://localhost:3005/api'
  ).replace(/\/$/, '');
  const path =
    process.env.PETCARE_BOOKING_CONTEXT_SNAPSHOT_PATH ??
    '/internal/booking-context/snapshots';
  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  if (watermark) {
    url.searchParams.set('watermark', watermark.toISOString());
  }
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-petcare-service-secret': serviceSecret(),
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Snapshot endpoint rejected backfill (${response.status})`);
  }
  return body;
}

function eventsFromResponse(response: unknown): BookingContextEvent[] {
  const record = asRecord(response);
  const supplied = Array.isArray(response)
    ? response
    : Array.isArray(record.events)
      ? record.events
      : Array.isArray(record.items)
        ? record.items
        : undefined;
  if (supplied) {
    return supplied.map((item) => parseBookingContextEvent(item));
  }
  return (
    [
      ['users', 'context.user.upserted'],
      ['pets', 'context.pet.upserted'],
      ['providers', 'context.provider.upserted'],
      ['promotions', 'context.promotion.upserted'],
    ] as const
  ).flatMap(([collection, eventType]) =>
    (Array.isArray(record[collection]) ? record[collection] : []).map((item) =>
      syntheticEvent(item, eventType),
    ),
  );
}

function syntheticEvent(
  value: unknown,
  eventType: BookingContextEventType,
): BookingContextEvent {
  const data = asRecord(value);
  const id = string(data.id);
  // Full snapshots currently omit source aggregate versions. Version zero
  // seeds an empty read model without blocking subsequent versioned events.
  const version = number(data.aggregateVersion ?? data.version, 0);
  const occurredAt =
    optionalString(data.updatedAt ?? data.occurredAt) ??
    new Date().toISOString();
  return {
    eventId: `backfill-${hash(`${eventType}:${id}:${version}`)}`,
    eventType,
    schemaVersion: number(data.schemaVersion, 1),
    sourceService: optionalString(data.sourceService) ?? 'petcare-backend',
    aggregateType: eventType.split('.')[1],
    aggregateId: id,
    aggregateVersion: version,
    occurredAt,
    data,
  };
}

function responseWatermark(response: unknown) {
  const value = optionalString(
    asRecord(response).watermark ??
      asRecord(response).watermarkAt ??
      asRecord(response).generatedAt,
  );
  if (!value || Number.isNaN(Date.parse(value))) {
    return undefined;
  }
  return new Date(value);
}

function serviceSecret() {
  const secret = process.env.PETCARE_SERVICE_SECRET;
  if (!secret?.trim()) {
    throw new Error('PETCARE_SERVICE_SECRET is required for context backfill');
  }
  return secret.trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown) {
  const result = optionalString(value);
  if (!result) {
    throw new Error('Snapshot item id is required');
  }
  return result;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function number(value: unknown, fallback: number) {
  return Number.isInteger(value) && Number(value) >= 0
    ? Number(value)
    : fallback;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 55);
}

void backfill().catch((error: unknown) => {
  process.stderr.write(
    `Booking context backfill failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
