import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  BookingPrimitives,
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  ServiceType,
  VisitMode,
} from '../../../domain/booking.entity';

@Entity({ name: 'bookings' })
@Index('IDX_booking_user_created_at', ['userId', 'createdAt'])
@Index('IDX_booking_provider_scheduled_at', ['providerId', 'scheduledAt'])
@Index('IDX_booking_status', ['status'])
@Index('UQ_booking_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class BookingOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string;

  @Column({ name: 'pet_id', type: 'varchar', length: 64 })
  petId!: string;

  @Column({ name: 'provider_id', type: 'varchar', length: 64 })
  providerId!: string;

  @Column({ name: 'service_type', type: 'varchar', length: 32 })
  serviceType!: ServiceType;

  @Column({ name: 'visit_mode', type: 'varchar', length: 32 })
  visitMode!: VisitMode;

  @Column({ name: 'scheduled_at', type: 'datetime', precision: 3 })
  scheduledAt!: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: number | null;

  @Column({
    name: 'address_reference',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  addressReference!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: BookingStatus;

  @Column({ name: 'original_total', type: 'int', unsigned: true })
  originalTotal!: number;

  @Column({ type: 'int', unsigned: true })
  total!: number;

  @Column({ name: 'discount_amount', type: 'int', unsigned: true, default: 0 })
  discountAmount!: number;

  @Column({ type: 'varchar', length: 3, default: 'COP' })
  currency!: 'COP';

  @Column({ name: 'payment_method', type: 'varchar', length: 20 })
  paymentMethod!: PaymentMethod;

  @Column({ name: 'payment_id', type: 'varchar', length: 64, unique: true })
  paymentId!: string;

  @Column({ name: 'payment_status', type: 'varchar', length: 20 })
  paymentStatus!: PaymentStatus;

  @Column({
    name: 'payment_reference',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  paymentReference!: string | null;

  @Column({
    name: 'payment_expires_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  paymentExpiresAt!: Date | null;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  idempotencyKey!: string | null;

  @Column({ name: 'promotion_id', type: 'varchar', length: 64, nullable: true })
  promotionId!: string | null;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  rejectionReason!: string | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt!: Date;

  static fromDomain(booking: BookingPrimitives) {
    const entity = new BookingOrmEntity();
    entity.id = booking.id;
    entity.userId = booking.userId;
    entity.petId = booking.petId;
    entity.providerId = booking.providerId;
    entity.serviceType = booking.serviceType;
    entity.visitMode = booking.visitMode;
    entity.scheduledAt = new Date(booking.scheduledAt);
    entity.address = booking.address ?? null;
    entity.latitude = booking.latitude ?? null;
    entity.longitude = booking.longitude ?? null;
    entity.addressReference = booking.addressReference ?? null;
    entity.notes = booking.notes ?? null;
    entity.status = booking.status;
    entity.originalTotal = booking.originalTotal;
    entity.total = booking.total;
    entity.discountAmount = booking.discountAmount;
    entity.currency = booking.currency;
    entity.paymentMethod = booking.paymentMethod;
    entity.paymentId = booking.paymentId;
    entity.paymentStatus = booking.paymentStatus;
    entity.paymentReference = booking.paymentReference ?? null;
    entity.paymentExpiresAt = booking.paymentExpiresAt
      ? new Date(booking.paymentExpiresAt)
      : null;
    entity.idempotencyKey = booking.idempotencyKey ?? null;
    entity.promotionId = booking.promotionId ?? null;
    entity.rejectionReason = booking.rejectionReason ?? null;
    entity.createdAt = new Date(booking.createdAt);
    return entity;
  }

  toDomain(): BookingPrimitives {
    return {
      id: this.id,
      userId: this.userId,
      petId: this.petId,
      providerId: this.providerId,
      serviceType: this.serviceType,
      visitMode: this.visitMode,
      scheduledAt: this.scheduledAt.toISOString(),
      address: this.address ?? undefined,
      latitude: this.latitude === null ? undefined : Number(this.latitude),
      longitude: this.longitude === null ? undefined : Number(this.longitude),
      addressReference: this.addressReference ?? undefined,
      notes: this.notes ?? undefined,
      status: this.status,
      originalTotal: this.originalTotal,
      total: this.total,
      discountAmount: this.discountAmount,
      currency: this.currency,
      paymentMethod: this.paymentMethod,
      paymentId: this.paymentId,
      paymentStatus: this.paymentStatus,
      paymentReference: this.paymentReference ?? undefined,
      paymentExpiresAt: this.paymentExpiresAt?.toISOString(),
      idempotencyKey: this.idempotencyKey ?? undefined,
      promotionId: this.promotionId ?? undefined,
      rejectionReason: this.rejectionReason ?? undefined,
      createdAt: this.createdAt.toISOString(),
    };
  }
}
