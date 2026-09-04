import { DurableObject } from 'cloudflare:workers';
import { MongoClient, ObjectId } from 'mongodb';

import { handleAuthRoute } from './routes/auth.routes';
import { handleUsersRoute } from './routes/users.routes';
import { handleConversationsRoute } from './routes/conversations.routes';
import { handleMessagesRoute } from './routes/messages.routes';
import { handleContactsRoute } from './routes/contacts.routes';

import { withMongoDb } from './lib/mongodb';
import { verifyToken } from './lib/jwt';

import {
  createConversationMessage,
  deliverConversationMessages,
  readConversationMessages,
} from './services/message.service';

import { getUserConversations } from './services/conversation.service';
import { areUsersContacts } from './services/contact.service';
import {
  findConversationById,
  findConversationByParticipants,
} from './repositories/conversation.repository';

export interface Env {
  ENVIRONMENT: string;
  MONGO_URI: string;
  JWT_SECRET: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  NEXCHAT_ROOM: DurableObjectNamespace<NexChatRoom>;
}

interface ClientMessage {
  type: string;
  conversationId?: string;
  content?: string;

  callId?: string;
  targetUserId?: string;
  callerId?: string;
  mode?: 'audio' | 'video';
  sdp?: unknown;
  candidate?: unknown;
}

interface SocketAttachment {
  userId: string;
  email: string;
  conversationIds: string[];
  memberConversationIds: string[];
}
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'https://nexchat-api.vercel.app',
  'https://nexchat-sites.vercel.app',
  'https://nexchat-coyalb0jn-muhammad-hasbi-ashidiqi-s-projects.vercel.app',
]);

function getCorsOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin');

  if (!origin) {
    return null;
  }

  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();

  const origin = getCorsOrigin(request);

  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);

    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    headers.set('Access-Control-Max-Age', '86400');

    headers.set('Vary', 'Origin');
  }

  return headers;
}

function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);

  const cors = corsHeaders(request);

  cors.forEach((value, key) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function sendSocketEvent(ws: WebSocket, event: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify(event));
}

export class NexChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST' && new URL(request.url).pathname === '/contact-event') {
      try {
        const event = (await request.json()) as {
          type:
            | 'contact_request_received'
            | 'contact_request_accepted'
            | 'contact_request_rejected'
            | 'contact_removed';
          userId: string;
          request?: unknown;
          conversation?: unknown;
          contact?: unknown;
          requestId?: string;
        };

        if (!event.userId || typeof event.userId !== 'string') {
          return new Response('Invalid contact event user id', { status: 400 });
        }

        const { userId, ...socketEvent } = event;

        if (
          event.type === 'contact_request_accepted' &&
          event.conversation &&
          typeof event.conversation === 'object' &&
          'id' in event.conversation &&
          typeof event.conversation.id === 'string' &&
          event.request &&
          typeof event.request === 'object' &&
          'senderId' in event.request &&
          'receiverId' in event.request &&
          typeof event.request.senderId === 'string' &&
          typeof event.request.receiverId === 'string'
        ) {
          this.updateUserConversationMembership(
            [event.request.senderId, event.request.receiverId],
            event.conversation.id,
            'add',
          );
        }

        if (
          event.type === 'contact_removed' &&
          event.contact &&
          typeof event.contact === 'object' &&
          'senderId' in event.contact &&
          'receiverId' in event.contact &&
          typeof event.contact.senderId === 'string' &&
          typeof event.contact.receiverId === 'string'
        ) {
          const contact = {
            senderId: event.contact.senderId,
            receiverId: event.contact.receiverId,
          };

          const conversationId = await withMongoDb(this.env.MONGO_URI, async (db) => {
            const conversation = await findConversationByParticipants(db, [
              new ObjectId(contact.senderId),
              new ObjectId(contact.receiverId),
            ]);

            return conversation?._id?.toString() ?? null;
          });

          if (conversationId) {
            this.updateUserConversationMembership(
              [contact.senderId, contact.receiverId],
              conversationId,
              'remove',
            );
          }

          this.broadcastToUser(userId, socketEvent);

          return Response.json({
            ok: true,
          });
        }

        this.broadcastToUser(userId, socketEvent);

        return Response.json({
          ok: true,
        });
      } catch (error) {
        console.error('[NexChatRoom] Contact event error:', error);

        return new Response('Invalid contact event', { status: 400 });
      }
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', {
        status: 426,
      });
    }

    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    console.log('[NexChatRoom] TOKEN:', token ? 'present' : 'missing');

    if (!token) {
      return new Response('Missing authentication token', {
        status: 401,
      });
    }

    let tokenPayload;

    try {
      tokenPayload = await verifyToken(token, this.env.JWT_SECRET);
      console.log('[NexChatRoom] JWT VERIFIED:', tokenPayload.sub);
    } catch (error) {
      console.error('[NexChatRoom] JWT verification failed:', error);

      return new Response('Invalid authentication token', {
        status: 401,
      });
    }

    try {
      console.log('[NexChatRoom] Creating WebSocketPair...');

      const webSocketPair = new WebSocketPair();

      const client = webSocketPair[0];
      const server = webSocketPair[1];

      console.log('[NexChatRoom] Loading conversations...');

      const userConversations = await withMongoDb(this.env.MONGO_URI, (db) =>
        getUserConversations(db, tokenPayload.sub),
      );

      console.log('[NexChatRoom] Conversations loaded:', userConversations.length);

      const memberConversationIds = userConversations
        .map((conversation) => conversation.id)
        .filter((id): id is string => typeof id === 'string');

      console.log('[NexChatRoom] Accepting WebSocket...');

      this.ctx.acceptWebSocket(server);

      console.log('[NexChatRoom] WebSocket accepted');

      server.serializeAttachment({
        userId: tokenPayload.sub,
        email: tokenPayload.email,
        conversationIds: [],
        memberConversationIds,
      } satisfies SocketAttachment);

      console.log('[NexChatRoom] Attachment serialized');

      console.log('[NexChatRoom] WebSocket connected:', tokenPayload.sub);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    } catch (error) {
      console.error('[NexChatRoom] WEBSOCKET SETUP FAILED:', error);

      return new Response(error instanceof Error ? error.message : 'WebSocket setup failed', {
        status: 500,
      });
    }
  }

  private getAttachment(ws: WebSocket): SocketAttachment | null {
    const attachment = ws.deserializeAttachment();

    if (!attachment || typeof attachment !== 'object') {
      return null;
    }

    const data = attachment as Partial<SocketAttachment>;

    if (
      typeof data.userId !== 'string' ||
      typeof data.email !== 'string' ||
      !Array.isArray(data.conversationIds) ||
      !Array.isArray(data.memberConversationIds)
    ) {
      return null;
    }

    return {
      userId: data.userId,
      email: data.email,
      conversationIds: data.conversationIds.filter((id): id is string => typeof id === 'string'),
      memberConversationIds: data.memberConversationIds.filter(
        (id): id is string => typeof id === 'string',
      ),
    };
  }

  private async isUserInConversation(conversationId: string, userId: string): Promise<boolean> {
    try {
      return await withMongoDb(this.env.MONGO_URI, async (db) => {
        const conversations = await getUserConversations(db, userId);

        return conversations.some((conversation) => conversation.id === conversationId);
      });
    } catch (error) {
      console.error('[NexChatRoom] Conversation membership check failed:', error);

      return false;
    }
  }

  private sendError(ws: WebSocket, message: string): void {
    sendSocketEvent(ws, {
      type: 'error',
      message,
    });
  }

  private updateUserConversationMembership(
    userIds: string[],
    conversationId: string,
    action: 'add' | 'remove',
  ): void {
    const targetUserIds = new Set(userIds);

    for (const ws of this.ctx.getWebSockets()) {
      const attachment = this.getAttachment(ws);

      if (!attachment || !targetUserIds.has(attachment.userId)) {
        continue;
      }

      const memberConversationIds = new Set(attachment.memberConversationIds);

      if (action === 'add') {
        memberConversationIds.add(conversationId);
      } else {
        memberConversationIds.delete(conversationId);
      }

      ws.serializeAttachment({
        ...attachment,
        memberConversationIds: [...memberConversationIds],
        conversationIds:
          action === 'remove'
            ? attachment.conversationIds.filter((id) => id !== conversationId)
            : attachment.conversationIds,
      } satisfies SocketAttachment);
    }
  }

  private broadcastToUser(userId: string, event: unknown): void {
    const sockets = this.ctx.getWebSockets();

    for (const socket of sockets) {
      const attachment = this.getAttachment(socket);

      if (!attachment) {
        continue;
      }

      if (attachment.userId !== userId) {
        continue;
      }

      sendSocketEvent(socket, event);
    }
  }

  private broadcastToConversation(
    conversationId: string,
    event: unknown,
    exclude?: WebSocket,
  ): void {
    const sockets = this.ctx.getWebSockets();

    for (const socket of sockets) {
      if (socket === exclude) {
        continue;
      }

      const attachment = this.getAttachment(socket);

      if (!attachment) {
        continue;
      }

      if (!attachment.memberConversationIds.includes(conversationId)) {
        continue;
      }

      sendSocketEvent(socket, event);
    }
  }

  private broadcastToConversationIncludingSender(
    conversationId: string,
    event: unknown,
  ): Set<string> {
    const sockets = this.ctx.getWebSockets();
    const deliveredUserIds = new Set<string>();

    for (const socket of sockets) {
      const attachment = this.getAttachment(socket);

      if (!attachment) {
        continue;
      }

      if (!attachment.memberConversationIds.includes(conversationId)) {
        continue;
      }

      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      sendSocketEvent(socket, event);
      deliveredUserIds.add(attachment.userId);
    }

    return deliveredUserIds;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      this.sendError(ws, 'Binary messages are not supported');

      return;
    }

    let data: ClientMessage;

    try {
      data = JSON.parse(message) as ClientMessage;
    } catch {
      this.sendError(ws, 'Invalid JSON message');

      return;
    }

    const attachment = this.getAttachment(ws);

    if (!attachment) {
      this.sendError(ws, 'Unauthenticated WebSocket');

      return;
    }

    try {
      switch (data.type) {
        case 'join_conversation': {
          await this.handleJoinConversation(ws, attachment, data.conversationId);

          break;
        }

        case 'leave_conversation': {
          this.handleLeaveConversation(ws, attachment, data.conversationId);

          break;
        }

        case 'send_message': {
          await this.handleSendMessage(ws, attachment, data.conversationId, data.content);

          break;
        }

        case 'mark_messages_read': {
          await this.handleMarkMessagesRead(ws, attachment, data.conversationId);

          break;
        }

        case 'typing_start': {
          await this.handleTyping(ws, attachment, data.conversationId, 'user_typing');

          break;
        }

        case 'typing_stop': {
          await this.handleTyping(ws, attachment, data.conversationId, 'user_stopped_typing');

          break;
        }

        case 'call_initiate': {
          await this.handleCallInitiate(
            ws,
            attachment,
            data.conversationId,
            data.callId,
            data.targetUserId,
            data.mode,
          );

          break;
        }

        case 'call_accept': {
          await this.handleCallSignal(
            ws,
            attachment,
            'call_accept',
            data.conversationId,
            data.callId,
            data.targetUserId,
          );

          break;
        }

        case 'call_reject': {
          await this.handleCallSignal(
            ws,
            attachment,
            'call_reject',
            data.conversationId,
            data.callId,
            data.targetUserId,
          );

          break;
        }

        case 'call_end': {
          await this.handleCallSignal(
            ws,
            attachment,
            'call_end',
            data.conversationId,
            data.callId,
            data.targetUserId,
          );

          break;
        }

        case 'webrtc_offer': {
          await this.handleWebRtcSignal(
            ws,
            attachment,
            'webrtc_offer',
            data.conversationId,
            data.callId,
            data.targetUserId,
            data.sdp,
          );

          break;
        }

        case 'webrtc_answer': {
          await this.handleWebRtcSignal(
            ws,
            attachment,
            'webrtc_answer',
            data.conversationId,
            data.callId,
            data.targetUserId,
            data.sdp,
          );

          break;
        }

        case 'ice_candidate': {
          await this.handleWebRtcSignal(
            ws,
            attachment,
            'ice_candidate',
            data.conversationId,
            data.callId,
            data.targetUserId,
            data.candidate,
          );

          break;
        }

        default: {
          this.sendError(ws, `Unknown event type: ${data.type}`);
        }
      }
    } catch (error) {
      console.error('[NexChatRoom] WebSocket message error:', error);

      this.sendError(ws, error instanceof Error ? error.message : 'WebSocket request failed');
    }
  }

  private async getCallParticipants(
    conversationId: string,
    callerId: string,
    targetUserId: string,
  ): Promise<boolean> {
    if (!ObjectId.isValid(conversationId)) {
      return false;
    }

    if (!ObjectId.isValid(callerId) || !ObjectId.isValid(targetUserId)) {
      return false;
    }

    if (callerId === targetUserId) {
      return false;
    }

    return withMongoDb(this.env.MONGO_URI, async (db) => {
      const conversation = await findConversationById(db, new ObjectId(conversationId));

      if (!conversation) {
        return false;
      }

      const participantIds = conversation.participants.map((participant) => participant.toString());

      if (!participantIds.includes(callerId) || !participantIds.includes(targetUserId)) {
        return false;
      }

      return areUsersContacts(db, callerId, targetUserId);
    });
  }

  private async handleCallInitiate(
    ws: WebSocket,
    attachment: SocketAttachment,
    conversationId?: string,
    callId?: string,
    targetUserId?: string,
    mode?: 'audio' | 'video',
  ): Promise<void> {
    if (!conversationId || !callId || !targetUserId) {
      this.sendError(ws, 'Call conversation, call id, and target user are required');

      return;
    }

    if (mode !== 'audio' && mode !== 'video') {
      this.sendError(ws, 'Invalid call mode');

      return;
    }

    const allowed = await this.getCallParticipants(conversationId, attachment.userId, targetUserId);

    if (!allowed) {
      this.sendError(ws, 'Call is only available between accepted contacts in the conversation');

      return;
    }

    this.broadcastToUser(targetUserId, {
      type: 'call_incoming',
      conversationId,
      callId,
      callerId: attachment.userId,
      mode,
    });

    sendSocketEvent(ws, {
      type: 'call_outgoing',
      conversationId,
      callId,
      targetUserId,
      mode,
    });

    console.log(
      '[NexChatRoom] Call initiated:',
      attachment.userId,
      '->',
      targetUserId,
      callId,
      mode,
    );
  }

  private async handleCallSignal(
    ws: WebSocket,
    attachment: SocketAttachment,
    eventType: 'call_accept' | 'call_reject' | 'call_end',
    conversationId?: string,
    callId?: string,
    targetUserId?: string,
  ): Promise<void> {
    if (!conversationId || !callId || !targetUserId) {
      this.sendError(ws, 'Call conversation, call id, and target user are required');

      return;
    }

    const allowed = await this.getCallParticipants(conversationId, attachment.userId, targetUserId);

    if (!allowed) {
      this.sendError(ws, 'Call participant validation failed');

      return;
    }

    this.broadcastToUser(targetUserId, {
      type: eventType,
      conversationId,
      callId,
      senderId: attachment.userId,
    });

    console.log(
      '[NexChatRoom] Call signal:',
      eventType,
      attachment.userId,
      '->',
      targetUserId,
      callId,
    );
  }

  private async handleWebRtcSignal(
    ws: WebSocket,
    attachment: SocketAttachment,
    eventType: 'webrtc_offer' | 'webrtc_answer' | 'ice_candidate',
    conversationId?: string,
    callId?: string,
    targetUserId?: string,
    payload?: unknown,
  ): Promise<void> {
    if (!conversationId || !callId || !targetUserId) {
      this.sendError(ws, 'WebRTC conversation, call id, and target user are required');

      return;
    }

    if (payload === undefined || payload === null) {
      this.sendError(ws, 'WebRTC payload is required');

      return;
    }

    const allowed = await this.getCallParticipants(conversationId, attachment.userId, targetUserId);

    if (!allowed) {
      this.sendError(ws, 'WebRTC participant validation failed');

      return;
    }

    this.broadcastToUser(targetUserId, {
      type: eventType,
      conversationId,
      callId,
      senderId: attachment.userId,
      [eventType === 'ice_candidate' ? 'candidate' : 'sdp']: payload,
    });
  }

  private async handleJoinConversation(
    ws: WebSocket,
    attachment: SocketAttachment,
    conversationId?: string,
  ): Promise<void> {
    if (!conversationId) {
      this.sendError(ws, 'Conversation id is required');

      return;
    }

    const allowed = await this.isUserInConversation(conversationId, attachment.userId);

    if (!allowed) {
      sendSocketEvent(ws, {
        type: 'conversation_access_denied',
        conversationId,
        message: 'User is not a member of this conversation',
      });

      return;
    }

    const conversation = await withMongoDb(this.env.MONGO_URI, async (db) => {
      const currentConversation = await findConversationById(db, new ObjectId(conversationId));

      if (!currentConversation) {
        return null;
      }

      const otherParticipantId = currentConversation.participants
        .map((participant) => participant.toString())
        .find((participantId) => participantId !== attachment.userId);

      if (!otherParticipantId) {
        return null;
      }

      const contactsAllowed = await areUsersContacts(db, attachment.userId, otherParticipantId);

      if (!contactsAllowed) {
        return null;
      }

      return currentConversation;
    });

    if (!conversation) {
      sendSocketEvent(ws, {
        type: 'conversation_access_denied',
        conversationId,
        message: 'Users must be accepted contacts before joining this conversation',
      });

      return;
    }

    if (!attachment.conversationIds.includes(conversationId)) {
      attachment.conversationIds.push(conversationId);
    }

    ws.serializeAttachment(attachment);

    sendSocketEvent(ws, {
      type: 'joined_conversation',
      conversationId,
    });

    console.log('[NexChatRoom] User joined conversation:', attachment.userId, conversationId);
  }

  private handleLeaveConversation(
    ws: WebSocket,
    attachment: SocketAttachment,
    conversationId?: string,
  ): void {
    if (!conversationId) {
      return;
    }

    attachment.conversationIds = attachment.conversationIds.filter((id) => id !== conversationId);

    ws.serializeAttachment(attachment);

    sendSocketEvent(ws, {
      type: 'left_conversation',
      conversationId,
    });

    console.log('[NexChatRoom] User left conversation:', attachment.userId, conversationId);
  }

  private async handleSendMessage(
    ws: WebSocket,
    attachment: SocketAttachment,
    conversationId?: string,
    content?: string,
  ): Promise<void> {
    if (!conversationId) {
      this.sendError(ws, 'Conversation id is required');

      return;
    }

    if (!attachment.conversationIds.includes(conversationId)) {
      this.sendError(ws, 'Join the conversation before sending messages');

      return;
    }

    if (typeof content !== 'string' || !content.trim()) {
      this.sendError(ws, 'Message content is required');

      return;
    }

    const message = await withMongoDb(this.env.MONGO_URI, (db) =>
      createConversationMessage(db, conversationId, attachment.userId, content),
    );

    const deliveredUserIds = this.broadcastToConversationIncludingSender(conversationId, {
      type: 'new_message',
      message,
    });

    deliveredUserIds.delete(attachment.userId);

    if (deliveredUserIds.size > 0) {
      const deliveredMessages = await withMongoDb(this.env.MONGO_URI, (db) =>
        deliverConversationMessages(db, conversationId, attachment.userId),
      );

      if (deliveredMessages.length > 0) {
        const deliveredAt = deliveredMessages[0].deliveredAt;

        this.broadcastToUser(attachment.userId, {
          type: 'message_delivered',
          conversationId,
          messageIds: deliveredMessages.map((item) => item.id),
          deliveredAt,
        });
      }
    }

    console.log('[NexChatRoom] Message created:', message.id);
  }

  private async handleMarkMessagesRead(
    ws: WebSocket,
    attachment: SocketAttachment,
    conversationId?: string,
  ): Promise<void> {
    if (!conversationId) {
      this.sendError(ws, 'Conversation id is required');

      return;
    }

    if (!attachment.memberConversationIds.includes(conversationId)) {
      this.sendError(ws, 'Conversation access denied');

      return;
    }

    const readMessages = await withMongoDb(this.env.MONGO_URI, (db) =>
      readConversationMessages(db, conversationId, attachment.userId),
    );

    if (readMessages.length === 0) {
      return;
    }

    const readAt = readMessages[0].readAt;

    this.broadcastToConversation(
      conversationId,
      {
        type: 'messages_read',
        conversationId,
        messageIds: readMessages.map((item) => item.id),
        readAt,
        readerId: attachment.userId,
      },
      ws,
    );
  }

  private async handleTyping(
    ws: WebSocket,
    attachment: SocketAttachment,
    conversationId: string | undefined,
    eventType: 'user_typing' | 'user_stopped_typing',
  ): Promise<void> {
    if (!conversationId) {
      this.sendError(ws, 'Conversation id is required');

      return;
    }

    if (!attachment.memberConversationIds.includes(conversationId)) {
      this.sendError(ws, 'Conversation access denied');

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

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const attachment = this.getAttachment(ws);

    console.log('[NexChatRoom] WebSocket closed:', attachment?.userId ?? 'unknown', code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('[NexChatRoom] WebSocket error:', error);
  }
}

async function mongoHealth(env: Env): Promise<Response> {
  const client = new MongoClient(env.MONGO_URI);

  try {
    const db = client.db('nexchat');

    await client.connect();

    const result = await db.command({
      ping: 1,
    });

    console.log('[MongoHealth] ping completed');

    const testUser = await db.collection('users').findOne({
      email: 'local-test@nexchat.local',
    });

    console.log('[MongoHealth] email findOne completed:', Boolean(testUser));

    let idUser = null;

    if (testUser?._id) {
      const testId = testUser._id.toString();

      console.log('[MongoHealth] testing ObjectId:', testId);

      idUser = await db.collection('users').findOne({
        _id: new ObjectId(testId),
      });

      console.log('[MongoHealth] ObjectId findOne completed:', Boolean(idUser));
    }

    return Response.json({
      status: 'ok',
      service: 'nexchat-worker',
      mongodb: result.ok === 1 ? 'connected' : 'unknown',
      emailFindOne: Boolean(testUser),
      objectIdFindOne: Boolean(idUser),
    });
  } catch (error) {
    console.error('MongoDB health check failed:', error);

    return Response.json(
      {
        status: 'error',
        mongodb: 'connection_failed',
        error: error instanceof Error ? error.message : String(error),
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      const origin = getCorsOrigin(request);

      if (!origin) {
        return new Response('CORS origin not allowed', {
          status: 403,
        });
      }

      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'nexchat-worker',
        environment: env.ENVIRONMENT,
      });
    }

    if (url.pathname === '/mongo-health') {
      return mongoHealth(env);
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

    if (url.pathname.startsWith('/api/')) {
      try {
        return await withMongoDb(env.MONGO_URI, async (db) => {
          const authResponse = await handleAuthRoute(request, url.pathname, db, env);

          if (authResponse) {
            return withCors(authResponse, request);
          }

          const usersResponse = await handleUsersRoute(request, url.pathname, db, env);

          if (usersResponse) {
            return withCors(usersResponse, request);
          }

          const contactsResponse = await handleContactsRoute(request, url.pathname, db, env);

          if (contactsResponse) {
            return withCors(contactsResponse, request);
          }

          const conversationsResponse = await handleConversationsRoute(
            request,
            url.pathname,
            db,
            env,
          );

          if (conversationsResponse) {
            return withCors(conversationsResponse, request);
          }

          const messagesResponse = await handleMessagesRoute(request, url.pathname, db, env);

          if (messagesResponse) {
            return withCors(messagesResponse, request);
          }

          return withCors(
            Response.json(
              {
                message: 'API route not found',
              },
              {
                status: 404,
              },
            ),
            request,
          );
        });
      } catch (error) {
        console.error('[Worker] API error:', error);

        return withCors(
          Response.json(
            {
              message: 'Internal server error',
            },
            {
              status: 500,
            },
          ),
          request,
        );
      }
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
