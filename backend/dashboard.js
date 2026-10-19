const express = require("express");

module.exports = function createDashboardRouter(pool) {
  const router = express.Router();

  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");

    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in." });
    }

    next();
  });

  router.get("/", async (req, res) => {
    try {
      // Each subquery aggregates independently to avoid counting
      // the same project or invoice multiple times through joins.
      const result = await pool.query(
        `
        WITH today AS (
          SELECT
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS day
        ),
        invoice_totals AS (
          SELECT
            i.id,
            i.status,
            i.due_on,
            COALESCE(SUM(item.amount), 0) AS total
          FROM invoices AS i
          LEFT JOIN invoice_items AS item
            ON item.invoice_id = i.id
          WHERE i.user_id = $1
          GROUP BY i.id
        )
        SELECT json_build_object(
          'summary', json_build_object(
            'active_projects', (
              SELECT COUNT(*)
              FROM projects AS p
              JOIN clients AS c ON c.id = p.client_id
              WHERE c.user_id = $1
                AND p.status = 'active'
            ),
            'pending_invoices', (
              SELECT COUNT(*)
              FROM invoice_totals
              WHERE status = 'unpaid'
            ),
            'outstanding_amount', (
              SELECT COALESCE(SUM(total), 0)::text
              FROM invoice_totals
              WHERE status = 'unpaid'
            ),
            'collected_revenue', (
              SELECT COALESCE(SUM(total), 0)::text
              FROM invoice_totals
              WHERE status = 'paid'
            ),
            'overdue_invoices', (
              SELECT COUNT(*)
              FROM invoice_totals
              WHERE status = 'unpaid'
                AND due_on < (SELECT day FROM today)
            ),
            'overdue_tasks', (
              SELECT COUNT(*)
              FROM tasks AS t
              JOIN projects AS p ON p.id = t.project_id
              JOIN clients AS c ON c.id = p.client_id
              WHERE c.user_id = $1
                AND p.status = 'active'
                AND t.status <> 'completed'
                AND t.due_date < (SELECT day FROM today)
            )
          ),
          'upcoming_tasks', (
            SELECT COALESCE(json_agg(upcoming), '[]'::json)
            FROM (
              SELECT
                t.id::text AS id,
                t.project_id::text AS project_id,
                p.name AS project_name,
                c.name AS client_name,
                t.title,
                t.status,
                to_char(t.due_date, 'YYYY-MM-DD') AS due_date
              FROM tasks AS t
              JOIN projects AS p ON p.id = t.project_id
              JOIN clients AS c ON c.id = p.client_id
              WHERE c.user_id = $1
                AND p.status = 'active'
                AND t.status <> 'completed'
                AND t.due_date >= (SELECT day FROM today)
                AND t.due_date <= (SELECT day FROM today) + 7
              ORDER BY t.due_date, t.id
              LIMIT 10
            ) AS upcoming
          ),
          'currency', 'INR',
          'timezone', 'Asia/Kolkata'
        ) AS dashboard
        `,
        [req.session.userId],
      );

      return res.json(result.rows[0].dashboard);
    } catch (error) {
      console.error("Dashboard lookup failed:", error.message);

      return res.status(500).json({
        error: "Unable to retrieve dashboard.",
      });
    }
  });

  router.get("/revenue", async (req, res) => {
    try {
      const result = await pool.query(
        `
        WITH current_month AS (
          SELECT date_trunc(
            'month',
            CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'
          )::date AS month
        ),
        months AS (
          SELECT generate_series(
            (SELECT month FROM current_month) - INTERVAL '5 months',
            (SELECT month FROM current_month),
            INTERVAL '1 month'
          )::date AS month
        ),
        invoice_totals AS (
          SELECT
            i.id,
            i.status,
            i.issued_on,
            i.paid_at,
            COALESCE(SUM(item.amount), 0) AS total
          FROM invoices AS i
          LEFT JOIN invoice_items AS item
            ON item.invoice_id = i.id
          WHERE i.user_id = $1
          GROUP BY i.id
        )
        SELECT
          to_char(m.month, 'YYYY-MM') AS month,
          to_char(m.month, 'Mon YYYY') AS label,

          COALESCE((
            SELECT SUM(i.total)
            FROM invoice_totals AS i
            WHERE i.status = 'paid'
              AND i.paid_at >= (
                m.month::timestamp AT TIME ZONE 'Asia/Kolkata'
              )
              AND i.paid_at < (
                (m.month + INTERVAL '1 month')
                  AT TIME ZONE 'Asia/Kolkata'
              )
          ), 0)::text AS collected_revenue,

          COALESCE((
            SELECT SUM(i.total)
            FROM invoice_totals AS i
            WHERE i.status = 'unpaid'
              AND i.issued_on >= m.month
              AND i.issued_on < m.month + INTERVAL '1 month'
          ), 0)::text AS outstanding_amount

        FROM months AS m
        ORDER BY m.month
        `,
        [req.session.userId],
      );

      return res.json({
        months: result.rows,
        currency: "INR",
        timezone: "Asia/Kolkata",
      });
    } catch (error) {
      console.error("Revenue lookup failed:", error.message);

      return res.status(500).json({
        error: "Unable to retrieve revenue overview.",
      });
    }
  });
  return router;
};
