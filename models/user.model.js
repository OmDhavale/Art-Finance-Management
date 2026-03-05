import mongoose from "mongoose";

const { Schema, model } = mongoose;

/**
 * USER MODEL — Murtikar (Idol Maker)
 *
 * Business Logic Notes:
 * - A "manager" role belongs to an owner (via ownerId reference).
 * - "owner" is the default role for newly registered Murtikars.
 * - Managers can operate under an owner but have restricted access (enforced in controllers).
 */

const locationSchema = new Schema(
  {
    area: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    workshopName: {
      type: String,
      required: [true, "Workshop name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: ["owner", "manager"],
        message: "Role must be either 'owner' or 'manager'",
      },
      default: "owner",
    },
    location: {
      type: locationSchema,
      default: {},
    },
    /**
     * ownerId is only populated when role === "manager".
     * References the User who owns this manager account.
     */
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: "users",
    versionKey: false,
  }
);

const User = model("User", userSchema);

export default User;
