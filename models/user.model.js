import mongoose from "mongoose";

const { Schema, model } = mongoose;

/**
 * USER MODEL — Murtikar (Idol Maker)
 *
 * Business Logic Notes:
 * - A "manager" role belongs to an owner (via ownerId reference).
 * - "owner" is the default role for newly self-registered Murtikars.
 * - "admin" is a super-user role for platform administrators.
 * - Managers can operate under an owner but have restricted access (enforced in controllers).
 * - password is stored as a bcrypt hash — never the plain text value.
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
    /** Stored as a bcrypt hash. Never returned in API responses. */
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    role: {
      type: String,
      enum: {
        values: ["owner", "manager", "admin"],
        message: "Role must be one of: owner, manager, admin",
      },
      default: "owner",
    },
    location: {
      type: locationSchema,
      default: {},
    },
    /**
     * ownerId is only populated when role === "manager".
     * References the User (owner) who created this manager account.
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
