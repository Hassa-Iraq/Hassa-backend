import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import * as CashCollection from "../models/CashCollection";

// GET /admin/cash-collection/pending?type=driver|restaurant
export async function getPendingSummary(req: AuthRequest, res: Response): Promise<void> {
  try {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    if (type && !["driver", "restaurant"].includes(type)) {
      res.status(400).json({ success: false, status: "ERROR", message: "type must be 'driver' or 'restaurant'", data: null });
      return;
    }

    const [drivers, restaurants] = await Promise.all([
      type !== "restaurant" ? CashCollection.driverPendingSummary() : [],
      type !== "driver" ? CashCollection.restaurantPendingSummary() : [],
    ]);

    const summary = [...drivers, ...restaurants].map(r => ({
      entity_id: r.entity_id,
      entity_name: r.entity_name,
      entity_phone: r.entity_phone,
      entity_type: r.entity_type,
      total_earned: parseFloat(r.total_earned),
      total_collected: parseFloat(r.total_collected),
      pending_balance: parseFloat(r.pending_balance),
    }));

    res.status(200).json({
      success: true, status: "OK", message: "Pending cash summary retrieved",
      data: { summary },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed", data: null });
  }
}

// GET /admin/cash-collection/balance/:type/:entityId
// How much does one driver/restaurant owe right now
export async function getBalance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { type, entityId } = req.params;
    if (!["driver", "restaurant"].includes(type)) {
      res.status(400).json({ success: false, status: "ERROR", message: "type must be 'driver' or 'restaurant'", data: null });
      return;
    }
    const balance = await CashCollection.pendingBalanceFor(type, entityId);
    res.status(200).json({
      success: true, status: "OK", message: "Balance retrieved",
      data: { entity_type: type, entity_id: entityId, ...balance },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed", data: null });
  }
}

// POST /admin/cash-collection
// Body: { collected_from_type, collected_from_user_id, amount, method, reference?, note? }
export async function collectCash(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const collected_from_type = body.collected_from_type as string;
    const collected_from_user_id = body.collected_from_user_id as string;
    const amount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount));
    const method = typeof body.method === "string" ? body.method.trim() : "";
    const reference = typeof body.reference === "string" ? body.reference.trim() || null : null;
    const note = typeof body.note === "string" ? body.note.trim() || null : null;

    if (!["driver", "restaurant"].includes(collected_from_type)) {
      res.status(400).json({ success: false, status: "ERROR", message: "collected_from_type must be 'driver' or 'restaurant'", data: null });
      return;
    }
    if (!collected_from_user_id) {
      res.status(400).json({ success: false, status: "ERROR", message: "collected_from_user_id is required", data: null });
      return;
    }
    if (!amount || amount <= 0 || !isFinite(amount)) {
      res.status(400).json({ success: false, status: "ERROR", message: "amount must be a positive number", data: null });
      return;
    }
    if (!method) {
      res.status(400).json({ success: false, status: "ERROR", message: "method is required (e.g. Cash, Bank Transfer)", data: null });
      return;
    }

    // Check pending balance — warn if collecting more than owed
    const balance = await CashCollection.pendingBalanceFor(collected_from_type, collected_from_user_id);
    if (amount > balance.pending_balance && balance.pending_balance > 0) {
      res.status(400).json({
        success: false, status: "ERROR",
        message: `Amount (${amount}) exceeds pending balance (${balance.pending_balance})`,
        data: { pending_balance: balance.pending_balance },
      });
      return;
    }

    const collection = await CashCollection.create({
      collected_from_type,
      collected_from_user_id,
      amount: parseFloat(amount.toFixed(2)),
      method,
      reference,
      note,
      collected_by_admin_id: req.user!.id,
    });

    // Return updated balance after collection
    const newBalance = await CashCollection.pendingBalanceFor(collected_from_type, collected_from_user_id);

    res.status(201).json({
      success: true, status: "OK", message: "Cash collected successfully",
      data: {
        collection: CashCollection.toResponse(collection),
        remaining_balance: newBalance.pending_balance,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to record collection", data: null });
  }
}

// GET /admin/cash-collection
export async function listCollections(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const entity_id = typeof req.query.entity_id === "string" ? req.query.entity_id : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() || undefined : undefined;

    const [rows, total] = await Promise.all([
      CashCollection.list({ limit, offset, type, entity_id, search }),
      CashCollection.count({ type, entity_id, search }),
    ]);

    res.status(200).json({
      success: true, status: "OK", message: "Collections listed",
      data: {
        collections: rows.map(CashCollection.toResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed", data: null });
  }
}
