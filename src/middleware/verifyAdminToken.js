const jwt = require("jsonwebtoken");
const User = require("../users/user.model"); // Adjust path as needed
const JWT_SECRET = process.env.JWT_SECRET_KEY;

const verifyAdminToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "Access Denied. No token provided" });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user || user.role.toLowerCase() !== 'admin') {
            return res.status(403).json({ message: "Access Denied. Admins only" });
        }

        req.user = user; // Attach the user to the request
        next(); // Proceed to the next middleware or controller
    } catch (err) {
        console.error("Error in verifyAdminToken middleware:", err);
        return res.status(403).json({ message: "Invalid or expired token" });
    }
};

module.exports = verifyAdminToken;
