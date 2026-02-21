import express, { Express } from 'express';
import cors from 'cors';
import { createLogger } from 'shared/logger/index';
import { requestLogger } from 'shared/logger/request-logger';
import config from './config/index';
import healthRoutes from './routes/health';
import notificationRoutes from './routes/notifications';
import errorHandler from './middleware/errorHandler';

const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

const app: Express = express();

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'Content-Range'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  (req as any).logger = logger;
  next();
});

app.use(requestLogger);
app.use('/', healthRoutes);
app.use('/', notificationRoutes);

app.use(errorHandler);

export default app;
