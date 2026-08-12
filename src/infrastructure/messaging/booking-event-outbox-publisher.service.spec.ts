import type { DataSource } from 'typeorm';
import { Booking } from '../../domain/booking.entity';
import { createBookingEvent } from '../../application/contracts/booking-event.contract';
import type { BookingEventBus } from '../../application/ports/booking-event-bus.port';
import { BookingEventOutboxOrmEntity } from '../persistence/entities/booking-event-outbox.orm-entity';
import { BookingEventOutboxPublisherService } from './booking-event-outbox-publisher.service';

describe('BookingEventOutboxPublisherService', () => {
  it('retries a failed publication and marks the event published after confirmation', async () => {
    const message = BookingEventOutboxOrmEntity.fromEvent(
      createBookingEvent(
        Booking.create({
          id: 'booking_outbox_1',
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
        }),
        'booking.created',
      ),
    );
    message.nextAttemptAt = new Date(0);
    const database = new InMemoryOutboxDataSource(message);
    let attempts = 0;
    const events: BookingEventBus = {
      registerBookingEvent: () => undefined,
      publishBookingEvent: () => {
        attempts += 1;
        if (attempts === 1) {
          return Promise.reject(
            new Error('RabbitMQ temporalmente indisponible'),
          );
        }
        return Promise.resolve();
      },
    };
    const originalMaxAttempts = process.env.BOOKING_EVENT_OUTBOX_MAX_ATTEMPTS;
    process.env.BOOKING_EVENT_OUTBOX_MAX_ATTEMPTS = '3';
    try {
      const publisher = new BookingEventOutboxPublisherService(
        database as unknown as DataSource,
        events,
        {
          publish: jest.fn().mockResolvedValue(undefined),
          register: jest.fn(),
        },
      );
      const flush = () =>
        (publisher as unknown as { flush: () => Promise<void> }).flush();

      await flush();
      expect(message.status).toBe('pending');
      message.nextAttemptAt = new Date(0);
      await flush();

      expect(attempts).toBe(2);
      expect(message.status).toBe('published');
      expect(message.publishedAt).toBeInstanceOf(Date);
    } finally {
      if (originalMaxAttempts === undefined) {
        delete process.env.BOOKING_EVENT_OUTBOX_MAX_ATTEMPTS;
      } else {
        process.env.BOOKING_EVENT_OUTBOX_MAX_ATTEMPTS = originalMaxAttempts;
      }
    }
  });
});

class InMemoryOutboxDataSource {
  readonly isInitialized = true;
  private readonly repository = {
    find: () =>
      Promise.resolve(
        [this.message].filter(
          (candidate) =>
            candidate.status === 'pending' &&
            candidate.nextAttemptAt.getTime() <= Date.now(),
        ),
      ),
    save: (changes: Partial<BookingEventOutboxOrmEntity>) => {
      Object.assign(this.message, changes);
      return Promise.resolve(this.message);
    },
  };

  constructor(private readonly message: BookingEventOutboxOrmEntity) {}

  getRepository() {
    return this.repository;
  }

  async transaction(
    callback: (manager: {
      getRepository: () => typeof this.repository;
    }) => Promise<void>,
  ) {
    await callback({
      getRepository: () => this.repository,
    });
  }
}
