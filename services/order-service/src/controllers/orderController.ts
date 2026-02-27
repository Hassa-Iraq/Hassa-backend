import { Response } from "express";
import config from "../config/index";
import * as Order from "../models/Order";
import { AuthRequest } from "../middleware/auth";

interface IncomingOrderItem {
  menu_item_id?: string;
  quantity?: number;
  special_instructions?: string | null;
}

interface MenuItemInfo {
  id: string;
  name: string;
  price: number;
}

const ALLOWED_NEXT_STATUSES: Record<Order.OrderStatus, Order.OrderStatus[]> = {
  pending: ["confirmed", "rejected", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
  rejected: [],
};

function parseMoney(value: unknown, defaultValue = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return defaultValue;
}

async function fetchRestaurantMenu(restaurantId: string): Promise<Map<string, MenuItemInfo>> {
  const restaurantServiceUrl = config.RESTAURANT_SERVICE_URL || "http://restaurant-service:3002";
  const response = await fetch(`${restaurantServiceUrl}/discover/restaurants/${restaurantId}/menu`);
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: {
      categories?: Array<{ items?: Array<{ id: string; name: string; price: number | string }> }>;
      uncategorizedItems?: Array<{ id: string; name: string; price: number | string }>;
    };
  };

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || "Restaurant menu not available");
  }

  const map = new Map<string, MenuItemInfo>();
  for (const category of json.data.categories ?? []) {
    for (const item of category.items ?? []) {
      map.set(item.id, {
        id: item.id,
        name: item.name,
        price: parseMoney(item.price),
      });
    }
  }
  for (const item of json.data.uncategorizedItems ?? []) {
    map.set(item.id, {
      id: item.id,
      name: item.name,
      price: parseMoney(item.price),
    });
  }
  return map;
}

async function getOwnedRestaurantIds(authHeader: string): Promise<string[]> {
  const restaurantServiceUrl = config.RESTAURANT_SERVICE_URL || "http://restaurant-service:3002";
  const response = await fetch(`${restaurantServiceUrl}/?page=1&limit=200`, {
    method: "GET",
    headers: {
      Authorization: authHeader,
    },
  });
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: { restaurants?: Array<{ id: string }> };
  };
  if (!response.ok || !json.success) return [];
  return (json.data?.restaurants ?? []).map((r) => r.id);
}

async function ensureOrderAccess(req: AuthRequest, res: Response, orderId: string): Promise<Order.OrderRow | null> {
  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404).json({
      success: false,
      status: "ERROR",
      message: "Order not found",
      data: null,
    });
    return null;
  }

  const role = req.user?.role;
  if (role === "admin") return order;

  if (role === "customer" && order.user_id !== req.user?.id) {
    res.status(403).json({
      success: false,
      status: "ERROR",
      message: "You do not have permission to access this order",
      data: null,
    });
    return null;
  }

  if (role === "restaurant") {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authorization header missing",
        data: null,
      });
      return null;
    }
    const ownedRestaurantIds = await getOwnedRestaurantIds(authHeader);
    if (!ownedRestaurantIds.includes(order.restaurant_id)) {
      res.status(403).json({
        success: false,
        status: "ERROR",
        message: "You do not have permission to access this order",
        data: null,
      });
      return null;
    }
  }

  return order;
}

export async function createOrder(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const restaurantId = body.restaurant_id;
    const incomingItems = body.items as IncomingOrderItem[] | undefined;

    if (!restaurantId || typeof restaurantId !== "string") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "restaurant_id is required",
        data: null,
      });
      return;
    }
    if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "items must be a non-empty array",
        data: null,
      });
      return;
    }

    const menuMap = await fetchRestaurantMenu(restaurantId);
    if (menuMap.size === 0) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Restaurant has no available menu items",
        data: null,
      });
      return;
    }

    const items: Order.CreateOrderItemInput[] = [];
    let subtotal = 0;
    for (const incomingItem of incomingItems) {
      const menuItemId = incomingItem.menu_item_id;
      const quantity = incomingItem.quantity;
      if (!menuItemId || typeof menuItemId !== "string" || !quantity || quantity < 1) {
        res.status(400).json({
          success: false,
          status: "ERROR",
          message: "Each item requires valid menu_item_id and quantity",
          data: null,
        });
        return;
      }
      const menuItem = menuMap.get(menuItemId);
      if (!menuItem) {
        res.status(400).json({
          success: false,
          status: "ERROR",
          message: `Menu item not available: ${menuItemId}`,
          data: null,
        });
        return;
      }
      const lineTotal = Number((menuItem.price * quantity).toFixed(2));
      subtotal += lineTotal;
      items.push({
        menu_item_id: menuItem.id,
        item_name: menuItem.name,
        unit_price: menuItem.price,
        quantity,
        line_total: lineTotal,
        special_instructions:
          typeof incomingItem.special_instructions === "string"
            ? incomingItem.special_instructions
            : null,
      });
    }

    const deliveryFee = parseMoney(body.delivery_fee);
    const taxAmount = parseMoney(body.tax_amount);
    const discountAmount = parseMoney(body.discount_amount);
    const totalAmount = Number((subtotal + deliveryFee + taxAmount - discountAmount).toFixed(2));
    if (totalAmount < 0) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Total amount cannot be negative",
        data: null,
      });
      return;
    }

    const created = await Order.create({
      user_id: req.user!.id,
      restaurant_id: restaurantId,
      subtotal: Number(subtotal.toFixed(2)),
      delivery_fee: deliveryFee,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      currency: typeof body.currency === "string" && body.currency.trim() ? body.currency.trim() : "PKR",
      notes: typeof body.notes === "string" ? body.notes : null,
      delivery_address:
        typeof body.delivery_address === "object" && body.delivery_address != null
          ? (body.delivery_address as Record<string, unknown>)
          : null,
      items,
    });

    res.status(201).json({
      success: true,
      status: "OK",
      message: "Order created successfully",
      data: { order: Order.toResponse(created.order, created.items) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to create order",
      data: null,
    });
  }
}

export async function getOrderById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const order = await ensureOrderAccess(req, res, id);
    if (!order) return;

    const items = await Order.findItemsByOrderId(order.id);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Order retrieved",
      data: { order: Order.toResponse(order, items) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get order",
      data: null,
    });
  }
}

export async function listOrders(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const status = typeof req.query.status === "string" ? (req.query.status as Order.OrderStatus) : undefined;
    const dateFrom = typeof req.query.date_from === "string" ? req.query.date_from : undefined;
    const dateTo = typeof req.query.date_to === "string" ? req.query.date_to : undefined;

    const filters: Order.ListOrdersFilters = {
      limit,
      offset,
      status,
      date_from: dateFrom,
      date_to: dateTo,
    };

    if (req.user?.role === "customer") {
      filters.user_id = req.user.id;
    } else if (req.user?.role === "restaurant") {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({
          success: false,
          status: "ERROR",
          message: "Authorization header missing",
          data: null,
        });
        return;
      }
      const ownedRestaurantIds = await getOwnedRestaurantIds(authHeader);
      if (ownedRestaurantIds.length === 0) {
        res.status(200).json({
          success: true,
          status: "OK",
          message: "Orders listed",
          data: {
            orders: [],
            pagination: {
              page,
              limit,
              total: 0,
              totalPages: 0,
            },
          },
        });
        return;
      }
      filters.restaurant_ids = ownedRestaurantIds;
    } else {
      if (typeof req.query.user_id === "string") filters.user_id = req.query.user_id;
      if (typeof req.query.restaurant_id === "string") filters.restaurant_id = req.query.restaurant_id;
    }

    const rows = await Order.list(filters);
    const total = await Order.count({
      user_id: filters.user_id,
      restaurant_id: filters.restaurant_id,
      restaurant_ids: filters.restaurant_ids,
      status: filters.status,
      date_from: filters.date_from,
      date_to: filters.date_to,
    });
    const orders = await Promise.all(
      rows.map(async (row) => {
        const items = await Order.findItemsByOrderId(row.id);
        return Order.toResponse(row, items);
      })
    );

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Orders listed",
      data: {
        orders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to list orders",
      data: null,
    });
  }
}

export async function updateOrderStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const nextStatus = req.body.status as Order.OrderStatus;
    if (!nextStatus) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "status is required",
        data: null,
      });
      return;
    }

    const order = await ensureOrderAccess(req, res, id);
    if (!order) return;

    const allowedNext = ALLOWED_NEXT_STATUSES[order.status] ?? [];
    if (!allowedNext.includes(nextStatus)) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: `Invalid status transition from ${order.status} to ${nextStatus}`,
        data: null,
      });
      return;
    }

    const updated = await Order.updateStatus(order.id, nextStatus);
    if (!updated) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Order not found",
        data: null,
      });
      return;
    }
    const items = await Order.findItemsByOrderId(updated.id);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Order status updated successfully",
      data: { order: Order.toResponse(updated, items) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to update order status",
      data: null,
    });
  }
}
