import User from "../models/user.model.js";
import Booking from "../models/booking.model.js";
import Mandal from "../models/mandal.model.js";

/**
 * GET /api/portal/murtikars OR /api/users/public-murtikars
 * Public endpoint for Mandals (Clients) to view real-time data of Murtikars.
 *
 * ONLY returns real data existing in the database:
 * - Murtikar's own name
 * - Workshop name
 * - Phone & WhatsApp contact
 * - Location (area, city)
 * - Workshop managers (name, phone, role)
 * - Actual year-wise number of bookings
 * - Client mandals served per year
 * - Murti sizes recorded in bookings
 * - Total bookings count
 *
 * STRICTLY EXCLUDES:
 * - Sensitive financial information (pending dues / debt, payment logs, advances)
 * - Fictional / static attributes (fake slot limits, ratings, awards, stock photos)
 */
export const getPublicMurtikarsStats = async (req, res) => {
    try {
        // 1. Fetch all active Murtikars (workshop owners)
        const murtikars = await User.find({ role: "owner", isActive: true })
            .select("name workshopName phone location plan createdAt")
            .sort({ createdAt: -1 })
            .lean();

        if (!murtikars || murtikars.length === 0) {
            return res.status(200).json({
                success: true,
                count: 0,
                data: [],
            });
        }

        const murtikarIds = murtikars.map((m) => m._id);

        // 2. Fetch all registered managers under these murtikars
        const managers = await User.find({
            role: "manager",
            ownerId: { $in: murtikarIds },
            isActive: true,
        })
            .select("name phone role ownerId")
            .lean();

        // Group managers by their ownerId
        const managersByOwner = {};
        managers.forEach((mgr) => {
            const oId = mgr.ownerId?.toString();
            if (oId) {
                if (!managersByOwner[oId]) managersByOwner[oId] = [];
                managersByOwner[oId].push({
                    id: mgr._id.toString(),
                    name: mgr.name,
                    phone: mgr.phone,
                    role: "Manager",
                });
            }
        });

        // 3. Fetch all bookings for these murtikars with Mandal details
        const bookings = await Booking.find({
            vendorId: { $in: murtikarIds },
        })
            .select("vendorId year murtiSize status mandalId createdAt")
            .populate("mandalId", "ganpatiTitle mandalName area city phone")
            .lean();

        // Group bookings by Murtikar (vendorId) and by year
        const bookingsByVendor = {};
        bookings.forEach((b) => {
            const vId = b.vendorId?.toString();
            if (!vId) return;

            if (!bookingsByVendor[vId]) {
                bookingsByVendor[vId] = {
                    totalBookings: 0,
                    yearMap: {},
                    allMandalsMap: new Map(),
                    distinctSizes: new Set(),
                };
            }

            const vendorStat = bookingsByVendor[vId];
            vendorStat.totalBookings += 1;

            const year = b.year || (b.createdAt ? new Date(b.createdAt).getFullYear() : new Date().getFullYear());

            if (!vendorStat.yearMap[year]) {
                vendorStat.yearMap[year] = {
                    year,
                    bookingsCount: 0,
                    activeBookings: 0,
                    completedBookings: 0,
                    murtiSizes: new Set(),
                    mandals: [],
                };
            }

            const yearObj = vendorStat.yearMap[year];
            yearObj.bookingsCount += 1;
            if (b.status === "completed") {
                yearObj.completedBookings += 1;
            } else {
                yearObj.activeBookings += 1;
            }

            if (b.murtiSize && b.murtiSize.trim()) {
                yearObj.murtiSizes.add(b.murtiSize.trim());
                vendorStat.distinctSizes.add(b.murtiSize.trim());
            }

            if (b.mandalId && b.mandalId.ganpatiTitle) {
                const mandalKey = b.mandalId._id?.toString() || `${b.mandalId.ganpatiTitle}_${b.mandalId.area}`;
                
                if (!vendorStat.allMandalsMap.has(mandalKey)) {
                    vendorStat.allMandalsMap.set(mandalKey, {
                        ganpatiTitle: b.mandalId.ganpatiTitle,
                        mandalName: b.mandalId.mandalName || "",
                        area: b.mandalId.area || "",
                        city: b.mandalId.city || "",
                        years: [year],
                    });
                } else {
                    const existing = vendorStat.allMandalsMap.get(mandalKey);
                    if (!existing.years.includes(year)) {
                        existing.years.push(year);
                    }
                }

                yearObj.mandals.push({
                    ganpatiTitle: b.mandalId.ganpatiTitle,
                    mandalName: b.mandalId.mandalName || "",
                    area: b.mandalId.area || "",
                    city: b.mandalId.city || "",
                    murtiSize: b.murtiSize || "",
                });
            }
        });

        // 4. Build output data containing ONLY real fields
        const result = murtikars.map((m) => {
            const mId = m._id.toString();
            const vendorBookings = bookingsByVendor[mId];
            const vendorManagers = managersByOwner[mId] || [];

            // Sort yearly bookings from most recent year descending
            const yearlyBookings = vendorBookings
                ? Object.values(vendorBookings.yearMap)
                      .map((y) => ({
                          year: y.year,
                          bookingsCount: y.bookingsCount,
                          activeBookings: y.activeBookings,
                          completedBookings: y.completedBookings,
                          murtiSizes: Array.from(y.murtiSizes),
                          mandals: y.mandals,
                      }))
                      .sort((a, b) => b.year - a.year)
                : [];

            // All distinct Mandals who ever booked with this Murtikar
            const pastMandals = vendorBookings
                ? Array.from(vendorBookings.allMandalsMap.values()).map((pm) => ({
                      ganpatiTitle: pm.ganpatiTitle,
                      mandalName: pm.mandalName,
                      area: pm.area,
                      city: pm.city,
                      years: pm.years.sort((a, b) => b - a),
                  }))
                : [];

            const murtiSizes = vendorBookings
                ? Array.from(vendorBookings.distinctSizes)
                : [];

            return {
                id: m._id.toString(),
                workshopName: m.workshopName || "Workshop",
                murtikarName: m.name || "Murtikar",
                phone: m.phone || "",
                location: {
                    area: m.location?.area || "",
                    city: m.location?.city || "",
                },
                plan: m.plan || "FREE",
                registeredDate: m.createdAt,
                managers: vendorManagers,
                yearlyBookings: yearlyBookings,
                totalBookings: vendorBookings?.totalBookings || 0,
                pastMandals: pastMandals,
                murtiSizes: murtiSizes,
            };
        });

        return res.status(200).json({
            success: true,
            count: result.length,
            data: result,
        });
    } catch (error) {
        console.error("Error in getPublicMurtikarsStats:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to load public murtikars data",
        });
    }
};
