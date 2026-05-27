import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { config } from '../config/config';

const USERS = [
  {
    username: 'sadiesink16@gmail.com',
    displayName: 'Sadie',
    password: 'ilovesadiesink@0616',
    avatarColor: '#128c7e',
  },
  {
    username: 'ricksanchez06@gmail.com',
    displayName: 'Rick',
    password: 'rickisme@0616',
    avatarColor: '#0284c7',
  },
];

const seed = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('✅ Connected to MongoDB');

    for (const userData of USERS) {
      const existing = await User.findOne({ username: userData.username });
      if (existing) {
        console.log(`⏭️  User "${userData.username}" already exists, skipping`);
        continue;
      }

      const passwordHash = await bcrypt.hash(userData.password, 12);
      await User.create({
        username: userData.username,
        displayName: userData.displayName,
        passwordHash,
        avatarColor: userData.avatarColor,
      });

      console.log(`✅ Created user: ${userData.username}`);
    }

    console.log('\n🎉 Done! Users are ready to log in.');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seed();
