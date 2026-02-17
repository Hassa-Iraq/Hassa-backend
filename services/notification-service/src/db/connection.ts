import { createDbPool, testConnection, DbConfig } from 'shared/db-connection/index';
import config from '../config/index';

const pool = createDbPool(config as DbConfig);

testConnection(pool).then((connected: boolean) => {
  if (connected) {
    console.log('Database connection established for notification service');
  } else {
    console.error('Failed to establish database connection');
  }
});

export default pool;
