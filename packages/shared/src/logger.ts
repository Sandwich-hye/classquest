/**
 * Structured JSON logging (report 7.9). Secrets are redacted so logs can be
 * centralised safely (report 6: do not expose credentials / internals).
 */
import pino from 'pino';

export function createLogger(name: string): pino.Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: [
        'password',
        'MYSQL_PASSWORD',
        'MYSQL_ROOT_PASSWORD',
        'JWT_SECRET',
        'AWS_SECRET_ACCESS_KEY',
        '*.password',
        'req.headers.authorization',
        'headers.authorization',
        'token',
      ],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = pino.Logger;
