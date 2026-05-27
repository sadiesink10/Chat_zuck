import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';

import { config } from './config/config';
import { connectDB } from './config/database';
import { registerSocketHandlers } from './socket/handlers';
import { startCleanupService } from './services/cleanupService';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import messageRoutes from './routes/messages';
import uploadRoutes from './routes/upload';

const app = express();
const httpServer = http.createServer(app);

// ─── Socket.IO ──────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: config.clientUrl,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── Middleware ──────────────────────────────────────────────────
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (config.nodeEnv !== 'test') {
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
}

// ─── Static uploads ─────────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), config.uploadDir)));

// ─── API Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);

// ─── Health Check ────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 Handler ─────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ─── Start ───────────────────────────────────────────────────────
const start = async () => {
  await connectDB();
  registerSocketHandlers(io);
  startCleanupService();

  httpServer.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);
    console.log(`🌍 Environment: ${config.nodeEnv}`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
