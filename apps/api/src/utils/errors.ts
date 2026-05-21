export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) {
    super(message);
    this.name = 'AppError';
  }
}

export const BadRequest = (msg: string, code?: string) => new AppError(400, msg, code);
export const Unauthorized = (msg = 'Unauthorized') => new AppError(401, msg);
export const Forbidden = (msg = 'Forbidden') => new AppError(403, msg);
export const NotFound = (msg = 'Not found') => new AppError(404, msg);
export const Conflict = (msg: string) => new AppError(409, msg);
