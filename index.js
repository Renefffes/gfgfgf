require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ─── In-memory store ───────────────────────────────────────────────────────────

/**
 * Map<discordId, { discordId, username, plan, timeAmount, createdAt, expiresAt }>
 * Each user has one active plan. Multiple users can be on the API at the same time.
 * Users are automatically removed when their time runs out.
 */
const users = new Map();

// ─── Helpers ───────────────────────────────────────────────────────────────────

function calcExpiry(timeAmountMinutes) {
  if (!timeAmountMinutes || timeAmountMinutes <= 0) return null;
  return new Date(Date.now() + timeAmountMinutes * 60 * 1000).toISOString();
}

function isActive(expiresAt) {
  return expiresAt === null || new Date(expiresAt) > new Date();
}

/** Runs every 60s — removes any user whose plan time has expired. */
function purgeExpired() {
  let removed = 0;
  for (const [discordId, user] of users.entries()) {
    if (!isActive(user.expiresAt)) {
      users.delete(discordId);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`🧹 Purged ${removed} expired user(s)`);
  }
}

// ─── Auto-expiry: runs every 60 seconds ───────────────────────────────────────

setInterval(purgeExpired, 60 * 1000);

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
 * Called by Google AI Studio to add a user with a plan and time.
 * If the user already exists their plan is overwritten with the new one.
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

  return res.status(201).json({ message: "User added successfully.", user: record });
});

/**
 * GET /users
 * Returns all currently active users.
 * Optional filter: ?plan=premium
 */
app.get("/users", (req, res) => {
  let list = Array.from(users.values()).map((u) => ({
    ...u,
    active: isActive(u.expiresAt),
    minutesLeft: u.expiresAt
      ? Math.max(0, Math.floor((new Date(u.expiresAt) - Date.now()) / 60000))
      : null,
  }));

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

  res.json({
    ...user,
    active: isActive(user.expiresAt),
    minutesLeft: user.expiresAt
      ? Math.max(0, Math.floor((new Date(user.expiresAt) - Date.now()) / 60000))
      : null,
  });
});

/**
 * DELETE /users/:discordId
 * Manually remove a user before their time is up.
 */
app.delete("/users/:discordId", (req, res) => {
  if (!users.has(req.params.discordId)) {
    return res.status(404).json({ error: "User not found." });
  }
  users.delete(req.params.discordId);
  res.json({ message: "User removed." });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅  API running on port ${PORT}`);
  console.log(`🕐  Expired users will be purged automatically every 60 seconds`);
});
