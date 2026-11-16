import type { Response } from "express";

export function sendApiError(res: Response, status: number, message: string, issues?: { path: string; message: string }[]) {
  const codes: Record<number, string> = {
    400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND",
    409: "CONFLICT", 413: "PAYLOAD_TOO_LARGE", 415: "UNSUPPORTED_MEDIA_TYPE",
    422: "UNPROCESSABLE_ENTITY", 429: "RATE_LIMITED", 503: "SERVICE_UNAVAILABLE",
  };
  const code = codes[status] ?? (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_REJECTED");
  res.status(status).json({ error: { code, message, issues } });
}
