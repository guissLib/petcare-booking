import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Booking,
  type BookingStatus,
  type PaymentMethod,
  type ServiceType,
  type VisitMode,
} from '../domain/booking.entity';
import { BusinessRuleError } from '../domain/business-rule.error';
import {
  BOOKING_CONTEXT,
  type BookingContext,
  type BookingContextPromotion,
  type BookingContextPort,
} from './ports/booking-context.port';
import {
  PAYMENT_SERVICE,
  type PaymentCardInput,
  type PaymentServicePort,
} from './ports/payment-service.port';
import type { SagaMessage } from './contracts/saga-message.contract';
import {
  BOOKING_REPOSITORY,
  type BookingRepositoryPort,
} from './ports/booking.repository';

export interface BookingActor {
  id: string;
  role: 'pet-owner' | 'provider' | 'administrator';
  providerId?: string;
}

export interface QuoteInput {
  petId: string;
  serviceType: ServiceType;
  visitMode: VisitMode;
  scheduledAt: string;
  providerId: string;
  promotionId?: string;
}

export interface CreateBookingInput extends QuoteInput {
  address?: string;
  latitude?: number;
  longitude?: number;
  addressReference?: string;
  notes?: string;
  paymentMethod: PaymentMethod;
  idempotencyKey?: string;
}

@Injectable()
export class BookingsApplicationService {
  constructor(
    @Inject(BOOKING_REPOSITORY)
    private readonly bookings: BookingRepositoryPort,
    @Inject(BOOKING_CONTEXT)
    private readonly context: BookingContextPort,
    @Inject(PAYMENT_SERVICE)
    private readonly payments: PaymentServicePort,
  ) {}

  async quote(userId: string, input: QuoteInput, enforceVaccination = false) {
    const resolved = await this.resolveContext(
      userId,
      input,
      enforceVaccination,
    );
    const originalTotal = priceFor(resolved.serviceType);
    const promotion = applicablePromotion(resolved);
    const discount =
      promotion?.discountType === 'percent'
        ? Math.min(
            originalTotal,
            Math.round((originalTotal * promotion.discountValue) / 100),
          )
        : Math.min(originalTotal, Math.round(promotion?.discountValue ?? 0));
    const total = originalTotal - discount;
    if (total <= 0) {
      throw new BusinessRuleError(
        'La promoción no puede dejar el total de la reserva en cero',
      );
    }
    const vaccinationRequired = requiresVaccination(resolved.serviceType);
    const vaccinationValid = hasCurrentVaccination(resolved.context.pet);
    return {
      serviceType: resolved.serviceType,
      visitMode: resolved.visitMode,
      originalTotal,
      discountAmount: discount,
      total,
      currency: 'COP' as const,
      promotion: promotion
        ? {
            ...promotion,
          }
        : undefined,
      promotionId: promotion?.id,
      vaccinationRequired,
      vaccinationValid,
      vaccinationMessage:
        vaccinationRequired && !vaccinationValid
          ? 'Para este servicio es obligatorio adjuntar el carnet de vacunación.'
          : undefined,
    };
  }

  async create(userId: string, input: CreateBookingInput) {
    required(userId, 'userId');
    required(input.petId, 'petId');
    required(input.providerId, 'providerId');
    required(input.paymentMethod, 'paymentMethod');
    if (!['online', 'at-location'].includes(input.paymentMethod)) {
      throw new BusinessRuleError('paymentMethod no es válido');
    }

    if (input.idempotencyKey) {
      const existing = await this.bookings.findByIdempotencyKey(
        userId,
        input.idempotencyKey,
      );
      if (existing) {
        return this.toResponse(existing);
      }
    }

    const quote = await this.quote(userId, input, true);
    const bookingId = `booking_${randomUUID()}`;
    const payment = await this.payments.createIntent({
      bookingId,
      userId,
      amount: quote.total,
      method: input.paymentMethod,
    });
    const booking = Booking.create({
      id: bookingId,
      userId,
      petId: input.petId,
      providerId: input.providerId,
      serviceType: quote.serviceType,
      visitMode: quote.visitMode,
      scheduledAt: input.scheduledAt,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      addressReference: input.addressReference,
      notes: input.notes,
      total: quote.total,
      originalTotal: quote.originalTotal,
      discountAmount: quote.discountAmount,
      paymentMethod: input.paymentMethod,
      paymentId: payment.id,
      paymentStatus: payment.status,
      paymentReference: payment.reference,
      paymentExpiresAt:
        input.paymentMethod === 'online'
          ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
          : undefined,
      idempotencyKey: input.idempotencyKey,
      promotionId: quote.promotionId,
      createdAt: new Date().toISOString(),
    });
    try {
      await this.bookings.save(booking);
    } catch (error) {
      await this.payments.cancelPending(payment.id).catch(() => undefined);
      throw error;
    }
    if (input.paymentMethod === 'at-location') {
      await this.payments.confirmAtLocation({
        bookingId: booking.id,
        userId,
        providerId: booking.providerId,
        paymentId: payment.id,
        amount: booking.toPrimitives().total,
      });
    }
    return this.toResponse(booking);
  }

  async list(actor: BookingActor, status?: BookingStatus) {
    if (actor.role === 'provider' && !actor.providerId) {
      throw new BusinessRuleError(
        'El token del proveedor no contiene providerId',
      );
    }
    const filters =
      actor.role === 'provider'
        ? { providerId: actor.providerId, status }
        : actor.role === 'administrator'
          ? { status }
          : { userId: actor.id, status };
    const bookings = await this.bookings.findAll(filters);
    return bookings
      .filter(
        (booking) =>
          actor.role !== 'provider' ||
          !['pending', 'pending-confirmation'].includes(booking.status),
      )
      .map((booking) => this.toResponse(booking));
  }

  async get(id: string, actor?: BookingActor) {
    const booking = await this.find(id);
    this.assertAccess(booking, actor);
    return this.toResponse(booking);
  }

  async updateStatus(
    id: string,
    status: BookingStatus,
    actor: BookingActor,
    reason?: string,
  ) {
    const booking = await this.find(id);
    this.assertAccess(booking, actor);
    booking.changeStatus(status, reason);
    await this.bookings.save(booking);
    return this.toResponse(booking);
  }

  async reminder(id: string, actor: BookingActor) {
    const booking = await this.find(id);
    this.assertAccess(booking, actor);
    if (!['confirmed', 'in-progress'].includes(booking.status)) {
      throw new BusinessRuleError(
        'Solo se pueden programar recordatorios para reservas confirmadas',
      );
    }
    return {
      bookingId: booking.id,
      scheduled: true,
      message: 'Recordatorio programado correctamente',
    };
  }

  async pay(id: string, card: PaymentCardInput, actor: BookingActor) {
    const booking = await this.find(id);
    this.assertAccess(booking, actor);
    const data = booking.toPrimitives();
    if (data.paymentMethod !== 'online') {
      throw new BusinessRuleError(
        'Las reservas at-location no requieren checkout online',
      );
    }
    if (!['pending', 'pending-confirmation'].includes(data.status)) {
      throw new BusinessRuleError(
        'La reserva no está disponible para procesar el pago',
      );
    }
    const payment = await this.payments.charge({
      bookingId: booking.id,
      userId: booking.userId,
      providerId: booking.providerId,
      paymentId: data.paymentId,
      amount: data.total,
      card,
    });
    if (payment.status === 'paid') {
      booking.markPaymentProcessing(payment.reference);
      await this.bookings.save(booking);
      await this.payments.publishConfirmed({
        bookingId: booking.id,
        userId: booking.userId,
        providerId: booking.providerId,
        paymentId: data.paymentId,
        amount: data.total,
      });
    }
    return {
      booking: this.toResponse(booking),
      payment,
      confirmationStatus:
        payment.status === 'paid' ? 'pending-confirmation' : 'failed',
    };
  }

  async confirmFromPaymentCommand(message: SagaMessage) {
    const paymentId = requiredMessageText(message.paymentId, 'paymentId');
    const bookingId = requiredMessageText(message.bookingId, 'bookingId');
    const amount = requiredMessageNumber(message.amount, 'amount');
    const booking = await this.find(bookingId);
    if (booking.toPrimitives().paymentStatus !== 'paid') {
      throw new BusinessRuleError(
        'La reserva no tiene registrado un pago aprobado',
      );
    }
    booking.confirmFromPayment(paymentId, amount);
    await this.bookings.save(booking);
    return this.toResponse(booking);
  }

  async cancelFromSaga(bookingId: string, reason?: string) {
    const booking = await this.find(bookingId);
    booking.cancel(reason);
    await this.bookings.save(booking);
    return this.toResponse(booking);
  }

  async availability(providerId: string, date: string, capacity: number) {
    const bookings = await this.bookings.findForAvailability(providerId, date);
    const booked = bookings.length;
    const available = booked < capacity;
    return {
      providerId,
      date,
      available,
      capacity,
      booked,
      slots: available
        ? [{ start: '08:00', end: '18:00', remaining: capacity - booked }]
        : [],
    };
  }

  async expirePendingPayments() {
    return this.bookings.expirePending();
  }

  private async resolveContext(
    userId: string,
    input: QuoteInput,
    enforceVaccination: boolean,
  ) {
    validateQuoteInput(input);
    const context = await this.context.get(userId, input);
    if (context.user.id !== userId) {
      throw new BusinessRuleError('El contexto de usuario no coincide');
    }
    if (context.pet.ownerId !== userId) {
      throw new BusinessRuleError('La mascota no pertenece al usuario');
    }
    if (context.provider.id !== input.providerId) {
      throw new BusinessRuleError('El proveedor no coincide');
    }
    if (!context.provider.services.includes(input.serviceType)) {
      throw new BusinessRuleError('El proveedor no ofrece ese servicio');
    }
    if (
      input.visitMode === 'home-visit' &&
      !context.provider.acceptsHomeVisits
    ) {
      throw new BusinessRuleError('El proveedor no ofrece visitas a domicilio');
    }
    const scheduledDate = new Date(input.scheduledAt);
    const dayOfWeek = scheduledDate.getUTCDay() || 7;
    if (
      !context.provider.schedule.some(
        (schedule) => schedule.dayOfWeek === dayOfWeek,
      )
    ) {
      throw new BusinessRuleError(
        'No hay disponibilidad del proveedor para la fecha seleccionada',
      );
    }
    const existing = await this.bookings.findForAvailability(
      input.providerId,
      input.scheduledAt.slice(0, 10),
    );
    if (existing.length >= context.provider.capacity) {
      throw new BusinessRuleError(
        'No hay disponibilidad para la fecha seleccionada',
      );
    }
    if (
      enforceVaccination &&
      requiresVaccination(input.serviceType) &&
      !hasCurrentVaccination(context.pet)
    ) {
      throw new BusinessRuleError(
        'Para este servicio es obligatorio adjuntar el carnet de vacunación.',
      );
    }
    return {
      context,
      serviceType: input.serviceType,
      visitMode: input.visitMode,
      scheduledAt: input.scheduledAt,
    };
  }

  private async find(id: string) {
    const booking = await this.bookings.findById(id);
    if (!booking) {
      throw new NotFoundException('Reserva no encontrada');
    }
    return booking;
  }

  private assertAccess(booking: Booking, actor?: BookingActor) {
    if (!actor || actor.role === 'administrator') {
      return;
    }
    if (actor.role === 'provider' && booking.providerId === actor.providerId) {
      if (['pending', 'pending-confirmation'].includes(booking.status)) {
        throw new BusinessRuleError(
          'La reserva aún no está disponible para el proveedor',
        );
      }
      return;
    }
    if (actor.role === 'pet-owner' && booking.userId === actor.id) {
      return;
    }
    throw new BusinessRuleError('No tiene acceso a esta reserva');
  }

  private toResponse(booking: Booking) {
    const primitives = booking.toPrimitives();
    return {
      ...primitives,
      scheduledAt: primitives.scheduledAt,
      payment: {
        id: primitives.paymentId,
        method: primitives.paymentMethod,
        amount: primitives.total,
        currency: primitives.currency,
        status: primitives.paymentStatus,
        provider: 'mock' as const,
        reference:
          primitives.paymentReference ??
          `PENDING-${primitives.paymentId.slice(0, 12)}`,
        createdAt: primitives.createdAt,
      },
    };
  }
}

function priceFor(serviceType: ServiceType) {
  return (
    {
      grooming: 50000,
      walking: 30000,
      boarding: 60000,
      veterinary: 70000,
      'home-visit': 60000,
      cleaning: 45000,
    } satisfies Record<ServiceType, number>
  )[serviceType];
}

function requiresVaccination(serviceType: ServiceType) {
  return ['boarding', 'cleaning', 'grooming'].includes(serviceType);
}

function validateQuoteInput(input: QuoteInput) {
  if (
    ![
      'grooming',
      'walking',
      'boarding',
      'veterinary',
      'home-visit',
      'cleaning',
    ].includes(input.serviceType)
  ) {
    throw new BusinessRuleError('serviceType no es válido');
  }
  if (
    !['pickup-dropoff', 'home-visit', 'at-location'].includes(input.visitMode)
  ) {
    throw new BusinessRuleError('visitMode no es válido');
  }
  if (!input.providerId?.trim()) {
    throw new BusinessRuleError('providerId es requerido');
  }
  if (
    !input.scheduledAt ||
    Number.isNaN(new Date(input.scheduledAt).getTime())
  ) {
    throw new BusinessRuleError('scheduledAt debe ser una fecha válida');
  }
}

function applicablePromotion(resolved: {
  context: BookingContext;
  serviceType: ServiceType;
  scheduledAt: string;
}) {
  const candidates = resolved.context.promotions.filter((promotion) => {
    const date = new Date(resolved.scheduledAt);
    const cityMatches =
      promotion.scope === 'national' ||
      (!!promotion.city &&
        !!resolved.context.user.city &&
        promotion.city.toLowerCase() ===
          resolved.context.user.city.toLowerCase());
    const providerMatches =
      !promotion.providerId ||
      promotion.providerId === resolved.context.provider.id;
    const serviceMatches =
      !promotion.serviceTypes?.length ||
      promotion.serviceTypes.includes(resolved.serviceType);
    return (
      promotion.active &&
      cityMatches &&
      providerMatches &&
      serviceMatches &&
      date >= new Date(promotion.startsAt) &&
      date <= new Date(promotion.endsAt)
    );
  });
  return candidates.sort(
    (left, right) => promotionSpecificity(right) - promotionSpecificity(left),
  )[0];
}

function promotionSpecificity(promotion: BookingContextPromotion) {
  return (promotion.providerId ? 2 : 0) + (promotion.scope === 'local' ? 1 : 0);
}

function hasCurrentVaccination(pet: {
  vaccinationRecords: {
    administeredAt: string;
    expiresAt?: string;
    documentMimeType?: string;
  }[];
}) {
  const now = new Date();
  return pet.vaccinationRecords.some((record) => {
    const administeredAt = new Date(record.administeredAt);
    const expiresAt = record.expiresAt ? new Date(record.expiresAt) : undefined;
    return (
      record.documentMimeType === 'application/pdf' &&
      !Number.isNaN(administeredAt.getTime()) &&
      administeredAt <= now &&
      (!expiresAt || (!Number.isNaN(expiresAt.getTime()) && expiresAt >= now))
    );
  });
}

function required(value: string | undefined, field: string): asserts value {
  if (!value?.trim()) {
    throw new BusinessRuleError(`${field} es requerido`);
  }
}

function requiredMessageText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BusinessRuleError(`El mensaje no contiene ${field}`);
  }
  return value.trim();
}

function requiredMessageNumber(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BusinessRuleError(`El mensaje no contiene ${field}`);
  }
  return value;
}
