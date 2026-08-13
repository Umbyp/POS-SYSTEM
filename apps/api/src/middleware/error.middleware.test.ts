/**
 * The error middleware decides what a caller's mistake looks like. It used to
 * answer 500 for anything it didn't recognise, which sent clients hunting for a
 * server fault (and buried genuine ones in the logs). No DB or app boot needed
 * — the handler is a pure function of the error it's handed.
 */
import { describe, expect, it, vi } from 'vitest';
import { ZodError, z } from 'zod';
import { Prisma } from '@prisma/client';
import { errorMiddleware } from './error.middleware';
import { BadRequest, Conflict, NotFound } from '../utils/errors';

function run(err: unknown) {
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })), json } as any;
  (errorMiddleware as any)(err, {} as any, res, () => {});
  const status = res.status.mock.calls[0]?.[0];
  const body = json.mock.calls[0]?.[0];
  return { status, body };
}

/** What body-parser throws on a malformed JSON request body. */
function malformedJsonError() {
  const err = new SyntaxError('Unexpected token o in JSON at position 1') as SyntaxError & {
    status: number; statusCode: number; type: string; body: string;
  };
  err.status = 400;
  err.statusCode = 400;
  err.type = 'entity.parse.failed';
  err.body = '{oops';
  return err;
}

describe('errorMiddleware', () => {
  it('maps a malformed JSON body to 400, not 500', () => {
    const { status, body } = run(malformedJsonError());
    expect(status).toBe(400);
    expect(body.error).toMatch(/malformed json/i);
  });

  it('keeps the status Express already assigned (e.g. 413 payload too large)', () => {
    const err = Object.assign(new Error('request entity too large'), {
      status: 413,
      type: 'entity.too.large',
    });
    expect(run(err).status).toBe(413);
  });

  it('maps a Prisma validation error (bad enum / shape) to 400', () => {
    const err = new Prisma.PrismaClientValidationError('Invalid value for argument `status`', {
      clientVersion: 'test',
    });
    const { status, body } = run(err);
    expect(status).toBe(400);
    expect(body.error).toMatch(/invalid request data/i);
  });

  it('still reports 500 for a genuine unexpected failure', () => {
    expect(run(new Error('kaboom')).status).toBe(500);
  });

  it('passes through AppError status and code', () => {
    expect(run(BadRequest('nope', 'NOPE'))).toEqual({
      status: 400,
      body: { error: 'nope', code: 'NOPE' },
    });
    expect(run(Conflict('taken', 'PHONE_TAKEN')).status).toBe(409);
    expect(run(NotFound()).status).toBe(404);
  });

  it('reports Zod failures as field details', () => {
    let zerr: ZodError;
    try {
      z.object({ status: z.enum(['PENDING', 'READY']) }).parse({ status: 'NOPE' });
      throw new Error('should not parse');
    } catch (e) {
      zerr = e as ZodError;
    }
    const { status, body } = run(zerr!);
    expect(status).toBe(400);
    expect(body.error).toBe('Validation failed');
    expect(body.details.status).toBeTruthy();
  });

  it('maps a unique-constraint violation to 409', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002', clientVersion: 'test', meta: { target: ['storeId', 'number'] },
    });
    expect(run(err).status).toBe(409);
  });
});
