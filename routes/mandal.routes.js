import express from "express";
import {
    createMandal,
    searchMandals,
    getMandalDetails,
    getAllMandals,
} from "../controllers/mandal.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// All mandal routes require a logged-in user
router.use(verifyToken);

// POST   /api/mandals              → Create a new Mandal
router.post("/", createMandal);

// GET    /api/mandals              → Get ALL mandals with grades & pending amounts
// NOTE: must be declared before /search and /:mandalId
router.get("/", getAllMandals);

// GET    /api/mandals/search?q=    → Search mandals by title / name / area
// NOTE: /search must be declared before /:mandalId to avoid route conflict
router.get("/search", searchMandals);

// GET    /api/mandals/:mandalId    → Get Mandal profile + booking history
router.get("/:mandalId", getMandalDetails);

export default router;
