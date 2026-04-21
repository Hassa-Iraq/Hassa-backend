import { createClient } from 'redis';
import config from '../config/index';
import * as Notification from '../models/Notification';
import pool from '../db/connection';
import { sendPush } from './firebase';
import { emitToUser, emitToRestaurant, emitToDriver } from './socketServer';

interface OrderPlacedEvent {
  order_id: string;
  order_number: string;
  restaurant_id: string;
  customer_id: string;
  total_amount: number;
}

interface OrderStatusChangedEvent {
  order_id: string;
  order_number: string;
  customer_id: string;
  status: string;
}

interface DriverAssignedEvent {
  order_id: string;
  delivery_id: string;
  customer_id: string;
  driver_user_id: string;
}

interface LocationUpdatedEvent {
  delivery_id: string;
  customer_id: string;
  latitude: number;
  longitude: number;
  bearing?: number;
}

interface DeliveryStatusChangedEvent {
  delivery_id: string;
  order_id: string;
  order_number: string;
  customer_id: string;
  restaurant_id: string;
  restaurant_owner_id: string;
  driver_id: string;
  status: string;
}

interface WalletCreditedEvent {
  user_id: string;
  amount: number;
  new_balance: number;
  note: string;
}

async function notify(params: {
  userId: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, unknown>;
  socketEvent: string;
  socketPayload: unknown;
  skipPush?: boolean;
}) {
  // 1. Persist in inbox
  await Notification.create({
    user_id: params.userId,
    title: params.title,
    body: params.body,
    type: params.type,
    data: params.data,
  }).catch(() => { });

  // 2. Socket — real-time (app in foreground)
  emitToUser(params.userId, params.socketEvent, params.socketPayload);

  // 3. FCM push — app in background / killed
  if (!params.skipPush) {
    const token = await Notification.getUserPushToken(params.userId).catch(() => null);
    if (token) {
      await sendPush({
        token,
        title: params.title,
        body: params.body,
        data: {
          type: params.type, ...Object.fromEntries(
            Object.entries(params.data).map(([k, v]) => [k, String(v)])
          )
        },
      });
    }
  }
}

async function getRestaurantOwnerId(restaurantId: string): Promise<string | null> {
  const r = await pool.query(
    `SELECT user_id FROM restaurant.restaurants WHERE id = $1`,
    [restaurantId]
  );
  return (r.rows[0]?.user_id as string | null) ?? null;
}

async function handleOrderPlaced(raw: string) {
  const e = JSON.parse(raw) as OrderPlacedEvent;

  const ownerId = await getRestaurantOwnerId(e.restaurant_id).catch(() => null);
  if (ownerId) {
    await notify({
      userId: ownerId,
      title: 'New Order Received',
      body: `Order #${e.order_number} — PKR ${e.total_amount}`,
      type: 'order_placed',
      data: { order_id: e.order_id, order_number: e.order_number },
      socketEvent: 'new_order',
      socketPayload: e,
    });
  }

  emitToRestaurant(e.restaurant_id, 'new_order', e);
}

async function handleOrderStatusChanged(raw: string) {
  const e = JSON.parse(raw) as OrderStatusChangedEvent;

  const labels: Record<string, string> = {
    confirmed: 'Order Confirmed',
    preparing: 'Order Being Prepared',
    ready_for_pickup: 'Order Ready for Pickup',
    out_for_delivery: 'Order Out for Delivery',
    delivered: 'Order Delivered',
    cancelled: 'Order Cancelled',
  };

  const title = labels[e.status] ?? 'Order Update';
  const body = `Your order #${e.order_number} is now ${e.status.replace(/_/g, ' ')}.`;

  await notify({
    userId: e.customer_id,
    title,
    body,
    type: 'order_status_changed',
    data: { order_id: e.order_id, order_number: e.order_number, status: e.status },
    socketEvent: 'order_status_changed',
    socketPayload: e,
  });
}

async function handleDriverAssigned(raw: string) {
  const e = JSON.parse(raw) as DriverAssignedEvent;

  await notify({
    userId: e.customer_id,
    title: 'Driver Assigned',
    body: 'A driver has accepted your order and is on the way.',
    type: 'driver_assigned',
    data: { order_id: e.order_id, delivery_id: e.delivery_id },
    socketEvent: 'driver_assigned',
    socketPayload: e,
  });
}

async function handleLocationUpdated(raw: string) {
  const e = JSON.parse(raw) as LocationUpdatedEvent;
  // Socket only — no FCM, no DB persist (high frequency)
  emitToUser(e.customer_id, 'driver_location', {
    delivery_id: e.delivery_id,
    latitude: e.latitude,
    longitude: e.longitude,
    bearing: e.bearing ?? null,
  });
}

async function handleDeliveryStatusChanged(raw: string) {
  const e = JSON.parse(raw) as DeliveryStatusChangedEvent;

  if (e.status === 'delivered') {
    // Notify customer
    await notify({
      userId: e.customer_id,
      title: 'Order Delivered!',
      body: `Your order #${e.order_number} has been delivered. Enjoy!`,
      type: 'order_delivered',
      data: { order_id: e.order_id, order_number: e.order_number },
      socketEvent: 'order_status_changed',
      socketPayload: { ...e, status: 'delivered' },
    });
  }
}

async function handleWalletCredited(raw: string) {
  const e = JSON.parse(raw) as WalletCreditedEvent;

  await notify({
    userId: e.user_id,
    title: 'Wallet Credited',
    body: `PKR ${e.amount} has been added to your wallet. ${e.note}`,
    type: 'wallet_credited',
    data: { amount: e.amount, new_balance: e.new_balance, note: e.note },
    socketEvent: 'wallet_credited',
    socketPayload: e,
  });
}

const HANDLERS: Record<string, (raw: string) => Promise<void>> = {
  'order:placed': handleOrderPlaced,
  'order:status_changed': handleOrderStatusChanged,
  'delivery:driver_assigned': handleDriverAssigned,
  'delivery:location_updated': handleLocationUpdated,
  'delivery:status_changed': handleDeliveryStatusChanged,
  'wallet:credited': handleWalletCredited,
};

export async function startRedisSubscriber(): Promise<void> {
  const subscriber = createClient({
    socket: {
      host: config.REDIS_HOST || 'localhost',
      port: config.REDIS_PORT || 6379,
      reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
    },
  });

  subscriber.on('error', (err) => console.error('[Redis Subscriber] error:', err.message));

  await subscriber.connect();
  console.info('[Redis Subscriber] connected');

  const channels = Object.keys(HANDLERS);
  await subscriber.subscribe(channels, (message, channel) => {
    const handler = HANDLERS[channel];
    if (handler) {
      handler(message).catch((err) =>
        console.error(`[Redis Subscriber] handler error on ${channel}:`, err?.message)
      );
    }
  });

  console.info('[Redis Subscriber] subscribed to:', channels.join(', '));
}
