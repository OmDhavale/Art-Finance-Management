import bcrypt from "bcrypt";
import User from "../models/user.model.js";
import Mandal from "../models/mandal.model.js";
import Booking from "../models/booking.model.js";

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

        // Plan-based manager limit (Simplified: only PRO can add managers)
        if (req.user.plan !== "PRO") {
            return res.status(403).json({
                success: false,
                message: "Upgrade to PRO to add managers.",
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

/**
 * POST /api/users/update-plan
 * Simulated endpoint to switch between FREE and PRO plans.
 */
// export const updatePlan = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const { plan } = req.body;

//         if (!['FREE', 'PRO'].includes(plan)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Invalid plan type. Use 'FREE' or 'PRO'.",
//             });
//         }

//         let updateData = { plan };

//         if (plan === "PRO") {
//             const expiresAt = new Date();
//             expiresAt.setFullYear(expiresAt.getFullYear() + 1);
//             updateData.planExpiresAt = expiresAt;
//         } else {
//             updateData.planExpiresAt = null;
//         }

//         const user = await User.findByIdAndUpdate(
//             userId,
//             updateData,
//             { new: true }
//         ).select("-password");

//         return res.status(200).json({
//             success: true,
//             message: `Successfully switched to ${plan} plan.`,
//             data: user,
//         });
//     } catch (error) {
//         return res.status(500).json({
//             success: false,
//             message: error.message || "Internal server error",
//         });
//     }
// };

// ─── Request Account Deletion (Owner Only, 7-day Grace Period) ────────────────

/**
 * POST /api/users/request-account-deletion
 * Protected — only owners can request account deletion.
 *
 * Business Logic:
 *  - Requires password confirmation for security.
 *  - Sets deletionRequestedAt = now, deletionScheduledFor = now + 7 days.
 *  - Managers cannot request deletion.
 *  - If a deletion is already pending, returns a 409 conflict.
 *  - During the 7-day grace period the account remains fully functional.
 */
export const requestAccountDeletion = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({
                success: false,
                message: "Only workshop owners can request account deletion.",
            });
        }

        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: "Password is required to confirm account deletion.",
            });
        }

        // Fetch user with password for verification
        const user = await User.findById(req.user._id).select("+password");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        // Check if deletion is already requested
        if (user.deletionRequestedAt) {
            return res.status(409).json({
                success: false,
                message: "Account deletion is already scheduled.",
                data: {
                    deletionRequestedAt: user.deletionRequestedAt,
                    deletionScheduledFor: user.deletionScheduledFor,
                },
            });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Incorrect password.",
            });
        }

        // Schedule deletion 7 days from now
        const now = new Date();
        const scheduledFor = new Date(now);
        scheduledFor.setDate(scheduledFor.getDate() + 7);

        user.deletionRequestedAt = now;
        user.deletionScheduledFor = scheduledFor;
        await user.save();

        const userObj = user.toObject();
        delete userObj.password;

        return res.status(200).json({
            success: true,
            message: "Account deletion requested. Your account will be permanently deleted after 7 days. You can cancel this anytime before then.",
            data: {
                deletionRequestedAt: user.deletionRequestedAt,
                deletionScheduledFor: user.deletionScheduledFor,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Cancel Account Deletion ──────────────────────────────────────────────────

/**
 * POST /api/users/cancel-account-deletion
 * Protected — only the owner who requested deletion can cancel it.
 *
 * Business Logic:
 *  - Clears deletionRequestedAt and deletionScheduledFor.
 *  - Account returns to normal state immediately.
 */
export const cancelAccountDeletion = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({
                success: false,
                message: "Only workshop owners can cancel account deletion.",
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        if (!user.deletionRequestedAt) {
            return res.status(400).json({
                success: false,
                message: "No pending account deletion request to cancel.",
            });
        }

        user.deletionRequestedAt = null;
        user.deletionScheduledFor = null;
        await user.save();

        const userObj = user.toObject();
        delete userObj.password;

        return res.status(200).json({
            success: true,
            message: "Account deletion cancelled. Your account is fully restored.",
            data: userObj,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
};

// ─── Hard-Delete Account (called by middleware after grace period) ─────────────

/**
 * performHardDelete(userId)
 * Internal helper — permanently removes the owner, their managers,
 * and all associated mandals and bookings from the database.
 */
export const performHardDelete = async (userId) => {
    // Find all managers under this owner
    const managers = await User.find({ ownerId: userId, role: "manager" });
    const managerIds = managers.map((m) => m._id);

    // All user IDs to clean up (owner + managers)
    const allUserIds = [userId, ...managerIds];

    // Delete all bookings created by any of these users
    await Booking.deleteMany({ vendorId: { $in: allUserIds } });

    // Delete all mandals created by any of these users
    await Mandal.deleteMany({ createdBy: { $in: allUserIds } });

    // Delete all manager accounts
    await User.deleteMany({ ownerId: userId, role: "manager" });

    // Delete the owner account
    await User.findByIdAndDelete(userId);
};

