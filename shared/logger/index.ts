import pino from 'pino';

/**
 * Creates a structured JSON logger instance
 */
export function createLogger(serviceName: string, logLevel: string = 'info'): pino.Logger {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const logger = pino({
    level: logLevel,
    base: {
      service: serviceName,
      env: process.env.NODE_ENV || 'development',
    },
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(isDevelopment && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname,service,env',
        },
      },
    }),
  });

  return logger;
}

export { requestLogger } from './request-logger';
export default createLogger;
