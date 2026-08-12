import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { BookingActor } from '../../../application/bookings.application.service';
import type { BookingResponse } from '../../../application/contracts/booking-response';
import { type BookingStatus } from '../../../domain/booking.entity';
import type {
  BookingReadRepositoryPort,
  BookingReadResult,
} from '../../../application/ports/booking-read.repository';
import type { BookingPagination } from '../../../application/ports/booking.repository';
import { BookingReadDocumentOrmEntity } from '../entities/booking-read-document.orm-entity';

const VIEW_TYPE = 'booking_overview';

@Injectable()
export class BookingReadRepository implements BookingReadRepositoryPort {
  private readonly logger = new Logger(BookingReadRepository.name);

  constructor(
    @InjectDataSource('bookingReadQuery')
    private readonly dataSource: DataSource,
  ) {}

  async list(
    actor: BookingActor,
    status?: BookingStatus,
    pagination?: BookingPagination,
  ): Promise<BookingReadResult<BookingResponse[]>> {
    if (!readsEnabled()) {
      return { enabled: false };
    }
    try {
      const query = this.baseQuery(actor);
      if (status) {
        query.andWhere('document.status = :status', { status });
      }
      if (pagination) {
        query
          .skip((pagination.page - 1) * pagination.pageSize)
          .take(pagination.pageSize);
      }
      const records = await query
        .orderBy('document.source_occurred_at', 'DESC')
        .addOrderBy('document.document_id', 'DESC')
        .getMany();
      return {
        enabled: true,
        value: records.map((record) => toResponse(record)),
      };
    } catch (error) {
      this.logger.warn(`Read model no disponible: ${errorMessage(error)}`);
      return { enabled: false };
    }
  }

  async get(
    id: string,
    actor: BookingActor,
  ): Promise<BookingReadResult<BookingResponse>> {
    if (!readsEnabled()) {
      return { enabled: false };
    }
    try {
      const record = await this.baseQuery(actor)
        .andWhere('document.document_id = :id', { id })
        .getOne();
      return {
        enabled: true,
        ...(record ? { value: toResponse(record) } : {}),
      };
    } catch (error) {
      this.logger.warn(`Read model no disponible: ${errorMessage(error)}`);
      return { enabled: false };
    }
  }

  private baseQuery(actor: BookingActor) {
    const query = this.dataSource
      .getRepository(BookingReadDocumentOrmEntity)
      .createQueryBuilder('document')
      .where('document.view_type = :viewType', { viewType: VIEW_TYPE })
      .andWhere('document.deleted_at IS NULL');

    if (actor.role === 'pet-owner') {
      query.andWhere('document.user_id = :userId', { userId: actor.id });
    } else if (actor.role === 'provider') {
      if (!actor.providerId) {
        return query.andWhere('1 = 0');
      }
      query
        .andWhere('document.provider_id = :providerId', {
          providerId: actor.providerId,
        })
        .andWhere('document.status NOT IN (:...hiddenStatuses)', {
          hiddenStatuses: [
            'provisional',
            'awaiting-payment-token',
            'payment-processing',
            'pending',
            'pending-confirmation',
          ],
        });
    }
    return query;
  }
}

@Injectable()
export class DisabledBookingReadRepository implements BookingReadRepositoryPort {
  list(): Promise<BookingReadResult<BookingResponse[]>> {
    return Promise.resolve({ enabled: false });
  }

  get(): Promise<BookingReadResult<BookingResponse>> {
    return Promise.resolve({ enabled: false });
  }
}

function toResponse(record: BookingReadDocumentOrmEntity): BookingResponse {
  const snapshot = record.payload;
  return {
    ...snapshot,
    projectedAt: record.projectedAt.toISOString(),
    payment: {
      id: snapshot.paymentId,
      method: snapshot.paymentMethod,
      amount: snapshot.total,
      currency: snapshot.currency,
      status: snapshot.paymentStatus,
      provider: 'mock',
      reference:
        snapshot.paymentReference ??
        `PENDING-${snapshot.paymentId.slice(0, 12)}`,
      createdAt: snapshot.createdAt,
    },
  };
}

function readsEnabled() {
  return ['true', '1', 'yes'].includes(
    (process.env.BOOKING_READ_MODEL_READS_ENABLED ?? '').toLowerCase(),
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
