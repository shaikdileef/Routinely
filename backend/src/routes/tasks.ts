import {
  TASK_IMAGE_KINDS,
  taskCreateSchema,
  taskQuerySchema,
  taskRemindersSchema,
  taskUpdateSchema,
  type TaskImageKind,
} from '@planner/shared';
import { Router } from 'express';
import { notFound } from '../lib/errors.js';
import { getAuth, parse, parseId } from '../lib/http.js';
import { IMMUTABLE_CACHE, rawImageBody } from '../lib/images.js';
import { listTaskReminders, setTaskReminders } from '../services/reminderService.js';
import { deleteTaskImage, getTaskImage, setTaskImage } from '../services/taskImageService.js';
import { createTask, deleteTask, getTask, listTasks, updateTask } from '../services/taskService.js';

export const tasksRouter = Router();

function parseImageKind(value: string): TaskImageKind {
  if (!(TASK_IMAGE_KINDS as readonly string[]).includes(value)) throw notFound('Image');
  return value as TaskImageKind;
}

tasksRouter.get('/', async (req, res) => {
  res.json(await listTasks(getAuth(req), parse(taskQuerySchema, req.query)));
});

tasksRouter.post('/', async (req, res) => {
  const { task, created } = await createTask(getAuth(req), parse(taskCreateSchema, req.body));
  res.status(created ? 201 : 200).json({ data: task });
});

tasksRouter.get('/:id', async (req, res) => {
  res.json({ data: await getTask(getAuth(req), parseId(req.params.id, 'Task')) });
});

tasksRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'Task');
  res.json({ data: await updateTask(getAuth(req), id, parse(taskUpdateSchema, req.body)) });
});

tasksRouter.delete('/:id', async (req, res) => {
  await deleteTask(getAuth(req), parseId(req.params.id, 'Task'));
  res.status(204).end();
});

tasksRouter.get('/:id/reminders', async (req, res) => {
  res.json({ data: await listTaskReminders(getAuth(req), parseId(req.params.id, 'Task')) });
});

tasksRouter.put('/:id/reminders', async (req, res) => {
  const id = parseId(req.params.id, 'Task');
  const { reminders } = parse(taskRemindersSchema, req.body);
  res.json({ data: await setTaskReminders(getAuth(req), id, reminders) });
});

tasksRouter.get('/:id/images/:kind', async (req, res) => {
  const id = parseId(req.params.id, 'Task');
  const image = await getTaskImage(getAuth(req), id, parseImageKind(req.params.kind));
  res.setHeader('Cache-Control', IMMUTABLE_CACHE);
  res.type(image.mimeType).send(Buffer.from(image.data));
});

tasksRouter.put('/:id/images/:kind', rawImageBody, async (req, res) => {
  const id = parseId(req.params.id, 'Task');
  const kind = parseImageKind(req.params.kind);
  res.json({ data: await setTaskImage(getAuth(req), id, kind, req.body) });
});

tasksRouter.delete('/:id/images/:kind', async (req, res) => {
  const id = parseId(req.params.id, 'Task');
  const kind = parseImageKind(req.params.kind);
  res.json({ data: await deleteTaskImage(getAuth(req), id, kind) });
});
