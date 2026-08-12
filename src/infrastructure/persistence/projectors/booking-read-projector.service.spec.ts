import type { DataSource } from 'typeorm';
import { Booking } from '../../../domain/booking.entity';
import { createBookingEvent } from '../../../application/contracts/booking-event.contract';
import type { BookingEventBus } from '../../../application/ports/booking-event-bus.port';
import { BookingProjectionErrorOrmEntity } from '../entities/booking-projection-error.orm-entity';
import { BookingProjectionInboxOrmEntity } from '../entities/booking-projection-inbox.orm-entity';
import { BookingReadDocumentOrmEntity } from '../entities/booking-read-document.orm-entity';
import { BookingReadProjectorService } from './booking-read-projector.service';

describe('BookingReadProjectorService', () => {
  it('is idempotent and keeps the newest aggregate version on out-of-order events', async () => {
    const database = new InMemoryDataSource();
    const events: BookingEventBus = {
      publishBookingEvent: () => Promise.resolve(),
      registerBookingEvent: () => undefined,
    };
    const projector = new BookingReadProjectorService(
      database as unknown as DataSource,
      events,
    );
    const booking = Booking.create({
      id: 'booking_projection_1',
      userId: 'user_1',
      petId: 'pet_1',
      providerId: 'provider_1',
      serviceType: 'walking',
      visitMode: 'at-location',
      scheduledAt: '2026-09-15T10:00:00.000Z',
      total: 30000,
      originalTotal: 30000,
      discountAmount: 0,
      paymentMethod: 'online',
      paymentId: 'payment_1',
      createdAt: '2026-08-01T00:00:00.000Z',
    });
    const first = createBookingEvent(booking, 'booking.created');
    booking.tokenizePayment('mock_tok_projection_1');
    const second = createBookingEvent(booking, 'booking.payment-tokenized');

    await projector.project(second);
    await projector.project(first);
    await projector.project(second);

    const document = database.documents.get(
      'booking_overview:booking_projection_1',
    );
    expect(document?.sourceAggregateVersion).toBe(2);
    expect(document?.payload.status).toBe('payment-processing');
    expect(document?.payload).not.toHaveProperty('mockPaymentToken');
    expect(database.inbox).toHaveLength(2);
    expect(projector.getMetrics().processedEvents).toBe(3);
  });
});

class InMemoryDataSource {
  readonly inbox: BookingProjectionInboxOrmEntity[] = [];
  readonly documents = new Map<string, BookingReadDocumentOrmEntity>();
  readonly errors: BookingProjectionErrorOrmEntity[] = [];
  private readonly manager = new InMemoryManager(this);

  async transaction(
    callback: (manager: InMemoryManager) => Promise<void>,
  ): Promise<void> {
    await callback(this.manager);
  }
}

class InMemoryManager {
  constructor(private readonly database: InMemoryDataSource) {}

  getRepository<T>(entity: new () => T) {
    if (entity === BookingProjectionInboxOrmEntity) {
      return new InMemoryRepository(
        this.database.inbox,
        (value) => `${value.sourceService}:${value.eventId}`,
      );
    }
    if (entity === BookingReadDocumentOrmEntity) {
      return new InMemoryRepository(
        this.database.documents,
        (value) => `${value.viewType}:${value.documentId}`,
      );
    }
    return new InMemoryRepository(this.database.errors, (value) =>
      String(value.id),
    );
  }
}

class InMemoryRepository<T extends object> {
  constructor(
    private readonly values: T[] | Map<string, T>,
    private readonly key: (value: T) => string,
  ) {}

  findOne(options: { where: Partial<T> }) {
    const values =
      this.values instanceof Map ? [...this.values.values()] : [...this.values];
    return Promise.resolve(
      values.find((value) =>
        Object.entries(options.where).every(
          ([property, expected]) => value[property as keyof T] === expected,
        ),
      ),
    );
  }

  save(value: Partial<T>) {
    const candidate = value as T;
    const candidateKey = this.key(candidate);
    if (this.values instanceof Map) {
      const existing = this.values.get(candidateKey);
      this.values.set(candidateKey, { ...existing, ...candidate });
      return Promise.resolve(this.values.get(candidateKey) as T);
    }
    const index = this.values.findIndex(
      (current) => this.key(current) === candidateKey,
    );
    if (index >= 0) {
      this.values[index] = { ...this.values[index], ...candidate };
      return Promise.resolve(this.values[index]);
    }
    this.values.push(candidate);
    return Promise.resolve(candidate);
  }
}
