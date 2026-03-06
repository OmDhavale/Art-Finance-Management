import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

// ─── Route Imports ────────────────────────────────────────────────────────────
import authRoutes from "./routes/auth.routes.js";
import mandalRoutes from "./routes/mandal.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import userRoutes from "./routes/user.routes.js";

// ─── Load Environment Variables ───────────────────────────────────────────────
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ganesh-mandal-db";

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
    //origin: ['http://localhost:8081', 'http://localhost:19006', 'https://artfinancemanagementfe.netlify.app'],
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS not allowed'), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Ganesh Mandal Payment Tracker API is running 🙏",
    });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/mandals", mandalRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/users", userRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found.`,
    });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({
        success: false,
        message: err.message || "Internal server error",
    });
});

// ─── Connect to MongoDB and Start Server ─────────────────────────────────────
mongoose
    .connect(MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB connected:", MONGO_URI);
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error("❌ MongoDB connection failed:", err.message);
        process.exit(1);
    });
