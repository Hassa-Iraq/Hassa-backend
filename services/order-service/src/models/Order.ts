import pool from "../db/connection";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

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
  delivery_address_id: string | null;
  delivery_address?: Record<string, unknown> | null;
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

export interface OrderItemSelectedOptionRow {
  id: string;
  order_item_id: string;
  option_id: string;
  group_id: string;
  group_name: string;
  option_name: string;
  additional_price: string;
  created_at: Date;
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
  selected_options?: OrderItemSelectedOptionRow[];
}

export interface OrderCustomerInfo {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  profile_picture_url: string | null;
}

export interface OrderRestaurantInfo {
  id: string;
  name: string | null;
  address: string | null;
  zone: string | null;
  cuisine: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  is_open: boolean | null;
  owner?: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    profile_picture_url: string | null;
  } | null;
}

export interface EnrichedOrderItemRow extends OrderItemRow {
  menu_name: string | null;
  menu_description: string | null;
  menu_image_url: string | null;
  category_id: string | null;
  category_name: string | null;
  subcategory_id: string | null;
  subcategory_name: string | null;
  menu_nutrition: Record<string, unknown> | null;
  menu_search_tags: string[] | null;
  menu_is_available: boolean | null;
}

export interface OrderDetailsRecord {
  order: OrderRow;
  items: EnrichedOrderItemRow[];
  customer: OrderCustomerInfo | null;
  restaurant: OrderRestaurantInfo | null;
}

export interface SelectedOptionSnapshot {
  option_id: string;
  group_id: string;
  group_name: string;
  option_name: string;
  additional_price: number;
}

export interface CreateOrderItemInput {
  menu_item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  special_instructions?: string | null;
  selected_options?: SelectedOptionSnapshot[];
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
  order_type?: string;
  payment_type?: string;
  notes?: string | null;
  delivery_address_id: string | null;
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
  statuses?: OrderStatus[];
  search?: string;
  date_from?: string;
  date_to?: string;
}

export interface ListCustomersFilters {
  limit: number;
  offset: number;
  search?: string;
  restaurant_id?: string;
  restaurant_ids?: string[];
  date_from?: string;
  date_to?: string;
}

export interface CustomerSummaryRow {
  user_id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  profile_picture_url: string | null;
  total_orders: number;
  total_spent: string;
  first_order_at: Date;
  last_order_at: Date;
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
  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(`o.status = ANY($${i++})`);
    values.push(filters.statuses);
  }
  if (filters.search) {
    conditions.push(`o.order_number ILIKE $${i++}`);
    values.push(filters.search);
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

function buildCustomersWhere(filters: ListCustomersFilters): { where: string; values: unknown[] } {
  const conditions: string[] = ["r.name = 'customer'"];
  const values: unknown[] = [];
  let i = 1;

  if (filters.search) {
    conditions.push(`(
      u.id::text ILIKE $${i}
      OR u.email ILIKE $${i}
      OR u.phone ILIKE $${i}
      OR u.full_name ILIKE $${i}
    )`);
    values.push(filters.search);
    i += 1;
  }
  if (filters.restaurant_id) {
    conditions.push(`o.restaurant_id = $${i++}`);
    values.push(filters.restaurant_id);
  }
  if (filters.restaurant_ids && filters.restaurant_ids.length > 0) {
    conditions.push(`o.restaurant_id = ANY($${i++})`);
    values.push(filters.restaurant_ids);
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
    where: `WHERE ${conditions.join(" AND ")}`,
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
         currency, notes, delivery_address_id, placed_at
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
        input.delivery_address_id,
      ]
    );
    const order = mapOrderRow(orderResult.rows[0] as Record<string, unknown>);

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
      const orderItem = itemResult.rows[0] as OrderItemRow;

      const selectedOptionRows: OrderItemSelectedOptionRow[] = [];
      for (const opt of item.selected_options ?? []) {
        const optResult = await client.query(
          `INSERT INTO orders.order_item_selected_options
             (order_item_id, option_id, group_id, group_name, option_name, additional_price)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [orderItem.id, opt.option_id, opt.group_id, opt.group_name, opt.option_name, opt.additional_price]
        );
        selectedOptionRows.push(optResult.rows[0] as OrderItemSelectedOptionRow);
      }
      orderItem.selected_options = selectedOptionRows;
      itemRows.push(orderItem);
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

function mapOrderRow(raw: Record<string, unknown>): OrderRow {
  const did = raw.delivery_address_id;
  const rest = { ...raw };
  delete rest.delivery_address;
  return {
    ...rest,
    delivery_address_id: did != null ? String(did) : null,
  } as OrderRow;
}

export async function findById(id: string): Promise<OrderRow | null> {
  const r = await pool.query("SELECT * FROM orders.orders WHERE id = $1", [id]);
  const raw = r.rows[0];
  return raw ? mapOrderRow(raw as Record<string, unknown>) : null;
}

export async function findItemsByOrderId(order_id: string): Promise<OrderItemRow[]> {
  const r = await pool.query(
    "SELECT * FROM orders.order_items WHERE order_id = $1 ORDER BY created_at ASC",
    [order_id]
  );
  const items = r.rows as OrderItemRow[];
  if (items.length === 0) return items;

  const itemIds = items.map((i) => i.id);
  const optsResult = await pool.query<OrderItemSelectedOptionRow>(
    `SELECT * FROM orders.order_item_selected_options
     WHERE order_item_id = ANY($1::uuid[])
     ORDER BY created_at ASC`,
    [itemIds]
  );
  const optsByItem = new Map<string, OrderItemSelectedOptionRow[]>();
  for (const opt of optsResult.rows) {
    const arr = optsByItem.get(opt.order_item_id) ?? [];
    arr.push(opt);
    optsByItem.set(opt.order_item_id, arr);
  }
  for (const item of items) {
    item.selected_options = optsByItem.get(item.id) ?? [];
  }
  return items;
}

export async function findEnrichedItemsByOrderId(order_id: string): Promise<EnrichedOrderItemRow[]> {
  const result = await pool.query<EnrichedOrderItemRow>(
    `SELECT
       oi.*,
       mi.name AS menu_name,
       mi.description AS menu_description,
       mi.image_url AS menu_image_url,
       c.id AS category_id,
       c.name AS category_name,
       sc.id AS subcategory_id,
       sc.name AS subcategory_name,
       mi.nutrition AS menu_nutrition,
       mi.search_tags AS menu_search_tags,
       mi.is_available AS menu_is_available
     FROM orders.order_items oi
     LEFT JOIN restaurant.menu_items mi ON mi.id = oi.menu_item_id
     LEFT JOIN restaurant.menu_categories c ON c.id = mi.category_id
     LEFT JOIN restaurant.menu_categories sc ON sc.id = mi.subcategory_id
     WHERE oi.order_id = $1
     ORDER BY oi.created_at ASC`,
    [order_id]
  );
  return result.rows;
}

export async function findCustomersByIds(userIds: string[]): Promise<OrderCustomerInfo[]> {
  if (userIds.length === 0) return [];
  const result = await pool.query<OrderCustomerInfo>(
    `SELECT
       id,
       full_name,
       email,
       phone,
       profile_picture_url
     FROM auth.users
     WHERE id = ANY($1::uuid[])`,
    [userIds]
  );
  return result.rows;
}

export async function findRestaurantsByIds(
  restaurantIds: string[]
): Promise<OrderRestaurantInfo[]> {
  if (restaurantIds.length === 0) return [];
  const result = await pool.query<OrderRestaurantInfo>(
    `SELECT
       id,
       name,
       address,
       zone,
       cuisine,
       logo_url,
       cover_image_url,
       is_open
     FROM restaurant.restaurants
     WHERE id = ANY($1::uuid[])`,
    [restaurantIds]
  );
  return result.rows;
}

export async function findDetailsById(id: string): Promise<OrderDetailsRecord | null> {
  const orderResult = await pool.query<
    OrderRow & {
      customer_full_name: string | null;
      customer_email: string | null;
      customer_phone: string | null;
      customer_profile_picture_url: string | null;
      restaurant_owner_id: string | null;
      restaurant_owner_full_name: string | null;
      restaurant_owner_email: string | null;
      restaurant_owner_phone: string | null;
      restaurant_owner_profile_picture_url: string | null;
      restaurant_name: string | null;
      restaurant_address: string | null;
      restaurant_zone: string | null;
      restaurant_cuisine: string | null;
      restaurant_logo_url: string | null;
      restaurant_cover_image_url: string | null;
      restaurant_is_open: boolean | null;
    }
  >(
    `SELECT
       o.*,
       u.full_name AS customer_full_name,
       u.email AS customer_email,
       u.phone AS customer_phone,
       u.profile_picture_url AS customer_profile_picture_url,
       ru.id AS restaurant_owner_id,
       ru.full_name AS restaurant_owner_full_name,
       ru.email AS restaurant_owner_email,
       ru.phone AS restaurant_owner_phone,
       ru.profile_picture_url AS restaurant_owner_profile_picture_url,
       r.name AS restaurant_name,
       r.address AS restaurant_address,
       r.zone AS restaurant_zone,
       r.cuisine AS restaurant_cuisine,
       r.logo_url AS restaurant_logo_url,
       r.cover_image_url AS restaurant_cover_image_url,
       r.is_open AS restaurant_is_open
     FROM orders.orders o
     LEFT JOIN auth.users u ON u.id = o.user_id
     LEFT JOIN restaurant.restaurants r ON r.id = o.restaurant_id
     LEFT JOIN auth.users ru ON ru.id = r.user_id
     WHERE o.id = $1`,
    [id]
  );

  const row = orderResult.rows[0];
  if (!row) return null;

  const items = await findEnrichedItemsByOrderId(id);
  const order: OrderRow = {
    id: row.id,
    order_number: row.order_number,
    user_id: row.user_id,
    restaurant_id: row.restaurant_id,
    status: row.status,
    subtotal: row.subtotal,
    delivery_fee: row.delivery_fee,
    tax_amount: row.tax_amount,
    discount_amount: row.discount_amount,
    total_amount: row.total_amount,
    currency: row.currency,
    notes: row.notes,
    delivery_address_id: row.delivery_address_id != null ? String(row.delivery_address_id) : null,
    placed_at: row.placed_at,
    confirmed_at: row.confirmed_at,
    preparing_at: row.preparing_at,
    ready_for_pickup_at: row.ready_for_pickup_at,
    out_for_delivery_at: row.out_for_delivery_at,
    delivered_at: row.delivered_at,
    cancelled_at: row.cancelled_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const customer: OrderCustomerInfo | null = row.user_id
    ? {
      id: row.user_id,
      full_name: row.customer_full_name,
      email: row.customer_email,
      phone: row.customer_phone,
      profile_picture_url: row.customer_profile_picture_url,
    }
    : null;

  const restaurant: OrderRestaurantInfo | null = row.restaurant_id
    ? {
      id: row.restaurant_id,
      name: row.restaurant_name,
      address: row.restaurant_address,
      zone: row.restaurant_zone,
      cuisine: row.restaurant_cuisine,
      logo_url: row.restaurant_logo_url,
      cover_image_url: row.restaurant_cover_image_url,
      is_open: row.restaurant_is_open,
      owner: row.restaurant_owner_id
        ? {
          id: row.restaurant_owner_id,
          full_name: row.restaurant_owner_full_name,
          email: row.restaurant_owner_email,
          phone: row.restaurant_owner_phone,
          profile_picture_url: row.restaurant_owner_profile_picture_url,
        }
        : null,
    }
    : null;

  return { order, items, customer, restaurant };
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
  return r.rows.map((raw) => mapOrderRow(raw as Record<string, unknown>));
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

export async function listCustomers(filters: ListCustomersFilters): Promise<CustomerSummaryRow[]> {
  const where = buildCustomersWhere(filters);
  const values = [...where.values, filters.limit, filters.offset];
  const limitPlaceholder = `$${where.values.length + 1}`;
  const offsetPlaceholder = `$${where.values.length + 2}`;

  const r = await pool.query(
    `SELECT
       u.id AS user_id,
       u.full_name,
       u.email,
       u.phone,
       u.profile_picture_url,
       COUNT(DISTINCT o.id)::int AS total_orders,
       COALESCE(SUM(o.total_amount), 0)::numeric::text AS total_spent,
       MIN(o.created_at) AS first_order_at,
       MAX(o.created_at) AS last_order_at
     FROM orders.orders o
     JOIN auth.users u ON u.id = o.user_id
     JOIN auth.roles r ON r.id = u.role_id
     ${where.where}
     GROUP BY u.id, u.full_name, u.email, u.phone, u.profile_picture_url
     ORDER BY MAX(o.created_at) DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    values
  );
  return r.rows as CustomerSummaryRow[];
}

export async function countCustomers(filters: Omit<ListCustomersFilters, "limit" | "offset">): Promise<number> {
  const where = buildCustomersWhere({ ...filters, limit: 1, offset: 0 });
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM (
       SELECT o.user_id
       FROM orders.orders o
       JOIN auth.users u ON u.id = o.user_id
       JOIN auth.roles r ON r.id = u.role_id
       ${where.where}
       GROUP BY o.user_id
     ) x`,
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
  };

  const timeColumn = statusToTimeColumn[status];
  let query = "UPDATE orders.orders SET status = $1";
  const values: unknown[] = [status];
  const idx = 2;

  if (timeColumn) {
    query += `, ${timeColumn} = NOW()`;
  }

  query += ` WHERE id = $${idx} RETURNING *`;
  values.push(id);

  const r = await pool.query(query, values);
  const raw = r.rows[0];
  return raw ? mapOrderRow(raw as Record<string, unknown>) : null;
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
    delivery_address_id: order.delivery_address_id ?? null,
    delivery_address: order.delivery_address ?? null,
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
      selected_options: (item.selected_options ?? []).map((opt) => ({
        option_id: opt.option_id,
        group_id: opt.group_id,
        group_name: opt.group_name,
        option_name: opt.option_name,
        additional_price: parseFloat(opt.additional_price),
      })),
    })),
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

export function toDetailsResponse(
  order: OrderRow,
  items: EnrichedOrderItemRow[],
  customer: OrderCustomerInfo | null,
  restaurant: OrderRestaurantInfo | null
): Record<string, unknown> {
  return {
    ...toResponse(order, items),
    customer,
    restaurant,
    items: items.map((item) => ({
      id: item.id,
      menu_item_id: item.menu_item_id,
      item_name: item.item_name,
      unit_price: parseFloat(item.unit_price),
      quantity: item.quantity,
      line_total: parseFloat(item.line_total),
      special_instructions: item.special_instructions,
      selected_options: (item.selected_options ?? []).map((opt) => ({
        option_id: opt.option_id,
        group_id: opt.group_id,
        group_name: opt.group_name,
        option_name: opt.option_name,
        additional_price: parseFloat(opt.additional_price),
      })),
      menu_item: {
        id: item.menu_item_id,
        name: item.menu_name,
        description: item.menu_description,
        image_url: item.menu_image_url,
        category: item.category_id
          ? {
            id: item.category_id,
            name: item.category_name,
          }
          : null,
        subcategory: item.subcategory_id
          ? {
            id: item.subcategory_id,
            name: item.subcategory_name,
          }
          : null,
        nutrition: item.menu_nutrition,
        search_tags: item.menu_search_tags,
        is_available: item.menu_is_available,
      },
    })),
  };
}

export function toResponseWithParties(
  order: OrderRow,
  items: OrderItemRow[],
  customer: OrderCustomerInfo | null,
  restaurant: OrderRestaurantInfo | null
): Record<string, unknown> {
  return {
    ...toResponse(order, items),
    customer,
    restaurant,
  };
}