const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const prisma = new PrismaClient();

const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Espera 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/create-checkout', checkoutLimiter, async (req, res) => {
  const { email, name } = req.body;

  if (!email || !EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Email inválido' });
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)
    return res.status(400).json({ error: 'Nombre inválido' });

  try {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) return res.status(409).json({ error: 'Este email ya tiene una cuenta. Inicia sesión.' });

    const frontendUrl = process.env.FRONTEND_URL || 'https://examrobotic.netlify.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'ExamRobotic – Acceso de por vida',
            description: 'Acceso completo a todos los simulacros y tests del Grado Superior de Robótica y Automatización Industrial.',
          },
          unit_amount: 1000,
        },
        quantity: 1,
      }],
      customer_email: email.toLowerCase().trim(),
      metadata: { name: name.trim(), email: email.toLowerCase().trim() },
      success_url: `${frontendUrl}/index.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/index.html?payment=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('Stripe checkout error:', e.message);
    res.status(500).json({ error: 'Error al crear sesión de pago' });
  }
});

router.post('/complete-registration', checkoutLimiter, async (req, res) => {
  const { sessionId, password } = req.body;

  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 200)
    return res.status(400).json({ error: 'Sesión inválida' });
  if (!password || typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return res.status(400).json({ error: 'Sesión de pago no encontrada' });
  }

  if (session.payment_status !== 'paid')
    return res.status(402).json({ error: 'El pago no se ha completado' });

  const email = (session.metadata?.email || session.customer_email || '').toLowerCase().trim();
  const name = (session.metadata?.name || email).trim();

  if (!email) return res.status(400).json({ error: 'Datos de pago inválidos' });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (!existing.paid) {
        await prisma.user.update({ where: { id: existing.id }, data: { paid: true, paidAt: new Date(), stripeSessionId: sessionId } });
      }
      const token = jwt.sign({ id: existing.id, role: existing.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token, user: { id: existing.id, email: existing.email, name: existing.name, role: existing.role } });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hash, name, role: 'student', paid: true, paidAt: new Date(), stripeSessionId: sessionId },
    });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Email ya registrado. Inicia sesión.' });
    console.error('complete-registration error:', e.message);
    res.status(500).json({ error: 'Error al crear la cuenta' });
  }
});

router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send('Webhook signature invalid');
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    if (s.payment_status === 'paid') {
      const email = (s.metadata?.email || s.customer_email || '').toLowerCase().trim();
      if (email) {
        await prisma.user.updateMany({
          where: { email },
          data: { paid: true, paidAt: new Date() },
        }).catch(() => {});
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;
