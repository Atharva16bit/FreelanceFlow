const express = require("express");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { rateLimit } = require("express-rate-limit");

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const passwordSchema = z
  .string()
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, {
    message: "Password must not exceed 72 bytes.",
  });

const registrationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema.min(12),
});

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema.min(1),
});

module.exports = function createAuthRouter(pool) {
  const router = express.Router();

  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many attempts. Try again in 15 minutes.",
    },
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many login attempts. Try again in 15 minutes.",
    },
  });

  const dummyHash = bcrypt.hashSync("unused-login-comparison", 12);

  // Register a new user.
  router.post("/register", registrationLimiter, async (req, res) => {
    const parsed = registrationSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid registration details.",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const { name, email, password } = parsed.data;

    try {
      const passwordHash = await bcrypt.hash(password, 12);

      const result = await pool.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, plan, created_at`,
        [name, email, passwordHash],
      );

      return res.status(201).json({ user: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          error: "An account with this email already exists.",
        });
      }

      console.error("Registration failed:", error.message);

      return res.status(500).json({
        error: "Unable to register. Please try again later.",
      });
    }
  });

  // Verify credentials and create a persistent session.
  router.post("/login", loginLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Enter a valid email and password.",
      });
    }

    const { email, password } = parsed.data;

    try {
      const result = await pool.query(
        `SELECT id, name, email, plan, password_hash
         FROM users
         WHERE email = $1`,
        [email],
      );

      const user = result.rows[0];

      const passwordMatches = await bcrypt.compare(
        password,
        user ? user.password_hash : dummyHash,
      );

      if (!user || !passwordMatches) {
        return res.status(401).json({
          error: "Invalid email or password.",
        });
      }

      // Replace the old session to prevent session fixation.
      req.session.regenerate((error) => {
        if (error) {
          console.error("Session regeneration failed:", error.message);
          return res.status(500).json({ error: "Unable to log in." });
        }

        req.session.userId = user.id;

        // Store the session before returning success.
        req.session.save((error) => {
          if (error) {
            console.error("Session save failed:", error.message);
            return res.status(500).json({ error: "Unable to log in." });
          }

          return res.json({
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              plan: user.plan,
            },
          });
        });
      });
    } catch (error) {
      console.error("Login failed:", error.message);

      return res.status(500).json({
        error: "Unable to log in. Please try again later.",
      });
    }
  });

  // Identify the current user using their session.
  router.get("/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in." });
    }

    try {
      const result = await pool.query(
        `SELECT id, name, email, plan
         FROM users
         WHERE id = $1`,
        [req.session.userId],
      );

      if (!result.rows[0]) {
        return res.status(401).json({ error: "Not logged in." });
      }

      return res.json({ user: result.rows[0] });
    } catch (error) {
      console.error("Session lookup failed:", error.message);

      return res.status(500).json({
        error: "Unable to retrieve your account.",
      });
    }
  });

  // Delete the server-side session and clear the browser cookie.
  router.post("/logout", (req, res) => {
    req.session.destroy((error) => {
      if (error) {
        console.error("Logout failed:", error.message);

        return res.status(500).json({
          error: "Unable to log out. Please try again.",
        });
      }

      res.clearCookie("freelanceflow.sid", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });

      return res.json({
        message: "Logged out successfully.",
      });
    });
  });

  return router;
};
