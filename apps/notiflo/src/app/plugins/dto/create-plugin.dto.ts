export class CreatePluginDto {
  name: string;
  version: string;
  description?: string;
  type: 'custom_channel' | 'hook' | 'integration';
  config?: Record<string, unknown>;
  hooks?: Array<{
    hookPoint: string;
    priority?: number;
    handlerCode?: string; // For simple inline hooks
  }>;
  channel?: {
    name: string;
    providerConfig: Record<string, unknown>;
  };
}
