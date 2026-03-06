import express from "express";
import { register, login } from "../controllers/auth.controller.js";

const router = express.Router();

// POST /api/auth/register  → Self-registration for Murtikars (role: owner)
router.post("/register", register);

// POST /api/auth/login     → Login with phone + password, returns JWT
router.post("/login", login);

export default router;
