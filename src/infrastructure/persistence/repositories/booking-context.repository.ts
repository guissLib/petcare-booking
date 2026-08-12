import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  BookingContext,
  BookingContextActor,
  BookingContextCatalogPort,
  BookingContextPet,
  BookingContextPort,
  BookingContextPromotion,
  BookingContextProvider,
  BookingContextUser,
} from '../../../application/ports/booking-context.port';
import type {
  CreateBookingInput,
  QuoteInput,
} from '../../../application/bookings.application.service';
import {
  contextTypeFromEvent,
  type BookingContextEvent,
} from '../../../application/contracts/booking-context-event.contract';
import { BookingContextInboxOrmEntity } from '../entities/booking-context-inbox.orm-entity';
import { BookingContextSnapshotOrmEntity } from '../entities/booking-context-snapshot.orm-entity';

export const LOCAL_BOOKING_CONTEXT = Symbol('LOCAL_BOOKING_CONTEXT');

@Injectable()
export class BookingContextRepository
  implements BookingContextPort, BookingContextCatalogPort
{
  constructor(
    @InjectDataSource('bookingRead')
    private readonly writeDataSource: DataSource,
    @InjectDataSource('bookingReadQuery')
    private readonly queryDataSource: DataSource,
  ) {}

  project(event: BookingContextEvent) {
    return projectBookingContextEvent(this.writeDataSource, event);
  }

  async get(
    userId: string,
    input: QuoteInput | CreateBookingInput,
  ): Promise<BookingContext> {
    const repository = this.queryDataSource.getRepository(
      BookingContextSnapshotOrmEntity,
    );
    const [userRow, petRow, providerRow] = await Promise.all([
      repository.findOneBy({ contextType: 'user', aggregateId: userId }),
      repository.findOneBy({
        contextType: 'pet',
        aggregateId: input.petId,
      }),
      repository.findOneBy({
        contextType: 'provider',
        aggregateId: input.providerId,
      }),
    ]);
    if (!userRow || !petRow || !providerRow) {
      throw new NotFoundException(
        'El contexto local de Booking está incompleto',
      );
    }
    const user = userRow.payload as unknown as BookingContextUser;
    const pet = petRow.payload as unknown as BookingContextPet;
    const provider = providerRow.payload as unknown as BookingContextProvider;
    if (pet.ownerId !== userId) {
      throw new ForbiddenException('La mascota no pertenece al usuario');
    }
    const promotions = await this.activePromotions(
      new Date(input.scheduledAt),
      user.city,
      input.providerId,
      false,
    );
    return { user, pet, provider, promotions };
  }

  async listPets(actor: BookingContextActor, ownerId?: string) {
    if (actor.role === 'provider') {
      throw new ForbiddenException('Un proveedor no puede listar mascotas');
    }
    const scopedOwner = actor.role === 'pet-owner' ? actor.id : ownerId;
    const rows = await this.queryDataSource
      .getRepository(BookingContextSnapshotOrmEntity)
      .find({
        where: {
          contextType: 'pet',
          ...(scopedOwner ? { ownerId: scopedOwner } : {}),
        },
        order: { aggregateId: 'ASC' },
      });
    return rows.map((row) => row.payload as unknown as BookingContextPet);
  }

  async listProviders() {
    const rows = await this.queryDataSource
      .getRepository(BookingContextSnapshotOrmEntity)
      .find({
        where: { contextType: 'provider' },
        order: { aggregateId: 'ASC' },
      });
    return rows
      .filter((row) => row.active !== false)
      .map((row) => row.payload as unknown as BookingContextProvider);
  }

  async listPromotions(actor: BookingContextActor) {
    const promotions = await this.activePromotions(
      new Date(),
      actor.city,
      actor.role === 'provider' ? actor.providerId : undefined,
      actor.role === 'administrator',
    );
    if (actor.role === 'administrator') {
      return promotions;
    }
    return promotions.filter(
      (promotion) =>
        !promotion.providerId ||
        actor.role !== 'provider' ||
        promotion.providerId === actor.providerId,
    );
  }

  private async activePromotions(
    at: Date,
    city: string | undefined,
    providerId: string | undefined,
    includeAllCities: boolean,
  ) {
    const rows = await this.queryDataSource
      .getRepository(BookingContextSnapshotOrmEntity)
      .find({ where: { contextType: 'promotion' } });
    return rows
      .filter((row) => row.active !== false)
      .map((row) => row.payload as unknown as BookingContextPromotion)
      .filter(
        (promotion) =>
          promotion.active &&
          at >= new Date(promotion.startsAt) &&
          at <= new Date(promotion.endsAt) &&
          (!promotion.providerId ||
            !providerId ||
            promotion.providerId === providerId) &&
          (includeAllCities ||
            promotion.scope === 'national' ||
            (!!city &&
              !!promotion.city &&
              promotion.city.toLowerCase() === city.toLowerCase())),
      );
  }
}

@Injectable()
export class DisabledBookingContextRepository
  implements BookingContextPort, BookingContextCatalogPort
{
  private unavailable(): never {
    throw new ServiceUnavailableException(
      'La proyección local de contexto Booking está deshabilitada',
    );
  }

  get(): Promise<BookingContext> {
    return this.unavailable();
  }
  listPets(): Promise<BookingContextPet[]> {
    return this.unavailable();
  }
  listProviders(): Promise<BookingContextProvider[]> {
    return this.unavailable();
  }
  listPromotions(): Promise<BookingContextPromotion[]> {
    return this.unavailable();
  }
}

export async function projectBookingContextEvent(
  dataSource: DataSource,
  event: BookingContextEvent,
) {
  try {
    return await dataSource.transaction(async (manager) => {
      const inbox = manager.getRepository(BookingContextInboxOrmEntity);
      const duplicate = await inbox.findOneBy({
        sourceService: event.sourceService,
        eventId: event.eventId,
      });
      if (duplicate) {
        return 'duplicate' as const;
      }
      await inbox.insert({
        sourceService: event.sourceService,
        eventId: event.eventId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        aggregateVersion: event.aggregateVersion,
      });

      const snapshots = manager.getRepository(BookingContextSnapshotOrmEntity);
      const contextType = contextTypeFromEvent(event.eventType);
      const existing = await snapshots.findOne({
        where: { contextType, aggregateId: event.aggregateId },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing && event.aggregateVersion <= existing.aggregateVersion) {
        return 'stale' as const;
      }
      const payload = snapshotPayload(event);
      await snapshots.save({
        contextType,
        aggregateId: event.aggregateId,
        ownerId: stringValue(payload.ownerId ?? payload.userId),
        providerId: stringValue(payload.providerId),
        city: stringValue(payload.city),
        active: booleanValue(payload.active),
        payload,
        schemaVersion: event.schemaVersion,
        sourceService: event.sourceService,
        aggregateVersion: event.aggregateVersion,
        lastEventId: event.eventId,
        sourceOccurredAt: new Date(event.occurredAt),
        projectedAt: new Date(),
      });
      return 'projected' as const;
    });
  } catch (error) {
    if (isDuplicateEntry(error)) {
      return 'duplicate' as const;
    }
    throw error;
  }
}

function snapshotPayload(event: BookingContextEvent): Record<string, unknown> {
  const contextType = contextTypeFromEvent(event.eventType);
  const nested = event.data[contextType] ?? event.data.snapshot;
  const payload =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : event.data;
  return { ...payload, id: event.aggregateId };
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function isDuplicateEntry(error: unknown) {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ER_DUP_ENTRY'
  );
}
