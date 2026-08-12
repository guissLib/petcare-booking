import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Booking, type BookingStatus } from '../../../domain/booking.entity';
import { ConcurrencyError } from '../../../domain/concurrency.error';
import {
  createBookingEvent,
  type BookingEvent,
} from '../../../application/contracts/booking-event.contract';
import type {
  BookingPagination,
  BookingRepositoryPort,
} from '../../../application/ports/booking.repository';
import { BookingOrmEntity } from '../entities/booking.orm-entity';
import { BookingEventOutboxOrmEntity } from '../entities/booking-event-outbox.orm-entity';

@Injectable()
export class BookingRepository implements BookingRepositoryPort {
  constructor(
    @InjectRepository(BookingOrmEntity)
    private readonly repository: Repository<BookingOrmEntity>,
  ) {}

  async save(booking: Booking, event?: BookingEvent) {
    await this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(BookingOrmEntity);
      const current = await repository.findOne({
        where: { id: booking.id },
      });
      if (
        current &&
        current.aggregateVersion !== booking.aggregateVersion - 1
      ) {
        throw new ConcurrencyError(
          `Versión esperada ${booking.aggregateVersion - 1}, actual ${current.aggregateVersion}`,
        );
      }
      if (!current && booking.aggregateVersion !== 1) {
        throw new ConcurrencyError(
          `No existe la reserva ${booking.id} para la versión ${booking.aggregateVersion}`,
        );
      }
      const entity = BookingOrmEntity.fromDomain(booking.toPrimitives());
      if (!current) {
        await repository.insert(entity);
      } else {
        const values = { ...entity, id: undefined };
        const result = await repository.update(
          {
            id: booking.id,
            aggregateVersion: booking.aggregateVersion - 1,
          },
          values,
        );
        if (result.affected !== 1) {
          throw new ConcurrencyError(
            `No se pudo guardar la versión ${booking.aggregateVersion} de ${booking.id}`,
          );
        }
      }
      const outboxEvent =
        event ??
        createBookingEvent(
          booking,
          current ? 'booking.status-changed' : 'booking.created',
        );
      await manager
        .getRepository(BookingEventOutboxOrmEntity)
        .save(BookingEventOutboxOrmEntity.fromEvent(outboxEvent));
    });
    return booking;
  }

  async findById(id: string) {
    const record = await this.repository.findOne({ where: { id } });
    return record ? Booking.rehydrate(record.toDomain()) : undefined;
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string) {
    const record = await this.repository.findOne({
      where: { userId, idempotencyKey },
    });
    return record ? Booking.rehydrate(record.toDomain()) : undefined;
  }

  async findAll(
    filters?: {
      userId?: string;
      providerId?: string;
      status?: BookingStatus;
    },
    pagination?: BookingPagination,
  ) {
    const records = await this.repository.find({
      where: {
        ...(filters?.userId ? { userId: filters.userId } : {}),
        ...(filters?.providerId ? { providerId: filters.providerId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      ...(pagination
        ? {
            skip: (pagination.page - 1) * pagination.pageSize,
            take: pagination.pageSize,
          }
        : {}),
    });
    return records.map((record) => Booking.rehydrate(record.toDomain()));
  }

  async findForAvailability(providerId: string, date: string) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const records = await this.repository
      .createQueryBuilder('booking')
      .where('booking.provider_id = :providerId', { providerId })
      .andWhere('booking.scheduled_at >= :start', { start })
      .andWhere('booking.scheduled_at < :end', { end })
      .andWhere('booking.status NOT IN (:...ignored)', {
        ignored: ['pending', 'rejected', 'cancelled'],
      })
      .getMany();
    return records.map((record) => Booking.rehydrate(record.toDomain()));
  }

  async expirePending(now = new Date()) {
    return this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(BookingOrmEntity);
      const records = await repository
        .createQueryBuilder('booking')
        .where('booking.status IN (:...statuses)', {
          statuses: ['awaiting-payment-token', 'pending'],
        })
        .andWhere('booking.payment_expires_at IS NOT NULL')
        .andWhere('booking.payment_expires_at <= :now', { now })
        .setLock('pessimistic_write')
        .getMany();
      const expired = records.map((record) => {
        const booking = Booking.rehydrate(record.toDomain());
        booking.cancel('El tiempo para pagar la reserva expiró');
        return booking;
      });
      if (expired.length > 0) {
        await repository.save(
          expired.map((booking) =>
            BookingOrmEntity.fromDomain(booking.toPrimitives()),
          ),
        );
        await manager
          .getRepository(BookingEventOutboxOrmEntity)
          .save(
            expired.map((booking) =>
              BookingEventOutboxOrmEntity.fromEvent(
                createBookingEvent(booking, 'booking.expired'),
              ),
            ),
          );
      }
      return expired;
    });
  }

  async transaction<T>(
    work: (manager: Repository<BookingOrmEntity>) => Promise<T>,
  ) {
    return this.repository.manager.transaction(async (manager) =>
      work(manager.getRepository(BookingOrmEntity)),
    );
  }
}
