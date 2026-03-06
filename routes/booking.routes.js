import express from "express";
import {
    createBooking,
    getBooking,
    addPayment,
    updateBookingPrice,
    closeBooking,
} from "../controllers/booking.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// All booking routes require a logged-in user
router.use(verifyToken);

// POST   /api/bookings                          → Create a new booking
router.post("/", createBooking);

// GET    /api/bookings/:bookingId               → Get booking + payment history
router.get("/:bookingId", getBooking);

// POST   /api/bookings/:bookingId/payments      → Add a payment to a booking
router.post("/:bookingId/payments", addPayment);

// PATCH  /api/bookings/:bookingId/price         → Update finalPrice after negotiation
router.patch("/:bookingId/price", updateBookingPrice);

// PATCH  /api/bookings/:bookingId/close         → Close the booking
router.patch("/:bookingId/close", closeBooking);

export default router;
