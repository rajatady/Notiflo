import {
  Controller,
  Get,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { McpToolsService } from './mcp-tools.service';

/**
 * REST controller that exposes the MCP protocol endpoints.
 * AI agents interact with Notiflo through these endpoints.
 */
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpToolsService: McpToolsService) {}

  /**
   * List all available MCP tools.
   */
  @Get('tools')
  listTools() {
    return this.mcpToolsService.getTools();
  }

  /**
   * Execute a specific MCP tool by name.
   */
  @Post('tools/:toolName')
  async executeTool(
    @Param('toolName') toolName: string,
    @Body() args: Record<string, unknown>,
  ) {
    return this.mcpToolsService.executeTool(toolName, args);
  }
}
