import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class CreateBookingReadModel1771000000000 implements MigrationInterface {
  name = 'CreateBookingReadModel1771000000000';

  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS booking_read_documents (
        view_type VARCHAR(64) NOT NULL,
        document_id VARCHAR(64) NOT NULL,
        payload JSON NOT NULL,
        schema_version INT UNSIGNED NOT NULL DEFAULT 1,
        source_service VARCHAR(64) NOT NULL,
        source_aggregate_version INT UNSIGNED NOT NULL,
        last_event_id VARCHAR(64) NOT NULL,
        source_occurred_at DATETIME(3) NOT NULL,
        projected_at DATETIME(3) NOT NULL,
        deleted_at DATETIME(3) NULL,
        user_id VARCHAR(64)
          GENERATED ALWAYS AS (
            JSON_UNQUOTE(JSON_EXTRACT(payload, '$.userId'))
          ) STORED,
        provider_id VARCHAR(64)
          GENERATED ALWAYS AS (
            JSON_UNQUOTE(JSON_EXTRACT(payload, '$.providerId'))
          ) STORED,
        status VARCHAR(32)
          GENERATED ALWAYS AS (
            JSON_UNQUOTE(JSON_EXTRACT(payload, '$.status'))
          ) STORED,
        scheduled_at DATETIME(3)
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
          ) STORED,
        payment_status VARCHAR(20)
          GENERATED ALWAYS AS (
            JSON_UNQUOTE(JSON_EXTRACT(payload, '$.paymentStatus'))
          ) STORED,
        PRIMARY KEY (view_type, document_id)
      ) ENGINE=InnoDB
    `);

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

    await createIndexIfMissing(
      queryRunner,
      'booking_read_documents',
      new TableIndex({
        name: 'IDX_booking_read_user_scheduled',
        columnNames: ['view_type', 'user_id', 'scheduled_at'],
      }),
    );
    await createIndexIfMissing(
      queryRunner,
      'booking_read_documents',
      new TableIndex({
        name: 'IDX_booking_read_provider_scheduled',
        columnNames: ['view_type', 'provider_id', 'scheduled_at'],
      }),
    );
    await createIndexIfMissing(
      queryRunner,
      'booking_read_documents',
      new TableIndex({
        name: 'IDX_booking_read_status_scheduled',
        columnNames: ['view_type', 'status', 'scheduled_at'],
      }),
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS booking_projection_inbox (
        source_service VARCHAR(64) NOT NULL,
        event_id VARCHAR(64) NOT NULL,
        aggregate_type VARCHAR(64) NOT NULL,
        aggregate_id VARCHAR(64) NOT NULL,
        aggregate_version INT UNSIGNED NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        processed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (source_service, event_id),
        UNIQUE KEY UQ_booking_projection_inbox_version
          (source_service, aggregate_type, aggregate_id, aggregate_version)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS booking_projection_errors (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        source_service VARCHAR(64) NOT NULL,
        event_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        aggregate_id VARCHAR(64) NOT NULL,
        attempts INT UNSIGNED NOT NULL DEFAULT 1,
        error_message VARCHAR(1000) NOT NULL,
        payload JSON NOT NULL,
        resolved_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY IDX_booking_projection_errors_pending (resolved_at, created_at)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS booking_projection_watermarks (
        projection_name VARCHAR(64) NOT NULL,
        watermark_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
          ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (projection_name)
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query('DROP TABLE IF EXISTS booking_projection_errors');
    await queryRunner.query(
      'DROP TABLE IF EXISTS booking_projection_watermarks',
    );
    await queryRunner.query('DROP TABLE IF EXISTS booking_projection_inbox');
    await queryRunner.query('DROP TABLE IF EXISTS booking_read_documents');
  }
}

async function createIndexIfMissing(
  queryRunner: QueryRunner,
  tableName: string,
  index: TableIndex,
) {
  const rows: unknown = await queryRunner.query(
    `
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [tableName, index.name],
  );
  if (Array.isArray(rows) && rows.length === 0) {
    const columns = index.columnNames
      .map((column) => `\`${column}\``)
      .join(', ');
    const unique = index.isUnique ? 'UNIQUE ' : '';
    await queryRunner.query(
      `CREATE ${unique}INDEX \`${index.name}\` ON \`${tableName}\` (${columns})`,
    );
  }
}
