import app from "./app";
import config from "./config/index";

const PORT = config.PORT || 3006;

app.listen(PORT, () => {
  if (process.env.NODE_ENV !== "test") {
    console.log(`Notification service listening on port ${PORT}`);
  }
});

process.on("SIGTERM", () => {
  process.exit(0);
});

process.on("SIGINT", () => {
  process.exit(0);
});
