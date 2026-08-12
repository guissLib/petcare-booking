import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'booking_projection_errors' })
@Index('IDX_booking_projection_errors_pending', ['resolvedAt', 'createdAt'])
export class BookingProjectionErrorOrmEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'source_service', type: 'varchar', length: 64 })
  sourceService!: string;

  @Column({ name: 'event_id', type: 'varchar', length: 64 })
  eventId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 64 })
  aggregateId!: string;

  @Column({ name: 'attempts', type: 'int', unsigned: true, default: 1 })
  attempts!: number;

  @Column({ name: 'error_message', type: 'varchar', length: 1000 })
  errorMessage!: string;

  @Column({ name: 'payload', type: 'json' })
  payload!: unknown;

  @Column({
    name: 'resolved_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  resolvedAt!: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 3,
  })
  createdAt!: Date;
}
