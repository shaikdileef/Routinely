import {
  categoryCreateSchema,
  categoryDeleteQuerySchema,
  categoryUpdateSchema,
} from '@planner/shared';
import { Router } from 'express';
import { getAuth, parse, parseId } from '../lib/http.js';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../services/categoryService.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (req, res) => {
  res.json({ data: await listCategories(getAuth(req)) });
});

categoriesRouter.post('/', async (req, res) => {
  res
    .status(201)
    .json({ data: await createCategory(getAuth(req), parse(categoryCreateSchema, req.body)) });
});

categoriesRouter.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'Category');
  res.json({ data: await updateCategory(getAuth(req), id, parse(categoryUpdateSchema, req.body)) });
});

categoriesRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'Category');
  const { reassignTo } = parse(categoryDeleteQuerySchema, req.query);
  res.json({ data: await deleteCategory(getAuth(req), id, reassignTo) });
});
