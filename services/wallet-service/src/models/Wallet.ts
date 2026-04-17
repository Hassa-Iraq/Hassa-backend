import pool from "../db/connection";

export type TransactionType =
  | "topup"
  | "order_payment"
  | "order_refund"
  | "order_earning"
  | "delivery_earning"
  | "payout_request"
  | "payout_reversal"
  | "adjustment"
  | "bonus";

export type TransactionDirection = "credit" | "debit";
export type TransactionStatus = "pending" | "completed" | "failed" | "reversed";

export interface WalletRow {
  id: string;
  user_id: string;
  balance: string;
  currency: string;
  is_frozen: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TransactionRow {
  id: string;
  wallet_id: string;
  type: TransactionType;
  direction: TransactionDirection;
  amount: string;
  balance_before: string;
  balance_after: string;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  status: TransactionStatus;
  created_at: Date;
}

export async function ensureWallet(userId: string, currency = "IQD"): Promise<WalletRow> {
  const r = await pool.query<WalletRow>(
    `INSERT INTO wallet.wallets (user_id, currency)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId, currency]
  );
  return r.rows[0];
}

export async function findByUserId(userId: string): Promise<WalletRow | null> {
  const r = await pool.query<WalletRow>(
    "SELECT * FROM wallet.wallets WHERE user_id = $1",
    [userId]
  );
  return r.rows[0] ?? null;
}

export async function findById(id: string): Promise<WalletRow | null> {
  const r = await pool.query<WalletRow>(
    "SELECT * FROM wallet.wallets WHERE id = $1",
    [id]
  );
  return r.rows[0] ?? null;
}

export interface CreditParams {
  userId: string;
  amount: number;
  type: TransactionType;
  referenceType?: string;
  referenceId?: string;
  note?: string;
}

export interface DebitParams extends CreditParams {
}

export async function credit(params: CreditParams): Promise<TransactionRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const walletResult = await client.query<WalletRow>(
      "SELECT * FROM wallet.wallets WHERE user_id = $1 FOR UPDATE",
      [params.userId]
    );
    const wallet = walletResult.rows[0];
    if (!wallet) throw new Error("Wallet not found");
    if (wallet.is_frozen) throw new Error("Wallet is frozen");

    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = Number((balanceBefore + params.amount).toFixed(2));

    await client.query(
      "UPDATE wallet.wallets SET balance = $1 WHERE id = $2",
      [balanceAfter, wallet.id]
    );

    const txResult = await client.query<TransactionRow>(
      `INSERT INTO wallet.transactions
         (wallet_id, type, direction, amount, balance_before, balance_after,
          reference_type, reference_id, note, status)
       VALUES ($1, $2, 'credit', $3, $4, $5, $6, $7, $8, 'completed')
       RETURNING *`,
      [
        wallet.id,
        params.type,
        params.amount,
        balanceBefore,
        balanceAfter,
        params.referenceType ?? null,
        params.referenceId ?? null,
        params.note ?? null,
      ]
    );

    await client.query("COMMIT");
    return txResult.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function debit(params: DebitParams): Promise<TransactionRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const walletResult = await client.query<WalletRow>(
      "SELECT * FROM wallet.wallets WHERE user_id = $1 FOR UPDATE",
      [params.userId]
    );
    const wallet = walletResult.rows[0];
    if (!wallet) throw new Error("Wallet not found");
    if (wallet.is_frozen) throw new Error("Wallet is frozen");

    const balanceBefore = parseFloat(wallet.balance);
    if (balanceBefore < params.amount) {
      throw new InsufficientBalanceError(balanceBefore, params.amount);
    }

    const balanceAfter = Number((balanceBefore - params.amount).toFixed(2));

    await client.query(
      "UPDATE wallet.wallets SET balance = $1 WHERE id = $2",
      [balanceAfter, wallet.id]
    );

    const txResult = await client.query<TransactionRow>(
      `INSERT INTO wallet.transactions
         (wallet_id, type, direction, amount, balance_before, balance_after,
          reference_type, reference_id, note, status)
       VALUES ($1, $2, 'debit', $3, $4, $5, $6, $7, $8, 'completed')
       RETURNING *`,
      [
        wallet.id,
        params.type,
        params.amount,
        balanceBefore,
        balanceAfter,
        params.referenceType ?? null,
        params.referenceId ?? null,
        params.note ?? null,
      ]
    );

    await client.query("COMMIT");
    return txResult.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listTransactions(
  walletId: string,
  opts: { limit: number; offset: number }
): Promise<TransactionRow[]> {
  const r = await pool.query<TransactionRow>(
    `SELECT * FROM wallet.transactions
     WHERE wallet_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [walletId, opts.limit, opts.offset]
  );
  return r.rows;
}

export async function countTransactions(walletId: string): Promise<number> {
  const r = await pool.query<{ total: number }>(
    "SELECT COUNT(*)::int AS total FROM wallet.transactions WHERE wallet_id = $1",
    [walletId]
  );
  return r.rows[0]?.total ?? 0;
}

export async function listAllWallets(opts: {
  limit: number;
  offset: number;
}): Promise<WalletRow[]> {
  const r = await pool.query<WalletRow>(
    "SELECT * FROM wallet.wallets ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    [opts.limit, opts.offset]
  );
  return r.rows;
}

export async function countAllWallets(): Promise<number> {
  const r = await pool.query<{ total: number }>(
    "SELECT COUNT(*)::int AS total FROM wallet.wallets"
  );
  return r.rows[0]?.total ?? 0;
}

export async function setFrozen(userId: string, frozen: boolean): Promise<WalletRow | null> {
  const r = await pool.query<WalletRow>(
    "UPDATE wallet.wallets SET is_frozen = $1 WHERE user_id = $2 RETURNING *",
    [frozen, userId]
  );
  return r.rows[0] ?? null;
}

export class InsufficientBalanceError extends Error {
  readonly balance: number;
  readonly required: number;
  constructor(balance: number, required: number) {
    super(`Insufficient wallet balance. Available: ${balance}, Required: ${required}`);
    this.name = "InsufficientBalanceError";
    this.balance = balance;
    this.required = required;
  }
}

export function toResponse(wallet: WalletRow): Record<string, unknown> {
  return {
    id: wallet.id,
    user_id: wallet.user_id,
    balance: parseFloat(wallet.balance),
    currency: wallet.currency,
    is_frozen: wallet.is_frozen,
    created_at: wallet.created_at,
    updated_at: wallet.updated_at,
  };
}

export function transactionToResponse(tx: TransactionRow): Record<string, unknown> {
  return {
    id: tx.id,
    type: tx.type,
    direction: tx.direction,
    amount: parseFloat(tx.amount),
    balance_before: parseFloat(tx.balance_before),
    balance_after: parseFloat(tx.balance_after),
    reference_type: tx.reference_type,
    reference_id: tx.reference_id,
    note: tx.note,
    status: tx.status,
    created_at: tx.created_at,
  };
}
