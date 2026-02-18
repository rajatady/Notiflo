import { Test, TestingModule } from '@nestjs/testing';
import { TemplateEngineService } from './template-engine.service';
import { Channel } from '../../core';
import type {
  ChannelTemplateContent,
  RenderResult,
  TemplateValidationResult,
} from '../../core';

describe('TemplateEngineService', () => {
  let engine: TemplateEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateEngineService],
    }).compile();

    engine = module.get<TemplateEngineService>(TemplateEngineService);
  });

  it('should be defined', () => {
    expect(engine).toBeDefined();
  });

  describe('render', () => {
    it('should render a simple template with variables', () => {
      const result = engine.render('Hello {{name}}', { name: 'World' });
      expect(result).toBe('Hello World');
    });

    it('should render with nested object access', () => {
      const result = engine.render(
        '{{user.name}} has {{user.count}} items',
        { user: { name: 'Alice', count: 5 } },
      );
      expect(result).toBe('Alice has 5 items');
    });

    it('should render with conditional blocks', () => {
      const template = '{{#if premium}}VIP{{else}}Standard{{/if}}';

      const vipResult = engine.render(template, { premium: true });
      expect(vipResult).toBe('VIP');

      const standardResult = engine.render(template, { premium: false });
      expect(standardResult).toBe('Standard');
    });

    it('should render with each loops', () => {
      const template = '{{#each items}}{{this}}, {{/each}}';
      const result = engine.render(template, {
        items: ['apple', 'banana', 'cherry'],
      });
      expect(result).toBe('apple, banana, cherry, ');
    });

    it('should handle missing variables gracefully (empty string, not error)', () => {
      const result = engine.render('Hello {{name}}, welcome to {{place}}', {});
      expect(result).toBe('Hello , welcome to ');
    });

    it('should escape HTML by default for safety', () => {
      const result = engine.render('Content: {{content}}', {
        content: '<script>alert("xss")</script>',
      });
      expect(result).toBe(
        'Content: &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
      );
      expect(result).not.toContain('<script>');
    });

    it('should render with triple-stash {{{raw}}} for unescaped HTML', () => {
      const result = engine.render('Content: {{{content}}}', {
        content: '<strong>bold</strong>',
      });
      expect(result).toBe('Content: <strong>bold</strong>');
    });

    it('should handle HTML content in email templates', () => {
      const template =
        '<html><body><h1>Hello {{name}}</h1><p>{{{htmlContent}}}</p></body></html>';
      const result = engine.render(template, {
        name: 'User',
        htmlContent: '<em>Welcome</em> to our platform',
      });
      expect(result).toBe(
        '<html><body><h1>Hello User</h1><p><em>Welcome</em> to our platform</p></body></html>',
      );
    });

    it('should render multiple variables in the same template', () => {
      const result = engine.render(
        '{{firstName}} {{lastName}} ({{email}})',
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      );
      expect(result).toBe('John Doe (john@example.com)');
    });
  });

  describe('renderForChannel', () => {
    it('should render for a specific channel returning RenderResult with subject and body rendered', () => {
      const channelTemplate: ChannelTemplateContent = {
        subject: 'Welcome {{name}}',
        body: '<h1>Hello {{name}}</h1><p>Your order #{{orderId}} is confirmed.</p>',
        metadata: { priority: 'high' },
      };

      const result: RenderResult = engine.renderForChannel(
        channelTemplate,
        { name: 'Alice', orderId: '12345' },
        Channel.EMAIL,
      );

      expect(result.channel).toBe(Channel.EMAIL);
      expect(result.subject).toBe('Welcome Alice');
      expect(result.body).toBe(
        '<h1>Hello Alice</h1><p>Your order #12345 is confirmed.</p>',
      );
      expect(result.metadata).toEqual({ priority: 'high' });
    });

    it('should handle channel template without subject', () => {
      const channelTemplate: ChannelTemplateContent = {
        body: 'Hello {{name}}, your code is {{code}}',
      };

      const result = engine.renderForChannel(
        channelTemplate,
        { name: 'Bob', code: '9876' },
        Channel.SMS,
      );

      expect(result.channel).toBe(Channel.SMS);
      expect(result.subject).toBeUndefined();
      expect(result.body).toBe('Hello Bob, your code is 9876');
    });

    it('should pass through metadata unchanged', () => {
      const channelTemplate: ChannelTemplateContent = {
        body: 'Test',
        metadata: { imageUrl: 'https://example.com/img.png', badge: 3 },
      };

      const result = engine.renderForChannel(
        channelTemplate,
        {},
        Channel.PUSH,
      );

      expect(result.metadata).toEqual({
        imageUrl: 'https://example.com/img.png',
        badge: 3,
      });
    });
  });

  describe('validate', () => {
    it('should validate a correct template as valid', () => {
      const result: TemplateValidationResult = engine.validate(
        'Hello {{name}}, welcome to {{place}}',
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a template with conditionals as valid', () => {
      const result = engine.validate(
        '{{#if active}}Yes{{else}}No{{/if}}',
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect syntax errors in templates (unclosed tags)', () => {
      const result: TemplateValidationResult = engine.validate(
        'Hello {{#if active}}open but never closed',
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('template');
      expect(result.errors[0].message).toBeDefined();
      expect(result.errors[0].message.length).toBeGreaterThan(0);
    });

    it('should detect unclosed variable expressions', () => {
      const result = engine.validate('Hello {{name');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate an empty template as valid', () => {
      const result = engine.validate('');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('extractVariables', () => {
    it('should extract variable names from a template', () => {
      const variables = engine.extractVariables(
        'Hello {{name}}, welcome to {{place}}',
      );
      expect(variables).toContain('name');
      expect(variables).toContain('place');
      expect(variables).toHaveLength(2);
    });

    it('should extract nested variable paths', () => {
      const variables = engine.extractVariables(
        '{{user.name}} lives in {{user.address.city}}',
      );
      expect(variables).toContain('user.name');
      expect(variables).toContain('user.address.city');
    });

    it('should not duplicate variable names', () => {
      const variables = engine.extractVariables(
        '{{name}} and {{name}} again',
      );
      expect(variables).toEqual(['name']);
    });

    it('should extract variables from inside block helpers', () => {
      const variables = engine.extractVariables(
        '{{#if premium}}Welcome {{name}}{{/if}}',
      );
      expect(variables).toContain('premium');
      expect(variables).toContain('name');
    });

    it('should extract variables from each blocks', () => {
      const variables = engine.extractVariables(
        '{{#each items}}{{this.name}}{{/each}}',
      );
      expect(variables).toContain('items');
    });

    it('should return empty array for a template with no variables', () => {
      const variables = engine.extractVariables('Hello World, no variables here');
      expect(variables).toEqual([]);
    });

    it('should handle triple-stash variables', () => {
      const variables = engine.extractVariables(
        'Content: {{{rawHtml}}} and {{safeText}}',
      );
      expect(variables).toContain('rawHtml');
      expect(variables).toContain('safeText');
    });
  });
});
