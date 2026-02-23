import app from "./app";
import config from "./config/index";
import pool from "./db/connection";
import { hashPassword } from "./utils/password";
import { initializeFirstUser } from "shared/admin-initializer/index";

async function initializeAdmin() {
  try {
    const result = await initializeFirstUser({
      pool,
      roleName: "admin",
      defaultEmail: process.env.FIRST_ADMIN_EMAIL || "admin@foodapp.com",
      defaultPassword: process.env.FIRST_ADMIN_PASSWORD || "Admin123!",
      hashPassword,
    });
    if (result.created && result.user?.id) {
      await pool.query(
        "UPDATE auth.users SET phone_verified = TRUE WHERE id = $1",
        [result.user.id]
      );
    }
  } catch (_error) {
  }
}

const PORT = config.PORT || 3001;

initializeAdmin().then(() => {
  app.listen(PORT, () => {
    if (process.env.NODE_ENV !== "test") {
      console.log(`Auth service listening on port ${PORT}`);
    }
  });
});

process.on("SIGTERM", () => {
  process.exit(0);
});

process.on("SIGINT", () => {
  process.exit(0);
});
