import express from "express";
import * as discoveryController from "../controllers/discoveryController";
import { authenticate, authorize, optionalAuthenticate } from "../middleware/auth";

const router = express.Router();

router.get("/restaurants", optionalAuthenticate, discoveryController.listRestaurants);
router.get("/menu-items/:id", discoveryController.getMenuItemDetails);
router.get("/home", optionalAuthenticate, discoveryController.getHomeData);
router.post("/cart/validate", discoveryController.validateCart);
router.get("/restaurants/:id/details", optionalAuthenticate, discoveryController.getRestaurantWithMenu);
router.get("/restaurants/:id/menu", discoveryController.getRestaurantMenu);
router.get("/restaurants/:id", optionalAuthenticate, discoveryController.getRestaurantPublic);
router.get("/favorites", authenticate, authorize("customer", "admin"), discoveryController.listFavoriteRestaurants);
router.post(
  "/restaurants/:id/favorite",
  authenticate,
  authorize("customer", "admin"),
  discoveryController.favoriteRestaurant
);
router.delete(
  "/restaurants/:id/favorite",
  authenticate,
  authorize("customer", "admin"),
  discoveryController.unfavoriteRestaurant
);

export default router;
