import { dateKeySchema, habitCreateSchema, habitUpdateSchema } from '@planner/shared';
import { Router } from 'express';
import { getAuth, parse, parseId } from '../lib/http.js';
import {
  createHabit,
  deleteHabit,
  getHabit,
  listHabits,
  setHabitCompletion,
  updateHabit,
} from '../services/habitService.js';

export const habitsRouter = Router();

habitsRouter.get('/', async (req, res) => {
  res.json({ data: await listHabits(getAuth(req)) });
});

habitsRouter.post('/', async (req, res) => {
  res
    .status(201)
    .json({ data: await createHabit(getAuth(req), parse(habitCreateSchema, req.body)) });
});

habitsRouter.get('/:id', async (req, res) => {
  res.json({ data: await getHabit(getAuth(req), parseId(req.params.id, 'Habit')) });
});

habitsRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'Habit');
  res.json({ data: await updateHabit(getAuth(req), id, parse(habitUpdateSchema, req.body)) });
});

habitsRouter.delete('/:id', async (req, res) => {
  await deleteHabit(getAuth(req), parseId(req.params.id, 'Habit'));
  res.status(204).end();
});

habitsRouter.put('/:id/completions/:date', async (req, res) => {
  const id = parseId(req.params.id, 'Habit');
  const date = parse(dateKeySchema, req.params.date);
  res.json({ data: await setHabitCompletion(getAuth(req), id, date, true) });
});

habitsRouter.delete('/:id/completions/:date', async (req, res) => {
  const id = parseId(req.params.id, 'Habit');
  const date = parse(dateKeySchema, req.params.date);
  res.json({ data: await setHabitCompletion(getAuth(req), id, date, false) });
});
