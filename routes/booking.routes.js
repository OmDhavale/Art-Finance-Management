import express from "express";
import {
    createBooking,
    getBooking,
    getMyBookings,
    addPayment,
    updateBookingPrice,
    closeBooking,
    deleteBooking,
} from "../controllers/booking.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// All booking routes require a logged-in user
router.use(verifyToken);

// POST   /api/bookings                          → Create a new booking
router.post("/", createBooking);

// GET    /api/bookings/my                       → Get current vendor's bookings
// NOTE: declared before /:bookingId to avoid route conflict
router.get("/my", getMyBookings);

// GET    /api/bookings/:bookingId               → Get booking + payment history
router.get("/:bookingId", getBooking);

// POST   /api/bookings/:bookingId/payments      → Add a payment to a booking
router.post("/:bookingId/payments", addPayment);

// PATCH  /api/bookings/:bookingId/price         → Update finalPrice after negotiation
router.patch("/:bookingId/price", updateBookingPrice);

// PATCH  /api/bookings/:bookingId/close         → Close the booking
router.patch("/:bookingId/close", closeBooking);

// DELETE /api/bookings/:bookingId               → Delete a booking (owner only)
router.delete("/:bookingId", deleteBooking);

export default router;
