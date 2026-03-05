import mongoose from "mongoose";

const { Schema, model } = mongoose;

/**
 * MANDAL MODEL
 *
 * Business Logic Notes:
 * - Each Mandal has a permanent profile created once by a Murtikar (vendorId or createdBy).
 * - The compound index on (ganpatiTitle + area) ensures no two mandals in the
 *   same area share the same Ganpati title — preventing duplicates.
 * - A Mandal can have multiple Bookings across different years (handled in Booking model).
 */

const mandalSchema = new Schema(
    {
        ganpatiTitle: {
            type: String,
            required: [true, "Ganpati title is required"],
            trim: true,
        },
        mandalName: {
            type: String,
            trim: true,
        },
        area: {
            type: String,
            required: [true, "Area is required"],
            trim: true,
        },
        city: {
            type: String,
            required: [true, "City is required"],
            trim: true,
        },
        phone: {
            type: String,
            trim: true,
        },
        /**
         * The Murtikar (User) who registered/created this Mandal entry.
         */
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        collection: "mandals",
        versionKey: false,
    }
);

/**
 * Compound unique index: prevents duplicate Mandal entries
 * with the same Ganpati title in the same area.
 */
mandalSchema.index({ ganpatiTitle: 1, area: 1 }, { unique: true });

const Mandal = model("Mandal", mandalSchema);

export default Mandal;
