import { z } from "zod";
import { ASSET_STATUSES } from "../../common/constants";

const isoDate = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const createAssetSchema = z.object({
  assetTag: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(200),
  serialNumber: z.string().trim().max(128).optional(),
  categoryId: z.string().min(1).nullish(),
  location: z.string().trim().max(200).optional(),
  purchasedAt: isoDate.optional(),
  warrantyUntil: isoDate.optional(),
});

export const updateAssetSchema = createAssetSchema.partial().extend({
  status: z.enum(ASSET_STATUSES).optional(),
});

export const assignAssetSchema = z.object({
  userId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});

export const listAssetsQuerySchema = z.object({
  status: z.enum(ASSET_STATUSES).optional(),
  q: z.string().max(200).optional(),
  categoryId: z.string().optional(),
  mine: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateAssetDto = z.infer<typeof createAssetSchema>;
export type UpdateAssetDto = z.infer<typeof updateAssetSchema>;
export type AssignAssetDto = z.infer<typeof assignAssetSchema>;
export type ListAssetsQueryDto = z.infer<typeof listAssetsQuerySchema>;
