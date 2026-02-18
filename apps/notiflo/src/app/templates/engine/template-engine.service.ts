import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import {
  Channel,
  ChannelTemplateContent,
  RenderResult,
  TemplateValidationResult,
  ITemplateEngine,
} from '../../core';

/**
 * Handlebars-based template engine implementing ITemplateEngine.
 * Renders templates with variable interpolation, supports conditionals,
 * loops, nested objects, and HTML escaping.
 */
@Injectable()
export class TemplateEngineService implements ITemplateEngine {
  /**
   * Render a raw template string with the given variables.
   * Missing variables resolve to empty strings (Handlebars default).
   * HTML is escaped by default; use triple-stash {{{var}}} for raw HTML.
   */
  render(template: string, variables: Record<string, unknown>): string {
    const compiled = Handlebars.compile(template);
    return compiled(variables);
  }

  /**
   * Render a channel-specific template (subject + body) and return a RenderResult.
   * The channel parameter is required to populate the RenderResult.channel field.
   */
  renderForChannel(
    channelTemplate: ChannelTemplateContent,
    variables: Record<string, unknown>,
    channel?: Channel,
  ): RenderResult {
    const result: RenderResult = {
      channel: channel ?? Channel.EMAIL,
      body: this.render(channelTemplate.body, variables),
    };

    if (channelTemplate.subject) {
      result.subject = this.render(channelTemplate.subject, variables);
    }

    if (channelTemplate.metadata) {
      result.metadata = channelTemplate.metadata;
    }

    return result;
  }

  /**
   * Validate a template string for syntax errors.
   * Attempts to compile the template; any Handlebars parse errors are captured.
   */
  validate(template: string): TemplateValidationResult {
    try {
      Handlebars.precompile(template);
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            field: 'template',
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * Extract variable names from a template string by walking the Handlebars AST.
   * Returns unique variable paths (e.g., ['name', 'user.address.city']).
   */
  extractVariables(template: string): string[] {
    const ast = Handlebars.parse(template);
    const variables = new Set<string>();

    this.walkAst(ast, variables);

    return Array.from(variables);
  }

  /**
   * Recursively walk the Handlebars AST to extract variable references.
   */
  private walkAst(node: hbs.AST.Node, variables: Set<string>): void {
    if (!node || typeof node !== 'object') {
      return;
    }

    switch (node.type) {
      case 'Program': {
        const program = node as hbs.AST.Program;
        for (const statement of program.body) {
          this.walkAst(statement, variables);
        }
        break;
      }
      case 'MustacheStatement': {
        const mustache = node as hbs.AST.MustacheStatement;
        this.extractPathFromExpression(mustache.path, variables);
        break;
      }
      case 'BlockStatement': {
        const block = node as hbs.AST.BlockStatement;
        // For block helpers like #if and #each, extract the path expression
        // as a variable reference (e.g., {{#if premium}} -> "premium")
        if (block.path.type === 'PathExpression') {
          const pathExpr = block.path as hbs.AST.PathExpression;
          // For built-in helpers (if, each, unless, with), extract params as variables
          const builtinHelpers = ['if', 'each', 'unless', 'with'];
          if (builtinHelpers.includes(pathExpr.original)) {
            for (const param of block.params) {
              this.extractPathFromExpression(param, variables);
            }
          }
        }
        // Walk the block body
        if (block.program) {
          this.walkAst(block.program, variables);
        }
        if (block.inverse) {
          this.walkAst(block.inverse, variables);
        }
        break;
      }
      case 'ContentStatement':
        // Raw content, no variables
        break;
      case 'CommentStatement':
        // Comments, no variables
        break;
      default:
        break;
    }
  }

  /**
   * Extract a dotted path from an AST expression node.
   * Filters out special references like "this" and "@index".
   */
  private extractPathFromExpression(
    expr: hbs.AST.Expression,
    variables: Set<string>,
  ): void {
    if (expr.type === 'PathExpression') {
      const pathExpr = expr as hbs.AST.PathExpression;
      const path = pathExpr.original;

      // Skip special Handlebars references
      if (
        path === 'this' ||
        path.startsWith('@') ||
        path.startsWith('this.')
      ) {
        return;
      }

      variables.add(path);
    }
  }
}
