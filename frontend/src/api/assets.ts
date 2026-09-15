import { api } from "./client";
import type { Asset, AssetDetail, Paginated } from "@/types";

export interface AssetListParams {
  status?: string;
  q?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchAssets(params: AssetListParams = {}): Promise<Paginated<Asset>> {
  const r = await api.get<Paginated<Asset>>("/assets", { params });
  return r.data;
}

export async function fetchAsset(id: string): Promise<AssetDetail> {
  const r = await api.get<AssetDetail>(`/assets/${id}`);
  return r.data;
}

export async function createAsset(dto: {
  assetTag: string;
  name: string;
  serialNumber?: string;
  categoryId?: string | null;
  location?: string;
}): Promise<Asset> {
  const r = await api.post<Asset>("/assets", dto);
  return r.data;
}

export async function assignAsset(id: string, userId: string, notes?: string): Promise<Asset> {
  const r = await api.post<Asset>(`/assets/${id}/assign`, { userId, ...(notes ? { notes } : {}) });
  return r.data;
}

export async function returnAsset(id: string): Promise<Asset> {
  const r = await api.post<Asset>(`/assets/${id}/return`);
  return r.data;
}

export async function startMaintenance(id: string): Promise<Asset> {
  const r = await api.post<Asset>(`/assets/${id}/maintenance`);
  return r.data;
}

export async function endMaintenance(id: string): Promise<Asset> {
  const r = await api.post<Asset>(`/assets/${id}/maintenance/end`);
  return r.data;
}

export async function retireAsset(id: string): Promise<Asset> {
  const r = await api.post<Asset>(`/assets/${id}/retire`);
  return r.data;
}
