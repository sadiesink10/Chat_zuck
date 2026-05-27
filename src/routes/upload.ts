import { Router, Response } from 'express';
import path from 'path';
import { authenticate, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { config } from '../config/config';

const router = Router();

// POST /api/upload/image
router.post(
  '/image',
  authenticate,
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'No file uploaded' });
        return;
      }

      const relativePath = path.relative(
        process.cwd(),
        req.file.path
      ).replace(/\\/g, '/');

      res.json({
        url: `/${relativePath}`,
        mimetype: req.file.mimetype,
        size: req.file.size,
        filename: req.file.filename,
      });
    } catch {
      res.status(500).json({ message: 'Upload failed' });
    }
  }
);

// POST /api/upload/voice
router.post(
  '/voice',
  authenticate,
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'No file uploaded' });
        return;
      }

      const relativePath = path.relative(
        process.cwd(),
        req.file.path
      ).replace(/\\/g, '/');

      res.json({
        url: `/${relativePath}`,
        mimetype: req.file.mimetype,
        size: req.file.size,
        filename: req.file.filename,
      });
    } catch {
      res.status(500).json({ message: 'Upload failed' });
    }
  }
);

export default router;
