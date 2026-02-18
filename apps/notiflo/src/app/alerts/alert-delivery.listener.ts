import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConditionMatchBatch,
  ConditionMatchResult,
} from '@notiflo/bridge/napi-bridge';
import { Channel } from '../core';
import { AlertsService } from './alerts.service';

/**
 * Listens for condition match events from the Rust engine
 * and triggers notification delivery via the OrchestratorService.
 */
@Injectable()
export class AlertDeliveryListener {
  private readonly logger = new Logger(AlertDeliveryListener.name);

  constructor(
    private readonly alertsService: AlertsService,
    @Inject('OrchestratorService')
    private readonly orchestratorService: {
      sendNotification: (
        orgId: string,
        subscriberId: string,
        channel: Channel,
        templateId: string,
        variables: Record<string, unknown>,
        metadata?: Record<string, unknown>,
      ) => Promise<any>;
    },
  ) {}

  @OnEvent('engine.condition.match')
  async handleConditionMatch(batch: ConditionMatchBatch): Promise<void> {
    this.logger.log(
      `Received ${batch.matches.length} condition matches`,
    );

    for (const match of batch.matches) {
      await this.processMatch(match);
    }
  }

  private async processMatch(match: ConditionMatchResult): Promise<void> {
    try {
      // Send notification for each channel in the match
      for (const channelStr of match.channels) {
        const channel = channelStr as Channel;
        const templateId = match.templateId || 'default-alert';

        await this.orchestratorService.sendNotification(
          match.organizationId,
          match.subscriberId,
          channel,
          templateId,
          {
            symbol: match.symbol,
            matchedValue: match.matchedValue,
            matchDetail: match.matchDetail,
            triggeredAt: new Date().toISOString(),
          },
          {
            alertConditionId: match.conditionId,
            source: 'rust_engine',
          },
        );
      }

      // Update trigger stats on the alert condition
      await this.alertsService.recordTrigger(match.conditionId);
    } catch (error) {
      this.logger.error(
        `Failed to process match for condition ${match.conditionId}`,
        error instanceof Error ? error.stack : error,
      );
      // Continue processing other matches — don't let one failure stop the batch
    }
  }
}
