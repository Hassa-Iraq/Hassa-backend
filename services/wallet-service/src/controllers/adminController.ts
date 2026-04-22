import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import * as Wallet from "../models/Wallet";
import * as Payout from "../models/Payout";

export async function listWallets(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;

    const [wallets, total] = await Promise.all([
      Wallet.listAllWallets({ limit, offset }),
      Wallet.countAllWallets(),
    ]);

    res.status(200).json({
      success: true, status: "OK", message: "Wallets listed",
      data: {
        wallets: wallets.map(Wallet.toResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to list wallets", data: null });
  }
}

export async function getUserWallet(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      res.status(404).json({ success: false, status: "ERROR", message: "Wallet not found", data: null });
      return;
    }
    const [transactions, total] = await Promise.all([
      Wallet.listTransactions(wallet.id, { limit: 20, offset: 0 }),
      Wallet.countTransactions(wallet.id),
    ]);
    res.status(200).json({
      success: true, status: "OK", message: "Wallet retrieved",
      data: {
        wallet: Wallet.toResponse(wallet),
        recent_transactions: transactions.map(Wallet.transactionToResponse),
        total_transactions: total,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to get wallet", data: null });
  }
}

export async function adjustWallet(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const body = req.body as Record<string, unknown>;
    const direction = body.direction as string;
    const amount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount));
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!["credit", "debit"].includes(direction)) {
      res.status(400).json({ success: false, status: "ERROR", message: "direction must be 'credit' or 'debit'", data: null });
      return;
    }
    if (!amount || amount <= 0 || !isFinite(amount)) {
      res.status(400).json({ success: false, status: "ERROR", message: "amount must be a positive number", data: null });
      return;
    }
    if (!note) {
      res.status(400).json({ success: false, status: "ERROR", message: "note is required for adjustments", data: null });
      return;
    }

    await Wallet.ensureWallet(userId);

    const tx = direction === "credit"
      ? await Wallet.credit({ userId, amount: Number(amount.toFixed(2)), type: "adjustment", note })
      : await Wallet.debit({ userId, amount: Number(amount.toFixed(2)), type: "adjustment", note });

    const wallet = await Wallet.findByUserId(userId);
    res.status(200).json({
      success: true, status: "OK", message: `Wallet ${direction}ed successfully`,
      data: {
        transaction: Wallet.transactionToResponse(tx),
        new_balance: wallet ? parseFloat(wallet.balance) : null,
      },
    });
  } catch (err) {
    if (err instanceof Wallet.InsufficientBalanceError) {
      res.status(400).json({ success: false, status: "ERROR", message: err.message, data: null });
      return;
    }
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to adjust wallet", data: null });
  }
}

export async function addFunds(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const body = req.body as Record<string, unknown>;
    const amount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount));
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!amount || amount <= 0 || !isFinite(amount)) {
      res.status(400).json({ success: false, status: "ERROR", message: "amount must be a positive number", data: null });
      return;
    }
    if (!note) {
      res.status(400).json({ success: false, status: "ERROR", message: "note is required", data: null });
      return;
    }

    await Wallet.ensureWallet(userId);
    const tx = await Wallet.credit({ userId, amount: Number(amount.toFixed(2)), type: "adjustment", note });
    const wallet = await Wallet.findByUserId(userId);

    res.status(200).json({
      success: true, status: "OK", message: "Funds added successfully",
      data: {
        transaction: Wallet.transactionToResponse(tx),
        new_balance: wallet ? parseFloat(wallet.balance) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to add funds", data: null });
  }
}

export async function freezeWallet(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const body = req.body as Record<string, unknown>;
    const frozen = body.is_frozen === true;

    const wallet = await Wallet.setFrozen(userId, frozen);
    if (!wallet) {
      res.status(404).json({ success: false, status: "ERROR", message: "Wallet not found", data: null });
      return;
    }
    res.status(200).json({
      success: true, status: "OK",
      message: frozen ? "Wallet frozen" : "Wallet unfrozen",
      data: { wallet: Wallet.toResponse(wallet) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to update wallet", data: null });
  }
}

export async function listPayouts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const status = typeof req.query.status === "string" ? req.query.status as Payout.PayoutStatus : undefined;

    const [payouts, total] = await Promise.all([
      Payout.listAll({ limit, offset, status }),
      Payout.countAll(status),
    ]);

    res.status(200).json({
      success: true, status: "OK", message: "Payouts listed",
      data: {
        payouts: payouts.map(Payout.toResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to list payouts", data: null });
  }
}

export async function approvePayout(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const payout = await Payout.findById(id);
    if (!payout) {
      res.status(404).json({ success: false, status: "ERROR", message: "Payout not found", data: null });
      return;
    }
    if (payout.status !== "pending") {
      res.status(400).json({ success: false, status: "ERROR", message: `Payout already ${payout.status}`, data: null });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const note = typeof body.note === "string" ? body.note : undefined;
    const updated = await Payout.updateStatus(id, "approved", req.user!.id, note);
    res.status(200).json({
      success: true, status: "OK", message: "Payout approved",
      data: { payout: updated ? Payout.toResponse(updated) : null },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to approve payout", data: null });
  }
}

export async function rejectPayout(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const payout = await Payout.findById(id);
    if (!payout) {
      res.status(404).json({ success: false, status: "ERROR", message: "Payout not found", data: null });
      return;
    }
    if (payout.status !== "pending") {
      res.status(400).json({ success: false, status: "ERROR", message: `Payout already ${payout.status}`, data: null });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const note = typeof body.note === "string" ? body.note : "Rejected by admin";

    await Wallet.credit({
      userId: payout.user_id,
      amount: parseFloat(payout.amount),
      type: "payout_reversal",
      referenceType: "payout",
      referenceId: payout.id,
      note: `Payout rejected: ${note}`,
    });

    const updated = await Payout.updateStatus(id, "rejected", req.user!.id, note);
    res.status(200).json({
      success: true, status: "OK", message: "Payout rejected and funds returned to wallet",
      data: { payout: updated ? Payout.toResponse(updated) : null },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to reject payout", data: null });
  }
}
