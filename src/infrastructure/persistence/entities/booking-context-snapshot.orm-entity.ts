import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'booking_context_snapshots' })
@Index('IDX_booking_context_owner', ['contextType', 'ownerId'])
@Index('IDX_booking_context_catalog', ['contextType', 'active', 'city'])
export class BookingContextSnapshotOrmEntity {
  @PrimaryColumn({ name: 'context_type', type: 'varchar', length: 24 })
  contextType!: string;

  @PrimaryColumn({ name: 'aggregate_id', type: 'varchar', length: 64 })
  aggregateId!: string;

  @Column({ name: 'owner_id', type: 'varchar', length: 64, nullable: true })
  ownerId!: string | null;

  @Column({ name: 'provider_id', type: 'varchar', length: 64, nullable: true })
  providerId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  city!: string | null;

  @Column({ type: 'boolean', nullable: true })
  active!: boolean | null;

  @Column({ type: 'json' })
  payload!: Record<string, unknown>;

  @Column({ name: 'schema_version', type: 'int', unsigned: true })
  schemaVersion!: number;

  @Column({ name: 'source_service', type: 'varchar', length: 64 })
  sourceService!: string;

  @Column({ name: 'aggregate_version', type: 'int', unsigned: true })
  aggregateVersion!: number;

  @Column({ name: 'last_event_id', type: 'varchar', length: 64 })
  lastEventId!: string;

  @Column({ name: 'source_occurred_at', type: 'datetime', precision: 3 })
  sourceOccurredAt!: Date;

  @Column({ name: 'projected_at', type: 'datetime', precision: 3 })
  projectedAt!: Date;
}
