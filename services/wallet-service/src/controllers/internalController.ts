import { Request, Response } from "express";
import * as Wallet from "../models/Wallet";

export async function ensureWallet(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const userId = typeof body.user_id === "string" ? body.user_id : null;
    const currency = typeof body.currency === "string" ? body.currency : "IQD";

    if (!userId) {
      res.status(400).json({ success: false, status: "ERROR", message: "user_id is required", data: null });
      return;
    }

    const wallet = await Wallet.ensureWallet(userId, currency);
    res.status(200).json({
      success: true, status: "OK", message: "Wallet ready",
      data: { wallet: Wallet.toResponse(wallet) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to ensure wallet", data: null });
  }
}

export async function debitWallet(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const userId = typeof body.user_id === "string" ? body.user_id : null;
    const amount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount));
    const type = (typeof body.type === "string" ? body.type : "order_payment") as Wallet.TransactionType;
    const referenceType = typeof body.reference_type === "string" ? body.reference_type : undefined;
    const referenceId = typeof body.reference_id === "string" ? body.reference_id : undefined;
    const note = typeof body.note === "string" ? body.note : undefined;

    if (!userId) {
      res.status(400).json({ success: false, status: "ERROR", message: "user_id is required", data: null });
      return;
    }
    if (!amount || amount <= 0 || !isFinite(amount)) {
      res.status(400).json({ success: false, status: "ERROR", message: "amount must be a positive number", data: null });
      return;
    }

    const tx = await Wallet.debit({ userId, amount: Number(amount.toFixed(2)), type, referenceType, referenceId, note });
    res.status(200).json({
      success: true, status: "OK", message: "Wallet debited",
      data: { transaction: Wallet.transactionToResponse(tx) },
    });
  } catch (err) {
    if (err instanceof Wallet.InsufficientBalanceError) {
      res.status(402).json({
        success: false, status: "ERROR",
        message: err.message,
        data: { balance: err.balance, required: err.required },
      });
      return;
    }
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to debit wallet", data: null });
  }
}

export async function creditWallet(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const userId = typeof body.user_id === "string" ? body.user_id : null;
    const amount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount));
    const type = (typeof body.type === "string" ? body.type : "order_earning") as Wallet.TransactionType;
    const referenceType = typeof body.reference_type === "string" ? body.reference_type : undefined;
    const referenceId = typeof body.reference_id === "string" ? body.reference_id : undefined;
    const note = typeof body.note === "string" ? body.note : undefined;

    if (!userId) {
      res.status(400).json({ success: false, status: "ERROR", message: "user_id is required", data: null });
      return;
    }
    if (!amount || amount <= 0 || !isFinite(amount)) {
      res.status(400).json({ success: false, status: "ERROR", message: "amount must be a positive number", data: null });
      return;
    }

    await Wallet.ensureWallet(userId);
    const tx = await Wallet.credit({ userId, amount: Number(amount.toFixed(2)), type, referenceType, referenceId, note });
    res.status(200).json({
      success: true, status: "OK", message: "Wallet credited",
      data: { transaction: Wallet.transactionToResponse(tx) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to credit wallet", data: null });
  }
}
