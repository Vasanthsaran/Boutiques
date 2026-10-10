export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Please sign in to continue.') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'You do not have permission to do that.') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Not found.') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string, code = 'CONFLICT') => new HttpError(409, msg, code);
