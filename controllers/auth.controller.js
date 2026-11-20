import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { performHardDelete } from "./user.controller.js";

const SALT_ROUNDS = 10;

// ─── Helper: Generate JWT ─────────────────────────────────────────────────────

/**
 * generateToken(user) → signed JWT string
 * Payload contains userId and role for use in protected routes.
 * Expires in 7 days.
 */
const generateToken = (user) => {
    return jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
};

const applyExpiredPlan = async (user) => {
    // The former demo endpoint allowed client-controlled PRO activation.
    // After billing rollout, only Google Play-verified entitlements are valid.
    if (user.plan === "PRO" && user.billing?.provider !== "google_play") {
        user.plan = "FREE";
        user.planExpiresAt = null;
        await user.save();
    } else if (user.plan === "PRO" && user.planExpiresAt && new Date() >= user.planExpiresAt) {
        user.plan = "FREE";
        if (user.billing) user.billing.status = "EXPIRED";
        await user.save();
    }
};
// ─── Register Murtikar (Self Registration) ────────────────────────────────────

/**
 * POST /api/auth/register
 *
 * Business Logic:
 *  - Phone must be unique across all users.
 *  - Password is hashed with bcrypt before saving.
 *  - New self-registrations always get role = "owner".
 *  - Returns JWT token + user object (without password).
 */
export const register = async (req, res) => {
    try {
        const { name, workshopName, phone, password, area, city } = req.body;

        // Validate required fields
        if (!name || !workshopName || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: "name, workshopName, phone, and password are required.",
            });
        }

        // Check for duplicate phone
        const existing = await User.findOne({ phone });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: "A user with this phone number is already registered.",
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Create owner user
        const user = await User.create({
            name,
            workshopName,
            phone,
            password: hashedPassword,
            role: "owner",
            location: { area, city },
        });

        await applyExpiredPlan(user);
        const token = generateToken(user);

        // Strip password from response
        const userObj = user.toObject();
        delete userObj.password;

        return res.status(201).json({
            success: true,
            token,
            user: userObj,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A user with this phone number is already registered.",
            });
        }

        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 *
 * Business Logic:
 *  - Find user by phone number.
 *  - Compare submitted password against stored bcrypt hash.
 *  - Return JWT token + user object (without password) on success.
 */
export const login = async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: "Phone and password are required.",
            });
        }

        // Fetch user WITH password (select override needed since we never select it by default)
        const user = await User.findOne({ phone }).select("+password");
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid phone number or password.",
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account has been deactivated. Contact the owner.",
            });
        }

        // ── Account Deletion Grace Period Check on Login ──
        // If the owner requested deletion and the 7-day window has elapsed,
        // perform the hard-delete and block login.
        if (user.deletionScheduledFor && new Date() >= user.deletionScheduledFor) {
            try {
                await performHardDelete(user._id);
            } catch (deleteErr) {
                console.error("Hard-delete on login failed:", deleteErr);
            }
            return res.status(401).json({
                success: false,
                message: "Your account has been permanently deleted as per your deletion request.",
            });
        }

        // If this is a manager, check if the owner's account has been deleted
        if (user.role === "manager" && user.ownerId) {
            const owner = await User.findById(user.ownerId);
            if (!owner) {
                // Owner was already deleted — delete this orphan manager too
                await User.findByIdAndDelete(user._id);
                return res.status(401).json({
                    success: false,
                    message: "The workshop owner's account has been deleted. This manager account is no longer valid.",
                });
            }
            if (owner.deletionScheduledFor && new Date() >= owner.deletionScheduledFor) {
                try {
                    await performHardDelete(owner._id);
                } catch (deleteErr) {
                    console.error("Hard-delete on manager login failed:", deleteErr);
                }
                return res.status(401).json({
                    success: false,
                    message: "The workshop owner's account has been permanently deleted. This manager account is no longer valid.",
                });
            }
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid phone number or password.",
            });
        }
        await applyExpiredPlan(user);
        const token = generateToken(user);

        // Strip password from response
        const userObj = user.toObject();
        delete userObj.password;

        return res.status(200).json({
            success: true,
            token,
            user: userObj,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};
