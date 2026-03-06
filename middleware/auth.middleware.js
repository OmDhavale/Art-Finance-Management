import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

/**
 * VERIFY TOKEN MIDDLEWARE
 *
 * Reads the JWT from the Authorization header in the format:
 *   Authorization: Bearer <token>
 *
 * On success: attaches decoded payload to req.user and calls next().
 * On failure: returns 401 Unauthorized.
 */
export const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers["authorization"];

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Access denied. No token provided.",
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach full user to request (excluding password)
        const user = await User.findById(decoded.userId).select("-password");
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: "User not found or account deactivated.",
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Token has expired. Please login again.",
            });
        }

        return res.status(401).json({
            success: false,
            message: "Invalid token.",
        });
    }
};
