import { Injectable, Logger } from '@nestjs/common';

export interface BulkWriteMongoOptions {
  ordered?: boolean;
}

@Injectable()
export class BulkWriterService {
  private readonly logger = new Logger(BulkWriterService.name);

  /**
   * Bulk write documents to MongoDB using the provided Mongoose model.
   * Uses bulkWrite with insertOne operations for efficient batch inserts.
   *
   * @param model - Mongoose model instance (must have bulkWrite method)
   * @param documents - Array of documents to insert
   * @param options - Optional bulkWrite options
   * @returns The result of the bulkWrite operation
   */
  async bulkWriteMongo<T>(
    model: { bulkWrite: (ops: unknown[], options?: unknown) => Promise<T> },
    documents: Record<string, unknown>[],
    options: BulkWriteMongoOptions = {},
  ): Promise<T> {
    if (documents.length === 0) {
      this.logger.debug('No documents to write, skipping bulkWriteMongo');
      return { insertedCount: 0, modifiedCount: 0 } as unknown as T;
    }

    const operations = documents.map((doc) => ({
      insertOne: { document: doc },
    }));

    this.logger.debug(`Bulk writing ${documents.length} documents to MongoDB`);

    try {
      const result = await model.bulkWrite(operations, {
        ordered: options.ordered ?? false,
      });
      this.logger.debug(`Bulk write complete: ${documents.length} documents`);
      return result;
    } catch (error) {
      this.logger.error(
        `Bulk write to MongoDB failed for ${documents.length} documents`,
        error,
      );
      throw error;
    }
  }

  /**
   * Batch insert rows into ClickHouse.
   *
   * @param table - Target ClickHouse table name
   * @param rows - Array of row objects to insert
   * @param clickhouseClient - ClickHouse client instance (must have insert method)
   */
  async bulkWriteClickhouse<T extends Record<string, unknown>>(
    table: string,
    rows: T[],
    clickhouseClient: {
      insert: (params: {
        table: string;
        values: T[];
        format: string;
      }) => Promise<void>;
    },
  ): Promise<void> {
    if (rows.length === 0) {
      this.logger.debug('No rows to write, skipping bulkWriteClickhouse');
      return;
    }

    this.logger.debug(
      `Batch inserting ${rows.length} rows into ClickHouse table ${table}`,
    );

    try {
      await clickhouseClient.insert({
        table,
        values: rows,
        format: 'JSONEachRow',
      });
      this.logger.debug(
        `ClickHouse batch insert complete: ${rows.length} rows into ${table}`,
      );
    } catch (error) {
      this.logger.error(
        `ClickHouse batch insert failed for ${rows.length} rows into ${table}`,
        error,
      );
      throw error;
    }
  }
}
