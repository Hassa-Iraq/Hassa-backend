import app from "./app";
import config from "./config/index";

const PORT = config.PORT || 3004;

app.listen(PORT, () => {
  console.info(`Delivery service started on port ${PORT} in ${config.NODE_ENV} mode`);
});

process.on("SIGTERM", () => {
  console.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});
