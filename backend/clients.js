const express = require("express");
const { z } = require("zod");

const clientSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  phone: z.string().trim().max(30).optional(),
  company: z.string().trim().max(150).optional(),
  hourly_rate: z
    .string()
    .regex(
      /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/,
      "Enter a non-negative amount with up to two decimal places.",
    )
    .default("0"),
});

function isValidClientId(id) {
  return /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
}

function validationDetails(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

module.exports = function createClientsRouter(pool) {
  const router = express.Router();

  // Require authentication for every client endpoint.
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");

    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in." });
    }

    next();
  });

  // List the current user's clients.
  router.get("/", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, email, phone, company, hourly_rate, created_at
         FROM clients
         WHERE user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 100`,
        [req.session.userId],
      );

      return res.json({ clients: result.rows });
    } catch (error) {
      console.error("Client listing failed:", error.message);

      return res.status(500).json({
        error: "Unable to retrieve clients.",
      });
    }
  });

  // Create a client while enforcing the Free plan limit.
  router.post("/", async (req, res) => {
    const parsed = clientSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid client details.",
        details: validationDetails(parsed.error),
      });
    }

    let connection;

    try {
      connection = await pool.connect();
      await connection.query("BEGIN");

      // Serialize client creation for this user.
      const userResult = await connection.query(
        "SELECT plan FROM users WHERE id = $1 FOR UPDATE",
        [req.session.userId],
      );

      const user = userResult.rows[0];

      if (!user) {
        await connection.query("ROLLBACK");
        return res.status(401).json({ error: "Not logged in." });
      }

      if (user.plan === "free") {
        const countResult = await connection.query(
          "SELECT COUNT(*)::int AS total FROM clients WHERE user_id = $1",
          [req.session.userId],
        );

        if (countResult.rows[0].total >= 2) {
          await connection.query("ROLLBACK");

          return res.status(403).json({
            error: "The Free plan allows a maximum of two clients.",
          });
        }
      }

      const data = parsed.data;

      const result = await connection.query(
        `INSERT INTO clients
           (user_id, name, email, phone, company, hourly_rate)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, email, phone, company,
                   hourly_rate, created_at`,
        [
          req.session.userId,
          data.name,
          data.email ?? null,
          data.phone || null,
          data.company || null,
          data.hourly_rate,
        ],
      );

      await connection.query("COMMIT");

      return res.status(201).json({ client: result.rows[0] });
    } catch (error) {
      if (connection) {
        try {
          await connection.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Rollback failed:", rollbackError.message);
        }
      }

      console.error("Client creation failed:", error.message);

      return res.status(500).json({
        error: "Unable to create client.",
      });
    } finally {
      if (connection) connection.release();
    }
  });

  // View one client belonging to the current user.
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    if (!isValidClientId(id)) {
      return res.status(400).json({ error: "Invalid client ID." });
    }

    try {
      const result = await pool.query(
        `SELECT id, name, email, phone, company, hourly_rate, created_at
         FROM clients
         WHERE id = $1 AND user_id = $2`,
        [id, req.session.userId],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Client not found." });
      }

      return res.json({ client: result.rows[0] });
    } catch (error) {
      console.error("Client lookup failed:", error.message);

      return res.status(500).json({
        error: "Unable to retrieve client.",
      });
    }
  });

  // Replace all editable details of an owned client.
  router.put("/:id", async (req, res) => {
    const { id } = req.params;

    if (!isValidClientId(id)) {
      return res.status(400).json({ error: "Invalid client ID." });
    }

    const parsed = clientSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid client details.",
        details: validationDetails(parsed.error),
      });
    }

    const data = parsed.data;

    try {
      const result = await pool.query(
        `UPDATE clients
         SET name = $1,
             email = $2,
             phone = $3,
             company = $4,
             hourly_rate = $5
         WHERE id = $6 AND user_id = $7
         RETURNING id, name, email, phone, company,
                   hourly_rate, created_at`,
        [
          data.name,
          data.email ?? null,
          data.phone || null,
          data.company || null,
          data.hourly_rate,
          id,
          req.session.userId,
        ],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Client not found." });
      }

      return res.json({ client: result.rows[0] });
    } catch (error) {
      console.error("Client update failed:", error.message);

      return res.status(500).json({
        error: "Unable to update client.",
      });
    }
  });

  // Delete only a client owned by the current user.
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    if (!isValidClientId(id)) {
      return res.status(400).json({ error: "Invalid client ID." });
    }

    try {
      const result = await pool.query(
        `DELETE FROM clients
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [id, req.session.userId],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Client not found." });
      }

      return res.json({
        message: "Client deleted successfully.",
      });
    } catch (error) {
      if (error.code === "23503") {
        return res.status(409).json({
          error: "This client has linked records and cannot be deleted.",
        });
      }

      console.error("Client deletion failed:", error.message);

      return res.status(500).json({
        error: "Unable to delete client.",
      });
    }
  });

  return router;
};
