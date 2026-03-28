import app from "./app";
import config from "./config/index";
import { sweepExpiredAssignments } from "./controllers/deliveryController";

const PORT = config.PORT || 3004;

async function startService() {
  try {
    app.listen(PORT, () => {
      if (process.env.NODE_ENV !== "test") {
        console.info(`Delivery service listening on port ${PORT}`);
      }
    });

    if (process.env.NODE_ENV !== "test") {
      const interval = Number(config.AUTO_ASSIGN_SWEEP_INTERVAL_MS || 15000);
      setInterval(() => {
        sweepExpiredAssignments().catch(() => {});
      }, Number.isFinite(interval) && interval > 1000 ? interval : 15000);
    }
  } catch (err) {
    console.error("Failed to start delivery service", err);
    process.exit(1);
  }
}

startService();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
