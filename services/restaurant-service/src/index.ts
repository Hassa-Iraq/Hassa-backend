import app from "./app";
import config from "./config/index";
import { initializeRedis } from "./utils/redis";

const PORT = config.PORT || 3002;

async function startService() {
  try {
    initializeRedis().catch(() => { });
    app.listen(PORT, () => {
      if (process.env.NODE_ENV !== "test") {
        console.info(`Restaurant service listening on port ${PORT}`);
      }
    });
  } catch (err) {
    console.error("Failed to start restaurant service", err);
    process.exit(1);
  }
}

startService();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
