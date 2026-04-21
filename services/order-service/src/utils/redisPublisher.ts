import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;

function getClient(): RedisClientType {
  if (!client) {
    client = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
      },
    }) as RedisClientType;
    client.on('error', (err) => console.error('[Redis Publisher] error:', err.message));
    client.connect().catch((err) => console.error('[Redis Publisher] connect error:', err.message));
  }
  return client;
}

export function publish(channel: string, payload: object): void {
  try {
    getClient().publish(channel, JSON.stringify(payload)).catch(() => {});
  } catch {
    // fire-and-forget — never throw
  }
}
