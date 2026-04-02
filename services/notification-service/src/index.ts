import app from "./app";
import config from "./config/index";

const PORT = config.PORT || 3006;

async function startService() {
  try {
    app.listen(PORT, () => {
      if (process.env.NODE_ENV !== "test") {
        console.info(`Notification service listening on port ${PORT}`);
      }
    });
  } catch (err) {
    console.error("Failed to start notification service", err);
    process.exit(1);
  }
}

startService();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
