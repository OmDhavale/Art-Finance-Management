import Mandal from "../models/mandal.model.js";
import Booking from "../models/booking.model.js";

// ─── Create Mandal ────────────────────────────────────────────────────────────

/**
 * POST /api/mandals
 * Creates a new Mandal profile.
 * Enforces uniqueness on ganpatiTitle + area via the model's compound index.
 */
export const createMandal = async (req, res) => {
    try {
        const { ganpatiTitle, mandalName, area, city, phone, createdBy } = req.body;

        const mandal = await Mandal.create({
            ganpatiTitle,
            mandalName,
            area,
            city,
            phone,
            createdBy,
        });

        return res.status(201).json({
            success: true,
            data: mandal,
        });
    } catch (error) {
        // MongoDB duplicate key error code
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A Mandal with this Ganpati title already exists in this area.",
            });
        }

        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Search Mandals ───────────────────────────────────────────────────────────

/**
 * GET /api/mandals/search?q=keyword
 * Case-insensitive regex search across ganpatiTitle, mandalName, and area.
 */
export const searchMandals = async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Search query 'q' is required.",
            });
        }

        const regex = new RegExp(q.trim(), "i");

        const mandals = await Mandal.find({
            $or: [
                { ganpatiTitle: regex },
                { mandalName: regex },
                { area: regex },
            ],
        });

        return res.status(200).json({
            success: true,
            count: mandals.length,
            data: mandals,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Get Mandal Details with Booking History ──────────────────────────────────

/**
 * GET /api/mandals/:mandalId
 * Returns the Mandal profile along with all its bookings sorted by year descending.
 */
export const getMandalDetails = async (req, res) => {
    try {
        const { mandalId } = req.params;

        const mandal = await Mandal.findById(mandalId).populate("createdBy", "name workshopName phone");

        if (!mandal) {
            return res.status(404).json({
                success: false,
                message: "Mandal not found.",
            });
        }

        // Fetch all bookings for this mandal, newest year first
        const bookings = await Booking.find({ mandalId })
            .sort({ year: -1 })
            .populate("vendorId", "name workshopName phone");

        return res.status(200).json({
            success: true,
            data: {
                mandal,
                bookingHistory: bookings,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};
