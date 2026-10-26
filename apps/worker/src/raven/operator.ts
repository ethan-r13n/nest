import { AppError } from '@nest/domain/errors';
import { z } from 'zod';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const OperatorSchema = z.object({ RAVEN_OPERATOR_KEY: z.string().min(32) });

/** Hosted grants are operator-controlled; a callback relies on its single-use OAuth state instead. */
export function requireRavenOperator(url: string, authorization: string | undefined, env: unknown): void {
  const target = new URL(url);
  if (LOCAL_HOSTS.has(target.hostname)) return;
  const config = OperatorSchema.safeParse(env);
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (target.protocol !== 'https:' || !config.success || !sameToken(token, config.data.RAVEN_OPERATOR_KEY)) {
    throw new AppError('FORBIDDEN', 'Only the operator can connect or inspect the research provider.');
  }
}

export function requireRavenCallbackTransport(url: string): void {
  const target = new URL(url);
  if (!LOCAL_HOSTS.has(target.hostname) && target.protocol !== 'https:') {
    throw new AppError('FORBIDDEN', 'The research provider callback requires a secure connection.');
  }
}

function sameToken(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}
