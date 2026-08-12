import { BusinessRuleError } from './business-rule.error';

export type BookingStatus =
  | 'provisional'
  | 'awaiting-payment-token'
  | 'payment-processing'
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
  aggregateVersion: number;
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
  mockPaymentToken?: string;
  paymentExpiresAt?: string;
  idempotencyKey?: string;
  promotionId?: string;
  rejectionReason?: string;
  createdAt: string;
}

export type NewBooking = Omit<
  BookingPrimitives,
  'aggregateVersion' | 'status' | 'paymentStatus' | 'currency'
> & {
  aggregateVersion?: number;
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
        (input.paymentMethod === 'online'
          ? 'awaiting-payment-token'
          : 'provisional'),
      paymentStatus: input.paymentStatus ?? 'pending',
      currency: 'COP',
    });
    booking.validate();
    return booking;
  }

  static rehydrate(input: BookingPrimitives) {
    return new Booking({
      ...input,
      aggregateVersion: input.aggregateVersion ?? 1,
    });
  }

  tokenizePayment(mockPaymentToken: string) {
    if (this.props.mockPaymentToken) {
      return this.props.mockPaymentToken;
    }
    if (this.props.status !== 'awaiting-payment-token') {
      throw new BusinessRuleError(
        `No se puede tokenizar el pago desde ${this.props.status}`,
      );
    }
    if (!/^mock_tok_[A-Za-z0-9_-]+$/.test(mockPaymentToken)) {
      throw new BusinessRuleError('El token mock no es válido');
    }
    this.props.mockPaymentToken = mockPaymentToken;
    this.props.status = 'payment-processing';
    this.bumpVersion();
    return mockPaymentToken;
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
      ![
        'provisional',
        'awaiting-payment-token',
        'payment-processing',
        'pending',
        'pending-confirmation',
      ].includes(this.props.status)
    ) {
      throw new BusinessRuleError('La reserva no está lista para confirmarse');
    }
    this.props.paymentStatus = 'paid';
    this.props.status = 'confirmed';
    this.props.paymentExpiresAt = undefined;
    this.bumpVersion();
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
    this.bumpVersion();
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
      provisional: ['cancelled'],
      'awaiting-payment-token': ['cancelled'],
      'payment-processing': ['cancelled'],
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
    this.bumpVersion();
  }

  isPaymentExpired(at = new Date()) {
    return (
      (this.props.status === 'pending' &&
        !!this.props.paymentExpiresAt &&
        new Date(this.props.paymentExpiresAt) <= at) ||
      (this.props.status === 'awaiting-payment-token' &&
        !!this.props.paymentExpiresAt &&
        new Date(this.props.paymentExpiresAt) <= at)
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

  get aggregateVersion() {
    return this.props.aggregateVersion;
  }

  private bumpVersion() {
    this.props.aggregateVersion += 1;
  }

  private validate() {
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
    aggregateVersion: Math.max(1, Math.trunc(input.aggregateVersion ?? 1)),
    userId: input.userId.trim(),
    petId: input.petId.trim(),
    providerId: input.providerId.trim(),
    scheduledAt: input.scheduledAt,
    address: input.address?.trim() || undefined,
    addressReference: input.addressReference?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    paymentId: input.paymentId.trim(),
    paymentReference: input.paymentReference?.trim() || undefined,
    mockPaymentToken: input.mockPaymentToken?.trim() || undefined,
    idempotencyKey: input.idempotencyKey?.trim() || undefined,
    originalTotal,
    total,
    discountAmount: Math.round(
      input.discountAmount ?? Math.max(0, originalTotal - total),
    ),
  } as BookingPrimitives;
}
