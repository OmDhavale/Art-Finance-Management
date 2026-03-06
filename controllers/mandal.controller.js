import Mandal from "../models/mandal.model.js";
import Booking from "../models/booking.model.js";
import { calculateGrade } from "./booking.controller.js";

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

        // Fetch ALL bookings for this mandal across all workshops (read-only history),
        // newest year first
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

// ─── Get All Mandals (with grades & pending amounts) ─────────────────────────

/**
 * GET /api/mandals
 *
 * Returns every Mandal with:
 *   - latestGrade   : grade of the most-recent booking (by year)
 *   - totalPending  : sum of remainingAmount across ALL bookings for this mandal
 *   - bookingSummary: array of { year, vendorName, workshopName, grade, remainingAmount }
 *
 * Sorted alphabetically by ganpatiTitle.
 */
export const getAllMandals = async (req, res) => {
    try {
        const mandals = await Mandal.find().sort({ ganpatiTitle: 1 }).lean();

        if (mandals.length === 0) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        const mandalIds = mandals.map((m) => m._id);

        // Fetch ALL bookings for these mandals across all workshops (read-only history)
        const allBookings = await Booking.find({ mandalId: { $in: mandalIds } })
            .sort({ year: -1 })
            .populate("vendorId", "name workshopName")
            .lean();


        // Build a map: mandalId → bookings[]
        const bookingsByMandal = {};
        for (const b of allBookings) {
            const key = b.mandalId.toString();
            if (!bookingsByMandal[key]) bookingsByMandal[key] = [];
            bookingsByMandal[key].push(b);
        }

        // Enrich each mandal
        const enriched = mandals.map((m) => {
            const bookings = bookingsByMandal[m._id.toString()] || [];

            // Latest booking (already sorted by year desc)
            const latest = bookings[0] || null;

            const totalPending = bookings.reduce(
                (sum, b) => sum + Math.max(0, b.remainingAmount || 0),
                0
            );

            const bookingSummary = bookings.map((b) => ({
                year: b.year,
                vendorName: b.vendorId?.name || "Unknown",
                workshopName: b.vendorId?.workshopName || "",
                grade: calculateGrade(b.remainingAmount || 0),
                remainingAmount: b.remainingAmount || 0,
                finalPrice: b.finalPrice || 0,
                totalPaid: b.totalPaid || 0,
            }));

            return {
                ...m,
                latestGrade: latest ? calculateGrade(latest.remainingAmount || 0) : null,
                latestYear: latest?.year || null,
                totalPending,
                bookingSummary,
            };
        });

        return res.status(200).json({
            success: true,
            count: enriched.length,
            data: enriched,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};
