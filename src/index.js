require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth');
const attemptsRoutes = require('./routes/attempts');
const adminRoutes = require('./routes/admin');
const stripeRoutes = require('./routes/stripe');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = [
  'https://examrobotic.com',
  'https://www.examrobotic.com',
  'https://glowing-selkie-f0a73e.netlify.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/attempts', attemptsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stripe', stripeRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/test-stripe', async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const bal = await stripe.balance.retrieve();
    res.json({ ok: true, currency: bal.available[0]?.currency });
  } catch (e) {
    res.json({ ok: false, error: e.message, type: e.type, code: e.code });
  }
});

app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));
