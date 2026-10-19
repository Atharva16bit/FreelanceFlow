const express = require("express");
const { z } = require("zod");

function validId(value) {
  return /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

const paginationSchema = z.object({
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
    .refine((value) => value <= 100),
});

const invoiceSelect = `
  SELECT i.id, i.client_id, i.client_name, i.client_email,
         i.client_company, i.currency, i.status,
         to_char(i.issued_on, 'YYYY-MM-DD') AS issued_on,
         to_char(i.due_on, 'YYYY-MM-DD') AS due_on,
         i.paid_at, i.notes, i.created_at,
         (
           SELECT COALESCE(SUM(item.amount), 0)
           FROM invoice_items AS item
           WHERE item.invoice_id = i.id
         ) AS total
  FROM invoices AS i
`;

module.exports = function createInvoiceViews(pool) {
  const router = express.Router();

  // The parent invoices router supplies authentication middleware.

  router.get("/", async (req, res) => {
    const parsed = paginationSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid pagination. Use page >= 1 and limit between 1 and 100.",
      });
    }

    const { page, limit } = parsed.data;

    try {
      const result = await pool.query(
        `${invoiceSelect}
         WHERE i.user_id = $1
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT $2 OFFSET $3`,
        [req.session.userId, limit + 1, (page - 1) * limit],
      );

      return res.json({
        invoices: result.rows.slice(0, limit),
        pagination: {
          page,
          limit,
          has_more: result.rows.length > limit,
        },
      });
    } catch (error) {
      console.error("Invoice listing failed:", error.message);

      return res.status(500).json({
        error: "Unable to retrieve invoices.",
      });
    }
  });

  router.get("/:id", async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        error: "Invalid invoice ID.",
      });
    }

    try {
      const invoiceResult = await pool.query(
        `${invoiceSelect}
         WHERE i.id = $1 AND i.user_id = $2`,
        [req.params.id, req.session.userId],
      );

      const invoice = invoiceResult.rows[0];

      if (!invoice) {
        return res.status(404).json({
          error: "Invoice not found.",
        });
      }

      const itemsResult = await pool.query(
        `SELECT item.id, item.time_entry_id, item.project_name,
                item.description, item.started_at, item.ended_at,
                item.hourly_rate, item.duration_seconds, item.amount
         FROM invoice_items AS item
         JOIN invoices AS i ON i.id = item.invoice_id
         WHERE i.id = $1 AND i.user_id = $2
         ORDER BY item.id`,
        [invoice.id, req.session.userId],
      );

      return res.json({
        invoice: {
          ...invoice,
          items: itemsResult.rows,
        },
      });
    } catch (error) {
      console.error("Invoice lookup failed:", error.message);

      return res.status(500).json({
        error: "Unable to retrieve invoice.",
      });
    }
  });

  return router;
};
