const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const prisma = new PrismaClient();

router.post('/', auth, async (req, res) => {
  const { subjectSlug, examType, score, rawScore, timeSpentSec, answers } = req.body;
  try {
    let subject = await prisma.subject.findUnique({ where: { slug: subjectSlug } });
    if (!subject) subject = await prisma.subject.create({ data: { slug: subjectSlug, name: subjectSlug } });

    const attempt = await prisma.examAttempt.create({
      data: {
        userId: req.user.id,
        subjectId: subject.id,
        examType,
        score,
        rawScore,
        timeSpentSec,
        answersJson: JSON.stringify(answers)
      }
    });
    res.status(201).json(attempt);
  } catch {
    res.status(500).json({ error: 'Error al guardar intento' });
  }
});

router.get('/me', auth, async (req, res) => {
  const attempts = await prisma.examAttempt.findMany({
    where: { userId: req.user.id },
    include: { subject: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(attempts);
});

router.get('/me/:slug', auth, async (req, res) => {
  const attempts = await prisma.examAttempt.findMany({
    where: { userId: req.user.id, subject: { slug: req.params.slug } },
    include: { subject: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(attempts);
});

module.exports = router;
