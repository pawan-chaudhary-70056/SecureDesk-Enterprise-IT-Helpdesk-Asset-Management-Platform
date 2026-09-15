export const API_PREFIX = "api/v1";

export function applyApiPrefix(app: { setGlobalPrefix(prefix: string): void }): void {
  app.setGlobalPrefix(API_PREFIX);
}
