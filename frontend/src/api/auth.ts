import { api, ApiError } from "./client";
import type { AuthUser, LoginResponse, MeResponse, Category, Paginated } from "@/types";

export async function login(email: string, password: string): Promise<LoginResponse> {
  const r = await api.post<LoginResponse>("/auth/login", { email, password });
  return r.data;
}

export async function register(email: string, name: string, password: string): Promise<LoginResponse> {
  const r = await api.post<LoginResponse>("/auth/register", { email, name, password });
  return r.data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function fetchMe(): Promise<AuthUser> {
  const r = await api.get<MeResponse>("/auth/me");
  const data = r.data;
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role.name,
    permissions: data.role.permissions.map((p) => p.permission.name),
  };
}

export async function fetchCategories(): Promise<Category[]> {
  const r = await api.get<Category[]>("/categories");
  return r.data;
}

export type { ApiError };
