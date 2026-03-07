import Booking from "../models/booking.model.js";
import mongoose from "mongoose";

// ─── Helper: Calculate Grade ──────────────────────────────────────────────────

/**
 * calculateGrade(remainingAmount) → "excellent" | "green" | "yellow" | "orange" | "red"
 *
 * Grade logic:
 *   remainingAmount < 0         → excellent (overpaid — mandal gave extra)
 *   remainingAmount === 0       → green     (fully paid)
 *   remainingAmount < 10,000   → yellow    (almost done)
 *   remainingAmount < 50,000   → orange    (partially paid)
 *   remainingAmount >= 50,000  → red       (largely unpaid)
 */
export const calculateGrade = (remainingAmount) => {
    if (remainingAmount < 0) return "excellent";
    if (remainingAmount === 0) return "green";
    if (remainingAmount < 10000) return "yellow";
    if (remainingAmount < 50000) return "orange";
    return "red";
};


// ─── Create Booking ───────────────────────────────────────────────────────────

/**
 * POST /api/bookings
 * Creates a new booking for a Mandal+Vendor+Year combination.
 *
 * Business Logic:
 *  - Prevents duplicate booking for the same mandal + year (unique index handles DB level,
 *    but we also do a pre-check for a cleaner error message).
 *  - If advancePaid > 0, it is pushed as the first entry in the payments[] array.
 *  - totalPaid = advancePaid, remainingAmount = finalPrice - advancePaid.
 *  - Grade is computed from remainingAmount.
 */
export const createBooking = async (req, res) => {
    try {
        const {
            mandalId,
            year,
            murtiSize,
            originalPrice,
            finalPrice,
            advancePaid = 0,
        } = req.body;

        // Consolidate data under the workshop owner
        // If current user is a manager, the actual vendor is their owner
        const vendorId = req.user.role === 'manager' ? req.user.ownerId : req.user._id;

        if (!vendorId) {
            return res.status(400).json({ success: false, message: "Could not determine workshop owner." });
        }


        // Pre-check for duplicate booking (provides a better error message than the index)
        const existing = await Booking.findOne({ mandalId, year });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: `A booking for this Mandal already exists for the year ${year}.`,
            });
        }

        const totalPaid = advancePaid;
        const remainingAmount = (finalPrice || 0) - totalPaid;
        const grade = calculateGrade(remainingAmount);

        // Seed payments array with the advance payment (if any)
        const payments = [];
        if (advancePaid > 0) {
            payments.push({
                amount: advancePaid,
                paymentMode: "cash",          // default mode for advance; can be updated later
                paymentDate: new Date(),
                addedBy: req.user?._id,       // track who created the booking and advance payment
                isAdvance: true,              // mark as initial advance
                createdAt: new Date(),
            });
        }

        const booking = await Booking.create({
            mandalId,
            vendorId,
            createdBy: req.user._id,   // tracks the actual person (owner or manager) who created it
            year,
            murtiSize,
            originalPrice,
            finalPrice,
            advancePaid,
            totalPaid,
            remainingAmount,
            grade,
            payments,
        });


        return res.status(201).json({
            success: true,
            data: booking,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A booking for this Mandal already exists for the given year.",
            });
        }

        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(400).json({
                success: false,
                message: messages.join(", "),
            });
        }

        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Get Booking Details ──────────────────────────────────────────────────────

/**
 * GET /api/bookings/:bookingId
 * Returns full booking details including embedded payment history.
 */
export const getBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        const booking = await Booking.findById(bookingId)
            .populate("mandalId", "ganpatiTitle mandalName area city")
            .populate("vendorId", "name workshopName phone")
            .populate("payments.addedBy", "name role");

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Booking not found.",
            });
        }

        return res.status(200).json({
            success: true,
            data: booking,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Add Payment to Booking ───────────────────────────────────────────────────

/**
 * POST /api/bookings/:bookingId/payments
 * Appends a payment to booking.payments[], then recalculates totals and grade.
 *
 * Business Logic:
 *  - Push new payment object into payments array.
 *  - totalPaid = sum of all payments[].amount.
 *  - remainingAmount = finalPrice - totalPaid.
 *  - Recalculate grade using calculateGrade().
 */
export const addPayment = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { paymentMode, paymentDate, addedBy } = req.body;

        // Coerce to number to safely handle values sent as strings (e.g. from form data)
        const amount = Number(req.body.amount);

        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Payment amount must be a valid number greater than 0.",
            });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Booking not found.",
            });
        }

        // Push the new payment into the embedded array
        booking.payments.push({
            amount,
            paymentMode,
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            addedBy: req.user?._id,   // track who added this payment
            createdAt: new Date(),
        });


        // Recalculate totalPaid as the sum of all embedded payments
        booking.totalPaid = booking.payments.reduce(
            (sum, p) => sum + p.amount,
            0
        );

        // Recalculate remainingAmount and grade
        booking.remainingAmount = (booking.finalPrice || 0) - booking.totalPaid;
        booking.grade = calculateGrade(booking.remainingAmount);

        // Auto-complete and lock price when fully paid (remainingAmount <= 0)
        if (booking.remainingAmount <= 0) {
            booking.status = "completed";
            booking.isPriceLocked = true;
        }

        await booking.save();

        return res.status(200).json({
            success: true,
            data: booking,
        });
    } catch (error) {
        if (error.name === "ValidationError") {
            const messages = Object.values(error.errors).map((e) => e.message);
            return res.status(400).json({
                success: false,
                message: messages.join(", "),
            });
        }

        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Update Booking Price (Negotiation) ───────────────────────────────────────

/**
 * PATCH /api/bookings/:bookingId/price
 * Updates finalPrice after negotiation, then recalculates remainingAmount and grade.
 *
 * Business Logic:
 *  - remainingAmount = new finalPrice - totalPaid.
 *  - Grade is recalculated based on new remainingAmount.
 */
export const updateBookingPrice = async (req, res) => {
    try {
        // ── Role guard: only owners may edit price ─────────────────────────────
        if (req.user?.role === 'manager') {
            return res.status(403).json({
                success: false,
                message: "Managers cannot edit the final price. Please contact the workshop owner.",
            });
        }

        const { bookingId } = req.params;

        const { finalPrice, reason } = req.body;
        const changedBy = req.user?._id;

        if (finalPrice === undefined || finalPrice < 0) {
            return res.status(400).json({
                success: false,
                message: "A valid finalPrice is required.",
            });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Booking not found.",
            });
        }

        // ── Guard 1: Price is locked (full payment already made) ──────────────
        if (booking.isPriceLocked) {
            return res.status(403).json({
                success: false,
                message: "Price cannot be edited after full payment.",
            });
        }

        const currentPrice = booking.finalPrice || 0;

        // ── Guard 2: Price increase is never allowed ───────────────────────────
        if (finalPrice > currentPrice) {
            return res.status(400).json({
                success: false,
                message: "Price increase is not allowed after booking.",
            });
        }

        // ── Guard 3: No price increase after any payment exists ───────────────
        if ((booking.totalPaid || 0) > 0 && finalPrice > currentPrice) {
            return res.status(400).json({
                success: false,
                message: "Price increase is not allowed after payments are made.",
            });
        }

        // ── Record audit trail ────────────────────────────────────────────────
        booking.priceHistory.push({
            oldPrice: currentPrice,
            newPrice: finalPrice,
            changedBy,
            reason: reason || "Negotiation",
            changedAt: new Date(),
        });

        // ── Apply price change ────────────────────────────────────────────────
        booking.finalPrice = finalPrice;
        booking.remainingAmount = finalPrice - (booking.totalPaid || 0);
        booking.grade = calculateGrade(booking.remainingAmount);

        // ── Auto-lock if remaining is now 0 or less ───────────────────────────
        if (booking.remainingAmount <= 0) {
            booking.isPriceLocked = true;
            booking.status = "completed";
        }

        await booking.save();

        return res.status(200).json({
            success: true,
            data: booking,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Close Booking ────────────────────────────────────────────────────────────

/**
 * PATCH /api/bookings/:bookingId/close
 * Closes the booking by setting its status based on remaining balance.
 *
 * Business Logic:
 *  - If remainingAmount === 0 → status = "completed"
 *  - Else                     → status = "pending"
 */
export const closeBooking = async (req, res) => {
    try {
        // ── Role guard: only owners may close a booking ────────────────────────
        if (req.user?.role === 'manager') {
            return res.status(403).json({
                success: false,
                message: "Managers cannot close bookings. Please contact the workshop owner.",
            });
        }

        const { bookingId } = req.params;


        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Booking not found.",
            });
        }

        booking.status = booking.remainingAmount === 0 ? "completed" : "pending";

        await booking.save();

        return res.status(200).json({
            success: true,
            message: `Booking closed with status: ${booking.status}`,
            data: booking,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Get My Bookings (Vendor) ──────────────────────────────────────────────────────────

/**
 * GET /api/bookings/my
 * Returns all bookings for the authenticated vendor (req.user.id),
 * sorted by year descending, with mandal info populated.
 */
export const getMyBookings = async (req, res) => {
    try {
        // Determine the workshop owner ID
        const vendorId = req.user.role === 'owner' ? req.user._id : req.user.ownerId;

        if (!vendorId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Workshop owner not found." });
        }


        const bookings = await Booking.find({ vendorId })
            .populate("mandalId", "ganpatiTitle mandalName area city")
            .populate("vendorId", "name workshopName")          // for workshop name display
            .populate("createdBy", "name role")                 // for "Booked by" attribution
            .sort({ year: -1, createdAt: -1 });


        return res.status(200).json({
            success: true,
            data: bookings,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Delete Booking ────────────────────────────────────────────────────────────

/**
 * DELETE /api/bookings/:bookingId
 * Deletes a booking. Only the vendor who created it can delete it.
 */
export const deleteBooking = async (req, res) => {
    try {
        // ── Role guard: only owners may delete a booking ───────────────────────
        if (req.user?.role === 'manager') {
            return res.status(403).json({
                success: false,
                message: "Managers cannot delete bookings. Please contact the workshop owner.",
            });
        }

        const { bookingId } = req.params;
        const ownerId = (req.user.role === 'owner' ? req.user._id : req.user.ownerId).toString();



        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found." });
        }

        // Only the workshop (owner and their managers) may delete it
        if (booking.vendorId.toString() !== ownerId) {
            return res.status(403).json({ success: false, message: "You can only delete bookings belonging to your workshop." });
        }


        await booking.deleteOne();

        return res.status(200).json({ success: true, message: "Booking deleted successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};
