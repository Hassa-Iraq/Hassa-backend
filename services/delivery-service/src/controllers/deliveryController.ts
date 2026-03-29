import { Response } from "express";
import config from "../config/index";
import * as Delivery from "../models/Delivery";
import { AuthRequest } from "../middleware/auth";

const ALLOWED_NEXT_STATUSES: Record<Delivery.DeliveryStatus, Delivery.DeliveryStatus[]> = {
  pending_assignment: ["assigned", "cancelled"],
  assigned: ["accepted_by_driver", "cancelled", "failed", "pending_assignment"],
  accepted_by_driver: ["arrived_at_pickup", "cancelled", "failed"],
  arrived_at_pickup: ["picked_up", "cancelled", "failed"],
  picked_up: ["on_the_way", "cancelled", "failed"],
  on_the_way: ["delivered", "failed", "cancelled"],
  delivered: [],
  cancelled: [],
  failed: [],
};

const ASSIGNMENT_TIMEOUT_SECONDS = 45;

type OrderApiResponse = {
  success?: boolean;
  message?: string;
  data?: {
    order?: {
      id: string;
      user_id: string;
      restaurant_id: string;
      status: string;
      delivery_address?: Record<string, unknown> | null;
      notes?: string | null;
    };
  };
};

type OrderPayload = {
  id: string;
  user_id: string;
  restaurant_id: string;
  status: string;
  delivery_address?: Record<string, unknown> | null;
  notes?: string | null;
};

function deliveryAddressLineFromOrder(da: Record<string, unknown> | null | undefined): string | null {
  if (!da) return null;
  const line = da.complete_address;
  if (typeof line === "string" && line.trim() !== "") return line;
  const legacy = da.line1;
  if (typeof legacy === "string" && legacy.trim() !== "") return legacy;
  return null;
}

function latitudeFromOrderAddress(da: Record<string, unknown> | null | undefined): number | null {
  if (!da) return null;
  if (typeof da.latitude === "number" && !Number.isNaN(da.latitude)) return da.latitude;
  if (typeof da.lat === "number" && !Number.isNaN(da.lat)) return da.lat;
  return null;
}

function longitudeFromOrderAddress(da: Record<string, unknown> | null | undefined): number | null {
  if (!da) return null;
  if (typeof da.longitude === "number" && !Number.isNaN(da.longitude)) return da.longitude;
  if (typeof da.lng === "number" && !Number.isNaN(da.lng)) return da.lng;
  return null;
}

type DriverApiResponse = {
  success?: boolean;
  message?: string;
  data?: {
    driver?: {
      id: string;
      role: string;
      owner_type: "platform" | "restaurant";
      owner_restaurant_id: string | null;
      is_active: boolean;
    };
  };
};

function internalAuthHeaders(): Record<string, string> {
  return config.INTERNAL_SERVICE_TOKEN ? { "X-Internal-Token": config.INTERNAL_SERVICE_TOKEN } : {};
}

async function getOrderById(orderId: string, authHeader: string): Promise<OrderPayload> {
  const orderServiceUrl = config.ORDER_SERVICE_URL || "http://order-service:3003";
  const response = await fetch(`${orderServiceUrl}/orders/${orderId}`, {
    method: "GET",
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...internalAuthHeaders(),
    },
  });
  const json = (await response.json().catch(() => ({}))) as OrderApiResponse;
  if (!response.ok || !json.success || !json.data?.order) {
    throw new Error(json.message || "Order not found");
  }
  return json.data.order;
}

async function getDriverById(driverId: string, authHeader: string): Promise<{
  id: string;
  role: string;
  owner_type: "platform" | "restaurant";
  owner_restaurant_id: string | null;
  is_active: boolean;
}> {
  const authServiceUrl = config.AUTH_SERVICE_URL || "http://auth-service:3001";
  const response = await fetch(`${authServiceUrl}/auth/drivers/${driverId}`, {
    method: "GET",
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...internalAuthHeaders(),
    },
  });
  const json = (await response.json().catch(() => ({}))) as DriverApiResponse;
  if (!response.ok || !json.success || !json.data?.driver) {
    throw new Error(json.message || "Driver not found");
  }
  return json.data.driver;
}

async function getOwnedRestaurantIds(authHeader: string): Promise<string[]> {
  const restaurantServiceUrl = "http://restaurant-service:3002";
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

async function listCandidateDrivers(params: {
  authHeader: string;
  restaurant_id: string;
  preferRestaurantDrivers: boolean;
}): Promise<string[]> {
  const authServiceUrl = config.AUTH_SERVICE_URL || "http://auth-service:3001";
  const headers = { ...(params.authHeader ? { Authorization: params.authHeader } : {}), ...internalAuthHeaders() };

  if (params.preferRestaurantDrivers) {
    const r = await fetch(
      `${authServiceUrl}/auth/drivers?page=1&limit=200&owner_type=restaurant&restaurant_id=${params.restaurant_id}&is_active=true`,
      { method: "GET", headers }
    );
    const json = (await r.json().catch(() => ({}))) as { success?: boolean; data?: { drivers?: Array<{ id: string }> } };
    const ids = (json.data?.drivers ?? []).map((d) => d.id).filter(Boolean);
    if (r.ok && json.success && ids.length > 0) return ids;
  }

  const r2 = await fetch(
    `${authServiceUrl}/auth/drivers?page=1&limit=200&owner_type=platform&is_active=true`,
    { method: "GET", headers }
  );
  const json2 = (await r2.json().catch(() => ({}))) as { success?: boolean; data?: { drivers?: Array<{ id: string }> } };
  return (json2.data?.drivers ?? []).map((d) => d.id).filter(Boolean);
}

async function pickAvailableDriver(params: {
  candidate_driver_ids: string[];
  attempted_driver_ids: string[];
}): Promise<string | null> {
  if (params.candidate_driver_ids.length === 0) return null;
  const attempted = new Set(params.attempted_driver_ids);
  const candidates = params.candidate_driver_ids.filter((id) => !attempted.has(id));
  if (candidates.length === 0) return null;

  const statuses = await Delivery.listDriverAvailability({ is_online: true, is_available: true, limit: 500, offset: 0 });
  const availableSet = new Set(statuses.map((s) => s.driver_user_id));
  const best = candidates.find((id) => availableSet.has(id));
  return best ?? null;
}

async function autoAssignDeliveryRow(params: {
  delivery: Delivery.DeliveryRow;
  restaurant_id: string;
  authHeader: string;
}): Promise<Delivery.DeliveryRow | null> {
  const rawAttempted = (params.delivery as any).attempted_driver_ids;
  const attempted: string[] =
    Array.isArray(rawAttempted) ? (rawAttempted as string[]) : (rawAttempted && typeof rawAttempted === "object" ? [] : []);

  const candidates = await listCandidateDrivers({
    authHeader: params.authHeader,
    restaurant_id: params.restaurant_id,
    preferRestaurantDrivers: true,
  });
  const picked = await pickAvailableDriver({
    candidate_driver_ids: candidates,
    attempted_driver_ids: attempted,
  });
  if (!picked) return null;

  const nextAttempted = [...new Set([...attempted, picked])];
  const expires = new Date(Date.now() + ASSIGNMENT_TIMEOUT_SECONDS * 1000);
  const assigned = await Delivery.setAssignment({
    id: params.delivery.id,
    driver_user_id: picked,
    assignment_expires_at: expires,
    attempted_driver_ids: nextAttempted,
  });
  if (assigned) {
    await Delivery.upsertDriverAvailability({ driver_user_id: picked, is_available: false });
  }
  return assigned;
}

export async function sweepExpiredAssignments(): Promise<void> {
  const now = new Date();
  const expired = await Delivery.listExpiredAssignments(now, 50);
  if (expired.length === 0) return;

  const authHeader = "";
  for (const d of expired) {
    const prev = d.driver_user_id;
    if (prev) {
      await Delivery.upsertDriverAvailability({ driver_user_id: prev, is_available: true });
    }
    const queued = await Delivery.markPendingAssignment({
      id: d.id,
      attempted_driver_ids: Array.isArray((d as any).attempted_driver_ids) ? (d as any).attempted_driver_ids : [],
    });
    if (!queued) continue;

    await autoAssignDeliveryRow({
      delivery: queued,
      restaurant_id: queued.restaurant_id,
      authHeader,
    });
  }
}

export async function autoAssignForOrder(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const orderId = body.order_id as string;
    if (!orderId || typeof orderId !== "string") {
      res.status(400).json({ success: false, status: "ERROR", message: "order_id is required", data: null });
      return;
    }

    const authHeader = req.headers.authorization ?? "";

    const order = await getOrderById(orderId, authHeader);
    if (!order || order.status !== "confirmed") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Order must be confirmed before driver assignment",
        data: null,
      });
      return;
    }

    let delivery = await Delivery.findByOrderId(orderId);
    if (!delivery) {
      delivery = await Delivery.create({
        order_id: order.id,
        customer_user_id: order.user_id,
        restaurant_id: order.restaurant_id,
        driver_user_id: null,
        delivery_address: deliveryAddressLineFromOrder(order.delivery_address ?? undefined),
        delivery_latitude: latitudeFromOrderAddress(order.delivery_address ?? undefined),
        delivery_longitude: longitudeFromOrderAddress(order.delivery_address ?? undefined),
        delivery_notes: typeof order.notes === "string" ? order.notes : null,
      });
    }

    const assigned = await autoAssignDeliveryRow({
      delivery,
      restaurant_id: order.restaurant_id,
      authHeader,
    });
    if (!assigned) {
      res.status(200).json({
        success: true,
        status: "OK",
        message: "No available drivers right now",
        data: { delivery: Delivery.toResponse(delivery) },
      });
      return;
    }

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Driver auto-assigned",
      data: { delivery: Delivery.toResponse(assigned) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to auto-assign driver",
      data: null,
    });
  }
}

async function ensureDeliveryAccess(req: AuthRequest, res: Response, deliveryId: string): Promise<Delivery.DeliveryRow | null> {
  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) {
    res.status(404).json({
      success: false,
      status: "ERROR",
      message: "Delivery not found",
      data: null,
    });
    return null;
  }

  const role = req.user?.role;
  if (role === "admin") return delivery;

  if (role === "driver") {
    if (delivery.driver_user_id !== req.user?.id) {
      res.status(403).json({
        success: false,
        status: "ERROR",
        message: "You do not have permission to access this delivery",
        data: null,
      });
      return null;
    }
    return delivery;
  }

  if (role === "customer") {
    if (delivery.customer_user_id !== req.user?.id) {
      res.status(403).json({
        success: false,
        status: "ERROR",
        message: "You do not have permission to access this delivery",
        data: null,
      });
      return null;
    }
    return delivery;
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
    if (!ownedRestaurantIds.includes(delivery.restaurant_id)) {
      res.status(403).json({
        success: false,
        status: "ERROR",
        message: "You do not have permission to access this delivery",
        data: null,
      });
      return null;
    }
    return delivery;
  }

  res.status(403).json({
    success: false,
    status: "ERROR",
    message: "Insufficient permissions",
    data: null,
  });
  return null;
}

export async function assignDriver(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const orderId = body.order_id as string;
    const driverUserId = body.driver_user_id as string;
    if (!orderId || typeof orderId !== "string") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "order_id is required",
        data: null,
      });
      return;
    }
    if (!driverUserId || typeof driverUserId !== "string") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "driver_user_id is required",
        data: null,
      });
      return;
    }

    const existing = await Delivery.findByOrderId(orderId);
    if (existing) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "A delivery is already assigned for this order",
        data: { delivery: Delivery.toResponse(existing) },
      });
      return;
    }

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
    const order = await getOrderById(orderId, authHeader);
    if (!order) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Order not found",
        data: null,
      });
      return;
    }
    const driver = await getDriverById(driverUserId, authHeader);
    if (driver.role !== "driver") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Selected user is not a driver",
        data: null,
      });
      return;
    }
    if (!driver.is_active) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Driver is inactive",
        data: null,
      });
      return;
    }
    if (driver.owner_type === "restaurant" && driver.owner_restaurant_id !== order.restaurant_id) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "This driver is restricted to a different restaurant",
        data: null,
      });
      return;
    }

    const delivery = await Delivery.create({
      order_id: order.id,
      customer_user_id: order.user_id,
      restaurant_id: order.restaurant_id,
      driver_user_id: driverUserId,
      pickup_address: (body.pickup_address as string) ?? null,
      delivery_address:
        (typeof body.delivery_address === "string" ? body.delivery_address : null) ??
        (typeof body.dropoff_address === "string" ? body.dropoff_address : null) ??
        deliveryAddressLineFromOrder(order.delivery_address ?? undefined),
      pickup_latitude: typeof body.pickup_latitude === "number" ? body.pickup_latitude : null,
      pickup_longitude: typeof body.pickup_longitude === "number" ? body.pickup_longitude : null,
      delivery_latitude:
        typeof body.delivery_latitude === "number"
          ? body.delivery_latitude
          : typeof body.dropoff_latitude === "number"
            ? body.dropoff_latitude
            : latitudeFromOrderAddress(order.delivery_address ?? undefined),
      delivery_longitude:
        typeof body.delivery_longitude === "number"
          ? body.delivery_longitude
          : typeof body.dropoff_longitude === "number"
            ? body.dropoff_longitude
            : longitudeFromOrderAddress(order.delivery_address ?? undefined),
      delivery_notes:
        typeof body.delivery_notes === "string"
          ? body.delivery_notes
          : (typeof order.notes === "string" ? order.notes : null),
    });

    await Delivery.upsertDriverAvailability({
      driver_user_id: driverUserId,
      is_available: false,
    });

    res.status(201).json({
      success: true,
      status: "OK",
      message: "Driver assigned successfully",
      data: { delivery: Delivery.toResponse(delivery) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to assign driver",
      data: null,
    });
  }
}

export async function listDeliveries(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const status = typeof req.query.status === "string" ? (req.query.status as Delivery.DeliveryStatus) : undefined;
    const dateFrom = typeof req.query.date_from === "string" ? req.query.date_from : undefined;
    const dateTo = typeof req.query.date_to === "string" ? req.query.date_to : undefined;

    const filters: Delivery.DeliveryListFilters = {
      limit,
      offset,
      status,
      date_from: dateFrom,
      date_to: dateTo,
    };
    if (typeof req.query.order_id === "string") filters.order_id = req.query.order_id;

    if (req.user?.role === "driver") {
      filters.driver_user_id = req.user.id;
    } else if (req.user?.role === "customer") {
      filters.customer_user_id = req.user.id;
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
          message: "Deliveries listed",
          data: {
            deliveries: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
          },
        });
        return;
      }
      filters.restaurant_ids = ownedRestaurantIds;
    } else {
      if (typeof req.query.driver_user_id === "string") filters.driver_user_id = req.query.driver_user_id;
      if (typeof req.query.customer_user_id === "string") filters.customer_user_id = req.query.customer_user_id;
      if (typeof req.query.restaurant_id === "string") filters.restaurant_id = req.query.restaurant_id;
    }

    const rows = await Delivery.list(filters);
    const total = await Delivery.count({
      order_id: filters.order_id,
      driver_user_id: filters.driver_user_id,
      customer_user_id: filters.customer_user_id,
      restaurant_id: filters.restaurant_id,
      restaurant_ids: filters.restaurant_ids,
      status: filters.status,
      date_from: filters.date_from,
      date_to: filters.date_to,
    });

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Deliveries listed",
      data: {
        deliveries: rows.map(Delivery.toResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to list deliveries",
      data: null,
    });
  }
}

export async function getDeliveryById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const delivery = await ensureDeliveryAccess(req, res, id);
    if (!delivery) return;
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Delivery retrieved",
      data: { delivery: Delivery.toResponse(delivery) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get delivery",
      data: null,
    });
  }
}

export async function updateDeliveryStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const nextStatus = req.body.status as Delivery.DeliveryStatus;
    if (!nextStatus) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "status is required",
        data: null,
      });
      return;
    }

    const delivery = await ensureDeliveryAccess(req, res, id);
    if (!delivery) return;

    if (req.user?.role === "driver" && delivery.status === "assigned" && nextStatus === "pending_assignment") {
      const attempted = Array.isArray((delivery as any).attempted_driver_ids)
        ? ((delivery as any).attempted_driver_ids as string[])
        : [];
      const prev = delivery.driver_user_id;
      const nextAttempted = prev ? [...new Set([...attempted, prev])] : attempted;
      const queued = await Delivery.markPendingAssignment({ id: delivery.id, attempted_driver_ids: nextAttempted });
      if (prev) await Delivery.upsertDriverAvailability({ driver_user_id: prev, is_available: true });
      res.status(200).json({
        success: true,
        status: "OK",
        message: "Assignment declined; re-queued for reassignment",
        data: { delivery: queued ? Delivery.toResponse(queued) : Delivery.toResponse(delivery) },
      });
      return;
    }

    const allowedNext = ALLOWED_NEXT_STATUSES[delivery.status] ?? [];
    if (!allowedNext.includes(nextStatus)) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: `Invalid status transition from ${delivery.status} to ${nextStatus}`,
        data: null,
      });
      return;
    }

    const updated = await Delivery.updateStatus(id, nextStatus, {
      proof_image_url: req.body.proof_image_url == null ? undefined : String(req.body.proof_image_url),
      delivery_notes: req.body.delivery_notes == null ? undefined : String(req.body.delivery_notes),
    });
    if (!updated) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Delivery not found",
        data: null,
      });
      return;
    }

    if (nextStatus === "delivered" || nextStatus === "cancelled" || nextStatus === "failed") {
      if (updated.driver_user_id) {
        await Delivery.upsertDriverAvailability({
          driver_user_id: updated.driver_user_id,
          is_available: true,
        });
      }
    }

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Delivery status updated successfully",
      data: { delivery: Delivery.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to update delivery status",
      data: null,
    });
  }
}

export async function setDriverAvailability(req: AuthRequest, res: Response): Promise<void> {
  try {
    const driverId = req.params.driverId as string;
    if (!driverId) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "driverId is required",
        data: null,
      });
      return;
    }
    if (req.user?.role === "driver" && req.user.id !== driverId) {
      res.status(403).json({
        success: false,
        status: "ERROR",
        message: "Drivers can only update their own availability",
        data: null,
      });
      return;
    }

    const row = await Delivery.upsertDriverAvailability({
      driver_user_id: driverId,
      is_online: req.body.is_online !== undefined ? Boolean(req.body.is_online) : undefined,
      is_available: req.body.is_available !== undefined ? Boolean(req.body.is_available) : undefined,
      current_latitude: typeof req.body.current_latitude === "number" ? req.body.current_latitude : undefined,
      current_longitude: typeof req.body.current_longitude === "number" ? req.body.current_longitude : undefined,
    });

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Driver availability updated",
      data: { driver: Delivery.toDriverStatusResponse(row) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to update driver availability",
      data: null,
    });
  }
}

export async function listDriverAvailability(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const isOnline = typeof req.query.is_online === "string" ? req.query.is_online === "true" : undefined;
    const isAvailable = typeof req.query.is_available === "string" ? req.query.is_available === "true" : undefined;

    const rows = await Delivery.listDriverAvailability({
      is_online: isOnline,
      is_available: isAvailable,
      limit,
      offset,
    });
    const total = await Delivery.countDriverAvailability({
      is_online: isOnline,
      is_available: isAvailable,
    });

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Driver availability listed",
      data: {
        drivers: rows.map(Delivery.toDriverStatusResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to list driver availability",
      data: null,
    });
  }
}
