import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createBookingEvent } from '../../application/contracts/booking-event.contract';
import { Booking } from '../../domain/booking.entity';
import { BookingOrmEntity } from './entities/booking.orm-entity';
import { BookingReadDocumentOrmEntity } from './entities/booking-read-document.orm-entity';
import { BookingProjectionWatermarkOrmEntity } from './entities/booking-projection-watermark.orm-entity';
import { BookingReadDataSource } from './read-data-source';
import { AppDataSource } from './data-source';

async function backfill() {
  const watermark = new Date();
  await AppDataSource.initialize();
  await BookingReadDataSource.initialize();
  try {
    const writeRepository = AppDataSource.getRepository(BookingOrmEntity);
    const readRepository = BookingReadDataSource.getRepository(
      BookingReadDocumentOrmEntity,
    );
    const watermarkRepository = BookingReadDataSource.getRepository(
      BookingProjectionWatermarkOrmEntity,
    );
    const records = await writeRepository.find();
    for (const record of records) {
      const booking = Booking.rehydrate(record.toDomain());
      const event = createBookingEvent(booking, 'booking.snapshot');
      const existing = await readRepository.findOne({
        where: {
          viewType: 'booking_overview',
          documentId: booking.id,
        },
      });
      if (
        !existing ||
        existing.sourceAggregateVersion < event.aggregateVersion
      ) {
        await readRepository.save({
          viewType: 'booking_overview',
          documentId: booking.id,
          payload: event.data,
          schemaVersion: event.schemaVersion,
          sourceService: event.sourceService,
          sourceAggregateVersion: event.aggregateVersion,
          lastEventId: backfillEventId(watermark, booking.id),
          sourceOccurredAt: record.updatedAt ?? record.createdAt,
          projectedAt: new Date(),
          deletedAt: null,
        });
      }
    }
    await watermarkRepository.save({
      projectionName: 'booking_overview',
      watermarkAt: watermark,
    });
    process.stdout.write(
      `Booking read model backfill complete: documents=${records.length} watermark=${watermark.toISOString()}\n`,
    );
  } finally {
    await BookingReadDataSource.destroy();
    await AppDataSource.destroy();
  }
}

void backfill().catch((error: unknown) => {
  process.stderr.write(
    `Booking read model backfill failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});

function backfillEventId(watermark: Date, bookingId: string) {
  const digest = createHash('sha256')
    .update(`${watermark.toISOString()}:${bookingId}`)
    .digest('hex');
  return `backfill-${digest.slice(0, 55)}`;
}
