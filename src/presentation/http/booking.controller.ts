import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  type BookingActor,
  type CreateBookingInput,
  type QuoteInput,
} from '../../application/bookings.application.service';
import type {
  BookingAvailabilityResponse,
  BookingPaymentResponse,
  BookingQuoteResponse,
  BookingResponse,
} from '../../application/contracts/booking-response';
import {
  CreateBookingCommand,
  PayBookingCommand,
  ScheduleBookingReminderCommand,
  UpdateBookingStatusCommand,
} from '../../application/commands/booking.commands';
import {
  CheckAvailabilityQuery,
  GetBookingQuery,
  ListBookingsQuery,
  QuoteBookingQuery,
} from '../../application/queries/booking.queries';
import type { BookingStatus } from '../../domain/booking.entity';
import {
  actorFromRequest,
  type AuthenticatedRequest,
} from './auth/jwt-auth.guard';
import { Public } from './auth/public.decorator';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller()
export class BookingController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post('users/:userId/bookings/quote')
  @ApiOperation({ summary: 'Calcula el importe de una reserva' })
  @ApiParam({ name: 'userId', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'petId',
        'providerId',
        'serviceType',
        'visitMode',
        'scheduledAt',
      ],
    },
  })
  quote(
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertUserPath(userId, actorFromRequest(request));
    return this.queries.execute<BookingQuoteResponse>(
      new QuoteBookingQuery(userId, asQuoteInput(body)),
    );
  }

  @Post('users/:userId/bookings')
  @ApiOperation({ summary: 'Crea una reserva en el contexto Booking' })
  @ApiParam({ name: 'userId', required: true })
  async create(
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertUserPath(userId, actorFromRequest(request));
    return this.commands.execute<BookingResponse>(
      new CreateBookingCommand(userId, asCreateInput(body)),
    );
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Lista las reservas del usuario o proveedor' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 50, maximum: 100 })
  async list(
    @Query('status') status: BookingStatus | undefined,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.queries.execute<BookingResponse[]>(
      new ListBookingsQuery(
        actorFromRequest(request),
        status,
        paginationFromQuery(page, pageSize),
      ),
    );
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'Obtiene una reserva' })
  async get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.queries.execute<BookingResponse>(
      new GetBookingQuery(id, actorFromRequest(request)),
    );
  }

  @Patch('bookings/:id/status')
  @ApiOperation({ summary: 'Actualiza el estado operativo de una reserva' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status?: BookingStatus; reason?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    if (!body.status) {
      throw new ForbiddenException('status es requerido');
    }
    return this.commands.execute<BookingResponse>(
      new UpdateBookingStatusCommand(
        id,
        body.status,
        actorFromRequest(request),
        body.reason,
      ),
    );
  }

  @Post('bookings/:id/reminder')
  @HttpCode(200)
  @ApiOperation({ summary: 'Programa un recordatorio de reserva' })
  async reminder(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commands.execute<{
      bookingId: string;
      scheduled: boolean;
      message: string;
    }>(new ScheduleBookingReminderCommand(id, actorFromRequest(request)));
  }

  @Post('bookings/:id/payments/mock')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Procesa el checkout mock y publica payment.confirmed',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'cardholderName',
        'cardNumber',
        'expiryMonth',
        'expiryYear',
        'cvv',
      ],
    },
  })
  async pay(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commands.execute<BookingPaymentResponse>(
      new PayBookingCommand(
        id,
        asPaymentCardInput(body),
        actorFromRequest(request),
      ),
    );
  }

  @Get('internal/providers/:providerId/availability')
  @Public()
  @ApiOperation({ summary: 'Calcula disponibilidad para el backend' })
  async availability(
    @Param('providerId') providerId: string,
    @Query('date') date: string,
    @Query('capacity') capacity: string,
    @Headers('x-booking-internal-secret') secret: string | undefined,
  ) {
    this.assertInternal(secret);
    const parsedCapacity = Number(capacity);
    if (!date || !Number.isInteger(parsedCapacity) || parsedCapacity <= 0) {
      throw new ForbiddenException('date y capacity son requeridos');
    }
    return this.queries.execute<BookingAvailabilityResponse>(
      new CheckAvailabilityQuery(providerId, date, parsedCapacity),
    );
  }

  private assertInternal(secret: string | undefined) {
    const expected =
      process.env.BOOKING_INTERNAL_SECRET ??
      (process.env.NODE_ENV === 'production' ? '' : 'booking-local-internal');
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Credenciales internas inválidas');
    }
  }

  private assertUserPath(userId: string, actor: BookingActor) {
    if (actor.role === 'pet-owner' && actor.id !== userId) {
      throw new ForbiddenException('No puede operar reservas de otro usuario');
    }
  }
}

function asQuoteInput(body: Record<string, unknown>): QuoteInput {
  return {
    petId: requiredString(body.petId),
    serviceType: requiredString(body.serviceType) as QuoteInput['serviceType'],
    visitMode: requiredString(body.visitMode) as QuoteInput['visitMode'],
    scheduledAt: requiredString(body.scheduledAt),
    providerId: requiredString(body.providerId),
    promotionId: optionalString(body.promotionId),
  };
}

function asCreateInput(body: Record<string, unknown>): CreateBookingInput {
  return {
    ...asQuoteInput(body),
    petId: requiredString(body.petId),
    address: optionalString(body.address),
    latitude: optionalNumber(body.latitude),
    longitude: optionalNumber(body.longitude),
    addressReference: optionalString(body.addressReference),
    notes: optionalString(body.notes),
    paymentMethod: requiredString(
      body.paymentMethod,
    ) as CreateBookingInput['paymentMethod'],
    idempotencyKey: optionalString(body.idempotencyKey),
  };
}

function asPaymentCardInput(body: Record<string, unknown>) {
  return {
    cardholderName: requiredString(body.cardholderName),
    cardNumber: requiredString(body.cardNumber),
    expiryMonth: requiredNumber(body.expiryMonth),
    expiryYear: requiredNumber(body.expiryYear),
    cvv: requiredString(body.cvv),
  };
}

function requiredString(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ForbiddenException('Campo de texto requerido');
  }
  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ForbiddenException('Campo numérico requerido');
  }
  return value;
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function paginationFromQuery(
  page: string | undefined,
  pageSize: string | undefined,
) {
  const parsedPage = positiveInteger(page, 1);
  const parsedPageSize = Math.min(100, positiveInteger(pageSize, 50));
  return {
    page: parsedPage,
    pageSize: parsedPageSize,
  };
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
