import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.flatten().fieldErrors,
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Unique constraint failed', meta: err.meta });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found' });
    }
  }

  // Prisma rejects an unknown enum value / bad shape before it ever reaches the
  // database. That's the caller's mistake, not ours — a 500 here sends the
  // client looking for a server fault and buries a real one in the logs.
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  // Errors raised by Express itself already carry the right status: body-parser
  // marks malformed JSON 400 (entity.parse.failed) and an oversized body 413.
  // Without this they all fell through to 500.
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const parseFailed = (err as { type?: string })?.type === 'entity.parse.failed';
    return res.status(status).json({
      error: parseFailed ? 'Malformed JSON body' : (err as Error).message || 'Bad request',
    });
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
};
