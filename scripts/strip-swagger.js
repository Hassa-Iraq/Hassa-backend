const fs = require("fs");
const path = require("path");

const routeFiles = [
  "services/auth-service/src/routes/auth.ts",
  "services/auth-service/src/routes/health.ts",
  "services/notification-service/src/routes/notifications.ts",
  "services/notification-service/src/routes/health.ts",
  "services/admin-analytics-service/src/routes/banners.ts",
  "services/admin-analytics-service/src/routes/coupons.ts",
  "services/admin-analytics-service/src/routes/health.ts",
  "services/restaurant-service/src/routes/menu-categories.ts",
  "services/restaurant-service/src/routes/discovery.ts",
  "services/restaurant-service/src/routes/restaurants.ts",
  "services/restaurant-service/src/routes/health.ts",
  "services/restaurant-service/src/routes/menu-items.ts",
  "services/restaurant-service/src/routes/banners.ts",
  "services/restaurant-service/src/routes/search.ts",
  "services/order-service/src/routes/health.ts",
  "services/payment-service/src/routes/health.ts",
  "services/delivery-service/src/routes/health.ts",
];

const swaggerBlockRe = /\s*\/\*\*[\s\S]*?@swagger[\s\S]*?\*\/\n?/g;

const root = path.join(__dirname, "..");
let totalRemoved = 0;

routeFiles.forEach((rel) => {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) {
    console.warn("Skip (not found):", rel);
    return;
  }
  let content = fs.readFileSync(filePath, "utf8");
  const before = content.length;
  content = content.replace(swaggerBlockRe, "\n");
  content = content.replace(/\n{3,}/g, "\n\n");
  const after = content.length;
  if (before !== after) {
    fs.writeFileSync(filePath, content, "utf8");
    totalRemoved += (before - after);
  }
});