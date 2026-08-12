import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'booking_context_inbox' })
export class BookingContextInboxOrmEntity {
  @PrimaryColumn({ name: 'source_service', type: 'varchar', length: 64 })
  sourceService!: string;

  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 64 })
  eventId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 64 })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 64 })
  aggregateId!: string;

  @Column({ name: 'aggregate_version', type: 'int', unsigned: true })
  aggregateVersion!: number;

  @CreateDateColumn({
    name: 'processed_at',
    type: 'datetime',
    precision: 3,
  })
  processedAt!: Date;
}
