import { Response } from "express";
import * as Restaurant from "../models/Restaurant";
import { AuthRequest } from "../middleware/auth";
import { cache, cacheKeys } from "../utils/redis";
import config from "../config/index";
import { getFileUrl } from "../utils/fileUpload";

async function ensureOwnership(
  req: AuthRequest,
  res: Response,
  restaurantId: string,
  opts?: { allowAdmin?: boolean }
): Promise<Restaurant.RestaurantRow | null> {
  const row = await Restaurant.findById(restaurantId);
  if (!row) {
    res.status(404).json({
      success: false,
      status: "ERROR",
      message: "Restaurant not found",
      data: null,
    });
    return null;
  }
  const allowAdmin = opts?.allowAdmin === true;
  const isAdmin = req.user?.role === "admin";
  if (req.user!.id !== row.user_id && !(allowAdmin && isAdmin)) {
    res.status(403).json({
      success: false,
      status: "ERROR",
      message: "You do not have permission to manage this restaurant",
      data: null,
    });
    return null;
  }
  return row;
}

export async function uploadRestaurantAssets(req: AuthRequest, res: Response): Promise<void> {
  try {
    const files = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
    const logo = files.logo?.[0];
    const cover = files.cover_image?.[0];
    const certificate = files.certificate?.[0];

    if (!logo && !cover && !certificate) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Upload at least one file: logo, cover_image, or certificate",
        data: null,
      });
      return;
    }

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Assets uploaded successfully",
      data: {
        logo_url: logo ? getFileUrl(logo.filename, logo.fieldname) : null,
        cover_image_url: cover ? getFileUrl(cover.filename, cover.fieldname) : null,
        certificate_url: certificate ? getFileUrl(certificate.filename, certificate.fieldname) : null,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to upload assets",
      data: null,
    });
  }
}

export async function uploadBannerImage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "banner_image file is required",
        data: null,
      });
      return;
    }
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Banner image uploaded successfully",
      data: {
        banner_image_url: getFileUrl(file.filename, file.fieldname),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to upload banner image",
      data: null,
    });
  }
}

export async function createRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const name = body.name as string;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Restaurant name is required",
        data: null,
      });
      return;
    }
    const row = await Restaurant.create({
      user_id: req.user!.id,
      name: name.trim(),
      parent_id: null,
      address: (body.address as string) ?? null,
      zone: (body.zone as string) ?? null,
      latitude: typeof body.lat === "number" ? body.lat : (typeof body.latitude === "number" ? body.latitude : null),
      longitude: typeof body.lng === "number" ? body.lng : (typeof body.longitude === "number" ? body.longitude : null),
      service_radius_km:
        typeof body.radius_km === "number"
          ? body.radius_km
          : (typeof body.service_radius_km === "number" ? body.service_radius_km : null),
      cuisine: (body.cuisine as string) ?? null,
      logo_url: (body.logo_url as string) ?? null,
      cover_image_url: (body.cover_image_url as string) ?? null,
      delivery_time_min: typeof body.delivery_time_min === "number" ? body.delivery_time_min : null,
      delivery_time_max: typeof body.delivery_time_max === "number" ? body.delivery_time_max : null,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : null,
      tin: (body.tin as string) ?? null,
      tin_expiry_date: (body.tin_expiry_date as string) ?? null,
      certificate_url: (body.certificate_url as string) ?? null,
      additional_data: typeof body.additional_data === "object" && body.additional_data != null ? (body.additional_data as Record<string, unknown>) : null,
      contact_email: (body.contact_email as string) ?? null,
      phone: (body.phone as string) ?? null,
      tax_type: (body.tax_type as string) ?? "exclusive",
      tax_rate: typeof body.tax_rate === "number" ? body.tax_rate : 0,
      free_delivery_enabled: Boolean(body.free_delivery_enabled),
      free_delivery_max_amount: typeof body.free_delivery_max_amount === "number" ? body.free_delivery_max_amount : null,
      free_delivery_min_distance_km: typeof body.free_delivery_min_distance_km === "number" ? body.free_delivery_min_distance_km : null,
      description: (body.description as string) ?? null,
    });
    res.status(201).json({
      success: true,
      status: "OK",
      message: "Restaurant created successfully",
      data: { restaurant: Restaurant.toResponse(row) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to create restaurant",
      data: null,
    });
  }
}

export async function createRestaurantByAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const ownerUserId = body.user_id as string;
    const name = body.name as string;
    if (!ownerUserId || typeof ownerUserId !== "string") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "user_id is required",
        data: null,
      });
      return;
    }
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Restaurant name is required",
        data: null,
      });
      return;
    }

    const created = await Restaurant.create({
      user_id: ownerUserId,
      name: name.trim(),
      parent_id: null,
      address: (body.address as string) ?? null,
      zone: (body.zone as string) ?? null,
      latitude: typeof body.lat === "number" ? body.lat : (typeof body.latitude === "number" ? body.latitude : null),
      longitude: typeof body.lng === "number" ? body.lng : (typeof body.longitude === "number" ? body.longitude : null),
      service_radius_km:
        typeof body.radius_km === "number"
          ? body.radius_km
          : (typeof body.service_radius_km === "number" ? body.service_radius_km : null),
      cuisine: (body.cuisine as string) ?? null,
      logo_url: (body.logo_url as string) ?? null,
      cover_image_url: (body.cover_image_url as string) ?? null,
      delivery_time_min: typeof body.delivery_time_min === "number" ? body.delivery_time_min : null,
      delivery_time_max: typeof body.delivery_time_max === "number" ? body.delivery_time_max : null,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : null,
      tin: (body.tin as string) ?? null,
      tin_expiry_date: (body.tin_expiry_date as string) ?? null,
      certificate_url: (body.certificate_url as string) ?? null,
      additional_data: typeof body.additional_data === "object" && body.additional_data != null ? (body.additional_data as Record<string, unknown>) : null,
      contact_email: (body.contact_email as string) ?? null,
      phone: (body.phone as string) ?? null,
      tax_type: (body.tax_type as string) ?? "exclusive",
      tax_rate: typeof body.tax_rate === "number" ? body.tax_rate : 0,
      free_delivery_enabled: Boolean(body.free_delivery_enabled),
      free_delivery_max_amount: typeof body.free_delivery_max_amount === "number" ? body.free_delivery_max_amount : null,
      free_delivery_min_distance_km: typeof body.free_delivery_min_distance_km === "number" ? body.free_delivery_min_distance_km : null,
      description: (body.description as string) ?? null,
    });

    const activated = await Restaurant.update(created.id, {
      is_active: true,
      is_blocked: false,
      is_open: false,
    });

    res.status(201).json({
      success: true,
      status: "OK",
      message: "Restaurant onboarded successfully by admin",
      data: { restaurant: Restaurant.toResponse(activated ?? created) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to create restaurant",
      data: null,
    });
  }
}

/**
 * Admin one-step onboarding:
 * 1) Create restaurant owner in auth-service
 * 2) Create restaurant profile in restaurant-service
 */
export async function onboardRestaurantByAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const ownerInput = (body.owner as Record<string, unknown>) ?? body;
    const restaurantInput = (body.restaurant as Record<string, unknown>) ?? body;

    const ownerEmail = ownerInput.email as string;
    const ownerPassword = ownerInput.password as string;
    const ownerPhone = ownerInput.phone as string;

    if (!ownerEmail || !ownerPassword || !ownerPhone) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "owner.email, owner.password, and owner.phone are required",
        data: null,
      });
      return;
    }

    const restaurantName = restaurantInput.name as string;
    if (!restaurantName || typeof restaurantName !== "string" || restaurantName.trim().length === 0) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "restaurant.name is required",
        data: null,
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

    const authServiceUrl = config.AUTH_SERVICE_URL || "http://auth-service:3001";
    const ownerResponse = await fetch(`${authServiceUrl}/auth/admin/restaurant-owner`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        email: ownerEmail,
        password: ownerPassword,
        phone: ownerPhone,
        full_name: ownerInput.full_name ?? null,
      }),
    });

    const ownerData = (await ownerResponse.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
      data?: { user?: { id?: string; email?: string; phone?: string; full_name?: string } };
    };

    if (!ownerResponse.ok || !ownerData.success || !ownerData.data?.user?.id) {
      res.status(ownerResponse.status || 400).json({
        success: false,
        status: "ERROR",
        message: ownerData.message || "Failed to create restaurant owner",
        data: ownerData.data ?? null,
      });
      return;
    }

    const ownerUserId = ownerData.data.user.id;

    try {
      const created = await Restaurant.create({
        user_id: ownerUserId,
        name: restaurantName.trim(),
        parent_id: null,
        address: (restaurantInput.address as string) ?? null,
        zone: (restaurantInput.zone as string) ?? null,
        latitude:
          typeof restaurantInput.lat === "number"
            ? restaurantInput.lat
            : (typeof restaurantInput.latitude === "number" ? restaurantInput.latitude : null),
        longitude:
          typeof restaurantInput.lng === "number"
            ? restaurantInput.lng
            : (typeof restaurantInput.longitude === "number" ? restaurantInput.longitude : null),
        service_radius_km:
          typeof restaurantInput.radius_km === "number"
            ? restaurantInput.radius_km
            : (typeof restaurantInput.service_radius_km === "number" ? restaurantInput.service_radius_km : null),
        cuisine: (restaurantInput.cuisine as string) ?? null,
        logo_url: (restaurantInput.logo_url as string) ?? null,
        cover_image_url: (restaurantInput.cover_image_url as string) ?? null,
        delivery_time_min:
          typeof restaurantInput.delivery_time_min === "number" ? restaurantInput.delivery_time_min : null,
        delivery_time_max:
          typeof restaurantInput.delivery_time_max === "number" ? restaurantInput.delivery_time_max : null,
        tags: Array.isArray(restaurantInput.tags) ? (restaurantInput.tags as string[]) : null,
        tin: (restaurantInput.tin as string) ?? null,
        tin_expiry_date: (restaurantInput.tin_expiry_date as string) ?? null,
        certificate_url: (restaurantInput.certificate_url as string) ?? null,
        additional_data:
          typeof restaurantInput.additional_data === "object" && restaurantInput.additional_data != null
            ? (restaurantInput.additional_data as Record<string, unknown>)
            : null,
        contact_email: (restaurantInput.contact_email as string) ?? null,
        phone: (restaurantInput.phone as string) ?? null,
        tax_type: (restaurantInput.tax_type as string) ?? "exclusive",
        tax_rate: typeof restaurantInput.tax_rate === "number" ? restaurantInput.tax_rate : 0,
        free_delivery_enabled: Boolean(restaurantInput.free_delivery_enabled),
        free_delivery_max_amount:
          typeof restaurantInput.free_delivery_max_amount === "number"
            ? restaurantInput.free_delivery_max_amount
            : null,
        free_delivery_min_distance_km:
          typeof restaurantInput.free_delivery_min_distance_km === "number"
            ? restaurantInput.free_delivery_min_distance_km
            : null,
        description: (restaurantInput.description as string) ?? null,
      });

      const activated = await Restaurant.update(created.id, {
        is_active: true,
        is_blocked: false,
        is_open: false,
      });

      res.status(201).json({
        success: true,
        status: "OK",
        message: "Restaurant owner + restaurant onboarded successfully",
        data: {
          owner: ownerData.data.user,
          restaurant: Restaurant.toResponse(activated ?? created),
        },
      });
    } catch (err) {
      let rollbackAttempted = false;
      let rollbackSucceeded = false;
      let rollbackError: string | null = null;

      try {
        rollbackAttempted = true;
        const rollbackResponse = await fetch(
          `${authServiceUrl}/auth/admin/restaurant-owner/${ownerUserId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: authHeader,
            },
          }
        );
        rollbackSucceeded = rollbackResponse.ok;
        if (!rollbackResponse.ok) {
          const rollbackData = (await rollbackResponse.json().catch(() => ({}))) as { message?: string };
          rollbackError = rollbackData.message ?? `Rollback failed with status ${rollbackResponse.status}`;
        }
      } catch (rollbackErr) {
        rollbackError =
          rollbackErr instanceof Error ? rollbackErr.message : "Rollback call failed";
      }

      res.status(500).json({
        success: false,
        status: "ERROR",
        message:
          err instanceof Error
            ? `Owner created but restaurant creation failed ${err.message}`
            : "Owner created but restaurant creation failed",
        data: {
          owner: ownerData.data.user,
          created_owner_user_id: ownerUserId,
          rollback_attempted: rollbackAttempted,
          rollback_succeeded: rollbackSucceeded,
          rollback_error: rollbackError,
        },
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to onboard restaurant",
      data: null,
    });
  }
}

export async function createBranch(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parentId = req.body.parent_id ?? req.body.parent_restaurant_id;
    if (!parentId || typeof parentId !== "string") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "parent_id (or parent_restaurant_id) is required",
        data: null,
      });
      return;
    }
    const parent = await ensureOwnership(req, res, parentId);
    if (!parent) return;
    const body = req.body as Record<string, unknown>;
    const name = (body.name as string) ?? `${parent.name} (Branch)`;
    const row = await Restaurant.create({
      user_id: req.user!.id,
      parent_id: parentId,
      name: typeof name === "string" ? name.trim() : name,
      address: (body.address as string) ?? null,
      zone: (body.zone as string) ?? null,
      latitude: typeof body.lat === "number" ? body.lat : (typeof body.latitude === "number" ? body.latitude : null),
      longitude: typeof body.lng === "number" ? body.lng : (typeof body.longitude === "number" ? body.longitude : null),
      service_radius_km:
        typeof body.radius_km === "number"
          ? body.radius_km
          : (typeof body.service_radius_km === "number" ? body.service_radius_km : null),
      cuisine: (body.cuisine as string) ?? null,
      logo_url: (body.logo_url as string) ?? null,
      cover_image_url: (body.cover_image_url as string) ?? null,
      delivery_time_min: typeof body.delivery_time_min === "number" ? body.delivery_time_min : null,
      delivery_time_max: typeof body.delivery_time_max === "number" ? body.delivery_time_max : null,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : null,
      tin: (body.tin as string) ?? null,
      tin_expiry_date: (body.tin_expiry_date as string) ?? null,
      certificate_url: (body.certificate_url as string) ?? null,
      additional_data: typeof body.additional_data === "object" && body.additional_data != null ? (body.additional_data as Record<string, unknown>) : null,
      contact_email: (body.contact_email as string) ?? null,
      phone: (body.phone as string) ?? null,
      tax_type: (body.tax_type as string) ?? "exclusive",
      tax_rate: typeof body.tax_rate === "number" ? body.tax_rate : 0,
      free_delivery_enabled: Boolean(body.free_delivery_enabled),
      free_delivery_max_amount: typeof body.free_delivery_max_amount === "number" ? body.free_delivery_max_amount : null,
      free_delivery_min_distance_km: typeof body.free_delivery_min_distance_km === "number" ? body.free_delivery_min_distance_km : null,
      description: (body.description as string) ?? null,
    });
    res.status(201).json({
      success: true,
      status: "OK",
      message: "Branch created successfully",
      data: { restaurant: Restaurant.toResponse(row) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to create branch",
      data: null,
    });
  }
}

export async function createBranchByAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parentId = req.body.parent_id ?? req.body.parent_restaurant_id;
    if (!parentId || typeof parentId !== "string") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "parent_id (or parent_restaurant_id) is required",
        data: null,
      });
      return;
    }

    const parent = await Restaurant.findById(parentId);
    if (!parent) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Parent restaurant not found",
        data: null,
      });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const name = (body.name as string) ?? `${parent.name} (Branch)`;
    const row = await Restaurant.create({
      user_id: parent.user_id,
      parent_id: parentId,
      name: typeof name === "string" ? name.trim() : name,
      address: (body.address as string) ?? null,
      zone: (body.zone as string) ?? null,
      latitude: typeof body.lat === "number" ? body.lat : (typeof body.latitude === "number" ? body.latitude : null),
      longitude: typeof body.lng === "number" ? body.lng : (typeof body.longitude === "number" ? body.longitude : null),
      service_radius_km:
        typeof body.radius_km === "number"
          ? body.radius_km
          : (typeof body.service_radius_km === "number" ? body.service_radius_km : null),
      cuisine: (body.cuisine as string) ?? null,
      logo_url: (body.logo_url as string) ?? null,
      cover_image_url: (body.cover_image_url as string) ?? null,
      delivery_time_min: typeof body.delivery_time_min === "number" ? body.delivery_time_min : null,
      delivery_time_max: typeof body.delivery_time_max === "number" ? body.delivery_time_max : null,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : null,
      tin: (body.tin as string) ?? null,
      tin_expiry_date: (body.tin_expiry_date as string) ?? null,
      certificate_url: (body.certificate_url as string) ?? null,
      additional_data: typeof body.additional_data === "object" && body.additional_data != null ? (body.additional_data as Record<string, unknown>) : null,
      contact_email: (body.contact_email as string) ?? null,
      phone: (body.phone as string) ?? null,
      tax_type: (body.tax_type as string) ?? "exclusive",
      tax_rate: typeof body.tax_rate === "number" ? body.tax_rate : 0,
      free_delivery_enabled: Boolean(body.free_delivery_enabled),
      free_delivery_max_amount: typeof body.free_delivery_max_amount === "number" ? body.free_delivery_max_amount : null,
      free_delivery_min_distance_km: typeof body.free_delivery_min_distance_km === "number" ? body.free_delivery_min_distance_km : null,
      description: (body.description as string) ?? null,
    });

    const activated = await Restaurant.update(row.id, {
      is_active: true,
      is_blocked: false,
      is_open: false,
    });

    res.status(201).json({
      success: true,
      status: "OK",
      message: "Branch created successfully by admin",
      data: { restaurant: Restaurant.toResponse(activated ?? row) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to create branch",
      data: null,
    });
  }
}

export async function listMyRestaurants(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const zone = typeof req.query.zone === "string" ? req.query.zone.trim() : undefined;
    const cuisine = typeof req.query.cuisine === "string" ? req.query.cuisine.trim() : undefined;
    const radius_km =
      typeof req.query.radius_km === "string" && req.query.radius_km.trim().length > 0
        ? Number(req.query.radius_km)
        : undefined;
    const parsedRadiusKm = typeof radius_km === "number" && Number.isFinite(radius_km) ? radius_km : undefined;
    const rawStatus = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : undefined;
    const allowedStatuses = new Set(["active", "inactive", "blocked", "open", "closed"]);
    const status = rawStatus && allowedStatuses.has(rawStatus)
      ? (rawStatus as "active" | "inactive" | "blocked" | "open" | "closed")
      : undefined;

    const filters: Restaurant.AdminRestaurantListFilters = {
      limit,
      offset,
      search,
      zone,
      cuisine,
      radius_km: parsedRadiusKm,
      status,
      user_id: req.user?.role === "restaurant" ? req.user.id : undefined,
    };
    const rows = await Restaurant.findAllForAdmin(filters);
    const total = await Restaurant.countAllForAdmin({
      user_id: filters.user_id,
      search,
      zone,
      cuisine,
      radius_km: parsedRadiusKm,
      status,
    });

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurants listed",
      data: {
        restaurants: rows.map((row) => ({
          ...Restaurant.toResponse(row),
          branches_count: row.branches_count,
          owner_name: row.owner_name,
          owner_phone: row.owner_phone,
          owner_email: row.owner_email,
        })),
        filters: {
          search: search ?? null,
          zone: zone ?? null,
          cuisine: cuisine ?? null,
          radius_km: parsedRadiusKm ?? null,
          status: status ?? null,
        },
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
      message: err instanceof Error ? err.message : "Failed to list restaurants",
      data: null,
    });
  }
}

export async function listRestaurantsForAdmin(req: AuthRequest, res: Response): Promise<void> {
  await listMyRestaurants(req, res);
}

export async function getRestaurantDashboardStats(_req: AuthRequest, res: Response): Promise<void> {
  try {
    void _req;
    const stats = await Restaurant.getAdminRestaurantStats();

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant dashboard stats retrieved",
      data: {
        total_restaurants: stats.total_restaurants,
        active_restaurants: stats.active_restaurants,
        inactive_restaurants: stats.inactive_restaurants,
        newly_joined_restaurants: stats.newly_joined_restaurants,
        total_transactions: null,
        commission_earned: null,
        total_restaurant_withdraws: null,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to fetch dashboard stats",
      data: null,
    });
  }
}

export async function listBranchesForAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parentId = req.params.id as string;
    const parent = await Restaurant.findById(parentId);
    if (!parent) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Parent restaurant not found",
        data: null,
      });
      return;
    }
    if (parent.parent_id !== null) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Provided id belongs to a branch. Use a parent restaurant id.",
        data: null,
      });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const rows = await Restaurant.findBranchesByParentIdForAdmin(parentId, { limit, offset });
    const total = await Restaurant.countBranchesByParentId(parentId);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Branches listed for admin",
      data: {
        parent_restaurant: Restaurant.toResponse(parent),
        branches: rows.map(Restaurant.toResponse),
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
      message: err instanceof Error ? err.message : "Failed to list branches",
      data: null,
    });
  }
}

export async function getRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await ensureOwnership(req, res, id, { allowAdmin: true });
    if (!row) return;
    const branches = row.parent_id == null ? await Restaurant.findBranches(row.id) : [];
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant retrieved",
      data: {
        restaurant: Restaurant.toResponse(row),
        branches: branches.map(Restaurant.toResponse),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get restaurant",
      data: null,
    });
  }
}

export async function updateRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await ensureOwnership(req, res, id, { allowAdmin: true });
    if (!row) return;
    const body = req.body as Record<string, unknown>;
    const params: Restaurant.UpdateRestaurantParams = {};
    if (body.name !== undefined) params.name = String(body.name);
    if (body.address !== undefined) params.address = body.address == null ? null : String(body.address);
    if (body.zone !== undefined) params.zone = body.zone == null ? null : String(body.zone);
    if (body.lat !== undefined || body.latitude !== undefined) {
      const val = body.lat !== undefined ? body.lat : body.latitude;
      params.latitude = typeof val === "number" ? val : null;
    }
    if (body.lng !== undefined || body.longitude !== undefined) {
      const val = body.lng !== undefined ? body.lng : body.longitude;
      params.longitude = typeof val === "number" ? val : null;
    }
    if (body.radius_km !== undefined || body.service_radius_km !== undefined) {
      const val = body.radius_km !== undefined ? body.radius_km : body.service_radius_km;
      params.service_radius_km = typeof val === "number" ? val : null;
    }
    if (body.cuisine !== undefined) params.cuisine = body.cuisine == null ? null : String(body.cuisine);
    if (body.logo_url !== undefined) params.logo_url = body.logo_url == null ? null : String(body.logo_url);
    if (body.cover_image_url !== undefined) params.cover_image_url = body.cover_image_url == null ? null : String(body.cover_image_url);
    if (body.delivery_time_min !== undefined) params.delivery_time_min = typeof body.delivery_time_min === "number" ? body.delivery_time_min : null;
    if (body.delivery_time_max !== undefined) params.delivery_time_max = typeof body.delivery_time_max === "number" ? body.delivery_time_max : null;
    if (body.tags !== undefined) params.tags = Array.isArray(body.tags) ? (body.tags as string[]) : null;
    if (body.tin !== undefined) params.tin = body.tin == null ? null : String(body.tin);
    if (body.tin_expiry_date !== undefined) params.tin_expiry_date = body.tin_expiry_date == null ? null : String(body.tin_expiry_date);
    if (body.certificate_url !== undefined) params.certificate_url = body.certificate_url == null ? null : String(body.certificate_url);
    if (body.additional_data !== undefined) params.additional_data = typeof body.additional_data === "object" && body.additional_data != null ? (body.additional_data as Record<string, unknown>) : null;
    if (body.contact_email !== undefined) params.contact_email = body.contact_email == null ? null : String(body.contact_email);
    if (body.phone !== undefined) params.phone = body.phone == null ? null : String(body.phone);
    if (body.tax_type !== undefined) params.tax_type = String(body.tax_type);
    if (typeof body.tax_rate === "number") params.tax_rate = body.tax_rate;
    if (body.free_delivery_enabled !== undefined) params.free_delivery_enabled = Boolean(body.free_delivery_enabled);
    if (typeof body.free_delivery_max_amount === "number") params.free_delivery_max_amount = body.free_delivery_max_amount;
    if (typeof body.free_delivery_min_distance_km === "number") params.free_delivery_min_distance_km = body.free_delivery_min_distance_km;
    if (body.description !== undefined) params.description = body.description == null ? null : String(body.description);
    const updated = await Restaurant.update(id, params);
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant updated successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to update restaurant",
      data: null,
    });
  }
}

export async function approveRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await Restaurant.findById(id);
    if (!row) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    if (row.is_blocked) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Cannot approve a blocked restaurant. Unblock it first.",
        data: null,
      });
      return;
    }
    const updated = await Restaurant.update(id, { is_active: true, is_blocked: false });
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant approved successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to approve restaurant",
      data: null,
    });
  }
}

export async function blockRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await Restaurant.findById(id);
    if (!row) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    const updated = await Restaurant.update(id, { is_blocked: true, is_active: false, is_open: false });
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant blocked successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to block restaurant",
      data: null,
    });
  }
}

export async function unblockRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await Restaurant.findById(id);
    if (!row) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    const updated = await Restaurant.update(id, { is_blocked: false });
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant unblocked successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to unblock restaurant",
      data: null,
    });
  }
}

export async function openRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await ensureOwnership(req, res, id);
    if (!row) return;
    if (row.is_blocked) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Cannot open a blocked restaurant",
        data: null,
      });
      return;
    }
    if (!row.is_active) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Cannot open an inactive restaurant. Please wait for admin approval.",
        data: null,
      });
      return;
    }
    const updated = await Restaurant.update(id, { is_open: true });
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant opened successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to open restaurant",
      data: null,
    });
  }
}

export async function closeRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await ensureOwnership(req, res, id);
    if (!row) return;
    const updated = await Restaurant.update(id, { is_open: false });
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant closed successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to close restaurant",
      data: null,
    });
  }
}
