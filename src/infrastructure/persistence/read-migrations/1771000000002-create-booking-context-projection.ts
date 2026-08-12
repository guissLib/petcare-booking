import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingContextProjection1771000000002 implements MigrationInterface {
  name = 'CreateBookingContextProjection1771000000002';

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS booking_context_snapshots (
        context_type VARCHAR(24) NOT NULL,
        aggregate_id VARCHAR(64) NOT NULL,
        owner_id VARCHAR(64) NULL,
        provider_id VARCHAR(64) NULL,
        city VARCHAR(128) NULL,
        active BOOLEAN NULL,
        payload JSON NOT NULL,
        schema_version INT UNSIGNED NOT NULL,
        source_service VARCHAR(64) NOT NULL,
        aggregate_version INT UNSIGNED NOT NULL,
        last_event_id VARCHAR(64) NOT NULL,
        source_occurred_at DATETIME(3) NOT NULL,
        projected_at DATETIME(3) NOT NULL,
        PRIMARY KEY (context_type, aggregate_id),
        KEY IDX_booking_context_owner (context_type, owner_id),
        KEY IDX_booking_context_catalog (context_type, active, city)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS booking_context_inbox (
        source_service VARCHAR(64) NOT NULL,
        event_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        aggregate_type VARCHAR(64) NOT NULL,
        aggregate_id VARCHAR(64) NOT NULL,
        aggregate_version INT UNSIGNED NOT NULL,
        processed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (source_service, event_id),
        KEY IDX_booking_context_inbox_aggregate
          (aggregate_type, aggregate_id, aggregate_version)
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query('DROP TABLE IF EXISTS booking_context_inbox');
    await queryRunner.query('DROP TABLE IF EXISTS booking_context_snapshots');
  }
}
