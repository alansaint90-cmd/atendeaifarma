export function origemHttpPermitida(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin !== process.env.AUTH_ORIGIN) return false;
  try { return new URL(origin).host === (request.headers.get("host") ?? new URL(request.url).host); }
  catch { return false; }
}
