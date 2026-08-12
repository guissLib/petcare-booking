import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BookingSagaConsumer } from './application/booking-saga.consumer';
import { bookingCommandHandlers } from './application/commands/booking.command.handlers';
import { bookingQueryHandlers } from './application/queries/booking.query.handlers';
import { BOOKING_EVENT_BUS } from './application/ports/booking-event-bus.port';
import { BookingsApplicationService } from './application/bookings.application.service';
import { PendingBookingExpirationScheduler } from './application/pending-booking-expiration.scheduler';
import { BOOKING_CONTEXT } from './application/ports/booking-context.port';
import { BOOKING_REPOSITORY } from './application/ports/booking.repository';
import { MESSAGE_BUS } from './application/ports/message-bus.port';
import { BookingOrmEntity } from './infrastructure/persistence/entities/booking.orm-entity';
import { BookingEventOutboxOrmEntity } from './infrastructure/persistence/entities/booking-event-outbox.orm-entity';
import { BookingRepository } from './infrastructure/persistence/repositories/booking.repository';
import { RabbitMqMessageBus } from './infrastructure/messaging/rabbitmq-message-bus.service';
import { BookingEventOutboxPublisherService } from './infrastructure/messaging/booking-event-outbox-publisher.service';
import { bookingDatabaseOptions } from './infrastructure/persistence/typeorm.config';
import {
  BookingReadPersistenceModule,
  readModelEnabled,
} from './infrastructure/persistence/booking-read-persistence.module';
import { BookingReadProjectorService } from './infrastructure/persistence/projectors/booking-read-projector.service';
import { BookingController } from './presentation/http/booking.controller';
import { DomainErrorFilter } from './presentation/http/filters/domain-error.filter';
import { JwtAuthGuard } from './presentation/http/auth/jwt-auth.guard';
import { BookingContextController } from './presentation/http/booking-context.controller';
import { LOCAL_BOOKING_CONTEXT } from './infrastructure/persistence/repositories/booking-context.repository';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => bookingDatabaseOptions(),
    }),
    TypeOrmModule.forFeature([BookingOrmEntity, BookingEventOutboxOrmEntity]),
    CqrsModule,
    BookingReadPersistenceModule.register(),
  ],
  controllers: [AppController, BookingController, BookingContextController],
  providers: [
    AppService,
    BookingRepository,
    {
      provide: BOOKING_REPOSITORY,
      useExisting: BookingRepository,
    },
    {
      provide: BOOKING_CONTEXT,
      useExisting: LOCAL_BOOKING_CONTEXT,
    },
    BookingsApplicationService,
    PendingBookingExpirationScheduler,
    BookingSagaConsumer,
    RabbitMqMessageBus,
    BookingEventOutboxPublisherService,
    ...(readModelEnabled() ? [BookingReadProjectorService] : []),
    ...bookingCommandHandlers,
    ...bookingQueryHandlers,
    {
      provide: BOOKING_EVENT_BUS,
      useExisting: RabbitMqMessageBus,
    },
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
