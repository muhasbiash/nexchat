import { DurableObject } from 'cloudflare:workers';
import { MongoClient, ObjectId } from 'mongodb';

import { handleAuthRoute } from './routes/auth.routes';
import { handleUsersRoute } from './routes/users.routes';
import { handleConversationsRoute } from './routes/conversations.routes';
import { handleMessagesRoute } from './routes/messages.routes';

import { getMongoDb } from './lib/mongodb';
import { verifyToken } from './lib/jwt';

import {
  createConversationMessage,
} from './services/message.service';

import {
  getUserConversations,
} from './services/conversation.service';

export interface Env {
  ENVIRONMENT: string;
  MONGO_URI: string;
  JWT_SECRET: string;
  NEXCHAT_ROOM: DurableObjectNamespace<NexChatRoom>;
}

interface ClientMessage {
  type: string;
  conversationId?: string;
  content?: string;
}

interface SocketAttachment {
  userId: string;
  email: string;
  conversationIds: string[];
}

function sendSocketEvent(
  ws: WebSocket,
  event: unknown,
): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify(event));
}

export class NexChatRoom extends DurableObject<Env> {
  constructor(
    ctx: DurableObjectState,
    env: Env,
  ) {
    super(ctx, env);

    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(
        'ping',
        'pong',
      ),
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (
      request.headers.get('Upgrade')?.toLowerCase() !==
      'websocket'
    ) {
      return new Response(
        'Expected WebSocket',
        {
          status: 426,
        },
      );
    }

    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(
        'Missing authentication token',
        {
          status: 401,
        },
      );
    }

    let tokenPayload;

    try {
      tokenPayload = await verifyToken(
        token,
        this.env.JWT_SECRET,
      );
    } catch (error) {
      console.error(
        '[NexChatRoom] JWT verification failed:',
        error,
      );

      return new Response(
        'Invalid authentication token',
        {
          status: 401,
        },
      );
    }

    const webSocketPair = new WebSocketPair();

    const client = webSocketPair[0];
    const server = webSocketPair[1];

    this.ctx.acceptWebSocket(server);

    server.serializeAttachment({
      userId: tokenPayload.sub,
      email: tokenPayload.email,
      conversationIds: [],
    } satisfies SocketAttachment);

    console.log(
      '[NexChatRoom] WebSocket connected:',
      tokenPayload.sub,
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private getAttachment(
    ws: WebSocket,
  ): SocketAttachment | null {
    const attachment =
      ws.deserializeAttachment();

    if (
      !attachment ||
      typeof attachment !== 'object'
    ) {
      return null;
    }

    const data =
      attachment as Partial<SocketAttachment>;

    if (
      typeof data.userId !== 'string' ||
      typeof data.email !== 'string' ||
      !Array.isArray(data.conversationIds)
    ) {
      return null;
    }

    return {
      userId: data.userId,
      email: data.email,
      conversationIds: data.conversationIds.filter(
        (id): id is string =>
          typeof id === 'string',
      ),
    };
  }

  private async isUserInConversation(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const db = await getMongoDb(
        this.env.MONGO_URI,
      );

      const conversations =
        await getUserConversations(
          db,
          userId,
        );

      return conversations.some(
        (conversation) =>
          conversation.id === conversationId,
      );
    } catch (error) {
      console.error(
        '[NexChatRoom] Conversation membership check failed:',
        error,
      );

      return false;
    }
  }

  private sendError(
    ws: WebSocket,
    message: string,
  ): void {
    sendSocketEvent(ws, {
      type: 'error',
      message,
    });
  }

  private broadcastToConversation(
    conversationId: string,
    event: unknown,
    exclude?: WebSocket,
  ): void {
    const sockets =
      this.ctx.getWebSockets();

    for (const socket of sockets) {
      if (socket === exclude) {
        continue;
      }

      const attachment =
        this.getAttachment(socket);

      if (!attachment) {
        continue;
      }

      if (
        !attachment.conversationIds.includes(
          conversationId,
        )
      ) {
        continue;
      }

      sendSocketEvent(
        socket,
        event,
      );
    }
  }

  private broadcastToConversationIncludingSender(
    conversationId: string,
    event: unknown,
  ): void {
    const sockets =
      this.ctx.getWebSockets();

    for (const socket of sockets) {
      const attachment =
        this.getAttachment(socket);

      if (!attachment) {
        continue;
      }

      if (
        !attachment.conversationIds.includes(
          conversationId,
        )
      ) {
        continue;
      }

      sendSocketEvent(
        socket,
        event,
      );
    }
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== 'string') {
      this.sendError(
        ws,
        'Binary messages are not supported',
      );

      return;
    }

    let data: ClientMessage;

    try {
      data = JSON.parse(
        message,
      ) as ClientMessage;
    } catch {
      this.sendError(
        ws,
        'Invalid JSON message',
      );

      return;
    }

    const attachment =
      this.getAttachment(ws);

    if (!attachment) {
      this.sendError(
        ws,
        'Unauthenticated WebSocket',
      );

      return;
    }

    try {
      switch (data.type) {
        case 'join_conversation': {
          await this.handleJoinConversation(
            ws,
            attachment,
            data.conversationId,
          );

          break;
        }

        case 'leave_conversation': {
          this.handleLeaveConversation(
            ws,
            attachment,
            data.conversationId,
          );

          break;
        }

        case 'send_message': {
          await this.handleSendMessage(
            ws,
            attachment,
            data.conversationId,
            data.content,
          );

          break;
        }

        case 'typing_start': {
          await this.handleTyping(
            ws,
            attachment,
            data.conversationId,
            'user_typing',
          );

          break;
        }

        case 'typing_stop': {
          await this.handleTyping(
            ws,
            attachment,
            data.conversationId,
            'user_stopped_typing',
          );

          break;
        }

        default: {
          this.sendError(
            ws,
            `Unknown event type: ${data.type}`,
          );
        }
      }
    } catch (error) {
      console.error(
        '[NexChatRoom] WebSocket message error:',
        error,
      );

      this.sendError(
        ws,
        error instanceof Error
          ? error.message
          : 'WebSocket request failed',
      );
    }
  }

  private async handleJoinConversation(
    ws: WebSocket,
    attachment: SocketAttachment,
    conversationId?: string,
  ): Promise<void> {
    if (!conversationId) {
      this.sendError(
        ws,
        'Conversation id is required',
      );

      return;
    }

    const allowed =
      await this.isUserInConversation(
        conversationId,
        attachment.userId,
      );

    if (!allowed) {
      this.sendError(
        ws,
        'User is not a member of this conversation',
      );

      return;
    }

    if (
      !attachment.conversationIds.includes(
        conversationId,
      )
    ) {
      attachment.conversationIds.push(
        conversationId,
      );
    }

    ws.serializeAttachment(
      attachment,
    );

    sendSocketEvent(ws, {
      type: 'joined_conversation',
      conversationId,
    });

    console.log(
      '[NexChatRoom] User joined conversation:',
      attachment.userId,
      conversationId,
    );
  }

  private handleLeaveConversation(
    ws: WebSocket,
    attachment: SocketAttachment,
    conversationId?: string,
  ): void {
    if (!conversationId) {
      return;
    }

    attachment.conversationIds =
      attachment.conversationIds.filter(
        (id) =>
          id !== conversationId,
      );

    ws.serializeAttachment(
      attachment,
    );

    sendSocketEvent(ws, {
      type: 'left_conversation',
      conversationId,
    });

    console.log(
      '[NexChatRoom] User left conversation:',
      attachment.userId,
      conversationId,
    );
  }

  private async handleSendMessage(
    ws: WebSocket,
    attachment: SocketAttachment,
    conversationId?: string,
    content?: string,
  ): Promise<void> {
    if (!conversationId) {
      this.sendError(
        ws,
        'Conversation id is required',
      );

      return;
    }

    if (!attachment.conversationIds.includes(
      conversationId,
    )) {
      this.sendError(
        ws,
        'Join the conversation before sending messages',
      );

      return;
    }

    if (
      typeof content !== 'string' ||
      !content.trim()
    ) {
      this.sendError(
        ws,
        'Message content is required',
      );

      return;
    }

    const db = await getMongoDb(
      this.env.MONGO_URI,
    );

    const message =
      await createConversationMessage(
        db,
        conversationId,
        attachment.userId,
        content,
      );

    this.broadcastToConversationIncludingSender(
      conversationId,
      {
        type: 'new_message',
        message,
      },
    );

    console.log(
      '[NexChatRoom] Message created:',
      message.id,
    );
  }

  private async handleTyping(
    ws: WebSocket,
    attachment: SocketAttachment,
    conversationId: string | undefined,
    eventType:
      | 'user_typing'
      | 'user_stopped_typing',
  ): Promise<void> {
    if (!conversationId) {
      this.sendError(
        ws,
        'Conversation id is required',
      );

      return;
    }

    if (
      !attachment.conversationIds.includes(
        conversationId,
      )
    ) {
      this.sendError(
        ws,
        'Join the conversation first',
      );

      return;
    }

    this.broadcastToConversation(
      conversationId,
      {
        type: eventType,
        conversationId,
        userId: attachment.userId,
      },
      ws,
    );
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    const attachment =
      this.getAttachment(ws);

    console.log(
      '[NexChatRoom] WebSocket closed:',
      attachment?.userId ?? 'unknown',
      code,
      reason,
    );
  }

  async webSocketError(
    ws: WebSocket,
    error: unknown,
  ): Promise<void> {
    console.error(
      '[NexChatRoom] WebSocket error:',
      error,
    );
  }
}

async function mongoHealth(
  env: Env,
): Promise<Response> {
  const client = new MongoClient(
    env.MONGO_URI,
  );

  try {
    const db = client.db('nexchat');

    await client.connect();

    const result = await db.command({
      ping: 1,
    });

    console.log(
      '[MongoHealth] ping completed',
    );

    const testUser = await db
      .collection('users')
      .findOne({
        email: 'local-test@nexchat.local',
      });

    console.log(
      '[MongoHealth] email findOne completed:',
      Boolean(testUser),
    );

    let idUser = null;

    if (testUser?._id) {
      const testId =
        testUser._id.toString();

      console.log(
        '[MongoHealth] testing ObjectId:',
        testId,
      );

      idUser = await db
        .collection('users')
        .findOne({
          _id: new ObjectId(testId),
        });

      console.log(
        '[MongoHealth] ObjectId findOne completed:',
        Boolean(idUser),
      );
    }

    return Response.json({
      status: 'ok',
      service: 'nexchat-worker',
      mongodb:
        result.ok === 1
          ? 'connected'
          : 'unknown',
      emailFindOne: Boolean(testUser),
      objectIdFindOne: Boolean(idUser),
    });
  } catch (error) {
    console.error(
      'MongoDB health check failed:',
      error,
    );

    return Response.json(
      {
        status: 'error',
        mongodb: 'connection_failed',
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      },
    );
  } finally {
    await client.close();
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(
      request.url,
    );

    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'nexchat-worker',
        environment: env.ENVIRONMENT,
      });
    }

    if (
      url.pathname === '/mongo-health'
    ) {
      return mongoHealth(env);
    }

    if (url.pathname === '/ws') {
      if (
        request.headers
          .get('Upgrade')
          ?.toLowerCase() !==
        'websocket'
      ) {
        return new Response(
          'Expected WebSocket',
          {
            status: 426,
          },
        );
      }

      const roomId =
        env.NEXCHAT_ROOM.idFromName(
          'global',
        );

      const room =
        env.NEXCHAT_ROOM.get(
          roomId,
        );

      return room.fetch(
        request,
      );
    }

    if (
      url.pathname.startsWith('/api/')
    ) {
      try {
        const db =
          await getMongoDb(
            env.MONGO_URI,
          );

        const authResponse =
          await handleAuthRoute(
            request,
            url.pathname,
            db,
            env,
          );

        if (authResponse) {
          return authResponse;
        }

        const usersResponse =
          await handleUsersRoute(
            request,
            url.pathname,
            db,
            env,
          );

        if (usersResponse) {
          return usersResponse;
        }

        const conversationsResponse =
          await handleConversationsRoute(
            request,
            url.pathname,
            db,
            env,
          );

        if (conversationsResponse) {
          return conversationsResponse;
        }

        const messagesResponse =
          await handleMessagesRoute(
            request,
            url.pathname,
            db,
            env,
          );

        if (messagesResponse) {
          return messagesResponse;
        }

        return Response.json(
          {
            message:
              'API route not found',
          },
          {
            status: 404,
          },
        );
      } catch (error) {
        console.error(
          '[Worker] API error:',
          error,
        );

        return Response.json(
          {
            message:
              'Internal server error',
          },
          {
            status: 500,
          },
        );
      }
    }

    return Response.json(
      {
        message:
          'NexChat Worker',
        status: 'ok',
      },
      {
        status: 200,
      },
    );
  },
};
