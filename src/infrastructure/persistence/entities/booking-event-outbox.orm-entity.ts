import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { BookingEvent } from '../../../application/contracts/booking-event.contract';

export type BookingOutboxStatus = 'pending' | 'published' | 'failed';

@Entity({ name: 'booking_event_outbox' })
@Index('IDX_booking_event_outbox_pending', ['status', 'nextAttemptAt'])
@Index(
  'UQ_booking_event_outbox_aggregate_version',
  ['sourceService', 'aggregateType', 'aggregateId', 'aggregateVersion'],
  { unique: true },
)
export class BookingEventOutboxOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'source_service', type: 'varchar', length: 64 })
  sourceService!: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 64 })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 64 })
  aggregateId!: string;

  @Column({ name: 'aggregate_version', type: 'int', unsigned: true })
  aggregateVersion!: number;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ name: 'schema_version', type: 'int', unsigned: true, default: 1 })
  schemaVersion!: number;

  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  correlationId!: string | null;

  @Column({ name: 'causation_id', type: 'varchar', length: 64, nullable: true })
  causationId!: string | null;

  @Column({ type: 'json' })
  payload!: BookingEvent;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: BookingOutboxStatus;

  @Column({ type: 'int', unsigned: true, default: 0 })
  attempts!: number;

  @Column({
    name: 'next_attempt_at',
    type: 'datetime',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
  })
  nextAttemptAt!: Date;

  @Column({
    name: 'published_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  publishedAt!: Date | null;

  @Column({ name: 'last_error', type: 'varchar', length: 1000, nullable: true })
  lastError!: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 3,
  })
  createdAt!: Date;

  static fromEvent(event: BookingEvent) {
    const record = new BookingEventOutboxOrmEntity();
    record.id = event.eventId;
    record.sourceService = event.sourceService;
    record.aggregateType = event.aggregateType;
    record.aggregateId = event.aggregateId;
    record.aggregateVersion = event.aggregateVersion;
    record.eventType = event.eventType;
    record.schemaVersion = event.schemaVersion;
    record.correlationId = event.correlationId ?? null;
    record.causationId = event.causationId ?? null;
    record.payload = event;
    record.status = 'pending';
    record.attempts = 0;
    record.nextAttemptAt = new Date();
    record.publishedAt = null;
    record.lastError = null;
    return record;
  }
}
