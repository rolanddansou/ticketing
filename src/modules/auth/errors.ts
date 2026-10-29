export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = "HttpError"; }
}
export const unauthorized = () => new HttpError(401, "Authentification requise ou invalide");
