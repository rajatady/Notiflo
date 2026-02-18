import { Channel } from '../types/channel.types';
import {
  RenderRequest,
  RenderResult,
  TemplateValidationResult,
  ChannelTemplateContent,
} from '../types/template.types';

/**
 * Template rendering engine interface.
 * Handles variable interpolation and per-channel template rendering.
 */
export interface ITemplateEngine {
  /** Render a raw template string with variables */
  render(template: string, variables: Record<string, unknown>): string;

  /** Render a channel-specific template */
  renderForChannel(
    channelTemplate: ChannelTemplateContent,
    variables: Record<string, unknown>,
    channel?: Channel,
  ): RenderResult;

  /** Validate a template string for syntax errors */
  validate(template: string): TemplateValidationResult;

  /** Extract variable names from a template string */
  extractVariables(template: string): string[];
}

export const TEMPLATE_ENGINE = 'TEMPLATE_ENGINE';
