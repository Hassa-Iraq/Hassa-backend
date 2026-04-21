import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/index';

let io: SocketServer | null = null;

interface TokenPayload {
  id: string;
  role: string;
  restaurant_id?: string;
  driver_id?: string;
}

export function initSocketServer(httpServer: HttpServer): void {
  io = new SocketServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  });

  io.use((socket: Socket, next: any) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Authentication required'));
      const payload = jwt.verify(token, config.JWT_SECRET) as TokenPayload;
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as TokenPayload;

    // Every user joins their personal room
    socket.join(`user:${user.id}`);

    // Restaurants join their restaurant room
    if (user.role === 'restaurant' && user.restaurant_id) {
      socket.join(`restaurant:${user.restaurant_id}`);
    }

    // Drivers join their driver room
    if (user.role === 'driver' && user.driver_id) {
      socket.join(`driver:${user.driver_id}`);
    }

    console.info(`[Socket] Connected: user:${user.id} role:${user.role}`);

    socket.on('disconnect', () => {
      console.info(`[Socket] Disconnected: user:${user.id}`);
    });
  });

  console.info('[Socket] Socket.io server initialized');
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  io?.to(`user:${userId}`).emit(event, data);
}

export function emitToRestaurant(restaurantId: string, event: string, data: unknown): void {
  io?.to(`restaurant:${restaurantId}`).emit(event, data);
}

export function emitToDriver(driverId: string, event: string, data: unknown): void {
  io?.to(`driver:${driverId}`).emit(event, data);
}
