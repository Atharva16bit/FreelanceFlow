const express = require("express");
const PDFDocument = require("pdfkit");

function validId(value) {
  return /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

function buildPdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Invoice FF-${invoice.id}`,
        Author: "FreelanceFlow",
      },
    });

    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      doc
        .font("Helvetica-Bold")
        .fontSize(24)
        .fillColor("#173b2c")
        .text("FreelanceFlow");

      doc.moveDown(0.5);

      doc.fontSize(18).text(`INVOICE FF-${invoice.id}`);

      doc.font("Helvetica").fontSize(10).fillColor("#333333");

      doc.moveDown();
      doc.text(`Status: ${invoice.status.toUpperCase()}`);
      doc.text(`Issued: ${invoice.issued_on}`);
      doc.text(`Due: ${invoice.due_on}`);
      doc.text(`Currency: ${invoice.currency}`);

      doc.moveDown(1.5);
      doc.font("Helvetica-Bold").text("BILL TO");
      doc.font("Helvetica").text(invoice.client_name);

      if (invoice.client_company) {
        doc.text(invoice.client_company);
      }

      if (invoice.client_email) {
        doc.text(invoice.client_email);
      }

      doc.moveDown(1.5);
      doc.font("Helvetica-Bold").fontSize(13).text("Work recorded");
      doc.moveDown(0.5);

      invoice.items.forEach((item, index) => {
        // Start a new page when little space remains.
        if (doc.y > doc.page.height - doc.page.margins.bottom - 130) {
          doc.addPage();
        }

        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#173b2c")
          .text(`${index + 1}. ${item.project_name}`);

        doc.font("Helvetica").fontSize(10).fillColor("#333333");

        doc.text(item.description || "Recorded project work");

        const start = new Date(item.started_at).toLocaleString("en-GB", {
          timeZone: "Asia/Kolkata",
        });

        const end = new Date(item.ended_at).toLocaleString("en-GB", {
          timeZone: "Asia/Kolkata",
        });

        doc.text(`Start: ${start} IST`);
        doc.text(`End: ${end} IST`);

        const hours = (Number(item.duration_seconds) / 3600).toFixed(4);

        doc.text(`Hours: ${hours} | Rate: INR ${item.hourly_rate}`);
        doc.font("Helvetica-Bold").text(`Amount: INR ${item.amount}`);
        doc.moveDown();
      });

      if (doc.y > doc.page.height - doc.page.margins.bottom - 80) {
        doc.addPage();
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#173b2c")
        .text(`TOTAL: INR ${invoice.total}`, { align: "right" });

      if (invoice.notes) {
        doc.moveDown();
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#333333")
          .text("Notes");

        doc.font("Helvetica").fontSize(10).text(invoice.notes);
      }

      doc.moveDown();
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#666666")
        .text(
          "Amounts are calculated from saved durations and rates. " +
            "Displayed hours are rounded; totals sum the rounded line amounts.",
        );

      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}

module.exports = function createInvoicePdfRouter(pool) {
  const router = express.Router();

  // Authentication is supplied by the parent invoices router.
  router.get("/:id/pdf", async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid invoice ID." });
    }

    try {
      // Read metadata, saved items, and total in one database snapshot.
      const result = await pool.query(
        `SELECT i.id, i.client_name, i.client_email,
                i.client_company, i.currency, i.status,
                to_char(i.issued_on, 'YYYY-MM-DD') AS issued_on,
                to_char(i.due_on, 'YYYY-MM-DD') AS due_on,
                i.notes, u.plan,
                (
                  SELECT COALESCE(SUM(item.amount), 0)::text
                  FROM invoice_items AS item
                  WHERE item.invoice_id = i.id
                ) AS total,
                (
                  SELECT COALESCE(
                    json_agg(
                      json_build_object(
                        'project_name', item.project_name,
                        'description', item.description,
                        'started_at', item.started_at,
                        'ended_at', item.ended_at,
                        'hourly_rate', item.hourly_rate::text,
                        'duration_seconds', item.duration_seconds::text,
                        'amount', item.amount::text
                      ) ORDER BY item.id
                    ),
                    '[]'::json
                  )
                  FROM invoice_items AS item
                  WHERE item.invoice_id = i.id
                ) AS items
         FROM invoices AS i
         JOIN users AS u ON u.id = i.user_id
         WHERE i.id = $1 AND i.user_id = $2`,
        [req.params.id, req.session.userId],
      );

      const invoice = result.rows[0];

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found." });
      }

      if (invoice.plan !== "pro") {
        return res.status(403).json({
          error: "PDF invoicing is available on the Pro plan.",
        });
      }

      const pdf = await buildPdf(invoice);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-FF-${invoice.id}.pdf"`,
        "Cache-Control": "no-store",
      });

      return res.send(pdf);
    } catch (error) {
      console.error("Invoice PDF generation failed:", error.message);

      return res.status(500).json({
        error: "Unable to generate invoice PDF.",
      });
    }
  });

  return router;
};
