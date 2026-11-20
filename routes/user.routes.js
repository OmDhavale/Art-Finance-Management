import express from "express";
import {
    createUser,
    getUserProfile,
    addManager,
    getWorkshopUsers,
    requestAccountDeletion,
    cancelAccountDeletion,
    // updatePlan,
} from "../controllers/user.controller.js";
import { getPublicMurtikarsStats } from "../controllers/portal.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// GET    /api/users/public-murtikars   → Public endpoint for Mandal Portal directory & stats
router.get("/public-murtikars", getPublicMurtikarsStats);

// POST   /api/users                    → Create a Murtikar (backward-compat, no JWT returned)
router.post("/", createUser);

// POST   /api/users/add-manager        → Owner adds a manager (protected)
// NOTE: declared before /:userId to avoid route conflict
router.post("/add-manager", verifyToken, addManager);

// GET    /api/users/workshop-users     → Get owner + all managers (protected)
// NOTE: declared before /:userId to avoid route conflict
router.get("/workshop-users", verifyToken, getWorkshopUsers);

// POST   /api/users/request-account-deletion → Owner requests soft-delete (7-day grace period)
router.post("/request-account-deletion", verifyToken, requestAccountDeletion);

// POST   /api/users/cancel-account-deletion → Owner cancels pending deletion
router.post("/cancel-account-deletion", verifyToken, cancelAccountDeletion);

// POST   /api/users/update-plan       → Switch between FREE and PRO plans (protected)
//router.post("/update-plan", verifyToken, updatePlan);

export default router;
