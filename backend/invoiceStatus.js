const express = require("express");
const { z } = require("zod");

function validId(value) {
  return /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

const statusSchema = z.object({
  status: z.enum(["unpaid", "paid"]),
});

module.exports = function createInvoiceStatusRouter(pool) {
  const router = express.Router();

  // Authentication is supplied by the parent invoices router.
  router.patch("/:id/status", async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        error: "Invalid invoice ID.",
      });
    }

    const parsed = statusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Status must be unpaid or paid.",
      });
    }

    try {
      const result = await pool.query(
        `UPDATE invoices AS i
         SET status = $1::text,
             paid_at = CASE
               WHEN $1::text = 'paid'
                 THEN COALESCE(i.paid_at, clock_timestamp())
               ELSE NULL
             END
         WHERE i.id = $2 AND i.user_id = $3
         RETURNING i.id, i.status, i.paid_at`,
        [parsed.data.status, req.params.id, req.session.userId],
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          error: "Invoice not found.",
        });
      }

      return res.json({
        invoice: result.rows[0],
      });
    } catch (error) {
      console.error("Invoice status update failed:", error.message);

      return res.status(500).json({
        error: "Unable to update invoice status.",
      });
    }
  });

  return router;
};
