import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Booking, type BookingStatus } from '../../../domain/booking.entity';
import type { BookingRepositoryPort } from '../../../application/ports/booking.repository';
import { BookingOrmEntity } from '../entities/booking.orm-entity';

@Injectable()
export class BookingRepository implements BookingRepositoryPort {
  constructor(
    @InjectRepository(BookingOrmEntity)
    private readonly repository: Repository<BookingOrmEntity>,
  ) {}

  async save(booking: Booking) {
    await this.repository.save(
      BookingOrmEntity.fromDomain(booking.toPrimitives()),
    );
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

  async findAll(filters?: {
    userId?: string;
    providerId?: string;
    status?: BookingStatus;
  }) {
    const records = await this.repository.find({
      where: {
        ...(filters?.userId ? { userId: filters.userId } : {}),
        ...(filters?.providerId ? { providerId: filters.providerId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      order: { createdAt: 'DESC' },
    });
    return records.map((record) => Booking.rehydrate(record.toDomain()));
  }

  async findForAvailability(providerId: string, date: string) {
    const records = await this.repository
      .createQueryBuilder('booking')
      .where('booking.provider_id = :providerId', { providerId })
      .andWhere('DATE(booking.scheduled_at) = :date', { date })
      .andWhere('booking.status NOT IN (:...ignored)', {
        ignored: ['pending', 'rejected', 'cancelled'],
      })
      .getMany();
    return records.map((record) => Booking.rehydrate(record.toDomain()));
  }

  async expirePending(now = new Date()) {
    const records = await this.repository
      .createQueryBuilder('booking')
      .where('booking.status = :status', { status: 'pending' })
      .andWhere('booking.payment_expires_at IS NOT NULL')
      .andWhere('booking.payment_expires_at <= :now', { now })
      .getMany();
    const expired = records.map((record) => {
      const booking = Booking.rehydrate(record.toDomain());
      booking.cancel('El tiempo para pagar la reserva expiró');
      return booking;
    });
    if (expired.length > 0) {
      await this.repository.save(
        expired.map((booking) =>
          BookingOrmEntity.fromDomain(booking.toPrimitives()),
        ),
      );
    }
    return expired;
  }

  async transaction<T>(
    work: (manager: Repository<BookingOrmEntity>) => Promise<T>,
  ) {
    return this.repository.manager.transaction(async (manager) =>
      work(manager.getRepository(BookingOrmEntity)),
    );
  }
}
