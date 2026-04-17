import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import path from 'path';
import fs from 'fs';

// Import routers
import authRouter from './routes/auth';
import principalRouter from './routes/principal';
import hodRouter from './routes/hod';
import adminRouter from './routes/admin';
import publicRouter from './routes/public';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Event Management System API is running.' });
});

app.use('/api/auth', authRouter);
app.use('/api/principal', principalRouter);
app.use('/api/hod', hodRouter);
app.use('/api/admin', adminRouter);
app.use('/api/public', publicRouter);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
