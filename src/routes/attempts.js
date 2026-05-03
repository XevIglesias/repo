const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const prisma = new PrismaClient();

const VALID_SLUGS = new Set(['ip','dt','sdmyr','ii','seneh','iplei','ssp','sdp','adiple']);
const VALID_TYPES = new Set(['real','simulacro']);

router.post('/', auth, async (req, res) => {
  const { subjectSlug, examType, score, rawScore, timeSpentSec, answers } = req.body;

  if (!VALID_SLUGS.has(subjectSlug))
    return res.status(400).json({ error: 'Asignatura inválida' });
  if (!VALID_TYPES.has(examType))
    return res.status(400).json({ error: 'Tipo de examen inválido' });
  if (typeof score !== 'number' || score < 0 || score > 10)
    return res.status(400).json({ error: 'Nota fuera de rango (0-10)' });
  if (typeof rawScore !== 'number' || rawScore < -40 || rawScore > 40)
    return res.status(400).json({ error: 'Puntuación bruta inválida' });
  if (!Number.isInteger(timeSpentSec) || timeSpentSec < 0 || timeSpentSec > 3600)
    return res.status(400).json({ error: 'Tiempo inválido' });
  if (!Array.isArray(answers) || answers.length > 50)
    return res.status(400).json({ error: 'Respuestas inválidas' });
  if (!answers.every(a => a === null || (Number.isInteger(a) && a >= 0 && a <= 3)))
    return res.status(400).json({ error: 'Valor de respuesta fuera de rango' });

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
        answersJson: JSON.stringify(answers),
      },
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
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(attempts);
});

router.get('/me/:slug', auth, async (req, res) => {
  if (!VALID_SLUGS.has(req.params.slug))
    return res.status(400).json({ error: 'Asignatura inválida' });

  const attempts = await prisma.examAttempt.findMany({
    where: { userId: req.user.id, subject: { slug: req.params.slug } },
    include: { subject: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(attempts);
});

module.exports = router;
