import express from "express";
import {
    searchMandals,
    getMandalDetails,
    getAllMandals,
} from "../controllers/mandal.controller.js";
import {
    createBooking,
    getBooking,
    getMyBookings,
    addPayment,
    updateBookingPrice,
    closeBooking,
    getDashboardStats,
} from "../controllers/booking.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// All artist routes require a logged-in user (sketch-artist role)
router.use(verifyToken);

// ─── Mandal Routes (View & Search) ───────────────────────────────────────────
// Sketch Artists can view all mandals, search, and get details

// GET    /api/artists/mandals              → Get ALL mandals with grades & pending amounts
// NOTE: must be declared before /search and /:mandalId
router.get("/mandals", getAllMandals);

// GET    /api/artists/mandals/search?q=    → Search mandals by title / name / area
// NOTE: /search must be declared before /:mandalId to avoid route conflict
router.get("/mandals/search", searchMandals);

// GET    /api/artists/mandals/:mandalId    → Get Mandal profile + booking history
router.get("/mandals/:mandalId", getMandalDetails);

// ─── Booking Routes (Create & Manage) ────────────────────────────────────────
// Sketch Artists can create bookings and manage their own bookings

// POST   /api/artists/bookings                          → Create a new booking
router.post("/bookings", createBooking);

// GET    /api/artists/bookings/my                       → Get artist's bookings
// NOTE: declared before /:bookingId to avoid route conflict
router.get("/bookings/my", getMyBookings);

// GET    /api/artists/bookings/stats                    → Dashboard statistics
router.get("/bookings/stats", getDashboardStats);

// GET    /api/artists/bookings/:bookingId               → Get booking + payment history
router.get("/bookings/:bookingId", getBooking);

// POST   /api/artists/bookings/:bookingId/payments      → Add a payment to a booking
router.post("/bookings/:bookingId/payments", addPayment);

// PATCH  /api/artists/bookings/:bookingId/price         → Update finalPrice after negotiation
router.patch("/bookings/:bookingId/price", updateBookingPrice);

// PATCH  /api/artists/bookings/:bookingId/close         → Close the booking
router.patch("/bookings/:bookingId/close", closeBooking);

export default router;
