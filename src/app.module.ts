import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BookingSagaConsumer } from './application/booking-saga.consumer';
import { BookingsApplicationService } from './application/bookings.application.service';
import { PendingBookingExpirationScheduler } from './application/pending-booking-expiration.scheduler';
import { BOOKING_CONTEXT } from './application/ports/booking-context.port';
import { BOOKING_REPOSITORY } from './application/ports/booking.repository';
import { MESSAGE_BUS } from './application/ports/message-bus.port';
import { PAYMENT_SERVICE } from './application/ports/payment-service.port';
import { BookingOrmEntity } from './infrastructure/persistence/entities/booking.orm-entity';
import { PetcareBackendContextClient } from './infrastructure/integrations/petcare-backend-context.client';
import { PetcarePaymentClient } from './infrastructure/integrations/petcare-payment.client';
import { BookingRepository } from './infrastructure/persistence/repositories/booking.repository';
import { RabbitMqMessageBus } from './infrastructure/messaging/rabbitmq-message-bus.service';
import { bookingDatabaseOptions } from './infrastructure/persistence/typeorm.config';
import { BookingController } from './presentation/http/booking.controller';
import { DomainErrorFilter } from './presentation/http/filters/domain-error.filter';
import { JwtAuthGuard } from './presentation/http/auth/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => bookingDatabaseOptions(),
    }),
    TypeOrmModule.forFeature([BookingOrmEntity]),
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: {
        expiresIn: Number(process.env.AUTH_JWT_EXPIRES_IN_SECONDS ?? 3600),
      },
    }),
  ],
  controllers: [AppController, BookingController],
  providers: [
    AppService,
    BookingRepository,
    {
      provide: BOOKING_REPOSITORY,
      useExisting: BookingRepository,
    },
    PetcareBackendContextClient,
    {
      provide: BOOKING_CONTEXT,
      useExisting: PetcareBackendContextClient,
    },
    PetcarePaymentClient,
    {
      provide: PAYMENT_SERVICE,
      useExisting: PetcarePaymentClient,
    },
    BookingsApplicationService,
    PendingBookingExpirationScheduler,
    BookingSagaConsumer,
    RabbitMqMessageBus,
    {
      provide: MESSAGE_BUS,
      useExisting: RabbitMqMessageBus,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: DomainErrorFilter,
    },
  ],
})
export class AppModule {}

function jwtSecret() {
  const configured = process.env.AUTH_JWT_SECRET?.trim();
  if (configured) {
    if (configured.length < 32) {
      throw new Error('AUTH_JWT_SECRET debe tener al menos 32 caracteres');
    }
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta AUTH_JWT_SECRET');
  }
  return 'petcare-local-development-secret-change-me';
}
