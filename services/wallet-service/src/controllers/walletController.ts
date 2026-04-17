import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import * as Wallet from "../models/Wallet";
import * as Payout from "../models/Payout";

// ─── GET /wallet ───────────────────────────────────────────────────────────────
export async function getMyWallet(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const wallet = await Wallet.ensureWallet(userId);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Wallet retrieved",
      data: { wallet: Wallet.toResponse(wallet) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to get wallet", data: null });
  }
}

// ─── GET /wallet/transactions ──────────────────────────────────────────────────
export async function getMyTransactions(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;

    const wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      res.status(200).json({
        success: true, status: "OK", message: "Transactions listed",
        data: { transactions: [], pagination: { page, limit, total: 0, totalPages: 0 } },
      });
      return;
    }

    const [transactions, total] = await Promise.all([
      Wallet.listTransactions(wallet.id, { limit, offset }),
      Wallet.countTransactions(wallet.id),
    ]);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Transactions listed",
      data: {
        transactions: transactions.map(Wallet.transactionToResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to get transactions", data: null });
  }
}

// ─── POST /wallet/topup ────────────────────────────────────────────────────────
export async function topup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const body = req.body as Record<string, unknown>;
    const amount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount));

    if (!amount || amount <= 0 || !isFinite(amount)) {
      res.status(400).json({ success: false, status: "ERROR", message: "amount must be a positive number", data: null });
      return;
    }
    if (amount > 1000000) {
      res.status(400).json({ success: false, status: "ERROR", message: "Top-up amount exceeds maximum limit", data: null });
      return;
    }

    await Wallet.ensureWallet(userId);
    const tx = await Wallet.credit({
      userId,
      amount: Number(amount.toFixed(2)),
      type: "topup",
      note: typeof body.note === "string" ? body.note : "Manual top-up",
    });

    const wallet = await Wallet.findByUserId(userId);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Wallet topped up successfully",
      data: {
        transaction: Wallet.transactionToResponse(tx),
        new_balance: wallet ? parseFloat(wallet.balance) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to top up wallet", data: null });
  }
}

// ─── POST /wallet/payout ───────────────────────────────────────────────────────
export async function requestPayout(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;

    if (!["restaurant", "driver", "admin"].includes(role)) {
      res.status(403).json({ success: false, status: "ERROR", message: "Only restaurant owners and drivers can request payouts", data: null });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const amount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount));

    if (!amount || amount <= 0 || !isFinite(amount)) {
      res.status(400).json({ success: false, status: "ERROR", message: "amount must be a positive number", data: null });
      return;
    }

    const wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      res.status(400).json({ success: false, status: "ERROR", message: "Wallet not found", data: null });
      return;
    }
    if (parseFloat(wallet.balance) < amount) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: `Insufficient balance. Available: ${wallet.balance}, Requested: ${amount}`,
        data: null,
      });
      return;
    }

    // Debit wallet immediately and create payout record
    const tx = await Wallet.debit({
      userId,
      amount: Number(amount.toFixed(2)),
      type: "payout_request",
      note: "Payout requested",
    });

    const bankDetails = typeof body.bank_details === "object" && body.bank_details !== null
      ? body.bank_details as Record<string, unknown>
      : undefined;

    const payout = await Payout.create({
      walletId: wallet.id,
      userId,
      amount: Number(amount.toFixed(2)),
      bankDetails,
      transactionId: tx.id,
    });

    res.status(201).json({
      success: true,
      status: "OK",
      message: "Payout request submitted. Admin will review within 1-3 business days.",
      data: { payout: Payout.toResponse(payout) },
    });
  } catch (err) {
    if (err instanceof Wallet.InsufficientBalanceError) {
      res.status(400).json({ success: false, status: "ERROR", message: err.message, data: null });
      return;
    }
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to request payout", data: null });
  }
}

// ─── GET /wallet/payouts ───────────────────────────────────────────────────────
export async function listMyPayouts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;

    const [payouts, total] = await Promise.all([
      Payout.listByUserId(userId, { limit, offset }),
      Payout.countByUserId(userId),
    ]);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Payouts listed",
      data: {
        payouts: payouts.map(Payout.toResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to list payouts", data: null });
  }
}
