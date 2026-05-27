import { Router, Response } from 'express';
import { User } from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/users — get all other users
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } })
      .select('-passwordHash')
      .sort({ displayName: 1 });

    res.json({ users });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash');
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.json({ user });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
