import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { BookingOrmEntity } from './entities/booking.orm-entity';
import { BookingEventOutboxOrmEntity } from './entities/booking-event-outbox.orm-entity';
import { BookingReadDocumentOrmEntity } from './entities/booking-read-document.orm-entity';
import { BookingProjectionInboxOrmEntity } from './entities/booking-projection-inbox.orm-entity';
import { BookingProjectionErrorOrmEntity } from './entities/booking-projection-error.orm-entity';
import { BookingProjectionWatermarkOrmEntity } from './entities/booking-projection-watermark.orm-entity';
import { BookingContextSnapshotOrmEntity } from './entities/booking-context-snapshot.orm-entity';
import { BookingContextInboxOrmEntity } from './entities/booking-context-inbox.orm-entity';

export function bookingDatabaseOptions(): DataSourceOptions {
  const ssl = process.env.BOOKING_MYSQL_SSL ?? process.env.MYSQL_SSL;
  const sslCa = process.env.BOOKING_MYSQL_SSL_CA ?? process.env.MYSQL_SSL_CA;
  const requireSsl = ['required', 'true', '1'].includes(
    (ssl ?? '').toLowerCase(),
  );

  return {
    type: 'mysql',
    host: required('BOOKING_MYSQL_HOST', 'MYSQL_HOST'),
    port: Number(
      process.env.BOOKING_MYSQL_PORT ?? process.env.MYSQL_PORT ?? 3306,
    ),
    username: required('BOOKING_MYSQL_USER', 'MYSQL_USER'),
    password: required('BOOKING_MYSQL_PASSWORD', 'MYSQL_PASSWORD'),
    database: required('BOOKING_MYSQL_DATABASE', 'MYSQL_DATABASE'),
    entities: [BookingOrmEntity, BookingEventOutboxOrmEntity],
    migrations: [resolve(__dirname, './migrations/*{.ts,.js}')],
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
    ...(requireSsl
      ? {
          ssl: {
            rejectUnauthorized: true,
            ...(sslCa ? { ca: readCertificate(sslCa) } : {}),
          },
        }
      : {}),
  };
}

export function bookingReadDatabaseOptions(): DataSourceOptions {
  const ssl = process.env.BOOKING_READ_MYSQL_SSL ?? process.env.MYSQL_SSL;
  const sslCa =
    process.env.BOOKING_READ_MYSQL_SSL_CA ??
    process.env.BOOKING_MYSQL_SSL_CA ??
    process.env.MYSQL_SSL_CA;
  const requireSsl = ['required', 'true', '1'].includes(
    (ssl ?? '').toLowerCase(),
  );
  const writeDatabase = required('BOOKING_MYSQL_DATABASE', 'MYSQL_DATABASE');

  return {
    type: 'mysql',
    host:
      process.env.BOOKING_READ_MYSQL_HOST?.trim() ||
      required('BOOKING_MYSQL_HOST', 'MYSQL_HOST'),
    port: Number(
      process.env.BOOKING_READ_MYSQL_PORT ??
        process.env.BOOKING_MYSQL_PORT ??
        process.env.MYSQL_PORT ??
        3306,
    ),
    username:
      process.env.BOOKING_READ_MYSQL_USER?.trim() ||
      required('BOOKING_MYSQL_USER', 'MYSQL_USER'),
    password:
      process.env.BOOKING_READ_MYSQL_PASSWORD?.trim() ||
      required('BOOKING_MYSQL_PASSWORD', 'MYSQL_PASSWORD'),
    database:
      process.env.BOOKING_READ_MYSQL_DATABASE?.trim() ||
      `${writeDatabase}_read`,
    entities: [
      BookingReadDocumentOrmEntity,
      BookingProjectionInboxOrmEntity,
      BookingProjectionErrorOrmEntity,
      BookingProjectionWatermarkOrmEntity,
      BookingContextSnapshotOrmEntity,
      BookingContextInboxOrmEntity,
    ],
    migrations: [resolve(__dirname, './read-migrations/*{.ts,.js}')],
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === 'true',
    ...(requireSsl
      ? {
          ssl: {
            rejectUnauthorized: true,
            ...(sslCa ? { ca: readCertificate(sslCa) } : {}),
          },
        }
      : {}),
  };
}

export function bookingReadQueryDatabaseOptions(): DataSourceOptions {
  const options = bookingReadDatabaseOptions();
  return {
    ...options,
    username:
      process.env.BOOKING_READ_QUERY_MYSQL_USER?.trim() ||
      process.env.BOOKING_READ_MYSQL_USER?.trim() ||
      required('BOOKING_MYSQL_USER', 'MYSQL_USER'),
    password:
      process.env.BOOKING_READ_QUERY_MYSQL_PASSWORD?.trim() ||
      process.env.BOOKING_READ_MYSQL_PASSWORD?.trim() ||
      required('BOOKING_MYSQL_PASSWORD', 'MYSQL_PASSWORD'),
  } as DataSourceOptions;
}

function required(primary: string, fallback: string) {
  const value = process.env[primary] ?? process.env[fallback];
  if (!value?.trim()) {
    throw new Error(
      `Missing required environment variable: ${primary} (or ${fallback})`,
    );
  }
  return value.trim();
}

function readCertificate(value: string) {
  const path = value.startsWith('/') ? value : resolve(process.cwd(), value);
  return readFileSync(path, 'utf8');
}
