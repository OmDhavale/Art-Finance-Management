import express from "express";
import { register, login, registerArtist } from "../controllers/auth.controller.js";

const router = express.Router();

// POST /api/auth/register  → Self-registration for Murtikars (role: owner)
router.post("/register", register);

// POST /api/auth/register/artist → Self-registration for Sketch Artists (role: sketch-artist)
router.post("/register/artist", registerArtist);

// POST /api/auth/login     → Login with phone + password, returns JWT
router.post("/login", login);

export default router;
