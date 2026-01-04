import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'signatureops-web',
    env: process.env.NODE_ENV || 'development',
  },
});

export function createRequestLogger(requestId?: string) {
  const correlationId = requestId || uuidv4();
  return logger.child({ correlationId });
}

export function getCorrelationId(): string {
  return uuidv4();
}

export type Logger = typeof logger;
