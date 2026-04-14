import express from "express";
import * as searchController from "../controllers/searchController";

const router = express.Router();

router.get("/", searchController.globalSearch);
router.get("/restaurants", searchController.searchRestaurants);
router.get("/menu-items", searchController.searchMenuItems);

export default router;
