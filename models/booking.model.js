import mongoose from "mongoose";

const { Schema, model } = mongoose;

/**
 * BOOKING MODEL
 *
 * Business Logic Notes:
 * - Each booking represents a Murti order for a specific Mandal + Vendor (Murtikar) + Year.
 * - A Mandal can only have ONE booking per year (enforced via unique index on mandalId + year).
 *
 * Payments are stored as an embedded array (payments[]) inside each booking document.
 * This avoids a separate Payment collection and keeps all payment history co-located.
 *
 * Payment tracking:
 * - On each new payment, controller pushes into booking.payments[].
 * - totalPaid is recalculated as the sum of all payment amounts.
 * - remainingAmount = finalPrice - totalPaid.
 *
 * Grade (payment status indicator):
 *   - "green"  → remainingAmount === 0         (Fully paid)
 *   - "yellow" → remainingAmount < 10,000      (Almost done)
 *   - "orange" → remainingAmount < 50,000      (Partially paid)
 *   - "red"    → remainingAmount >= 50,000     (Largely unpaid)
 *
 * Grade should be computed and stored each time totalPaid or finalPrice is updated.
 */

// ─── Embedded Payment Sub-Schema ─────────────────────────────────────────────

const paymentSchema = new Schema(
    {
        amount: {
            type: Number,
            required: [true, "Payment amount is required"],
            min: [1, "Payment amount must be at least 1"],
        },
        paymentMode: {
            type: String,
            enum: {
                values: ["cash", "upi", "bank", "cheque"],
                message: "Payment mode must be one of: cash, upi, bank, cheque",
            },
        },
        paymentDate: {
            type: Date,
        },
        /** The Murtikar (User) who recorded this payment entry. */
        addedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        /** Whether this payment was the initial booking advance. */
        isAdvance: {
            type: Boolean,
            default: false,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: true, versionKey: false }
);

// ─── Booking Schema ───────────────────────────────────────────────────────────

const bookingSchema = new Schema(
    {
        mandalId: {
            type: Schema.Types.ObjectId,
            ref: "Mandal",
            required: [true, "Mandal reference is required"],
        },
        vendorId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Vendor (Murtikar) reference is required"],
        },
        year: {
            type: Number,
            required: [true, "Booking year is required"],
        },
        murtiSize: {
            type: String,
            trim: true,
        },
        originalPrice: {
            type: Number,
            min: [0, "Original price cannot be negative"],
        },
        finalPrice: {
            type: Number,
            min: [0, "Final price cannot be negative"],
        },
        /**
         * advancePaid: advance amount collected at booking time (used to seed payments[]).
         * totalPaid:   running sum of all payments[].amount values.
         * remainingAmount: finalPrice - totalPaid (recomputed on every payment).
         */
        advancePaid: {
            type: Number,
            default: 0,
            min: [0, "Advance paid cannot be negative"],
        },
        totalPaid: {
            type: Number,
            default: 0,
            min: [0, "Total paid cannot be negative"],
        },
        remainingAmount: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: {
                values: ["active", "completed", "pending", "cancelled"],
                message: "Status must be one of: active, completed, pending, cancelled",
            },
            default: "active",
        },
        /**
         * Grade reflects how much of the payment is still remaining.
         * Computed and stored by the controller when payments are updated.
         *
         * green  → remainingAmount === 0
         * yellow → remainingAmount < 10,000
         * orange → remainingAmount < 50,000
         * red    → remainingAmount >= 50,000
         */
        grade: {
            type: String,
            enum: {
                values: ["excellent", "green", "yellow", "orange", "red"],
                message: "Grade must be one of: excellent, green, yellow, orange, red",
            },
        },
        /** When true, no further price edits are permitted (set after full payment). */
        isPriceLocked: {
            type: Boolean,
            default: false,
        },
        /** Audit trail of every finalPrice change. */
        priceHistory: [
            {
                oldPrice: Number,
                newPrice: Number,
                changedBy: {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                },
                reason: String,
                changedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        /** Embedded array of all payment transactions for this booking. */
        payments: {
            type: [paymentSchema],
            default: [],
        },
        /** Tracks who actually created this booking (could be owner or manager). */
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },

    },
    {
        collection: "bookings",
        versionKey: false,
    }
);

/**
 * Compound unique index: ensures a Mandal has only one booking per year.
 */
bookingSchema.index({ mandalId: 1, year: 1 }, { unique: true });

const Booking = model("Booking", bookingSchema);

export default Booking;
