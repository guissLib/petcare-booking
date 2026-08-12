import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddBookingCqrsWriteSide1771000000001 implements MigrationInterface {
  name = 'AddBookingCqrsWriteSide1771000000001';

  async up(queryRunner: QueryRunner) {
    if (await queryRunner.hasTable('bookings')) {
      const bookings = await queryRunner.getTable('bookings');
      if (!bookings?.findColumnByName('aggregate_version')) {
        await queryRunner.addColumn(
          'bookings',
          new TableColumn({
            name: 'aggregate_version',
            type: 'int',
            unsigned: true,
            default: 1,
          }),
        );
      }
    }

    const outboxExists = await queryRunner.hasTable('booking_event_outbox');
    if (!outboxExists) {
      await queryRunner.createTable(
        new Table({
          name: 'booking_event_outbox',
          columns: [
            { name: 'id', type: 'varchar', length: '64', isPrimary: true },
            { name: 'source_service', type: 'varchar', length: '64' },
            { name: 'aggregate_type', type: 'varchar', length: '64' },
            { name: 'aggregate_id', type: 'varchar', length: '64' },
            { name: 'aggregate_version', type: 'int', unsigned: true },
            { name: 'event_type', type: 'varchar', length: '64' },
            {
              name: 'schema_version',
              type: 'int',
              unsigned: true,
              default: 1,
            },
            {
              name: 'correlation_id',
              type: 'varchar',
              length: '64',
              isNullable: true,
            },
            {
              name: 'causation_id',
              type: 'varchar',
              length: '64',
              isNullable: true,
            },
            { name: 'payload', type: 'json' },
            {
              name: 'status',
              type: 'varchar',
              length: '16',
              default: "'pending'",
            },
            { name: 'attempts', type: 'int', unsigned: true, default: 0 },
            {
              name: 'next_attempt_at',
              type: 'datetime',
              precision: 3,
              default: 'CURRENT_TIMESTAMP(3)',
            },
            {
              name: 'published_at',
              type: 'datetime',
              precision: 3,
              isNullable: true,
            },
            {
              name: 'last_error',
              type: 'varchar',
              length: '1000',
              isNullable: true,
            },
            {
              name: 'created_at',
              type: 'datetime',
              precision: 3,
              default: 'CURRENT_TIMESTAMP(3)',
            },
          ],
        }),
        true,
      );
      await queryRunner.query(`
        ALTER TABLE booking_event_outbox
        ADD CONSTRAINT CHK_booking_event_outbox_status
        CHECK (status IN ('pending', 'published', 'failed'))
      `);
    }

    await createIndexIfMissing(
      queryRunner,
      'booking_event_outbox',
      new TableIndex({
        name: 'IDX_booking_event_outbox_pending',
        columnNames: ['status', 'next_attempt_at'],
      }),
    );
    await createIndexIfMissing(
      queryRunner,
      'booking_event_outbox',
      new TableIndex({
        name: 'UQ_booking_event_outbox_aggregate_version',
        columnNames: [
          'source_service',
          'aggregate_type',
          'aggregate_id',
          'aggregate_version',
        ],
        isUnique: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner) {
    if (await queryRunner.hasTable('booking_event_outbox')) {
      await queryRunner.dropTable('booking_event_outbox', true);
    }
    if (await queryRunner.hasTable('bookings')) {
      const bookings = await queryRunner.getTable('bookings');
      if (bookings?.findColumnByName('aggregate_version')) {
        await queryRunner.dropColumn('bookings', 'aggregate_version');
      }
    }
  }
}

async function createIndexIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  index: TableIndex,
) {
  const table = await queryRunner.getTable(tableName);
  if (!table?.indices.some((candidate) => candidate.name === index.name)) {
    await queryRunner.createIndex(tableName, index);
  }
}
