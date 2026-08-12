import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { BookingOrmEntity } from './entities/booking.orm-entity';

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
    entities: [BookingOrmEntity],
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
