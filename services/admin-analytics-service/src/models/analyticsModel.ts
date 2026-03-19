import pool from "../db/connection";

export type AnalyticsFilter = "overall" | "today" | "this_month" | "this_year";

export interface PopularRestaurantRow {
  restaurant_id: string;
  restaurant_name: string;
  logo_url: string | null;
  total_orders: number;
  total_revenue: string | number;
}

export interface PlatformStatistics {
  customers_registered: number;
  restaurants_registered: number;
  delivery_men_registered: number;
}

export interface OrderStatistics {
  delivered: number;
  cancelled: number;
  refunded: number;
  payment_failed: number;
  unassigned: number;
  accepted_by_rider: number;
  cooking_in_restaurants: number;
  picked_up_by_rider: number;
}

export interface TopDeliveryManRow {
  driver_id: string;
  driver_name: string | null;
  email: string | null;
  phone: string | null;
  total_deliveries: number;
  delivered_orders: number;
  failed_or_cancelled_orders: number;
}

export interface TopRestaurantRow {
  restaurant_id: string;
  restaurant_name: string;
  logo_url: string | null;
  delivered_orders: number;
  total_orders: number;
  total_revenue: string | number;
}

export interface TopRatedFoodRow {
  menu_item_id: string;
  menu_item_name: string;
  restaurant_id: string;
  restaurant_name: string;
  rating_score: string | number;
  quantity_sold: number;
  order_items_count: number;
}

export interface TopSellingFoodRow {
  menu_item_id: string;
  menu_item_name: string;
  restaurant_id: string;
  restaurant_name: string;
  quantity_sold: number;
  total_revenue: string | number;
  order_items_count: number;
}

function getFilterStartDate(filter: AnalyticsFilter): Date | null {
  const now = new Date();

  switch (filter) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case "this_month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "this_year":
      return new Date(now.getFullYear(), 0, 1);
    case "overall":
    default:
      return null;
  }
}

function addDateFilter(
  filter: AnalyticsFilter,
  params: unknown[],
  columnName: string
): string {
  const startDate = getFilterStartDate(filter);
  if (!startDate) return "";
  params.push(startDate);
  return ` AND ${columnName} >= $${params.length}`;
}

async function tableExists(schemaName: string, tableName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`${schemaName}.${tableName}`]
  );
  return Boolean(result.rows[0]?.exists);
}

async function countUsersByRole(roleName: string, filter: AnalyticsFilter): Promise<number> {
  const params: unknown[] = [roleName];
  const dateCondition = addDateFilter(filter, params, "u.created_at");

  const result = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM auth.users u
     JOIN auth.roles ar ON ar.id = u.role_id
     WHERE ar.name = $1${dateCondition}`,
    params
  );

  return result.rows[0]?.total ?? 0;
}

async function countRestaurants(filter: AnalyticsFilter): Promise<number> {
  const params: unknown[] = [];
  const dateCondition = addDateFilter(filter, params, "r.created_at");

  const result = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM restaurant.restaurants r
     WHERE r.parent_id IS NULL${dateCondition}`,
    params
  );

  return result.rows[0]?.total ?? 0;
}

async function countOrdersByStatuses(
  statuses: string[],
  filter: AnalyticsFilter
): Promise<number> {
  const params: unknown[] = [statuses];
  const dateCondition = addDateFilter(filter, params, "o.created_at");

  const result = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM orders.orders o
     WHERE o.status = ANY($1::orders.order_status[])${dateCondition}`,
    params
  );

  return result.rows[0]?.total ?? 0;
}

export async function getPopularRestaurants(
  filter: AnalyticsFilter,
  limit: number
): Promise<PopularRestaurantRow[]> {
  const params: unknown[] = [];
  const dateCondition = addDateFilter(filter, params, "o.created_at");
  params.push(limit);

  const result = await pool.query<PopularRestaurantRow>(
    `SELECT
       r.id AS restaurant_id,
       r.name AS restaurant_name,
       r.logo_url,
       COUNT(o.id)::int AS total_orders,
       COALESCE(SUM(o.total_amount), 0) AS total_revenue
     FROM orders.orders o
     JOIN restaurant.restaurants r ON r.id = o.restaurant_id
     WHERE r.parent_id IS NULL${dateCondition}
     GROUP BY r.id, r.name, r.logo_url
     ORDER BY total_orders DESC, total_revenue DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows;
}

export async function getPlatformStatistics(
  filter: AnalyticsFilter
): Promise<PlatformStatistics> {
  const [customers, restaurants, deliveryMen] = await Promise.all([
    countUsersByRole("customer", filter),
    countRestaurants(filter),
    countUsersByRole("driver", filter),
  ]);

  return {
    customers_registered: customers,
    restaurants_registered: restaurants,
    delivery_men_registered: deliveryMen,
  };
}

export async function getCustomersRegistered(filter: AnalyticsFilter): Promise<number> {
  return countUsersByRole("customer", filter);
}

export async function getRestaurantsRegistered(filter: AnalyticsFilter): Promise<number> {
  return countRestaurants(filter);
}

export async function getDeliveryMenRegistered(filter: AnalyticsFilter): Promise<number> {
  return countUsersByRole("driver", filter);
}

export async function getOrderStatistics(filter: AnalyticsFilter): Promise<OrderStatistics> {
  const [delivered, cancelled, cookingInRestaurants] = await Promise.all([
    countOrdersByStatuses(["delivered"], filter),
    countOrdersByStatuses(["cancelled", "rejected"], filter),
    countOrdersByStatuses(["preparing"], filter),
  ]);

  let unassigned = 0;
  let acceptedByRider = 0;
  let pickedUpByRider = 0;

  const hasDeliveriesTable = await tableExists("delivery", "deliveries");
  if (hasDeliveriesTable) {
    const unassignedParams: unknown[] = [];
    const unassignedDateCondition = addDateFilter(filter, unassignedParams, "o.created_at");
    const unassignedResult = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM orders.orders o
       LEFT JOIN delivery.deliveries d ON d.order_id = o.id
       WHERE o.status IN ('confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery')
         AND (d.id IS NULL OR d.status = 'pending_assignment')${unassignedDateCondition}`,
      unassignedParams
    );
    unassigned = unassignedResult.rows[0]?.total ?? 0;

    const deliveryStatusParams: unknown[] = [];
    const deliveryDateCondition = addDateFilter(filter, deliveryStatusParams, "d.created_at");
    const deliveryStatusResult = await pool.query<{
      accepted_by_rider: number;
      picked_up_by_rider: number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE d.status = 'accepted_by_driver')::int AS accepted_by_rider,
         COUNT(*) FILTER (WHERE d.status IN ('picked_up', 'on_the_way'))::int AS picked_up_by_rider
       FROM delivery.deliveries d
       WHERE 1 = 1${deliveryDateCondition}`,
      deliveryStatusParams
    );

    acceptedByRider = deliveryStatusResult.rows[0]?.accepted_by_rider ?? 0;
    pickedUpByRider = deliveryStatusResult.rows[0]?.picked_up_by_rider ?? 0;
  }

  return {
    delivered,
    cancelled,
    refunded: 0,
    payment_failed: 0,
    unassigned,
    accepted_by_rider: acceptedByRider,
    cooking_in_restaurants: cookingInRestaurants,
    picked_up_by_rider: pickedUpByRider,
  };
}

export async function getTopDeliveryMen(
  filter: AnalyticsFilter,
  limit: number
): Promise<TopDeliveryManRow[]> {
  const hasDeliveriesTable = await tableExists("delivery", "deliveries");
  if (!hasDeliveriesTable) return [];

  const params: unknown[] = [];
  const dateCondition = addDateFilter(filter, params, "d.created_at");
  params.push(limit);

  const result = await pool.query<TopDeliveryManRow>(
    `SELECT
       d.driver_user_id AS driver_id,
       u.full_name AS driver_name,
       u.email,
       u.phone,
       COUNT(*)::int AS total_deliveries,
       COUNT(*) FILTER (WHERE d.status = 'delivered')::int AS delivered_orders,
       COUNT(*) FILTER (WHERE d.status IN ('cancelled', 'failed'))::int AS failed_or_cancelled_orders
     FROM delivery.deliveries d
     LEFT JOIN auth.users u ON u.id = d.driver_user_id
     WHERE 1 = 1${dateCondition}
     GROUP BY d.driver_user_id, u.full_name, u.email, u.phone
     ORDER BY delivered_orders DESC, total_deliveries DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows;
}

export async function getTopRestaurants(
  filter: AnalyticsFilter,
  limit: number
): Promise<TopRestaurantRow[]> {
  const params: unknown[] = [];
  const dateCondition = addDateFilter(filter, params, "o.created_at");
  params.push(limit);

  const result = await pool.query<TopRestaurantRow>(
    `SELECT
       r.id AS restaurant_id,
       r.name AS restaurant_name,
       r.logo_url,
       COUNT(o.id) FILTER (WHERE o.status = 'delivered')::int AS delivered_orders,
       COUNT(o.id)::int AS total_orders,
       COALESCE(SUM(o.total_amount), 0) AS total_revenue
     FROM orders.orders o
     JOIN restaurant.restaurants r ON r.id = o.restaurant_id
     WHERE r.parent_id IS NULL${dateCondition}
     GROUP BY r.id, r.name, r.logo_url
     ORDER BY delivered_orders DESC, total_revenue DESC, total_orders DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows;
}

export async function getTopRatedFood(
  filter: AnalyticsFilter,
  limit: number
): Promise<TopRatedFoodRow[]> {
  const params: unknown[] = [];
  const startDate = getFilterStartDate(filter);
  const orderJoinFilter = startDate
    ? ` AND o.created_at >= $${params.push(startDate)}`
    : "";
  params.push(limit);

  const result = await pool.query<TopRatedFoodRow>(
    `SELECT
       mi.id AS menu_item_id,
       mi.name AS menu_item_name,
       r.id AS restaurant_id,
       r.name AS restaurant_name,
       COALESCE((r.additional_data ->> 'rating')::numeric, 0) AS rating_score,
       COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity ELSE 0 END), 0)::int AS quantity_sold,
       COUNT(CASE WHEN o.id IS NOT NULL THEN oi.id END)::int AS order_items_count
     FROM restaurant.menu_items mi
     JOIN restaurant.restaurants r ON r.id = mi.restaurant_id
     LEFT JOIN orders.order_items oi ON oi.menu_item_id = mi.id
     LEFT JOIN orders.orders o ON o.id = oi.order_id${orderJoinFilter}
     WHERE r.parent_id IS NULL
     GROUP BY mi.id, mi.name, r.id, r.name, r.additional_data
     ORDER BY rating_score DESC, quantity_sold DESC, order_items_count DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows;
}

export async function getTopSellingFood(
  filter: AnalyticsFilter,
  limit: number
): Promise<TopSellingFoodRow[]> {
  const params: unknown[] = [];
  const dateCondition = addDateFilter(filter, params, "o.created_at");
  params.push(limit);

  const result = await pool.query<TopSellingFoodRow>(
    `SELECT
       mi.id AS menu_item_id,
       mi.name AS menu_item_name,
       r.id AS restaurant_id,
       r.name AS restaurant_name,
       COALESCE(SUM(oi.quantity), 0)::int AS quantity_sold,
       COALESCE(SUM(oi.line_total), 0) AS total_revenue,
       COUNT(oi.id)::int AS order_items_count
     FROM orders.order_items oi
     JOIN orders.orders o ON o.id = oi.order_id
     JOIN restaurant.menu_items mi ON mi.id = oi.menu_item_id
     JOIN restaurant.restaurants r ON r.id = o.restaurant_id
     WHERE r.parent_id IS NULL
       AND o.status NOT IN ('cancelled', 'rejected')${dateCondition}
     GROUP BY mi.id, mi.name, r.id, r.name
     ORDER BY quantity_sold DESC, total_revenue DESC, order_items_count DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows;
}
