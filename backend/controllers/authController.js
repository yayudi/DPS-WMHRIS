import catchAsync from "../utils/catchAsync.js";
// backend/controllers/authController.js
import * as authService from "../services/authService.js";

/**
 * Controller untuk login user.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const login = catchAsync(async (req, res, next) => {
  const { username, password } = req.body;
  const { token, user } = await authService.loginService(username, password, req.ip, req.headers["user-agent"]);

  // Set HttpOnly cookie
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  });

  res.json({
    success: true,
    token,
    user,
  });
});

/**
 * Controller untuk logout user.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.json({ success: true, message: "Logged out" });
};
