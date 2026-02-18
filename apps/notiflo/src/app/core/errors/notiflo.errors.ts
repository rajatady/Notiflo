/**
 * Base error class for all Notiflo domain errors.
 */
export class NotifloError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'NotifloError';
  }
}

export class ChannelNotConfiguredError extends NotifloError {
  constructor(channel: string) {
    super(
      `No active provider configured for channel: ${channel}`,
      'CHANNEL_NOT_CONFIGURED',
      400,
      { channel },
    );
    this.name = 'ChannelNotConfiguredError';
  }
}

export class ProviderNotFoundError extends NotifloError {
  constructor(channel: string, providerName?: string) {
    super(
      providerName
        ? `Provider '${providerName}' not found for channel: ${channel}`
        : `No provider found for channel: ${channel}`,
      'PROVIDER_NOT_FOUND',
      404,
      { channel, providerName },
    );
    this.name = 'ProviderNotFoundError';
  }
}

export class ProviderSendError extends NotifloError {
  constructor(providerName: string, originalError: string) {
    super(
      `Provider '${providerName}' failed to send: ${originalError}`,
      'PROVIDER_SEND_FAILED',
      502,
      { providerName, originalError },
    );
    this.name = 'ProviderSendError';
  }
}

export class TemplateRenderError extends NotifloError {
  constructor(templateId: string, detail: string) {
    super(
      `Failed to render template '${templateId}': ${detail}`,
      'TEMPLATE_RENDER_FAILED',
      400,
      { templateId },
    );
    this.name = 'TemplateRenderError';
  }
}

export class TemplateNotFoundError extends NotifloError {
  constructor(templateId: string) {
    super(
      `Template not found: ${templateId}`,
      'TEMPLATE_NOT_FOUND',
      404,
      { templateId },
    );
    this.name = 'TemplateNotFoundError';
  }
}

export class SubscriberNotFoundError extends NotifloError {
  constructor(subscriberId: string) {
    super(
      `Subscriber not found: ${subscriberId}`,
      'SUBSCRIBER_NOT_FOUND',
      404,
      { subscriberId },
    );
    this.name = 'SubscriberNotFoundError';
  }
}

export class WorkflowNotFoundError extends NotifloError {
  constructor(workflowId: string) {
    super(
      `Workflow not found: ${workflowId}`,
      'WORKFLOW_NOT_FOUND',
      404,
      { workflowId },
    );
    this.name = 'WorkflowNotFoundError';
  }
}

export class WorkflowExecutionError extends NotifloError {
  constructor(workflowId: string, stepId: string, detail: string) {
    super(
      `Workflow '${workflowId}' failed at step '${stepId}': ${detail}`,
      'WORKFLOW_EXECUTION_FAILED',
      500,
      { workflowId, stepId },
    );
    this.name = 'WorkflowExecutionError';
  }
}

export class CampaignNotFoundError extends NotifloError {
  constructor(campaignId: string) {
    super(
      `Campaign not found: ${campaignId}`,
      'CAMPAIGN_NOT_FOUND',
      404,
      { campaignId },
    );
    this.name = 'CampaignNotFoundError';
  }
}

export class CampaignStatusError extends NotifloError {
  constructor(campaignId: string, currentStatus: string, requiredStatus: string) {
    super(
      `Campaign '${campaignId}' is '${currentStatus}', must be '${requiredStatus}'`,
      'CAMPAIGN_INVALID_STATUS',
      409,
      { campaignId, currentStatus, requiredStatus },
    );
    this.name = 'CampaignStatusError';
  }
}

export class OrganizationNotFoundError extends NotifloError {
  constructor(orgId: string) {
    super(
      `Organization not found: ${orgId}`,
      'ORGANIZATION_NOT_FOUND',
      404,
      { orgId },
    );
    this.name = 'OrganizationNotFoundError';
  }
}

export class InvalidApiKeyError extends NotifloError {
  constructor() {
    super(
      'Invalid or expired API key',
      'INVALID_API_KEY',
      401,
    );
    this.name = 'InvalidApiKeyError';
  }
}

export class EventValidationError extends NotifloError {
  constructor(detail: string) {
    super(
      `Event validation failed: ${detail}`,
      'EVENT_VALIDATION_FAILED',
      400,
    );
    this.name = 'EventValidationError';
  }
}
