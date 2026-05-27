import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { Message } from '../models/Message';
import { ReadReceipt } from '../models/ReadReceipt';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/messages/:userId — get conversation with a user
router.get('/:userId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId: otherUserId } = req.params;
    const myId = req.userId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: otherUserId, isDeletedBySender: false },
        { senderId: otherUserId, receiverId: myId, isDeletedByReceiver: false },
      ],
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Reverse to chronological order
    messages.reverse();

    res.json({ messages, page, limit });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/messages/seen — mark multiple messages as seen
router.patch('/seen/batch', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { messageIds } = req.body as { messageIds: string[] };
    const myId = req.userId!;
    const now = new Date();

    if (!messageIds?.length) {
      res.status(400).json({ message: 'messageIds required' });
      return;
    }

    // Only mark as seen if I am the receiver
    const result = await Message.updateMany(
      {
        _id: { $in: messageIds },
        receiverId: myId,
        status: { $ne: 'seen' },
      },
      {
        $set: { status: 'seen', seenAt: now },
      }
    );

    // Create read receipts
    const receipts = messageIds.map((msgId) => ({
      messageId: new mongoose.Types.ObjectId(msgId),
      readerId: new mongoose.Types.ObjectId(myId),
      openedAt: now,
    }));

    await ReadReceipt.insertMany(receipts, { ordered: false }).catch(() => {
      // Ignore duplicate key errors
    });

    res.json({ updated: result.modifiedCount, seenAt: now });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/messages/:id/seen
router.patch('/:id/seen', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const myId = req.userId!;
    const now = new Date();

    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, receiverId: myId, status: { $ne: 'seen' } },
      { $set: { status: 'seen', seenAt: now } },
      { new: true }
    );

    if (!message) {
      res.status(404).json({ message: 'Message not found or already seen' });
      return;
    }

    await ReadReceipt.findOneAndUpdate(
      { messageId: message._id, readerId: myId },
      { openedAt: now },
      { upsert: true }
    );

    res.json({ message, seenAt: now });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/messages/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const myId = req.userId!;
    const message = await Message.findById(req.params.id);

    if (!message) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }

    const isSender = message.senderId.toString() === myId;
    const isReceiver = message.receiverId.toString() === myId;

    if (!isSender && !isReceiver) {
      res.status(403).json({ message: 'Not authorized' });
      return;
    }

    if (isSender) {
      message.isDeletedBySender = true;
    }
    if (isReceiver) {
      message.isDeletedByReceiver = true;
    }

    // If both deleted, remove from DB entirely
    if (message.isDeletedBySender && message.isDeletedByReceiver) {
      await message.deleteOne();
    } else {
      await message.save();
    }

    res.json({ message: 'Message deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/:userId/search
router.get('/:userId/search', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId: otherUserId } = req.params;
    const { q } = req.query as { q: string };
    const myId = req.userId!;

    if (!q || q.trim().length < 1) {
      res.status(400).json({ message: 'Search query required' });
      return;
    }

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: myId },
      ],
      type: 'text',
      content: { $regex: q.trim(), $options: 'i' },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ messages });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
