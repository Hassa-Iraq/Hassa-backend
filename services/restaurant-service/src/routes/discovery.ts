import express from "express";
import * as discoveryController from "../controllers/discoveryController";

const router = express.Router();

router.get("/restaurants", discoveryController.listRestaurants);
router.get("/restaurants/:id", discoveryController.getRestaurantPublic);
router.get("/restaurants/:id/menu", discoveryController.getRestaurantMenu);

export default router;
