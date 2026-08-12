import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { BookingEventSnapshot } from '../../../application/contracts/booking-event.contract';

@Entity({ name: 'booking_read_documents' })
@Index('IDX_booking_read_user_scheduled', ['viewType', 'userId', 'scheduledAt'])
@Index('IDX_booking_read_provider_scheduled', [
  'viewType',
  'providerId',
  'scheduledAt',
])
@Index('IDX_booking_read_status_scheduled', [
  'viewType',
  'status',
  'scheduledAt',
])
export class BookingReadDocumentOrmEntity {
  @PrimaryColumn({ name: 'view_type', type: 'varchar', length: 64 })
  viewType!: 'booking_overview';

  @PrimaryColumn({ name: 'document_id', type: 'varchar', length: 64 })
  documentId!: string;

  @Column({ type: 'json' })
  payload!: BookingEventSnapshot;

  @Column({ name: 'schema_version', type: 'int', unsigned: true, default: 1 })
  schemaVersion!: number;

  @Column({ name: 'source_service', type: 'varchar', length: 64 })
  sourceService!: string;

  @Column({ name: 'source_aggregate_version', type: 'int', unsigned: true })
  sourceAggregateVersion!: number;

  @Column({ name: 'last_event_id', type: 'varchar', length: 64 })
  lastEventId!: string;

  @Column({ name: 'source_occurred_at', type: 'datetime', precision: 3 })
  sourceOccurredAt!: Date;

  @Column({ name: 'projected_at', type: 'datetime', precision: 3 })
  projectedAt!: Date;

  @Column({
    name: 'deleted_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  deletedAt!: Date | null;

  @Column({
    name: 'user_id',
    type: 'varchar',
    length: 64,
    nullable: true,
    insert: false,
    update: false,
  })
  userId!: string | null;

  @Column({
    name: 'provider_id',
    type: 'varchar',
    length: 64,
    nullable: true,
    insert: false,
    update: false,
  })
  providerId!: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 32,
    nullable: true,
    insert: false,
    update: false,
  })
  status!: string | null;

  @Column({
    name: 'scheduled_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
    insert: false,
    update: false,
  })
  scheduledAt!: Date | null;

  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 20,
    nullable: true,
    insert: false,
    update: false,
  })
  paymentStatus!: string | null;
}
