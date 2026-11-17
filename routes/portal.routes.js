import express from "express";
import { getPublicMurtikarsStats } from "../controllers/portal.controller.js";

const router = express.Router();

/**
 * GET /api/portal/murtikars
 * Public endpoint — no auth required.
 * Returns all active murtikars, workshops, their managers, and year-wise booking counts.
 * Excludes sensitive data (pending amounts, individual payment transactions, debt).
 */
router.get("/murtikars", getPublicMurtikarsStats);
router.get("/murtikars-stats", getPublicMurtikarsStats);

export default router;

