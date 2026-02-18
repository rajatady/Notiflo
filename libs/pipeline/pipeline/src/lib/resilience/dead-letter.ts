import { Injectable, Logger } from '@nestjs/common';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

export interface DeadLetterMessage {
  originalTopic: string;
  originalMessage: unknown;
  error: string;
  errorStack?: string;
  retryCount: number;
  timestamp: string;
}

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  /**
   * Sends a failed message to the dead letter topic.
   * Dead letter topic follows the convention: dlq.{originalTopic}
   */
  async send(
    originalTopic: string,
    originalMessage: unknown,
    error: Error | string,
    retryCount: number,
  ): Promise<void> {
    const dlqTopic = `dlq.${originalTopic}`;
    const errorObj = error instanceof Error ? error : new Error(String(error));

    const deadLetterMessage: DeadLetterMessage = {
      originalTopic,
      originalMessage,
      error: errorObj.message,
      errorStack: errorObj.stack,
      retryCount,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.kafkaProducer.send(dlqTopic, [
        { value: JSON.stringify(deadLetterMessage) },
      ]);
      this.logger.warn(
        `Sent message to dead letter queue ${dlqTopic} after ${retryCount} retries: ${errorObj.message}`,
      );
    } catch (dlqError) {
      this.logger.error(
        `Failed to send message to dead letter queue ${dlqTopic}`,
        dlqError,
      );
      throw dlqError;
    }
  }

  /**
   * Retrieves dead letter messages for a given topic.
   * Note: This is a simplified implementation. In production, you would
   * consume from the DLQ topic using a dedicated consumer group.
   */
  async getDeadLetters(
    topic: string,
    limit = 100,
  ): Promise<DeadLetterMessage[]> {
    const dlqTopic = `dlq.${topic}`;
    this.logger.debug(
      `Fetching up to ${limit} dead letters from ${dlqTopic}`,
    );
    // In a full implementation, this would use a KafkaConsumerService
    // to consume messages from the DLQ topic. For now, we return an
    // empty array as DLQ consumption requires a dedicated consumer setup.
    return [];
  }
}
