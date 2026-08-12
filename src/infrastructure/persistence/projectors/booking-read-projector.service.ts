import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import type { BookingEvent } from '../../../application/contracts/booking-event.contract';
import {
  BOOKING_EVENT_BUS,
  type BookingEventBus,
} from '../../../application/ports/booking-event-bus.port';
import { BookingProjectionErrorOrmEntity } from '../entities/booking-projection-error.orm-entity';
import { BookingProjectionInboxOrmEntity } from '../entities/booking-projection-inbox.orm-entity';
import { BookingReadDocumentOrmEntity } from '../entities/booking-read-document.orm-entity';

@Injectable()
export class BookingReadProjectorService implements OnModuleInit {
  private readonly logger = new Logger(BookingReadProjectorService.name);
  private processedEvents = 0;
  private projectionErrors = 0;
  private lastProjectedAt?: Date;
  private lastSourceOccurredAt?: Date;

  constructor(
    @InjectDataSource('bookingRead')
    private readonly dataSource: DataSource,
    @Inject(BOOKING_EVENT_BUS)
    private readonly events: BookingEventBus,
  ) {}

  onModuleInit() {
    this.events.registerBookingEvent((event) => this.project(event));
  }

  getMetrics() {
    const lagMs =
      this.lastSourceOccurredAt && this.lastProjectedAt
        ? Math.max(
            0,
            this.lastProjectedAt.getTime() -
              this.lastSourceOccurredAt.getTime(),
          )
        : undefined;
    return {
      processedEvents: this.processedEvents,
      projectionErrors: this.projectionErrors,
      lastProjectedAt: this.lastProjectedAt?.toISOString(),
      lastSourceOccurredAt: this.lastSourceOccurredAt?.toISOString(),
      lagMs,
    };
  }

  async project(event: BookingEvent) {
    try {
      await this.dataSource.transaction(async (manager) => {
        const inbox = manager.getRepository(BookingProjectionInboxOrmEntity);
        const existingInbox = await inbox.findOne({
          where: {
            sourceService: event.sourceService,
            eventId: event.eventId,
          },
        });
        if (existingInbox) {
          return;
        }

        const documents = manager.getRepository(BookingReadDocumentOrmEntity);
        const existing = await documents.findOne({
          where: {
            viewType: 'booking_overview',
            documentId: event.aggregateId,
          },
        });
        if (
          !existing ||
          event.aggregateVersion > existing.sourceAggregateVersion
        ) {
          const document = existing ?? new BookingReadDocumentOrmEntity();
          document.viewType = 'booking_overview';
          document.documentId = event.aggregateId;
          document.payload = event.data;
          document.schemaVersion = event.schemaVersion;
          document.sourceService = event.sourceService;
          document.sourceAggregateVersion = event.aggregateVersion;
          document.lastEventId = event.eventId;
          document.sourceOccurredAt = new Date(event.occurredAt);
          document.projectedAt = new Date();
          document.deletedAt = null;
          await documents.save(document);
        }

        const processed = new BookingProjectionInboxOrmEntity();
        processed.sourceService = event.sourceService;
        processed.eventId = event.eventId;
        processed.aggregateType = event.aggregateType;
        processed.aggregateId = event.aggregateId;
        processed.aggregateVersion = event.aggregateVersion;
        processed.eventType = event.eventType;
        await inbox.save(processed);
      });
      this.processedEvents += 1;
      this.lastProjectedAt = new Date();
      this.lastSourceOccurredAt = new Date(event.occurredAt);
    } catch (error) {
      this.projectionErrors += 1;
      await this.recordError(event, error);
      this.logger.error(
        `No se pudo proyectar ${event.eventType} id=${event.eventId}: ${errorMessage(error)}`,
      );
      throw error;
    }
  }

  private async recordError(event: BookingEvent, error: unknown) {
    try {
      const repository = this.dataSource.getRepository(
        BookingProjectionErrorOrmEntity,
      );
      const existing = await repository.findOne({
        where: {
          sourceService: event.sourceService,
          eventId: event.eventId,
          resolvedAt: IsNull(),
        },
      });
      await repository.save({
        ...(existing
          ? { id: existing.id, attempts: existing.attempts + 1 }
          : {}),
        sourceService: event.sourceService,
        eventId: event.eventId,
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        errorMessage: errorMessage(error).slice(0, 1000),
        payload: event,
        resolvedAt: null,
      });
    } catch (recordError) {
      this.logger.error(
        `No se pudo registrar error de proyección: ${errorMessage(recordError)}`,
      );
    }
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
