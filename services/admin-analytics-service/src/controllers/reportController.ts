import { Request, Response } from "express";
import * as Report from "../models/reportModel";

function parsePagination(req: Request) {
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function parseFilters(req: Request) {
  return {
    restaurantId: typeof req.query.restaurant_id === "string" ? req.query.restaurant_id : undefined,
    categoryId: typeof req.query.category_id === "string" ? req.query.category_id : undefined,
    zone: typeof req.query.zone === "string" ? req.query.zone : undefined,
    dateFrom: typeof req.query.date_from === "string" ? req.query.date_from : undefined,
    dateTo: typeof req.query.date_to === "string" ? req.query.date_to : undefined,
  };
}

// GET /reports/revenue-overview
export async function revenueOverview(req: Request, res: Response): Promise<void> {
  try {
    const year = typeof req.query.year === "string" ? parseInt(req.query.year) : new Date().getFullYear();
    const result = await Report.getRevenueOverview({ year });
    res.status(200).json({
      success: true, status: "OK", message: "Revenue overview retrieved",
      data: { year, ...result },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed", data: null });
  }
}

// GET /reports/transactions
export async function transactionReport(req: Request, res: Response): Promise<void> {
  try {
    const { page, limit, offset } = parsePagination(req);
    const { restaurantId, dateFrom, dateTo } = parseFilters(req);

    const [summary, rows, total] = await Promise.all([
      Report.getTransactionSummary({ restaurantId, dateFrom, dateTo }),
      Report.getTransactions({ restaurantId, dateFrom, dateTo, limit, offset }),
      Report.countTransactions({ restaurantId, dateFrom, dateTo }),
    ]);

    res.status(200).json({
      success: true, status: "OK", message: "Transaction report retrieved",
      data: {
        summary,
        transactions: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed", data: null });
  }
}

// GET /reports/food
export async function foodReport(req: Request, res: Response): Promise<void> {
  try {
    const { page, limit, offset } = parsePagination(req);
    const { restaurantId, categoryId, dateFrom, dateTo } = parseFilters(req);

    const [chart, rows, total] = await Promise.all([
      Report.getFoodReportChart({ restaurantId, dateFrom, dateTo }),
      Report.getFoodReport({ restaurantId, categoryId, dateFrom, dateTo, limit, offset }),
      Report.countFoodReport({ restaurantId, categoryId }),
    ]);

    const averageYearlySales = chart.length
      ? parseFloat((chart.reduce((s, r) => s + r.total_amount_sold, 0) / chart.length).toFixed(2))
      : 0;

    res.status(200).json({
      success: true, status: "OK", message: "Food report retrieved",
      data: {
        average_yearly_sales: averageYearlySales,
        chart,
        items: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed", data: null });
  }
}

// GET /reports/orders
export async function orderReport(req: Request, res: Response): Promise<void> {
  try {
    const { page, limit, offset } = parsePagination(req);
    const { restaurantId, zone, dateFrom, dateTo } = parseFilters(req);
    const customerId = typeof req.query.customer_id === "string" ? req.query.customer_id : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() || undefined : undefined;

    const [summary, rows, total] = await Promise.all([
      Report.getOrderReportSummary({ zone, restaurantId, customerId, dateFrom, dateTo }),
      Report.getOrderReportRows({ zone, restaurantId, customerId, dateFrom, dateTo, search, limit, offset }),
      Report.countOrderReport({ zone, restaurantId, customerId, dateFrom, dateTo, search }),
    ]);

    res.status(200).json({
      success: true, status: "OK", message: "Order report retrieved",
      data: {
        summary,
        orders: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed", data: null });
  }
}

// GET /reports/restaurants
export async function restaurantReport(req: Request, res: Response): Promise<void> {
  try {
    const { page, limit, offset } = parsePagination(req);
    const { zone, dateFrom, dateTo } = parseFilters(req);

    const [chart, rows, total] = await Promise.all([
      Report.getRestaurantReportChart({ zone, dateFrom, dateTo }),
      Report.getRestaurantReport({ zone, dateFrom, dateTo, limit, offset }),
      Report.countRestaurantReport({ zone }),
    ]);

    const averageOrderValue = chart.length
      ? parseFloat((chart.reduce((s, r) => s + r.total_order_amount, 0) / chart.length).toFixed(2))
      : 0;

    res.status(200).json({
      success: true, status: "OK", message: "Restaurant report retrieved",
      data: {
        average_order_value: averageOrderValue,
        chart,
        restaurants: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed", data: null });
  }
}

function parseWalletFilters(req: Request) {
  const rawDirection = typeof req.query.direction === "string" ? req.query.direction : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const customerId = typeof req.query.customer_id === "string" ? req.query.customer_id : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;

  const direction: "credit" | "debit" | undefined =
    rawDirection === "credit" || rawDirection === "debit" ? rawDirection : undefined;

  return {
    customerId,
    q,
    direction,
    type,
    dateFrom: typeof req.query.date_from === "string" ? req.query.date_from : undefined,
    dateTo: typeof req.query.date_to === "string" ? req.query.date_to : undefined,
  };
}

// GET /reports/wallet/transactions
export async function walletTransactionReport(req: Request, res: Response): Promise<void> {
  try {
    const { page, limit, offset } = parsePagination(req);
    const { customerId, q, direction, type, dateFrom, dateTo } = parseWalletFilters(req);

    const [summary, rows, total] = await Promise.all([
      Report.getWalletTransactionSummary({ customerId, q, direction, type, dateFrom, dateTo }),
      Report.getWalletTransactions({ customerId, q, direction, type, dateFrom, dateTo, limit, offset }),
      Report.countWalletTransactions({ customerId, q, direction, type, dateFrom, dateTo }),
    ]);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Wallet transaction report retrieved",
      data: {
        summary,
        transactions: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed",
      data: null,
    });
  }
}

// GET /reports/wallet/customers
export async function walletCustomerOptions(req: Request, res: Response): Promise<void> {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const customers = await Report.listWalletCustomers({ q, limit });
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Wallet customers listed",
      data: { customers },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed",
      data: null,
    });
  }
}
