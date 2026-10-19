const express = require("express");
const { Pool } = require("pg");
const path = require("node:path");
const helmet = require("helmet");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);

require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters.");
}

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "100kb" }));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
  console.error("Unexpected database connection error:", error.message);
});

// Load sessions BEFORE registering authentication routes.
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
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api/auth", require("./auth")(pool));
app.use("/api/clients", require("./clients")(pool));
app.use("/api/projects", require("./projects")(pool));
app.use("/api/tasks", require("./tasks")(pool));
app.use("/api/time-entries", require("./timeEntries")(pool));

app.get("/api/health", async (req, res) => {
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

// Handle errors passed by middleware, including session storage.
app.use((error, req, res, next) => {
  console.error("Request failed:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON request body." });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
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

    const server = app.listen(port, "127.0.0.1", () => {
      console.log(`Backend running at http://127.0.0.1:${port}`);
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

startServer();
