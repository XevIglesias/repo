const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const prisma = new PrismaClient();

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso restringido' });
  next();
}

router.get('/stats', auth, adminOnly, async (req, res) => {
  const [totalUsers, totalAttempts, bySubject] = await Promise.all([
    prisma.user.count(),
    prisma.examAttempt.count(),
    prisma.examAttempt.groupBy({
      by: ['subjectId'],
      _avg: { score: true },
      _count: true
    })
  ]);
  res.json({ totalUsers, totalAttempts, bySubject });
});

router.get('/users', auth, adminOnly, async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(users);
});

module.exports = router;
