// Vercel Serverless Function entry point
// Wraps the Express backend for deployment as a Vercel serverless function

const path = require('path');
const dotenv = require('dotenv');

// Load env vars (Vercel will inject them from the dashboard, but this is a fallback)
dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Import compiled routes from backend/dist
const authRouter = require('../backend/dist/routes/auth').default;
const principalRouter = require('../backend/dist/routes/principal').default;
const hodRouter = require('../backend/dist/routes/hod').default;
const adminRouter = require('../backend/dist/routes/admin').default;
const publicRouter = require('../backend/dist/routes/public').default;

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Event Management System API is running on Vercel.' });
});

// Mount routes under /api
app.use('/api/auth', authRouter);
app.use('/api/principal', principalRouter);
app.use('/api/hod', hodRouter);
app.use('/api/admin', adminRouter);
app.use('/api/public', publicRouter);

// Catch-all for unmatched API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Export for Vercel serverless
module.exports = app;
