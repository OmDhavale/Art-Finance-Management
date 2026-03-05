import User from "../models/user.model.js";

// ─── Create User (Murtikar) ───────────────────────────────────────────────────

/**
 * POST /api/users
 * Registers a new Murtikar (owner or manager).
 * Phone number is unique — duplicate will return a 409.
 */
export const createUser = async (req, res) => {
    try {
        const { name, workshopName, phone, role, location, ownerId } = req.body;

        const user = await User.create({
            name,
            workshopName,
            phone,
            role,
            location,
            ownerId: role === "manager" ? ownerId : null,
        });

        return res.status(201).json({
            success: true,
            data: user,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A user with this phone number already exists.",
            });
        }

        // Mongoose validation errors
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

        const user = await User.findById(userId).populate(
            "ownerId",
            "name workshopName phone"
        );

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
