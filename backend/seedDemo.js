const path = require("node:path");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");

require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const DEMO_EMAIL = "demo@freelanceflow.example";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
});

async function seedDemo() {
  const password = process.env.DEMO_PASSWORD;

  if (
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new Error(
      "Set DEMO_PASSWORD to at least 12 characters and at most 72 UTF-8 bytes.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await pool.connect();

  try {
    await connection.query("BEGIN");

    // Prevent simultaneous runs from creating duplicate demo records.
    await connection.query("SELECT pg_advisory_xact_lock(20261019, 4001)");

    const existing = await connection.query(
      "SELECT id FROM users WHERE email = $1",
      [DEMO_EMAIL],
    );

    if (existing.rows.length > 0) {
      await connection.query("ROLLBACK");
      console.log("Demo account already exists. No records changed.");
      return;
    }

    const userResult = await connection.query(
      `INSERT INTO users (name, email, password_hash, plan)
       VALUES ($1, $2, $3, 'pro')
       RETURNING id`,
      ["FreelanceFlow Demo", DEMO_EMAIL, passwordHash],
    );

    const userId = userResult.rows[0].id;

    const examples = [
      {
        name: "Aarna",
        email: "aarna.demo@example.com",
        company: "Aarna Design Studio",
        project: "Portfolio Website",
        budget: "25000.00",
        status: "active",
      },
      {
        name: "Parth",
        email: "parth.demo@example.com",
        company: "Parth Digital",
        project: "Business Dashboard",
        budget: "40000.00",
        status: "active",
      },
      {
        name: "Ekjyot",
        email: "ekjyot.demo@example.com",
        company: "Ekjyot Creative",
        project: "Brand Landing Page",
        budget: "15000.00",
        status: "completed",
      },
    ];

    const projects = [];

    for (const example of examples) {
      const clientResult = await connection.query(
        `INSERT INTO clients
           (user_id, name, email, company, hourly_rate)
         VALUES ($1, $2, $3, $4, '1000.00')
         RETURNING id`,
        [userId, example.name, example.email, example.company],
      );

      const clientId = clientResult.rows[0].id;

      const projectResult = await connection.query(
        `INSERT INTO projects
           (client_id, name, description, status, budget)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          clientId,
          example.project,
          "Sample project for the evaluator demonstration.",
          example.status,
          example.budget,
        ],
      );

      projects.push({
        ...example,
        clientId,
        projectId: projectResult.rows[0].id,
      });
    }

    const tasks = [
      {
        project: projects[0],
        title: "Review responsive homepage",
        status: "in_progress",
        offset: 2,
      },
      {
        project: projects[1],
        title: "Finish dashboard filters",
        status: "todo",
        offset: -2,
      },
      {
        project: projects[2],
        title: "Deliver approved brand assets",
        status: "completed",
        offset: -4,
      },
    ];

    for (const task of tasks) {
      await connection.query(
        `INSERT INTO tasks
           (project_id, title, description, status, due_date)
         VALUES (
           $1, $2, $3, $4,
           (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
             + $5::integer
         )`,
        [
          task.project.projectId,
          task.title,
          "Demonstration task.",
          task.status,
          task.offset,
        ],
      );
    }

    const project = projects[0];

    // Five previous months: paid invoices.
    // Current month: an unpaid invoice.
    for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo -= 1) {
      const entryResult = await connection.query(
        `WITH dates AS (
           SELECT CASE
             WHEN $3::integer = 0
               THEN CURRENT_TIMESTAMP - INTERVAL '3 hours'
             ELSE (
               date_trunc(
                 'month',
                 CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'
               )
               - make_interval(months => $3::integer)
               + INTERVAL '9 hours'
             ) AT TIME ZONE 'Asia/Kolkata'
           END AS started_at
         )
         INSERT INTO time_entries
           (user_id, project_id, description, source,
            started_at, ended_at)
         SELECT $1, $2, 'Demo website implementation', 'manual',
                started_at, started_at + INTERVAL '2 hours'
         FROM dates
         RETURNING id, started_at, ended_at`,
        [userId, project.projectId, monthsAgo],
      );

      const entry = entryResult.rows[0];
      const status = monthsAgo === 0 ? "unpaid" : "paid";

      const invoiceResult = await connection.query(
        `INSERT INTO invoices (
           user_id, client_id, client_name, client_email,
           client_company, status, issued_on, due_on,
           paid_at, notes, created_at
         )
         VALUES (
                      $1, $2, $3, $4, $5, $6::text,
           ($7::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,
           ($7::timestamptz AT TIME ZONE 'Asia/Kolkata')::date + 14,
           CASE WHEN $6::text = 'paid'
             THEN $7::timestamptz ELSE NULL END,
           'Sample invoice for demonstration.',
           $7::timestamptz
         )
         RETURNING id`,
        [
          userId,
          project.clientId,
          project.name,
          project.email,
          project.company,
          status,
          entry.ended_at,
        ],
      );

      await connection.query(
        `INSERT INTO invoice_items (
           invoice_id, time_entry_id, project_name,
           description, started_at, ended_at, hourly_rate
         )
         VALUES ($1, $2, $3, $4, $5, $6, '1000.00')`,
        [
          invoiceResult.rows[0].id,
          entry.id,
          project.project,
          "Demo website implementation",
          entry.started_at,
          entry.ended_at,
        ],
      );
    }

    // Leave one finished entry available for the invoice wizard.
    await connection.query(
      `INSERT INTO time_entries (
         user_id, project_id, description, source,
         started_at, ended_at
       )
       VALUES (
         $1, $2, 'Unbilled demo consultation', 'manual',
         CURRENT_TIMESTAMP - INTERVAL '5 hours',
         CURRENT_TIMESTAMP - INTERVAL '4 hours'
       )`,
      [userId, projects[1].projectId],
    );

    await connection.query("COMMIT");

    console.log("Demo data created successfully.");
    console.log(`Email: ${DEMO_EMAIL}`);
    console.log("Plan: Pro");
    console.log("Clients: 3 | Projects: 3 | Tasks: 3");
    console.log("Invoices: 5 paid, 1 unpaid");
    console.log("Unbilled time entries: 1");
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError.message);
    }

    throw error;
  } finally {
    connection.release();
  }
}

seedDemo()
  .catch((error) => {
    console.error("Demo setup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
