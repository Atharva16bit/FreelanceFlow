const express = require("express");
const { Pool } = require("pg");
const path = require("node:path");
const fs = require("node:fs");
const helmet = require("helmet");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);

require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const isProduction = process.env.NODE_ENV === "production";
const isVercel = process.env.VERCEL === "1";

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters.");
}

if (isVercel && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required on Vercel.");
}

const app = express();

app.disable("x-powered-by");

// Vercel terminates HTTPS before forwarding requests to Express.
if (isVercel) {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(express.json({ limit: "100kb" }));

const pool = new Pool({
  ...(process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
      }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      }),
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
});

pool.on("error", (error) => {
  console.error("Unexpected database connection error:", error.message);
});

// Load sessions before registering protected routes.
app.use(
  session({
    name: "freelanceflow.sid",
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction || isVercel,
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api/auth", require("./auth")(pool));
app.use("/api/clients", require("./clients")(pool));
app.use("/api/projects", require("./projects")(pool));
app.use("/api/tasks", require("./tasks")(pool));
app.use("/api/time-entries", require("./timeEntries")(pool));
app.use("/api/invoices", require("./invoices")(pool));
app.use("/api/dashboard", require("./dashboard")(pool));

app.get("/api/health", async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    await pool.query("SELECT 1");

    return res.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);

    return res.status(503).json({
      status: "error",
      database: "unavailable",
    });
  }
});

app.use("/api", (req, res) => {
  return res.status(404).json({
    error: "API endpoint not found.",
  });
});

// Keep the existing local, single-server frontend workflow.
// Vercel serves the built frontend through its CDN instead.
if (!isVercel && process.env.SERVE_FRONTEND === "true") {
  const frontendDirectory = path.join(__dirname, "..", "frontend", "dist");
  const frontendIndex = path.join(frontendDirectory, "index.html");

  if (!fs.existsSync(frontendIndex)) {
    throw new Error(
      "Frontend build missing. Run npm run build in the frontend folder.",
    );
  }

  app.use(
    express.static(frontendDirectory, {
      maxAge: 0,
      setHeaders(res) {
        res.set("Cache-Control", "no-cache");
      },
    }),
  );

  app.get("/", (req, res) => {
    res.set("Cache-Control", "no-cache");
    return res.sendFile(frontendIndex);
  });
}

app.use((error, req, res, next) => {
  console.error("Request failed:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Invalid JSON request body.",
    });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      error: "Request body is too large.",
    });
  }

  return res.status(500).json({
    error: "An internal server error occurred.",
  });
});

async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("PostgreSQL connected successfully.");

    const port = Number(process.env.PORT || 5000);
    const host = process.env.HOST || "127.0.0.1";

    const server = app.listen(port, host, () => {
      console.log(`Backend running at http://${host}:${port}`);
    });

    server.on("error", (error) => {
      console.error("Server failed:", error.message);
      pool.end().finally(() => process.exit(1));
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    await pool.end();
    process.exitCode = 1;
  }
}

// Vercel imports the application; local npm start opens a listener.
module.exports = app;

if (require.main === module && !isVercel) {
  startServer();
}
