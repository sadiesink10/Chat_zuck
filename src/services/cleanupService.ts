import cron from 'node-cron';
import { Message } from '../models/Message';

export const startCleanupService = (): void => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      // Delete 24h disappearing messages that have expired
      // (MongoDB TTL handles expiresAt, but this is a fallback)
      const expired24h = await Message.deleteMany({
        disappearMode: '24h',
        expiresAt: { $lt: now },
      });

      // Delete on-view disappearing messages that have been seen > 5 seconds ago
      const fiveSecondsAgo = new Date(now.getTime() - 5000);
      const expiredOnView = await Message.deleteMany({
        disappearMode: 'on-view',
        status: 'seen',
        seenAt: { $lt: fiveSecondsAgo },
      });

      if (expired24h.deletedCount > 0 || expiredOnView.deletedCount > 0) {
        console.log(
          `🗑️ Cleanup: removed ${expired24h.deletedCount} 24h messages, ${expiredOnView.deletedCount} on-view messages`
        );
      }
    } catch (error) {
      console.error('Cleanup service error:', error);
    }
  });

  console.log('🧹 Message cleanup service started');
};
