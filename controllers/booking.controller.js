import Booking from "../models/booking.model.js";

// ─── Helper: Calculate Grade ──────────────────────────────────────────────────

/**
 * calculateGrade(remainingAmount) → "green" | "yellow" | "orange" | "red"
 *
 * Grade logic:
 *   remainingAmount === 0        → green  (fully paid)
 *   remainingAmount < 10,000    → yellow (almost done)
 *   remainingAmount < 50,000    → orange (partially paid)
 *   remainingAmount >= 50,000   → red    (largely unpaid)
 */
export const calculateGrade = (remainingAmount) => {
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
            vendorId,
            year,
            murtiSize,
            originalPrice,
            finalPrice,
            advancePaid = 0,
        } = req.body;

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
                createdAt: new Date(),
            });
        }

        const booking = await Booking.create({
            mandalId,
            vendorId,
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
            .populate("vendorId", "name workshopName phone");

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
            addedBy,
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
        const { bookingId } = req.params;
        const { finalPrice } = req.body;

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

        booking.finalPrice = finalPrice;
        booking.remainingAmount = finalPrice - (booking.totalPaid || 0);
        booking.grade = calculateGrade(booking.remainingAmount);

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
