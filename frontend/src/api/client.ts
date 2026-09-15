import axios, { AxiosError } from "axios";
import type { ApiErrorBody } from "@/types";

/**
 * Typed API client.
 * - Base URL defaults to same-origin "/api" (Vite dev proxy / nginx in prod).
 * - Bearer access token kept in memory only; refresh token lives in an
 *   httpOnly cookie scoped to /api/v1/auth.
 * - Single-flight refresh: concurrent 401s wait for one refresh call.
 *   Refresh failures force a hard redirect to /login (no infinite loops).
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function createClient(): ReturnType<typeof axios.create> {
  const baseURL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1";

  const api = axios.create({
    baseURL,
    timeout: 15000,
    withCredentials: true,
  });

  let accessToken: string | null = null;
  let refreshPromise: Promise<string> | null = null;

  api.interceptors.request.use((config) => {
    if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
    return config;
  });

  const isAuthRefreshCall = (config?: { url?: string }) => config?.url?.includes("/auth/refresh");

  api.interceptors.response.use(
    (res) => res,
    async (error: AxiosError<ApiErrorBody>) => {
      const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
      const status = error.response?.status;

      if (status === 401 && original && !original._retry && !isAuthRefreshCall(original)) {
        original._retry = true;
        try {
          accessToken = await getNewAccessToken();
          original.headers.Authorization = `Bearer ${accessToken}`;
          return api(original);
        } catch {
          // refresh failed — force re-login, but never from /login itself:
          // /auth/me 401s there on every mount, so a redirect would reload the
          // page, re-run this interceptor, and loop the browser into
          // ERR_INSUFFICIENT_RESOURCES.
          if (!window.location.pathname.startsWith("/login")) {
            window.location.assign("/login");
          }
          return Promise.reject(normalize(error));
        }
      }
      return Promise.reject(normalize(error));
    },
  );

  function normalize(error: AxiosError<ApiErrorBody>): ApiError {
    const body = error.response?.data;
    if (body?.error) {
      return new ApiError(error.response!.status, body.error.code, body.error.message, body.error.requestId, body);
    }
    if (error.code === "ECONNABORTED") {
      return new ApiError(0, "TIMEOUT", "The server took too long to respond");
    }
    return new ApiError(error.response?.status ?? 0, "NETWORK_ERROR", error.message || "Network error");
  }

  async function getNewAccessToken(): Promise<string> {
    if (!refreshPromise) {
      refreshPromise = axios
        .post(`${baseURL}/auth/refresh`, {}, { withCredentials: true, timeout: 15000 })
        .then((r) => {
          const token = (r.data as { accessToken?: string }).accessToken;
          if (!token) throw new Error("no token in refresh response");
          setAccessToken(token);
          return token;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

  function setAccessToken(token: string | null): void {
    accessToken = token;
  }

  return api;
}

export const api = createClient();
