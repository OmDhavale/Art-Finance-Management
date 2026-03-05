import express from "express";
import {
    createMandal,
    searchMandals,
    getMandalDetails,
} from "../controllers/mandal.controller.js";

const router = express.Router();

// POST   /api/mandals              → Create a new Mandal
router.post("/", createMandal);

// GET    /api/mandals/search?q=    → Search mandals by title / name / area
// NOTE: /search must be declared before /:mandalId to avoid route conflict
router.get("/search", searchMandals);

// GET    /api/mandals/:mandalId    → Get Mandal profile + booking history
router.get("/:mandalId", getMandalDetails);

export default router;
