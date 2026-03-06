import bcrypt from "bcrypt";
import User from "../models/user.model.js";

const SALT_ROUNDS = 10;

// ─── Create User (Murtikar) ───────────────────────────────────────────────────

/**
 * POST /api/users
 * Public — registers a Murtikar without going through /auth/register.
 * Kept for backward compatibility; does NOT return a JWT.
 */
export const createUser = async (req, res) => {
    try {
        const { name, workshopName, phone, password, role, location, ownerId } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: "Password is required.",
            });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const user = await User.create({
            name,
            workshopName,
            phone,
            password: hashedPassword,
            role,
            location,
            ownerId: role === "manager" ? ownerId : null,
        });

        const userObj = user.toObject();
        delete userObj.password;

        return res.status(201).json({
            success: true,
            data: userObj,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A user with this phone number already exists.",
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

// ─── Get User Profile ─────────────────────────────────────────────────────────

/**
 * GET /api/users/:userId
 * Returns the full profile of a Murtikar.
 * If the user is a manager, populates the owner's basic info.
 */
export const getUserProfile = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId)
            .select("-password")
            .populate("ownerId", "name workshopName phone");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        return res.status(200).json({
            success: true,
            data: user,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Add Manager ──────────────────────────────────────────────────────────────

/**
 * POST /api/users/add-manager
 * Protected — only owners can call this.
 *
 * Business Logic:
 *  - Manager is linked to the authenticated owner via ownerId.
 *  - Password is hashed before saving.
 *  - workshopName is inherited from the owner.
 */
export const addManager = async (req, res) => {
    try {
        // req.user is set by verifyToken middleware
        if (req.user.role !== "owner") {
            return res.status(403).json({
                success: false,
                message: "Only owners can add managers.",
            });
        }

        const { name, phone, password } = req.body;

        if (!name || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: "name, phone, and password are required.",
            });
        }

        const existing = await User.findOne({ phone });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: "A user with this phone number already exists.",
            });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const manager = await User.create({
            name,
            phone,
            password: hashedPassword,
            role: "manager",
            workshopName: req.user.workshopName,   // inherit owner's workshop name
            location: req.user.location,            // inherit owner's location
            ownerId: req.user._id,
        });

        const managerObj = manager.toObject();
        delete managerObj.password;

        return res.status(201).json({
            success: true,
            data: managerObj,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A user with this phone number already exists.",
            });
        }

        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Get Workshop Users ───────────────────────────────────────────────────────

/**
 * GET /api/users/workshop-users
 * Protected — returns the authenticated owner + all their managers.
 *
 * Business Logic:
 *  - If logged-in user is a manager, use their ownerId to look up the owner.
 *  - Returns owner profile + list of all managers under that owner.
 */
export const getWorkshopUsers = async (req, res) => {
    try {
        // Determine the owner's ID based on the caller's role
        const ownerId =
            req.user.role === "owner" ? req.user._id : req.user.ownerId;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Could not determine workshop owner.",
            });
        }

        const [owner, managers] = await Promise.all([
            User.findById(ownerId).select("-password"),
            User.find({ ownerId, role: "manager" }).select("-password"),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                owner,
                managers,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

