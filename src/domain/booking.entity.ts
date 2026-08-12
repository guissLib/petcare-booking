import { BusinessRuleError } from './business-rule.error';

export type BookingStatus =
  | 'pending'
  | 'pending-confirmation'
  | 'confirmed'
  | 'rejected'
  | 'in-progress'
  | 'completed'
  | 'cancelled';

export type PaymentMethod = 'online' | 'at-location';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type ServiceType =
  | 'grooming'
  | 'walking'
  | 'boarding'
  | 'veterinary'
  | 'home-visit'
  | 'cleaning';
export type VisitMode = 'pickup-dropoff' | 'home-visit' | 'at-location';

export interface BookingPrimitives {
  id: string;
  userId: string;
  petId: string;
  providerId: string;
  serviceType: ServiceType;
  visitMode: VisitMode;
  scheduledAt: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  addressReference?: string;
  notes?: string;
  status: BookingStatus;
  total: number;
  originalTotal: number;
  discountAmount: number;
  currency: 'COP';
  paymentMethod: PaymentMethod;
  paymentId: string;
  paymentStatus: PaymentStatus;
  paymentReference?: string;
  paymentExpiresAt?: string;
  idempotencyKey?: string;
  promotionId?: string;
  rejectionReason?: string;
  createdAt: string;
}

export type NewBooking = Omit<
  BookingPrimitives,
  'status' | 'paymentStatus' | 'currency'
> & {
  status?: BookingStatus;
  paymentStatus?: PaymentStatus;
  currency?: 'COP';
};

export class Booking {
  private constructor(private readonly props: BookingPrimitives) {}

  static create(input: NewBooking) {
    const booking = new Booking({
      ...normalize(input),
      status:
        input.status ??
        (input.paymentMethod === 'online' ? 'pending' : 'confirmed'),
      paymentStatus:
        input.paymentStatus ??
        (input.paymentMethod === 'online' ? 'pending' : 'paid'),
      currency: 'COP',
    });
    booking.validate();
    return booking;
  }

  static rehydrate(input: BookingPrimitives) {
    return new Booking({ ...input });
  }

  markPaymentProcessing(paymentReference?: string) {
    if (
      this.props.status === 'confirmed' ||
      this.props.status === 'pending-confirmation'
    ) {
      this.props.paymentStatus = 'paid';
      this.props.paymentReference =
        paymentReference?.trim() || this.props.paymentReference;
      return;
    }
    if (this.props.status !== 'pending') {
      throw new BusinessRuleError(
        `No se puede procesar el pago desde ${this.props.status}`,
      );
    }
    this.props.status = 'pending-confirmation';
    this.props.paymentStatus = 'paid';
    this.props.paymentReference = paymentReference?.trim() || undefined;
    this.props.paymentExpiresAt = undefined;
  }

  confirmFromPayment(paymentId: string, amount: number) {
    if (paymentId !== this.props.paymentId || amount !== this.props.total) {
      throw new BusinessRuleError(
        'El comando de pago no coincide con la reserva',
      );
    }
    if (this.props.status === 'confirmed') {
      return;
    }
    if (
      !['pending', 'pending-confirmation'].includes(this.props.status) ||
      this.props.paymentStatus !== 'paid'
    ) {
      throw new BusinessRuleError('La reserva no está lista para confirmarse');
    }
    this.props.status = 'confirmed';
    this.props.paymentExpiresAt = undefined;
  }

  cancel(reason = 'Compensación de la reserva Saga') {
    if (this.props.status === 'cancelled') {
      return;
    }
    if (
      ['confirmed', 'rejected', 'in-progress', 'completed'].includes(
        this.props.status,
      )
    ) {
      throw new BusinessRuleError('La reserva ya no puede ser compensada');
    }
    this.props.status = 'cancelled';
    this.props.rejectionReason = reason.trim() || 'Reserva cancelada';
    this.props.paymentExpiresAt = undefined;
  }

  changeStatus(status: BookingStatus, reason?: string) {
    if (
      this.props.status === 'pending' ||
      this.props.status === 'pending-confirmation'
    ) {
      if (status === 'confirmed') {
        throw new BusinessRuleError(
          'La reserva solo puede confirmarse mediante el pago',
        );
      }
    }
    const transitions: Record<BookingStatus, BookingStatus[]> = {
      pending: ['pending-confirmation', 'rejected', 'cancelled'],
      'pending-confirmation': ['confirmed', 'cancelled'],
      confirmed: ['in-progress', 'rejected', 'cancelled'],
      rejected: [],
      'in-progress': ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };
    if (!transitions[this.props.status].includes(status)) {
      throw new BusinessRuleError(
        `No se puede cambiar una reserva de ${this.props.status} a ${status}`,
      );
    }
    this.props.status = status;
    if (status === 'rejected') {
      this.props.rejectionReason = reason?.trim() || 'Requisitos no cumplidos';
    }
  }

  isPaymentExpired(at = new Date()) {
    return (
      this.props.status === 'pending' &&
      !!this.props.paymentExpiresAt &&
      new Date(this.props.paymentExpiresAt) <= at
    );
  }

  toPrimitives() {
    return { ...this.props };
  }

  get id() {
    return this.props.id;
  }

  get userId() {
    return this.props.userId;
  }

  get providerId() {
    return this.props.providerId;
  }

  get status() {
    return this.props.status;
  }

  private validate() {
    if (
      this.props.paymentMethod === 'at-location' &&
      this.props.paymentStatus !== 'paid'
    ) {
      throw new BusinessRuleError(
        'Una reserva at-location requiere un pago registrado',
      );
    }
    if (
      this.props.paymentMethod === 'online' &&
      this.props.status === 'confirmed' &&
      this.props.paymentStatus !== 'paid'
    ) {
      throw new BusinessRuleError(
        'Una reserva online no puede confirmarse sin pago',
      );
    }
    if (
      !this.props.scheduledAt ||
      Number.isNaN(new Date(this.props.scheduledAt).getTime())
    ) {
      throw new BusinessRuleError('scheduledAt debe ser una fecha válida');
    }
    if (this.props.visitMode === 'home-visit') {
      if (!this.props.address || !this.props.addressReference) {
        throw new BusinessRuleError(
          'address y addressReference son requeridos para visita a domicilio',
        );
      }
      if (
        this.props.latitude === undefined ||
        this.props.longitude === undefined ||
        this.props.latitude < -23 ||
        this.props.latitude > -9 ||
        this.props.longitude < -70 ||
        this.props.longitude > -57
      ) {
        throw new BusinessRuleError(
          'La ubicación de la visita debe estar dentro de Bolivia',
        );
      }
    }
    if (
      this.props.total <= 0 ||
      this.props.originalTotal <= 0 ||
      this.props.discountAmount < 0 ||
      this.props.originalTotal - this.props.discountAmount !== this.props.total
    ) {
      throw new BusinessRuleError(
        'Los importes de la reserva no son coherentes',
      );
    }
  }
}

function normalize(input: NewBooking): BookingPrimitives {
  const originalTotal = Math.round(input.originalTotal ?? input.total);
  const total = Math.round(input.total);
  return {
    ...input,
    id: input.id.trim(),
    userId: input.userId.trim(),
    petId: input.petId.trim(),
    providerId: input.providerId.trim(),
    scheduledAt: input.scheduledAt,
    address: input.address?.trim() || undefined,
    addressReference: input.addressReference?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    paymentId: input.paymentId.trim(),
    paymentReference: input.paymentReference?.trim() || undefined,
    idempotencyKey: input.idempotencyKey?.trim() || undefined,
    originalTotal,
    total,
    discountAmount: Math.round(
      input.discountAmount ?? Math.max(0, originalTotal - total),
    ),
  } as BookingPrimitives;
}
