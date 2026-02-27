import pool from "../db/connection";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "rejected";

export interface OrderRow {
  id: string;
  order_number: string;
  user_id: string;
  restaurant_id: string;
  status: OrderStatus;
  subtotal: string;
  delivery_fee: string;
  tax_amount: string;
  discount_amount: string;
  total_amount: string;
  currency: string;
  notes: string | null;
  delivery_address: Record<string, unknown> | null;
  placed_at: Date;
  confirmed_at: Date | null;
  preparing_at: Date | null;
  ready_for_pickup_at: Date | null;
  out_for_delivery_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string;
  item_name: string;
  unit_price: string;
  quantity: number;
  line_total: string;
  special_instructions: string | null;
  created_at: Date;
}

export interface CreateOrderItemInput {
  menu_item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  special_instructions?: string | null;
}

export interface CreateOrderInput {
  user_id: string;
  restaurant_id: string;
  subtotal: number;
  delivery_fee: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  currency?: string;
  notes?: string | null;
  delivery_address?: Record<string, unknown> | null;
  items: CreateOrderItemInput[];
}

export interface OrderWithItems {
  order: OrderRow;
  items: OrderItemRow[];
}

export interface ListOrdersFilters {
  limit: number;
  offset: number;
  user_id?: string;
  restaurant_id?: string;
  restaurant_ids?: string[];
  status?: OrderStatus;
  date_from?: string;
  date_to?: string;
}

function buildWhere(filters: ListOrdersFilters): { where: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filters.user_id) {
    conditions.push(`o.user_id = $${i++}`);
    values.push(filters.user_id);
  }
  if (filters.restaurant_id) {
    conditions.push(`o.restaurant_id = $${i++}`);
    values.push(filters.restaurant_id);
  }
  if (filters.restaurant_ids && filters.restaurant_ids.length > 0) {
    conditions.push(`o.restaurant_id = ANY($${i++})`);
    values.push(filters.restaurant_ids);
  }
  if (filters.status) {
    conditions.push(`o.status = $${i++}`);
    values.push(filters.status);
  }
  if (filters.date_from) {
    conditions.push(`o.created_at >= $${i++}`);
    values.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push(`o.created_at <= $${i++}`);
    values.push(filters.date_to);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

export async function create(input: CreateOrderInput): Promise<OrderWithItems> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const orderResult = await client.query(
      `INSERT INTO orders.orders (
         order_number, user_id, restaurant_id, status, subtotal, delivery_fee, tax_amount, discount_amount, total_amount,
         currency, notes, delivery_address, placed_at
       ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING *`,
      [
        orderNumber,
        input.user_id,
        input.restaurant_id,
        input.subtotal,
        input.delivery_fee,
        input.tax_amount,
        input.discount_amount,
        input.total_amount,
        input.currency ?? "PKR",
        input.notes ?? null,
        input.delivery_address ? JSON.stringify(input.delivery_address) : null,
      ]
    );
    const order = orderResult.rows[0] as OrderRow;

    const itemRows: OrderItemRow[] = [];
    for (const item of input.items) {
      const itemResult = await client.query(
        `INSERT INTO orders.order_items (
           order_id, menu_item_id, item_name, unit_price, quantity, line_total, special_instructions
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          order.id,
          item.menu_item_id,
          item.item_name,
          item.unit_price,
          item.quantity,
          item.line_total,
          item.special_instructions ?? null,
        ]
      );
      itemRows.push(itemResult.rows[0] as OrderItemRow);
    }

    await client.query("COMMIT");
    return { order, items: itemRows };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function findById(id: string): Promise<OrderRow | null> {
  const r = await pool.query("SELECT * FROM orders.orders WHERE id = $1", [id]);
  return (r.rows[0] as OrderRow | undefined) ?? null;
}

export async function findItemsByOrderId(order_id: string): Promise<OrderItemRow[]> {
  const r = await pool.query(
    "SELECT * FROM orders.order_items WHERE order_id = $1 ORDER BY created_at ASC",
    [order_id]
  );
  return r.rows as OrderItemRow[];
}

export async function list(filters: ListOrdersFilters): Promise<OrderRow[]> {
  const where = buildWhere(filters);
  const values = [...where.values, filters.limit, filters.offset];
  const limitPlaceholder = `$${where.values.length + 1}`;
  const offsetPlaceholder = `$${where.values.length + 2}`;

  const r = await pool.query(
    `SELECT o.*
     FROM orders.orders o
     ${where.where}
     ORDER BY o.created_at DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    values
  );
  return r.rows as OrderRow[];
}

export async function count(filters: Omit<ListOrdersFilters, "limit" | "offset">): Promise<number> {
  const where = buildWhere({ ...filters, limit: 1, offset: 0 });
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM orders.orders o
     ${where.where}`,
    where.values
  );
  return r.rows[0]?.total ?? 0;
}

export async function updateStatus(id: string, status: OrderStatus): Promise<OrderRow | null> {
  const statusToTimeColumn: Partial<Record<OrderStatus, string>> = {
    confirmed: "confirmed_at",
    preparing: "preparing_at",
    ready_for_pickup: "ready_for_pickup_at",
    out_for_delivery: "out_for_delivery_at",
    delivered: "delivered_at",
    cancelled: "cancelled_at",
    rejected: "cancelled_at",
  };

  const timeColumn = statusToTimeColumn[status];
  let query = "UPDATE orders.orders SET status = $1";
  const values: unknown[] = [status];
  let idx = 2;

  if (timeColumn) {
    query += `, ${timeColumn} = NOW()`;
  }

  query += ` WHERE id = $${idx} RETURNING *`;
  values.push(id);

  const r = await pool.query(query, values);
  return (r.rows[0] as OrderRow | undefined) ?? null;
}

export function toResponse(order: OrderRow, items: OrderItemRow[]): Record<string, unknown> {
  return {
    id: order.id,
    order_number: order.order_number,
    user_id: order.user_id,
    restaurant_id: order.restaurant_id,
    status: order.status,
    subtotal: parseFloat(order.subtotal),
    delivery_fee: parseFloat(order.delivery_fee),
    tax_amount: parseFloat(order.tax_amount),
    discount_amount: parseFloat(order.discount_amount),
    total_amount: parseFloat(order.total_amount),
    currency: order.currency,
    notes: order.notes,
    delivery_address: order.delivery_address,
    placed_at: order.placed_at,
    confirmed_at: order.confirmed_at,
    preparing_at: order.preparing_at,
    ready_for_pickup_at: order.ready_for_pickup_at,
    out_for_delivery_at: order.out_for_delivery_at,
    delivered_at: order.delivered_at,
    cancelled_at: order.cancelled_at,
    items: items.map((item) => ({
      id: item.id,
      menu_item_id: item.menu_item_id,
      item_name: item.item_name,
      unit_price: parseFloat(item.unit_price),
      quantity: item.quantity,
      line_total: parseFloat(item.line_total),
      special_instructions: item.special_instructions,
    })),
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}
