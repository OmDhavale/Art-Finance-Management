import express from "express";
import {
    createUser,
    getUserProfile,
    addManager,
    getWorkshopUsers,
} from "../controllers/user.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// POST   /api/users                    → Create a Murtikar (backward-compat, no JWT returned)
router.post("/", createUser);

// POST   /api/users/add-manager        → Owner adds a manager (protected)
// NOTE: declared before /:userId to avoid route conflict
router.post("/add-manager", verifyToken, addManager);

// GET    /api/users/workshop-users     → Get owner + all managers (protected)
// NOTE: declared before /:userId to avoid route conflict
router.get("/workshop-users", verifyToken, getWorkshopUsers);

// GET    /api/users/:userId            → Get any user's profile
router.get("/:userId", getUserProfile);

export default router;
