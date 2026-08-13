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

  // The database is unreachable — a paused/sleeping DB, rotated credentials, a
  // pooler at its connection limit. Every request that touches Postgres fails
  // while /health stays green, so as a plain 500 it reads as "the app is broken"
  // and takes a while to trace. Name it instead: 503, and a message that points
  // at the thing to go look at.
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    (err instanceof Prisma.PrismaClientKnownRequestError &&
      ['P1001', 'P1002', 'P1008', 'P1017'].includes(err.code))
  ) {
    const code = (err as { errorCode?: string; code?: string }).errorCode
      ?? (err as { code?: string }).code;
    logger.error({ err, prismaCode: code }, 'Database unreachable');
    return res.status(503).json({
      error: 'ระบบติดต่อฐานข้อมูลไม่ได้ชั่วคราว — กรุณาลองใหม่อีกครั้ง (ถ้ายังไม่หาย ให้ตรวจสถานะฐานข้อมูล)',
      code: 'DB_UNAVAILABLE',
      prismaCode: code,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Unique constraint failed', meta: err.meta });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found' });
    }
    // The deployed code expects a column/table the database doesn't have — the
    // drift MIGRATIONS.md was written about, which last time showed up as
    // unexplained 500s weeks after the fact. Say which migration step is owed.
    if (['P2021', 'P2022'].includes(err.code)) {
      logger.error({ err, meta: err.meta }, 'Database schema is behind the code — run prisma migrate deploy');
      return res.status(503).json({
        error: 'สคีมาฐานข้อมูลไม่ตรงกับเวอร์ชันของโค้ด — ต้องรัน prisma migrate deploy',
        code: 'DB_SCHEMA_DRIFT',
        prismaCode: err.code,
        meta: err.meta,
      });
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
