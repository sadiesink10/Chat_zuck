import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/config';

// Ensure upload directories exist
const imageDir = path.join(config.uploadDir, 'images');
const voiceDir = path.join(config.uploadDir, 'voice');
[imageDir, voiceDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req: Request, file, cb) => {
    const isVoice = file.mimetype.startsWith('audio/');
    cb(null, isVoice ? voiceDir : imageDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedImages = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const allowedAudio = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];

  if ([...allowedImages, ...allowedAudio].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSize,
  },
});
