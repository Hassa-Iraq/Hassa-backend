import { Response, NextFunction } from 'express';
import { RequestWithLogger } from '../error-handler/index';

/**
 * Request/Response logging middleware
 * Logs incoming requests and outgoing responses with status codes and response times
 */
export function requestLogger(req: RequestWithLogger, res: Response, next: NextFunction): void {
  if (!req.logger) {
    return next();
  }
  const logger = req.logger;
  const startTime = Date.now();
  logger.info(
    {
      method: req.method,
      url: req.url,
      path: req.path,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
    },
    'Incoming request'
  );

  res.on('finish', () => {
    if (!logger) {
      return;
    }

    const duration = Date.now() - startTime;
    const logData: Record<string, unknown> = {
      method: req.method,
      url: req.url,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      durationMs: duration,
      ip: req.ip || req.socket.remoteAddress,
    };

    if (req.user) {
      logData.userId = req.user.id;
      logData.userRole = req.user.role;
    }

    if (res.statusCode >= 500) {
      logger.error(logData, 'Request completed with server error');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'Request completed with client error');
    } else {
      logger.info(logData, 'Request completed successfully');
    }
  });
  next();
}

export default requestLogger;
