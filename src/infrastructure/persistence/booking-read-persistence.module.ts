import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  bookingReadDatabaseOptions,
  bookingReadQueryDatabaseOptions,
} from './typeorm.config';
import { BOOKING_READ_REPOSITORY } from '../../application/ports/booking-read.repository';
import {
  BookingReadRepository,
  DisabledBookingReadRepository,
} from './repositories/booking-read.repository';
import { BOOKING_CONTEXT_CATALOG } from '../../application/ports/booking-context.port';
import { BookingContextConsumerService } from '../messaging/booking-context-consumer.service';
import {
  BookingContextRepository,
  DisabledBookingContextRepository,
  LOCAL_BOOKING_CONTEXT,
} from './repositories/booking-context.repository';

@Module({})
export class BookingReadPersistenceModule {
  static register(): DynamicModule {
    const readEnabled = readModelEnabled();
    const contextEnabled = contextProjectionEnabled();
    const databaseEnabled = readEnabled || contextEnabled;
    return {
      module: BookingReadPersistenceModule,
      imports: databaseEnabled
        ? [
            TypeOrmModule.forRootAsync({
              name: 'bookingRead',
              useFactory: bookingReadDatabaseOptions,
            }),
            TypeOrmModule.forRootAsync({
              name: 'bookingReadQuery',
              useFactory: bookingReadQueryDatabaseOptions,
            }),
          ]
        : [],
      providers: [
        {
          provide: BOOKING_READ_REPOSITORY,
          useClass: readEnabled
            ? BookingReadRepository
            : DisabledBookingReadRepository,
        },
        ...(contextEnabled
          ? [
              BookingContextRepository,
              BookingContextConsumerService,
              {
                provide: LOCAL_BOOKING_CONTEXT,
                useExisting: BookingContextRepository,
              },
            ]
          : [
              DisabledBookingContextRepository,
              {
                provide: LOCAL_BOOKING_CONTEXT,
                useExisting: DisabledBookingContextRepository,
              },
            ]),
        {
          provide: BOOKING_CONTEXT_CATALOG,
          useExisting: LOCAL_BOOKING_CONTEXT,
        },
      ],
      exports: [
        BOOKING_READ_REPOSITORY,
        LOCAL_BOOKING_CONTEXT,
        BOOKING_CONTEXT_CATALOG,
      ],
    };
  }
}

export function readModelEnabled() {
  return ['true', '1', 'yes'].includes(
    (process.env.BOOKING_READ_MODEL_ENABLED ?? '').toLowerCase(),
  );
}

export function contextProjectionEnabled() {
  return ['true', '1', 'yes'].includes(
    (process.env.BOOKING_CONTEXT_PROJECTION_ENABLED ?? '').toLowerCase(),
  );
}
