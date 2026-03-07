import Mandal from "../models/mandal.model.js";
import Booking from "../models/booking.model.js";
import { calculateGrade } from "./booking.controller.js";

// ─── Helper: Calculate Overall Mandal Grade ───────────────────────────────────

/**
 * calculateOverallGrade(netPending) → "O" | "A" | "B" | "C" | "D" | null
 *
 * Grade is based on the SUM of remainingAmount across ALL bookings for a mandal
 * (this sum can be negative if the mandal has ever over-paid).
 *
 *   netPending < 0          → "O"  (Outstanding — overpaid the murtikar)
 *   netPending === 0        → "A"  (Excellent — all bookings fully cleared)
 *   netPending < 5,000      → "B"  (Good payer)
 *   netPending < 50,000     → "C"  (Average payer)
 *   netPending >= 50,000    → "D"  (Poor payer — large dues)
 *
 * Returns null when the mandal has no bookings at all.
 */
export const calculateOverallGrade = (netPending) => {
    if (netPending < 0) return "O";
    if (netPending === 0) return "A";
    if (netPending < 5000) return "B";
    if (netPending < 50000) return "C";
    return "D";
};

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
        }).lean();

        // Enrich each result with overallGrade from booking history
        let enriched = mandals;
        if (mandals.length > 0) {
            const mandalIds = mandals.map((m) => m._id);
            const allBookings = await Booking.find({ mandalId: { $in: mandalIds } }).lean();

            // Map mandalId → summed remainingAmount
            const pendingMap = {};
            const hasBookingMap = {};
            for (const b of allBookings) {
                const key = b.mandalId.toString();
                pendingMap[key] = (pendingMap[key] || 0) + (b.remainingAmount || 0);
                hasBookingMap[key] = true;
            }

            enriched = mandals.map((m) => {
                const key = m._id.toString();
                const overallGrade = hasBookingMap[key]
                    ? calculateOverallGrade(pendingMap[key] || 0)
                    : null;
                return { ...m, overallGrade };
            });
        }

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


        // Compute the mandal's overall grade from its full booking history
        const netPending = bookings.reduce(
            (sum, b) => sum + (b.remainingAmount || 0),
            0
        );
        const overallGrade = bookings.length > 0
            ? calculateOverallGrade(netPending)
            : null;

        return res.status(200).json({
            success: true,
            data: {
                mandal: { ...mandal.toObject(), overallGrade },
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

            // Net pending = raw sum (can be negative for overpaid mandals)
            const netPending = bookings.reduce(
                (sum, b) => sum + (b.remainingAmount || 0),
                0
            );
            const overallGrade = bookings.length > 0
                ? calculateOverallGrade(netPending)
                : null;

            return {
                ...m,
                latestGrade: latest ? calculateGrade(latest.remainingAmount || 0) : null,
                latestYear: latest?.year || null,
                totalPending,
                overallGrade,
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
