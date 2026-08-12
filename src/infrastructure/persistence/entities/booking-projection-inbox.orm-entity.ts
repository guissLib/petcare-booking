import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'booking_projection_inbox' })
export class BookingProjectionInboxOrmEntity {
  @PrimaryColumn({ name: 'source_service', type: 'varchar', length: 64 })
  sourceService!: string;

  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 64 })
  eventId!: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 64 })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 64 })
  aggregateId!: string;

  @Column({ name: 'aggregate_version', type: 'int', unsigned: true })
  aggregateVersion!: number;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @CreateDateColumn({
    name: 'processed_at',
    type: 'datetime',
    precision: 3,
  })
  processedAt!: Date;
}
