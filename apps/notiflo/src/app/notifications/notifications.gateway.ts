import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Server, WebSocket } from 'ws';

/**
 * Standalone WebSocket server attached to Fastify's underlying HTTP server.
 * Listens on /ws/notifications path for upgrade requests.
 *
 * This bypasses NestJS's WsAdapter because Fastify intercepts HTTP upgrade
 * requests before the adapter can handle them.
 */
@Injectable()
export class NotificationsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsGateway.name);
  private wss: Server | null = null;

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  onModuleInit() {
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    const httpServer = httpAdapter.getHttpServer();

    this.wss = new Server({ noServer: true });

    this.wss.on('connection', () => {
      this.logger.log(
        `WebSocket client connected (total: ${this.wss?.clients.size})`,
      );
    });

    httpServer.on('upgrade', (request: any, socket: any, head: any) => {
      if (request.url === '/ws/notifications') {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.logger.log('WebSocket server mounted on /ws/notifications');
  }

  onModuleDestroy() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  broadcastDeliveryEvent(event: Record<string, unknown>) {
    if (!this.wss) return;
    const payload = JSON.stringify({ type: 'delivery', data: event });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }

  broadcastMetrics(metrics: Record<string, unknown>) {
    if (!this.wss) return;
    const payload = JSON.stringify({ type: 'metrics', data: metrics });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }
}
