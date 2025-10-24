import jwt from "jsonwebtoken";

function authenticateToken(req, res, next) {
  let token;
  const authHeader = req.headers["authorization"];

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Akses ditolak. Token tidak ditemukan." });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ success: false, message: "Token tidak valid atau kedaluwarsa." });
    }
    req.user = user;
    next();
  });
}

export default authenticateToken;
