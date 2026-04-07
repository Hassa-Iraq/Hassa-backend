import { Response } from "express";
import config from "../config/index";
import * as Order from "../models/Order";
import { AuthRequest } from "../middleware/auth";
import * as DeliveryAddress from "../utils/deliveryAddress";

interface IncomingOrderItem {
  menu_item_id?: string;
  quantity?: number;
  special_instructions?: string | null;
  selected_option_ids?: string[];
}

interface OptionInfo {
  id: string;
  group_id: string;
  group_name: string;
  name: string;
  additional_price: number;
  is_available: boolean;
}

interface OptionGroupInfo {
  id: string;
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  options: OptionInfo[];
}

interface MenuItemInfo {
  id: string;
  name: string;
  price: number;
  option_groups: OptionGroupInfo[];
}

const ALLOWED_NEXT_STATUSES: Record<Order.OrderStatus, Order.OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

const ORDER_LIST_STATUS_MAP: Record<string, Order.OrderStatus[] | null> = {
  all: [],
  pending: ["pending"],
  accepted: ["confirmed"],
  processing: ["preparing", "ready_for_pickup"],
  "food on the way": ["out_for_delivery"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
  "payment failed": null,
  refunded: null,
  "offline payments": null,
};

function parseMoney(value: unknown, defaultValue = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return defaultValue;
}

type RawMenuItem = {
  id: string;
  name: string;
  price: number | string;
  option_groups?: Array<{
    id: string;
    name: string;
    is_required: boolean;
    min_selections: number;
    max_selections: number;
    options: Array<{ id: string; name: string; additional_price: number | string; is_available: boolean }>;
  }>;
};

async function fetchRestaurantMenu(restaurantId: string): Promise<Map<string, MenuItemInfo>> {
  const restaurantServiceUrl = config.RESTAURANT_SERVICE_URL || "http://restaurant-service:3002";
  const response = await fetch(`${restaurantServiceUrl}/discover/restaurants/${restaurantId}/menu`);
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: {
      categories?: Array<{ items?: RawMenuItem[] }>;
      uncategorizedItems?: RawMenuItem[];
    };
  };

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || "Restaurant menu not available");
  }

  const map = new Map<string, MenuItemInfo>();

  const toMenuItemInfo = (item: RawMenuItem): MenuItemInfo => ({
    id: item.id,
    name: item.name,
    price: parseMoney(item.price),
    option_groups: (item.option_groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      is_required: g.is_required,
      min_selections: g.min_selections,
      max_selections: g.max_selections,
      options: (g.options ?? []).map((o) => ({
        id: o.id,
        group_id: g.id,
        group_name: g.name,
        name: o.name,
        additional_price: parseMoney(o.additional_price),
        is_available: o.is_available,
      })),
    })),
  });

  for (const category of json.data.categories ?? []) {
    for (const item of category.items ?? []) {
      map.set(item.id, toMenuItemInfo(item));
    }
  }
  for (const item of json.data.uncategorizedItems ?? []) {
    map.set(item.id, toMenuItemInfo(item));
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

      const selectedOptionIds: string[] = Array.isArray(incomingItem.selected_option_ids)
        ? incomingItem.selected_option_ids.filter((id) => typeof id === "string")
        : [];

      const allOptions = new Map<string, OptionInfo>();
      for (const group of menuItem.option_groups) {
        for (const opt of group.options) {
          allOptions.set(opt.id, opt);
        }
      }

      for (const optId of selectedOptionIds) {
        const opt = allOptions.get(optId);
        if (!opt || !opt.is_available) {
          res.status(400).json({
            success: false,
            status: "ERROR",
            message: `Option not available: ${optId}`,
            data: null,
          });
          return;
        }
      }

      for (const group of menuItem.option_groups) {
        const groupOptionIds = new Set(group.options.map((o) => o.id));
        const selectedInGroup = selectedOptionIds.filter((id) => groupOptionIds.has(id));
        const count = selectedInGroup.length;

        if (group.is_required && count < group.min_selections) {
          res.status(400).json({
            success: false,
            status: "ERROR",
            message: `"${group.name}" requires at least ${group.min_selections} selection(s)`,
            data: null,
          });
          return;
        }
        if (count > group.max_selections) {
          res.status(400).json({
            success: false,
            status: "ERROR",
            message: `"${group.name}" allows at most ${group.max_selections} selection(s)`,
            data: null,
          });
          return;
        }
      }

      const selectedSnapshots: Order.SelectedOptionSnapshot[] = selectedOptionIds.map((optId) => {
        const opt = allOptions.get(optId)!;
        return {
          option_id: opt.id,
          group_id: opt.group_id,
          group_name: opt.group_name,
          option_name: opt.name,
          additional_price: opt.additional_price,
        };
      });
      const optionsAdditionalPrice = selectedSnapshots.reduce((sum, o) => sum + o.additional_price, 0);
      const unitPriceWithOptions = Number((menuItem.price + optionsAdditionalPrice).toFixed(2));
      const lineTotal = Number((unitPriceWithOptions * quantity).toFixed(2));
      subtotal += lineTotal;
      items.push({
        menu_item_id: menuItem.id,
        item_name: menuItem.name,
        unit_price: unitPriceWithOptions,
        quantity,
        line_total: lineTotal,
        special_instructions:
          typeof incomingItem.special_instructions === "string"
            ? incomingItem.special_instructions
            : null,
        selected_options: selectedSnapshots,
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

    const orderType = typeof body.order_type === "string" && ["delivery", "pickup"].includes(body.order_type)
      ? body.order_type
      : "delivery";

    const paymentType = typeof body.payment_type === "string" && ["cash", "card", "wallet"].includes(body.payment_type)
      ? body.payment_type
      : "cash";

    let resolvedAddressId: string | null = null;
    if (orderType === "delivery") {
      const addressId = body.address_id;
      if (typeof addressId !== "string" || !addressId.trim()) {
        res.status(400).json({
          success: false,
          status: "ERROR",
          message: "address_id is required for delivery orders",
          data: null,
        });
        return;
      }
      const trimmedAddressId = addressId.trim();
      const ownedAddress = await DeliveryAddress.findUserAddressById(trimmedAddressId, req.user!.id);
      if (!ownedAddress) {
        res.status(400).json({
          success: false,
          status: "ERROR",
          message: "address_id is not a saved address for this user",
          data: null,
        });
        return;
      }
      resolvedAddressId = trimmedAddressId;
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
      order_type: orderType,
      payment_type: paymentType,
      notes: typeof body.notes === "string" ? body.notes : null,
      delivery_address_id: resolvedAddressId,
      items,
    });

    const displayAddress = await DeliveryAddress.deliveryAddressForOrderResponse(created.order);
    const orderForResponse = {
      ...created.order,
      delivery_address: (displayAddress ?? null) as Record<string, unknown> | null,
    };

    res.status(201).json({
      success: true,
      status: "OK",
      message: "Order created successfully",
      data: { order: Order.toResponse(orderForResponse, created.items) },
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

    const details = await Order.findDetailsById(order.id);
    if (!details) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Order not found",
        data: null,
      });
      return;
    }
    const resolvedDa = await DeliveryAddress.deliveryAddressForOrderResponse(details.order);
    const orderForResponse = {
      ...details.order,
      delivery_address: (resolvedDa ?? null) as Record<string, unknown> | null,
    };
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Order retrieved",
      data: {
        order: Order.toDetailsResponse(
          orderForResponse,
          details.items,
          details.customer,
          details.restaurant
        ),
      },
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
    const rawStatus = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";
    const normalizedStatus = rawStatus.replace(/\s+/g, " ");
    const searchQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const escapedSearch = searchQuery
      ? `%${searchQuery.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`
      : undefined;
    const dateFrom = typeof req.query.date_from === "string" ? req.query.date_from : undefined;
    const dateTo = typeof req.query.date_to === "string" ? req.query.date_to : undefined;
    const missingStatusFilters = ["payment failed", "refunded", "offline payments"];

    if (normalizedStatus && !(normalizedStatus in ORDER_LIST_STATUS_MAP)) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message:
          "Invalid status filter. Use one of: All, Pending, Accepted, Processing, Food on the way, Delivered, Cancelled, Payment Failed, Refunded, Offline Payments",
        data: null,
      });
      return;
    }
    if (normalizedStatus && ORDER_LIST_STATUS_MAP[normalizedStatus] === null) {
      res.status(200).json({
        success: true,
        status: "OK",
        message: "Orders listed",
        data: {
          orders: [],
          filters: {
            status: normalizedStatus,
            q: searchQuery || null,
          },
          note:
            "This filter depends on payment module fields and will be enabled fully in the payments phase.",
          pending_status_filters: missingStatusFilters,
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

    const filters: Order.ListOrdersFilters = {
      limit,
      offset,
      statuses: normalizedStatus ? ORDER_LIST_STATUS_MAP[normalizedStatus] ?? [] : undefined,
      search: escapedSearch,
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
      statuses: filters.statuses,
      search: filters.search,
      date_from: filters.date_from,
      date_to: filters.date_to,
    });
    const uniqueUserIds = Array.from(new Set(rows.map((row) => row.user_id)));
    const uniqueRestaurantIds = Array.from(
      new Set(rows.map((row) => row.restaurant_id))
    );

    const [customers, restaurants, itemsPerOrder] = await Promise.all([
      Order.findCustomersByIds(uniqueUserIds),
      Order.findRestaurantsByIds(uniqueRestaurantIds),
      Promise.all(rows.map((row) => Order.findItemsByOrderId(row.id))),
    ]);

    const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
    const restaurantMap = new Map(
      restaurants.map((restaurant) => [restaurant.id, restaurant])
    );

    const orders = await Promise.all(
      rows.map(async (row, index) => {
        const resolvedDa = await DeliveryAddress.deliveryAddressForOrderResponse(row);
        const orderRow = {
          ...row,
          delivery_address: (resolvedDa ?? null) as Record<string, unknown> | null,
        };
        return Order.toResponseWithParties(
          orderRow,
          itemsPerOrder[index] ?? [],
          customerMap.get(row.user_id) ?? null,
          restaurantMap.get(row.restaurant_id) ?? null
        );
      })
    );

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Orders listed",
      data: {
        orders,
        filters: {
          status: normalizedStatus || "all",
          q: searchQuery || null,
        },
        pending_status_filters: missingStatusFilters,
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

export async function listCustomers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const rawSearch = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const search = rawSearch
      ? `%${rawSearch.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`
      : undefined;
    const dateFrom = typeof req.query.date_from === "string" ? req.query.date_from : undefined;
    const dateTo = typeof req.query.date_to === "string" ? req.query.date_to : undefined;

    const filters: Order.ListCustomersFilters = {
      limit,
      offset,
      search,
      date_from: dateFrom,
      date_to: dateTo,
    };

    if (req.user?.role === "restaurant") {
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
          message: "Customers listed",
          data: {
            customers: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
          },
        });
        return;
      }
      filters.restaurant_ids = ownedRestaurantIds;
    } else if (typeof req.query.restaurant_id === "string") {
      filters.restaurant_id = req.query.restaurant_id;
    }

    const rows = await Order.listCustomers(filters);
    const total = await Order.countCustomers({
      search: filters.search,
      restaurant_id: filters.restaurant_id,
      restaurant_ids: filters.restaurant_ids,
      date_from: filters.date_from,
      date_to: filters.date_to,
    });

    const customers = rows.map((row) => ({
      user_id: row.user_id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      profile_picture_url: row.profile_picture_url,
      total_orders: row.total_orders,
      total_spent: parseFloat(row.total_spent),
      first_order_at: row.first_order_at,
      last_order_at: row.last_order_at,
    }));

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Customers listed",
      data: {
        customers,
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
      message: err instanceof Error ? err.message : "Failed to list customers",
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
    if (order.status === "pending" && nextStatus === "confirmed") {
      const deliveryServiceUrl = config.DELIVERY_SERVICE_URL || "http://delivery-service:3004";
      const internalToken = config.INTERNAL_SERVICE_TOKEN;
      if (internalToken) {
        fetch(`${deliveryServiceUrl}/deliveries/assignments/auto`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Internal-Token": internalToken },
          body: JSON.stringify({ order_id: updated.id }),
        }).catch(() => { });
      }
    }

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
