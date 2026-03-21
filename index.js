require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ─── In-memory store ───────────────────────────────────────────────────────────

/** @type {Map<string, { discordId: string, username: string, plan: string, timeAmount: number, createdAt: string, expiresAt: string | null }>} */
const users = new Map();

// ─── Helper ────────────────────────────────────────────────────────────────────

function calcExpiry(timeAmountMinutes) {
  if (!timeAmountMinutes || timeAmountMinutes <= 0) return null;
  return new Date(Date.now() + timeAmountMinutes * 60 * 1000).toISOString();
}

// ─── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Discord User Plan API is running.",
    totalUsers: users.size,
  });
});

/**
 * POST /users
 * Called by Google AI Studio to register / update a user.
 *
 * Body (JSON):
 * {
 *   "discordId":  "123456789012345678",
 *   "username":   "CoolUser#1234",
 *   "plan":       "premium",
 *   "timeAmount": 60          // in minutes
 * }
 */
app.post("/users", (req, res) => {
  const { discordId, username, plan, timeAmount } = req.body;

  if (!discordId || !username || !plan || timeAmount === undefined) {
    return res.status(400).json({
      error: "Missing required fields: discordId, username, plan, timeAmount.",
    });
  }

  if (typeof timeAmount !== "number" || timeAmount < 0) {
    return res.status(400).json({
      error: "timeAmount must be a non-negative number (minutes).",
    });
  }

  const record = {
    discordId,
    username,
    plan,
    timeAmount,
    unit: "minutes",
    createdAt: new Date().toISOString(),
    expiresAt: calcExpiry(timeAmount),
  };

  users.set(discordId, record);

  return res.status(201).json({ message: "User saved successfully.", user: record });
});

/**
 * GET /users
 * Returns all users. Optional filter: ?plan=premium
 */
app.get("/users", (req, res) => {
  let list = Array.from(users.values());

  if (req.query.plan) {
    list = list.filter(
      (u) => u.plan.toLowerCase() === req.query.plan.toLowerCase()
    );
  }

  res.json({ total: list.length, users: list });
});

/**
 * GET /users/:discordId
 * Returns a single user by Discord ID.
 */
app.get("/users/:discordId", (req, res) => {
  const user = users.get(req.params.discordId);
  if (!user) return res.status(404).json({ error: "User not found." });

  const active = user.expiresAt === null || new Date(user.expiresAt) > new Date();
  res.json({ ...user, active });
});

/**
 * DELETE /users/:discordId
 * Remove a user.
 */
app.delete("/users/:discordId", (req, res) => {
  if (!users.has(req.params.discordId)) {
    return res.status(404).json({ error: "User not found." });
  }
  users.delete(req.params.discordId);
  res.json({ message: "User deleted." });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅  API running on port ${PORT}`);
});