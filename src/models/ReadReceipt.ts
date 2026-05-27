import mongoose, { Document, Schema } from 'mongoose';

export interface IReadReceipt extends Document {
  _id: mongoose.Types.ObjectId;
  messageId: mongoose.Types.ObjectId;
  readerId: mongoose.Types.ObjectId;
  openedAt: Date;
}

const ReadReceiptSchema = new Schema<IReadReceipt>(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      required: true,
      index: true,
    },
    readerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    openedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

ReadReceiptSchema.index({ messageId: 1, readerId: 1 }, { unique: true });

export const ReadReceipt = mongoose.model<IReadReceipt>('ReadReceipt', ReadReceiptSchema);
