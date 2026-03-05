import mongoose from "mongoose";

const { Schema, model } = mongoose;

/**
 * PAYMENT MODEL
 *
 * Business Logic Notes:
 * - Each document represents a single payment transaction toward a Booking.
 * - After a payment is saved, the controller should:
 *     1. Add payment.amount to booking.totalPaid
 *     2. Recalculate: booking.remainingAmount = booking.finalPrice - booking.totalPaid
 *     3. Recompute booking.grade based on remainingAmount:
 *          - remainingAmount === 0        → "green"
 *          - remainingAmount < 10,000    → "yellow"
 *          - remainingAmount < 50,000    → "orange"
 *          - remainingAmount >= 50,000   → "red"
 *     4. If remainingAmount === 0, optionally update booking.status to "completed"
 */

const paymentSchema = new Schema(
    {
        bookingId: {
            type: Schema.Types.ObjectId,
            ref: "Booking",
            required: [true, "Booking reference is required"],
        },
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
        /**
         * addedBy: references the Murtikar (User) who recorded this payment.
         */
        addedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        collection: "payments",
        versionKey: false,
    }
);

const Payment = model("Payment", paymentSchema);

export default Payment;
