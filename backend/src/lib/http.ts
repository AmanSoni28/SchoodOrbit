import { z } from 'zod';

export const uuid = z.string().uuid();
export const idParam = z.object({ id: uuid });

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Capped pagination for list endpoints.
export function paging(query: unknown) {
  const { page, pageSize } = pageSchema.parse(query);
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export const meta = (p: { page: number; pageSize: number }, total: number) => ({ page: p.page, pageSize: p.pageSize, total });
