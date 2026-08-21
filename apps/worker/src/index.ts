import { DurableObject } from 'cloudflare:workers';

export interface Env {
  ENVIRONMENT: string;
  NEXCHAT_ROOM: DurableObjectNamespace<NexChatRoom>;
}

interface ClientMessage {
  type: string;
  conversationId?: string;
  content?: string;
}

export class NexChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', {
        status: 426,
      });
    }

    const webSocketPair = new WebSocketPair();

    const client = webSocketPair[0];
    const server = webSocketPair[1];

    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') {
      return;
    }

    try {
      const data = JSON.parse(message) as ClientMessage;

      console.log('[NexChatRoom] Message:', data);

      ws.send(
        JSON.stringify({
          type: 'ack',
          received: data,
        }),
      );
    } catch {
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Invalid JSON message',
        }),
      );
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
  ) {
    console.log('[NexChatRoom] WebSocket closed:', code, reason);

    // 1005, 1006, and 1015 are reserved WebSocket codes
    // and must not be passed to WebSocket.close().
    if (code === 1005 || code === 1006 || code === 1015) {
      return;
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.close(code, reason);
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error('[NexChatRoom] WebSocket error:', error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'nexchat-worker',
        environment: env.ENVIRONMENT,
      });
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket', {
          status: 426,
        });
      }

      const roomId = env.NEXCHAT_ROOM.idFromName('global');
      const room = env.NEXCHAT_ROOM.get(roomId);

      return room.fetch(request);
    }

    return Response.json(
      {
        message: 'NexChat Worker',
        status: 'ok',
      },
      {
        status: 200,
      },
    );
  },
};