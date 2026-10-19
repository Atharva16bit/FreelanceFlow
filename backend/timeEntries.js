const express = require("express");
const { z } = require("zod");

function validId(value) {
  return /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

// Require an explicit timezone and validate the calendar date.
function validTimestamp(value) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/,
  );

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || month < 1 || month > 12) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return (
    day >= 1 &&
    day <= daysInMonth[month - 1] &&
    Number.isFinite(Date.parse(value))
  );
}

const startSchema = z.object({
  project_id: z.string().refine(validId, {
    message: "Invalid project ID.",
  }),
  description: z.string().trim().max(2000).default(""),
});

const timestampSchema = z.string().refine(validTimestamp, {
  message: "Use an ISO timestamp with a timezone, such as Z or +05:30.",
});

const manualSchema = startSchema
  .extend({
    started_at: timestampSchema,
    ended_at: timestampSchema,
  })
  .superRefine((data, context) => {
    const start = Date.parse(data.started_at);
    const end = Date.parse(data.ended_at);

    if (!Number.isFinite(start) || !Number.isFinite(end)) return;

    if (end <= start) {
      context.addIssue({
        code: "custom",
        path: ["ended_at"],
        message: "End time must be after start time.",
      });
    }

    const now = Date.now();

    if (start > now || end > now) {
      context.addIssue({
        code: "custom",
        path: ["ended_at"],
        message: "Manual entries cannot contain future times.",
      });
    }
  });

const listSchema = z.object({
  project_id: z.string().refine(validId).optional(),
  page: z
    .string()
    .regex(/^[1-9]\d{0,5}$/)
    .default("1")
    .transform(Number),
  limit: z
    .string()
    .regex(/^[1-9]\d{0,2}$/)
    .default("20")
    .transform(Number)
    .refine((value) => value <= 100, {
      message: "Limit must be between 1 and 100.",
    }),
});

function invalidDetails(res, error) {
  return res.status(400).json({
    error: "Invalid time-entry details.",
    details: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

module.exports = function createTimeEntriesRouter(pool) {
  const router = express.Router();

  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");

    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in." });
    }

    next();
  });

  // List finished entries only. Running timers have a separate endpoint.
  router.get("/", async (req, res) => {
    const parsed = listSchema.safeParse(req.query);

    if (!parsed.success) {
      return invalidDetails(res, parsed.error);
    }

    const { project_id, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    try {
      const result = await pool.query(
        `SELECT t.id, t.project_id, p.name AS project_name,
                c.name AS client_name, t.description, t.source,
                t.started_at, t.ended_at,
                EXTRACT(EPOCH FROM
                  (t.ended_at - t.started_at)
                )::double precision AS duration_seconds
         FROM time_entries AS t
         JOIN projects AS p ON p.id = t.project_id
         JOIN clients AS c ON c.id = p.client_id
         WHERE t.user_id = $1
           AND c.user_id = $1
           AND t.ended_at IS NOT NULL
           AND ($2::bigint IS NULL OR t.project_id = $2::bigint)
         ORDER BY t.started_at DESC, t.id DESC
         LIMIT $3 OFFSET $4`,
        [req.session.userId, project_id ?? null, limit + 1, offset],
      );

      return res.json({
        entries: result.rows.slice(0, limit),
        pagination: {
          page,
          limit,
          has_more: result.rows.length > limit,
        },
      });
    } catch (error) {
      console.error("Time-entry listing failed:", error.message);

      return res.status(500).json({
        error: "Unable to retrieve time entries.",
      });
    }
  });

  // Recover the running timer after navigation or refresh.
  router.get("/running", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT t.id, t.project_id, p.name AS project_name,
                t.description, t.source, t.started_at, t.ended_at,
                clock_timestamp() AS server_now
         FROM time_entries AS t
         JOIN projects AS p ON p.id = t.project_id
         JOIN clients AS c ON c.id = p.client_id
         WHERE t.user_id = $1
           AND c.user_id = $1
           AND t.ended_at IS NULL`,
        [req.session.userId],
      );

      return res.json({ timer: result.rows[0] || null });
    } catch (error) {
      console.error("Running timer lookup failed:", error.message);

      return res.status(500).json({
        error: "Unable to retrieve running timer.",
      });
    }
  });

  // Start a timer on an owned, active project.
  router.post("/start", async (req, res) => {
    const parsed = startSchema.safeParse(req.body);

    if (!parsed.success) {
      return invalidDetails(res, parsed.error);
    }

    try {
      const result = await pool.query(
        `INSERT INTO time_entries
           (user_id, project_id, description, source)
         SELECT $1, p.id, $2, 'timer'
         FROM projects AS p
         JOIN clients AS c ON c.id = p.client_id
         WHERE p.id = $3
           AND c.user_id = $1
           AND p.status = 'active'
         RETURNING id, project_id, description, source,
                   started_at, ended_at,
                   clock_timestamp() AS server_now`,
        [req.session.userId, parsed.data.description, parsed.data.project_id],
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          error: "Active project not found.",
        });
      }

      return res.status(201).json({ timer: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          error: "You already have a running timer. Stop it first.",
        });
      }

      if (error.code === "23503") {
        return res.status(409).json({
          error: "The selected project is no longer available.",
        });
      }

      console.error("Timer start failed:", error.message);

      return res.status(500).json({
        error: "Unable to start timer.",
      });
    }
  });

  // Add completed work manually, including work on completed projects.
  router.post("/manual", async (req, res) => {
    const parsed = manualSchema.safeParse(req.body);

    if (!parsed.success) {
      return invalidDetails(res, parsed.error);
    }

    const data = parsed.data;

    try {
      const result = await pool.query(
        `INSERT INTO time_entries
           (user_id, project_id, description, source, started_at, ended_at)
         SELECT $1, p.id, $2, 'manual', $3::timestamptz, $4::timestamptz
         FROM projects AS p
         JOIN clients AS c ON c.id = p.client_id
         WHERE p.id = $5 AND c.user_id = $1
         RETURNING id, project_id, description, source,
                   started_at, ended_at,
                   EXTRACT(EPOCH FROM
                     (ended_at - started_at)
                   )::double precision AS duration_seconds`,
        [
          req.session.userId,
          data.description,
          data.started_at,
          data.ended_at,
          data.project_id,
        ],
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          error: "Project not found.",
        });
      }

      return res.status(201).json({ entry: result.rows[0] });
    } catch (error) {
      if (error.code === "23503") {
        return res.status(409).json({
          error: "The selected project is no longer available.",
        });
      }

      console.error("Manual entry creation failed:", error.message);

      return res.status(500).json({
        error: "Unable to save manual time entry.",
      });
    }
  });

  // Stop an owned timer once; later stop requests cannot overwrite it.
  router.post("/:id/stop", async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid timer ID." });
    }

    try {
      const result = await pool.query(
        `UPDATE time_entries AS t
         SET ended_at = clock_timestamp()
         FROM projects AS p, clients AS c
         WHERE t.project_id = p.id
           AND p.client_id = c.id
           AND t.id = $1
           AND t.user_id = $2
           AND c.user_id = $2
           AND t.source = 'timer'
           AND t.ended_at IS NULL
         RETURNING t.id, t.project_id, t.description, t.source,
                   t.started_at, t.ended_at,
                   EXTRACT(EPOCH FROM
                     (t.ended_at - t.started_at)
                   )::double precision AS duration_seconds`,
        [req.params.id, req.session.userId],
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          error: "Running timer not found.",
        });
      }

      return res.json({ entry: result.rows[0] });
    } catch (error) {
      console.error("Timer stop failed:", error.message);

      return res.status(500).json({
        error: "Unable to stop timer.",
      });
    }
  });

  return router;
};
