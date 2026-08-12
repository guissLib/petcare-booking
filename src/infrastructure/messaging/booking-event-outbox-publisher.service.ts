import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { LessThanOrEqual, DataSource } from 'typeorm';
import {
  BOOKING_EVENT_BUS,
  type BookingEventBus,
} from '../../application/ports/booking-event-bus.port';
import {
  MESSAGE_BUS,
  type MessageBus,
} from '../../application/ports/message-bus.port';
import { BookingEventOutboxOrmEntity } from '../persistence/entities/booking-event-outbox.orm-entity';

@Injectable()
export class BookingEventOutboxPublisherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BookingEventOutboxPublisherService.name);
  private readonly intervalMs = positiveInteger(
    process.env.BOOKING_EVENT_OUTBOX_POLL_MS,
    1000,
  );
  private readonly maxAttempts = positiveInteger(
    process.env.BOOKING_EVENT_OUTBOX_MAX_ATTEMPTS,
    10,
  );
  private timer?: NodeJS.Timeout;
  private flushing = false;
  private lastMissingTableWarning = 0;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(BOOKING_EVENT_BUS)
    private readonly events: BookingEventBus,
    @Inject(MESSAGE_BUS)
    private readonly messages: MessageBus,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.flush(), this.intervalMs);
    void this.flush();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async flush() {
    if (this.flushing || !this.dataSource.isInitialized) {
      return;
    }
    this.flushing = true;
    try {
      const repository = this.dataSource.getRepository(
        BookingEventOutboxOrmEntity,
      );
      const messages = await repository.find({
        where: {
          status: 'pending',
          nextAttemptAt: LessThanOrEqual(new Date()),
        },
        order: {
          createdAt: 'ASC',
          aggregateId: 'ASC',
          aggregateVersion: 'ASC',
        },
        take: 25,
      });
      for (const message of messages) {
        await this.publishOne(message);
      }
    } catch (error) {
      const message = errorMessage(error);
      if (isMissingOutboxTable(message)) {
        if (Date.now() - this.lastMissingTableWarning >= 60_000) {
          this.lastMissingTableWarning = Date.now();
          this.logger.warn(
            'La tabla booking_event_outbox aún no existe; ejecuta las migraciones de Booking',
          );
        }
      } else {
        this.logger.error(`Error leyendo outbox Booking: ${message}`);
      }
    } finally {
      this.flushing = false;
    }
  }

  private async publishOne(message: BookingEventOutboxOrmEntity) {
    const attempts = message.attempts + 1;
    message.attempts = attempts;
    message.nextAttemptAt = new Date(Date.now() + retryDelay(attempts));
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(BookingEventOutboxOrmEntity).save({
        id: message.id,
        attempts,
        nextAttemptAt: message.nextAttemptAt,
      });
    });

    try {
      const { integrationMessage, ...bookingEvent } = message.payload;
      if (integrationMessage) {
        await this.messages.publish(integrationMessage);
      }
      await this.events.publishBookingEvent(bookingEvent);
      message.status = 'published';
      message.publishedAt = new Date();
      message.lastError = null;
    } catch (error) {
      message.status = attempts >= this.maxAttempts ? 'failed' : 'pending';
      message.lastError = errorMessage(error).slice(0, 1000);
      this.logger.error(
        `No se pudo publicar evento Booking id=${message.id} attempt=${attempts}: ${message.lastError}`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(BookingEventOutboxOrmEntity).save({
        id: message.id,
        status: message.status,
        publishedAt: message.publishedAt,
        lastError: message.lastError,
      });
    });
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function retryDelay(attempt: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.min(attempt - 1, 6));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingOutboxTable(message: string) {
  return (
    message.includes('booking_event_outbox') &&
    (message.includes("doesn't exist") || message.includes('does not exist'))
  );
}
