import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import * as DriverPayment from "../models/DriverPayment";
import * as Wallet from "../models/Wallet";

// POST /admin/driver-payments
// Admin creates a payment record for a driver (status = pending)
export async function createPayment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const driver_user_id = typeof body.driver_user_id === "string" ? body.driver_user_id.trim() : "";
    const amount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount));
    const method = typeof body.method === "string" ? body.method.trim() : "";
    const reference = typeof body.reference === "string" ? body.reference.trim() || null : null;
    const note = typeof body.note === "string" ? body.note.trim() || null : null;

    if (!driver_user_id) {
      res.status(400).json({ success: false, status: "ERROR", message: "driver_user_id is required", data: null });
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

    const payment = await DriverPayment.create({
      driver_user_id,
      amount: parseFloat(amount.toFixed(2)),
      method,
      reference,
      note,
      created_by_admin_id: req.user!.id,
    });

    res.status(201).json({
      success: true, status: "OK", message: "Driver payment record created",
      data: { payment: DriverPayment.toResponse(payment) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to create payment", data: null });
  }
}

// POST /admin/driver-payments/:id/pay
// Mark as paid — credits driver's wallet
export async function markAsPaid(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const existing = await DriverPayment.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, status: "ERROR", message: "Payment not found", data: null });
      return;
    }
    if (existing.status === "paid") {
      res.status(400).json({ success: false, status: "ERROR", message: "Payment already marked as paid", data: null });
      return;
    }

    // Credit driver wallet
    await Wallet.ensureWallet(existing.driver_user_id);
    await Wallet.credit({
      userId: existing.driver_user_id,
      amount: parseFloat(existing.amount),
      type: "adjustment",
      referenceType: "driver_payment",
      referenceId: existing.id,
      note: `Earnings payment by admin — ${existing.method}${existing.reference ? ` (${existing.reference})` : ""}`,
    });

    const updated = await DriverPayment.markPaid(id, req.user!.id);
    const wallet = await Wallet.findByUserId(existing.driver_user_id);

    res.status(200).json({
      success: true, status: "OK", message: "Payment marked as paid and wallet credited",
      data: {
        payment: updated ? DriverPayment.toResponse(updated) : null,
        driver_new_balance: wallet ? parseFloat(wallet.balance) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to process payment", data: null });
  }
}

// GET /admin/driver-payments
export async function listPayments(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const driver_user_id = typeof req.query.driver_id === "string" ? req.query.driver_id : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() || undefined : undefined;

    const [rows, total] = await Promise.all([
      DriverPayment.list({ limit, offset, status, driver_user_id, search }),
      DriverPayment.count({ status, driver_user_id, search }),
    ]);

    res.status(200).json({
      success: true, status: "OK", message: "Driver payments listed",
      data: {
        payments: rows.map(DriverPayment.toResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed", data: null });
  }
}
