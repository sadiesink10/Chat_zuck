import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { Session } from '../models/Session';
import { authenticate, generateTokens, verifyRefreshToken, AuthRequest } from '../middleware/auth';
import { config } from '../config/config';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ message: 'Username and password are required' });
      return;
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(
      user._id.toString(),
      user.username
    );

    // Hash refresh token before storing
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    // Revoke old sessions for this user (keep it to 1 session per user)
    await Session.deleteMany({ userId: user._id });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await Session.create({
      userId: user._id,
      refreshTokenHash,
      deviceInfo: req.headers['user-agent'] || 'Unknown',
      ipAddress: req.ip || '',
      expiresAt,
    });

    // Update online status
    await User.findByIdAndUpdate(user._id, { isOnline: true, lastSeen: new Date() });

    res.cookie('accessToken', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 1000, // 1 hour
    });
    res.cookie('refreshToken', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      accessToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken || req.body.refreshToken;

    if (!token) {
      res.status(401).json({ message: 'Refresh token required' });
      return;
    }

    const decoded = verifyRefreshToken(token);
    const sessions = await Session.find({ userId: decoded.userId, isRevoked: false });

    let validSession = null;
    for (const session of sessions) {
      const matches = await bcrypt.compare(token, session.refreshTokenHash);
      if (matches) {
        validSession = session;
        break;
      }
    }

    if (!validSession) {
      res.status(401).json({ message: 'Invalid or expired session' });
      return;
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(
      user._id.toString(),
      user.username
    );

    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await Session.findByIdAndUpdate(validSession._id, {
      refreshTokenHash: newRefreshTokenHash,
      expiresAt,
    });

    res.cookie('accessToken', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 1000,
    });
    res.cookie('refreshToken', newRefreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken, user: user.toJSON() });
  } catch {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Session.deleteMany({ userId: req.userId });
    await User.findByIdAndUpdate(req.userId, { isOnline: false, lastSeen: new Date() });

    res.clearCookie('accessToken', COOKIE_OPTIONS);
    res.clearCookie('refreshToken', COOKIE_OPTIONS);

    res.json({ message: 'Logged out successfully' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ user: req.user?.toJSON() });
});

export default router;
