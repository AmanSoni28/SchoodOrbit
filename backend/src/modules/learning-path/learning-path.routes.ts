import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { learningPath } from './learning-path.service';

const r = Router();

// Students only ever see their own path.
r.get('/learning-path', requireRole('STUDENT'), async (req, res) => {
  res.json({ data: await learningPath(req.user!.id) });
});

export default r;
