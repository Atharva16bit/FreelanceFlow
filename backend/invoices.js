const express = require("express");
const { z } = require("zod");
const createInvoiceHandler = require("./createInvoice");

function validId(value) {
  return /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number(value.slice(0, 4)) < 1) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

const selectionSchema = z
  .object({
    client_id: z.string().refine(validId, {
      message: "Invalid client ID.",
    }),
    from: z.string().refine(validDate, {
      message: "Enter a valid start date: YYYY-MM-DD.",
    }),
    to: z.string().refine(validDate, {
      message: "Enter a valid end date: YYYY-MM-DD.",
    }),
  })
  .refine((data) => data.from <= data.to, {
    path: ["to"],
    message: "End date must be on or after start date.",
  });

module.exports = function createInvoicesRouter(pool) {
  const router = express.Router();

  // Protect every invoice endpoint.
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");

    if (!req.session.userId) {
      return res.status(401).json({
        error: "Not logged in.",
      });
    }

    next();
  });

  // Preview finished, unbilled entries for an owned client.
  // Both selected dates are inclusive in India time.
  router.get("/unbilled", async (req, res) => {
    const parsed = selectionSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid invoice selection.",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const { client_id, from, to } = parsed.data;

    try {
      const clientResult = await pool.query(
        `SELECT id, name, email, company, hourly_rate
         FROM clients
         WHERE id = $1 AND user_id = $2`,
        [client_id, req.session.userId],
      );

      const client = clientResult.rows[0];

      if (!client) {
        return res.status(404).json({
          error: "Client not found.",
        });
      }

      const result = await pool.query(
        `SELECT t.id,
                t.project_id,
                p.name AS project_name,
                t.description,
                t.started_at,
                t.ended_at,
                EXTRACT(EPOCH FROM
                  (t.ended_at - t.started_at)
                ) AS duration_seconds,
                $5::numeric AS hourly_rate,
                ROUND(
                  EXTRACT(EPOCH FROM (t.ended_at - t.started_at))
                  / 3600 * $5::numeric,
                  2
                ) AS estimated_amount
         FROM time_entries AS t
         JOIN projects AS p ON p.id = t.project_id
         JOIN clients AS c ON c.id = p.client_id
         WHERE c.id = $1
           AND c.user_id = $2
           AND t.user_id = $2
           AND t.ended_at IS NOT NULL
           AND t.started_at >=
               ($3::date::timestamp AT TIME ZONE 'Asia/Kolkata')
           AND t.started_at <
               (($4::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
           AND NOT EXISTS (
             SELECT 1
             FROM invoice_items AS item
             WHERE item.time_entry_id = t.id
           )
         ORDER BY t.started_at, t.id
         LIMIT 501`,
        [client_id, req.session.userId, from, to, client.hourly_rate],
      );

      if (result.rows.length > 500) {
        return res.status(400).json({
          error: "More than 500 entries match. Select a smaller date range.",
        });
      }

      return res.json({
        client,
        selection: {
          from,
          to,
          timezone: "Asia/Kolkata",
        },
        entries: result.rows,
      });
    } catch (error) {
      console.error("Unbilled entry lookup failed:", error.message);

      return res.status(500).json({
        error: "Unable to retrieve unbilled time entries.",
      });
    }
  });

  // Create the invoice and its items in one transaction.
  router.post("/", createInvoiceHandler(pool));

  router.use("/", require("./invoiceStatus")(pool));
  router.use("/", require("./invoicePdf")(pool));
  router.use("/", require("./invoiceViews")(pool));

  return router;
};
