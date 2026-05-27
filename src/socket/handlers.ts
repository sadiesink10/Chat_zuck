import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { User } from '../models/User';
import { Message, DisappearMode } from '../models/Message';
import { ReadReceipt } from '../models/ReadReceipt';

interface JwtPayload {
  userId: string;
  username: string;
}

// Track connected sockets: userId -> Set<socketId>
const connectedUsers = new Map<string, Set<string>>();

const getUserRoom = (userId: string) => `user:${userId}`;

const isUserOnline = (userId: string) => {
  const sockets = connectedUsers.get(userId);
  return sockets ? sockets.size > 0 : false;
};

export const registerSocketHandlers = (io: Server): void => {
  // Middleware: authenticate socket connections
  io.use(async (socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
      const user = await User.findById(decoded.userId).select('-passwordHash');

      if (!user) {
        return next(new Error('User not found'));
      }

      (socket as any).userId = decoded.userId;
      (socket as any).username = decoded.username;
      (socket as any).user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = (socket as any).userId as string;
    const user = (socket as any).user;

    console.log(`🔌 Socket connected: ${user.username} (${socket.id})`);

    // Track connection
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId)!.add(socket.id);

    // Join personal room
    socket.join(getUserRoom(userId));

    // Update DB: online
    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });

    // Notify all others that this user is online
    socket.broadcast.emit('user-status', {
      userId,
      isOnline: true,
      lastSeen: new Date(),
    });

    // Deliver pending messages (status: sent -> delivered)
    const pendingMessages = await Message.find({
      receiverId: userId,
      status: 'sent',
    });

    if (pendingMessages.length > 0) {
      await Message.updateMany(
        { receiverId: userId, status: 'sent' },
        { $set: { status: 'delivered' } }
      );

      // Notify senders
      for (const msg of pendingMessages) {
        io.to(getUserRoom(msg.senderId.toString())).emit('message-status-update', {
          messageId: msg._id.toString(),
          status: 'delivered',
        });
      }
    }

    // ─── SEND MESSAGE ───────────────────────────────────────────
    socket.on(
      'send-message',
      async (data: {
        tempId: string;
        receiverId: string;
        content: string;
        type: 'text' | 'image' | 'voice';
        mediaUrl?: string;
        mediaMimeType?: string;
        mediaDuration?: number;
        disappearMode?: DisappearMode;
      }) => {
        try {
          const { tempId, receiverId, content, type, mediaUrl, mediaMimeType, mediaDuration, disappearMode = 'none' } = data;

          let expiresAt: Date | undefined;
          if (disappearMode === '24h') {
            expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          }

          const isReceiverOnline = isUserOnline(receiverId);
          const initialStatus = isReceiverOnline ? 'delivered' : 'sent';

          const message = await Message.create({
            senderId: userId,
            receiverId,
            content,
            type,
            mediaUrl,
            mediaMimeType,
            mediaDuration,
            status: initialStatus,
            disappearMode,
            expiresAt,
          });

          const messageData = {
            ...message.toObject(),
            _id: message._id.toString(),
            tempId,
          };

          // Confirm to sender
          socket.emit('message-sent', messageData);

          // Deliver to receiver's room
          io.to(getUserRoom(receiverId)).emit('new-message', messageData);

          // If receiver is online, they got it as "delivered"
          if (isReceiverOnline) {
            socket.emit('message-status-update', {
              messageId: message._id.toString(),
              status: 'delivered',
            });
          }
        } catch (err) {
          console.error('send-message error:', err);
          socket.emit('message-error', { tempId: data.tempId, error: 'Failed to send message' });
        }
      }
    );

    // ─── TYPING INDICATORS ──────────────────────────────────────
    socket.on('typing-start', (data: { receiverId: string }) => {
      io.to(getUserRoom(data.receiverId)).emit('user-typing', {
        userId,
        username: (socket as any).username,
      });
    });

    socket.on('typing-stop', (data: { receiverId: string }) => {
      io.to(getUserRoom(data.receiverId)).emit('user-stop-typing', { userId });
    });

    // ─── READ RECEIPTS ───────────────────────────────────────────
    socket.on(
      'messages-seen',
      async (data: { messageIds: string[]; senderId: string }) => {
        try {
          const { messageIds, senderId } = data;
          const now = new Date();

          await Message.updateMany(
            {
              _id: { $in: messageIds },
              receiverId: userId,
              status: { $ne: 'seen' },
            },
            { $set: { status: 'seen', seenAt: now } }
          );

          const receipts = messageIds.map((msgId) => ({
            messageId: msgId,
            readerId: userId,
            openedAt: now,
          }));

          await ReadReceipt.insertMany(receipts, { ordered: false }).catch(() => {});

          // Notify sender
          io.to(getUserRoom(senderId)).emit('messages-seen-update', {
            messageIds,
            seenAt: now,
            seenBy: userId,
          });

          // Handle on-view disappearing messages: delete after 5 seconds
          const onViewMessages = await Message.find({
            _id: { $in: messageIds },
            disappearMode: 'on-view',
            status: 'seen',
          });

          if (onViewMessages.length > 0) {
            const onViewIds = onViewMessages.map((m) => m._id.toString());
            setTimeout(async () => {
              await Message.deleteMany({ _id: { $in: onViewIds } });
              io.to(getUserRoom(senderId)).emit('messages-deleted', { messageIds: onViewIds });
              io.to(getUserRoom(userId)).emit('messages-deleted', { messageIds: onViewIds });
            }, 5000);
          }
        } catch (err) {
          console.error('messages-seen error:', err);
        }
      }
    );

    // ─── DELETE MESSAGE ──────────────────────────────────────────
    socket.on('delete-message', async (data: { messageId: string; receiverId: string }) => {
      try {
        const { messageId, receiverId } = data;
        const message = await Message.findById(messageId);

        if (!message) return;
        if (message.senderId.toString() !== userId) return;

        message.isDeletedBySender = true;
        if (message.isDeletedByReceiver) {
          await message.deleteOne();
        } else {
          await message.save();
        }

        socket.emit('message-deleted', { messageId });
        io.to(getUserRoom(receiverId)).emit('message-deleted', { messageId });
      } catch (err) {
        console.error('delete-message error:', err);
      }
    });

    // ─── DISCONNECT ──────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${user.username} (${socket.id})`);

      const userSockets = connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedUsers.delete(userId);
          const lastSeen = new Date();
          await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen });
          socket.broadcast.emit('user-status', {
            userId,
            isOnline: false,
            lastSeen,
          });
        }
      }
    });
  });
};
