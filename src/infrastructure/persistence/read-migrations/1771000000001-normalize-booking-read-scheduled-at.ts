import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeBookingReadScheduledAt1771000000001 implements MigrationInterface {
  name = 'NormalizeBookingReadScheduledAt1771000000001';

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`
      ALTER TABLE booking_read_documents
      MODIFY COLUMN scheduled_at DATETIME(3)
        GENERATED ALWAYS AS (
          CAST(
            REPLACE(
              REPLACE(
                JSON_UNQUOTE(JSON_EXTRACT(payload, '$.scheduledAt')),
                'T',
                ' '
              ),
              'Z',
              ''
            )
            AS DATETIME(3)
          )
        ) STORED
    `);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`
      ALTER TABLE booking_read_documents
      MODIFY COLUMN scheduled_at DATETIME(3)
        GENERATED ALWAYS AS (
          CAST(
            JSON_UNQUOTE(JSON_EXTRACT(payload, '$.scheduledAt'))
            AS DATETIME(3)
          )
        ) STORED
    `);
  }
}
