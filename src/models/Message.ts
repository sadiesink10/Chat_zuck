import mongoose, { Document, Schema } from 'mongoose';

export type MessageType = 'text' | 'image' | 'voice';
export type MessageStatus = 'sent' | 'delivered' | 'seen';
export type DisappearMode = 'none' | 'on-view' | '24h';

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  content: string;
  type: MessageType;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaDuration?: number; // for voice notes, in seconds
  status: MessageStatus;
  seenAt?: Date;
  disappearMode: DisappearMode;
  expiresAt?: Date;
  isDeletedBySender: boolean;
  isDeletedByReceiver: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['text', 'image', 'voice'],
      default: 'text',
    },
    mediaUrl: {
      type: String,
    },
    mediaMimeType: {
      type: String,
    },
    mediaDuration: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'seen'],
      default: 'sent',
    },
    seenAt: {
      type: Date,
    },
    disappearMode: {
      type: String,
      enum: ['none', 'on-view', '24h'],
      default: 'none',
    },
    expiresAt: {
      type: Date,
      index: { expires: 0 }, // MongoDB TTL index
    },
    isDeletedBySender: {
      type: Boolean,
      default: false,
    },
    isDeletedByReceiver: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient conversation queries
MessageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
MessageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
