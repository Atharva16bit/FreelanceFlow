const { z } = require("zod");

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

const schema = z.object({
  client_id: z.string().refine(validId),
  time_entry_ids: z
    .array(z.string().refine(validId))
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Select each time entry only once.",
    }),
  due_on: z.string().refine(validDate, {
    message: "Enter a valid due date: YYYY-MM-DD.",
  }),
  notes: z.string().trim().max(2000).default(""),
});

module.exports = function createInvoiceHandler(pool) {
  return async function createInvoice(req, res) {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid invoice details.",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const data = parsed.data;
    let connection;

    try {
      connection = await pool.connect();
      await connection.query("BEGIN");

      // Lock the client so their details and rate remain consistent.
      // This also serializes invoice creation for the same client.
      const clientResult = await connection.query(
        `SELECT id, name, email, company, hourly_rate
         FROM clients
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [data.client_id, req.session.userId],
      );

      const client = clientResult.rows[0];

      if (!client) {
        await connection.query("ROLLBACK");
        return res.status(404).json({ error: "Client not found." });
      }

      const dateResult = await connection.query(
        `SELECT to_char(
           clock_timestamp() AT TIME ZONE 'Asia/Kolkata',
           'YYYY-MM-DD'
         ) AS issued_on`,
      );

      const issuedOn = dateResult.rows[0].issued_on;

      if (data.due_on < issuedOn) {
        await connection.query("ROLLBACK");

        return res.status(400).json({
          error: "Due date must be on or after the issue date.",
        });
      }

      // Lock only finished entries owned by this user and client.
      const entryResult = await connection.query(
        `SELECT t.id
         FROM time_entries AS t
         JOIN projects AS p ON p.id = t.project_id
         WHERE t.id = ANY($1::bigint[])
           AND t.user_id = $2
           AND p.client_id = $3
           AND t.ended_at IS NOT NULL
         ORDER BY t.id
         FOR UPDATE OF t`,
        [data.time_entry_ids, req.session.userId, data.client_id],
      );

      if (entryResult.rows.length !== data.time_entry_ids.length) {
        await connection.query("ROLLBACK");

        return res.status(400).json({
          error:
            "Some selected entries are unavailable, unfinished, or do not belong to this client.",
        });
      }

      const billedResult = await connection.query(
        `SELECT time_entry_id
         FROM invoice_items
         WHERE time_entry_id = ANY($1::bigint[])
         LIMIT 1`,
        [data.time_entry_ids],
      );

      if (billedResult.rows.length > 0) {
        await connection.query("ROLLBACK");

        return res.status(409).json({
          error: "Some selected time entries have already been billed.",
        });
      }

      const invoiceResult = await connection.query(
        `INSERT INTO invoices (
           user_id, client_id, client_name, client_email,
           client_company, issued_on, due_on, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8)
         RETURNING id, client_id, client_name, client_email,
                   client_company, currency, status,
                   to_char(issued_on, 'YYYY-MM-DD') AS issued_on,
                   to_char(due_on, 'YYYY-MM-DD') AS due_on,
                   notes, created_at`,
        [
          req.session.userId,
          client.id,
          client.name,
          client.email,
          client.company,
          issuedOn,
          data.due_on,
          data.notes,
        ],
      );

      const invoice = invoiceResult.rows[0];

      // Snapshot the source details. Generated columns calculate
      // each duration and rounded line amount in PostgreSQL.
      const itemsResult = await connection.query(
        `INSERT INTO invoice_items (
           invoice_id, time_entry_id, project_name,
           description, started_at, ended_at, hourly_rate
         )
         SELECT $1, t.id, p.name, t.description,
                t.started_at, t.ended_at, $2::numeric
         FROM time_entries AS t
         JOIN projects AS p ON p.id = t.project_id
         WHERE t.id = ANY($3::bigint[])
           AND t.user_id = $4
           AND p.client_id = $5
           AND t.ended_at IS NOT NULL
         ORDER BY t.id
         RETURNING id, time_entry_id, project_name, description,
                   started_at, ended_at, hourly_rate,
                   duration_seconds, amount`,
        [
          invoice.id,
          client.hourly_rate,
          data.time_entry_ids,
          req.session.userId,
          client.id,
        ],
      );

      if (itemsResult.rows.length !== data.time_entry_ids.length) {
        throw new Error("Invoice item count did not match selected entries.");
      }

      const totalResult = await connection.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM invoice_items
         WHERE invoice_id = $1`,
        [invoice.id],
      );

      await connection.query("COMMIT");

      return res.status(201).json({
        invoice: {
          ...invoice,
          total: totalResult.rows[0].total,
          items: itemsResult.rows,
        },
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Invoice rollback failed:", rollbackError.message);
        }
      }

      if (error.code === "23505") {
        return res.status(409).json({
          error: "Some selected time entries have already been billed.",
        });
      }

      if (error.code === "23503") {
        return res.status(409).json({
          error: "Selected records changed. Refresh and try again.",
        });
      }

      if (error.code === "40P01" || error.code === "40001") {
        return res.status(409).json({
          error: "Another request changed these records. Please retry.",
        });
      }

      console.error("Invoice creation failed:", error.message);

      return res.status(500).json({
        error: "Unable to create invoice.",
      });
    } finally {
      if (connection) connection.release();
    }
  };
};
