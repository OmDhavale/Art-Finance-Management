import express from "express";
import { createUser, getUserProfile } from "../controllers/user.controller.js";

const router = express.Router();

// POST   /api/users          → Register a new Murtikar (owner or manager)
router.post("/", createUser);

// GET    /api/users/:userId  → Get Murtikar profile
router.get("/:userId", getUserProfile);

export default router;
