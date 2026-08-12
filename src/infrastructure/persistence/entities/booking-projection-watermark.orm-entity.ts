import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'booking_projection_watermarks' })
export class BookingProjectionWatermarkOrmEntity {
  @PrimaryColumn({ name: 'projection_name', type: 'varchar', length: 64 })
  projectionName!: string;

  @Column({ name: 'watermark_at', type: 'datetime', precision: 3 })
  watermarkAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt!: Date;
}
