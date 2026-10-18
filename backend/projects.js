const express = require("express");
const { z } = require("zod");

function validId(id) {
  return /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
}

const projectDetails = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(5000).default(""),
  status: z.enum(["active", "completed"]).default("active"),
  budget: z
    .string()
    .regex(
      /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/,
      "Enter a non-negative budget with up to two decimal places.",
    )
    .default("0"),
});

const createSchema = projectDetails.extend({
  client_id: z.string().refine(validId, {
    message: "Invalid client ID.",
  }),
});

function invalidDetails(res, error) {
  return res.status(400).json({
    error: "Invalid project details.",
    details: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

module.exports = function createProjectsRouter(pool) {
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
      const result = await pool.query(
        `SELECT p.id, p.client_id, c.name AS client_name,
                p.name, p.description, p.status, p.budget, p.created_at
         FROM projects AS p
         JOIN clients AS c ON c.id = p.client_id
         WHERE c.user_id = $1
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT 100`,
        [req.session.userId],
      );

      return res.json({ projects: result.rows });
    } catch (error) {
      console.error("Project listing failed:", error.message);
      return res.status(500).json({
        error: "Unable to retrieve projects.",
      });
    }
  });

  router.post("/", async (req, res) => {
    const parsed = createSchema.safeParse(req.body);

    if (!parsed.success) {
      return invalidDetails(res, parsed.error);
    }

    const data = parsed.data;

    try {
      const result = await pool.query(
        `INSERT INTO projects
           (client_id, name, description, status, budget)
         SELECT c.id, $1, $2, $3, $4
         FROM clients AS c
         WHERE c.id = $5 AND c.user_id = $6
         RETURNING id, client_id, name, description,
                   status, budget, created_at`,
        [
          data.name,
          data.description,
          data.status,
          data.budget,
          data.client_id,
          req.session.userId,
        ],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Client not found." });
      }

      return res.status(201).json({ project: result.rows[0] });
    } catch (error) {
      if (error.code === "23503") {
        return res.status(409).json({
          error: "The selected client is no longer available.",
        });
      }

      console.error("Project creation failed:", error.message);
      return res.status(500).json({
        error: "Unable to create project.",
      });
    }
  });

  // Validate the ID for every route below.
  router.param("id", (req, res, next, id) => {
    if (!validId(id)) {
      return res.status(400).json({ error: "Invalid project ID." });
    }

    next();
  });

  router.get("/:id", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT p.id, p.client_id, c.name AS client_name,
                p.name, p.description, p.status, p.budget, p.created_at
         FROM projects AS p
         JOIN clients AS c ON c.id = p.client_id
         WHERE p.id = $1 AND c.user_id = $2`,
        [req.params.id, req.session.userId],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Project not found." });
      }

      return res.json({ project: result.rows[0] });
    } catch (error) {
      console.error("Project lookup failed:", error.message);
      return res.status(500).json({
        error: "Unable to retrieve project.",
      });
    }
  });

  // Replace editable details; the project's client remains fixed.
  router.put("/:id", async (req, res) => {
    const parsed = projectDetails.safeParse(req.body);

    if (!parsed.success) {
      return invalidDetails(res, parsed.error);
    }

    const data = parsed.data;

    try {
      const result = await pool.query(
        `UPDATE projects AS p
         SET name = $1, description = $2, status = $3, budget = $4
         FROM clients AS c
         WHERE p.client_id = c.id
           AND p.id = $5 AND c.user_id = $6
         RETURNING p.id, p.client_id, p.name, p.description,
                   p.status, p.budget, p.created_at`,
        [
          data.name,
          data.description,
          data.status,
          data.budget,
          req.params.id,
          req.session.userId,
        ],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Project not found." });
      }

      return res.json({ project: result.rows[0] });
    } catch (error) {
      console.error("Project update failed:", error.message);
      return res.status(500).json({
        error: "Unable to update project.",
      });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM projects AS p
         USING clients AS c
         WHERE p.client_id = c.id
           AND p.id = $1 AND c.user_id = $2
         RETURNING p.id`,
        [req.params.id, req.session.userId],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Project not found." });
      }

      return res.json({ message: "Project deleted successfully." });
    } catch (error) {
      if (error.code === "23503") {
        return res.status(409).json({
          error: "This project has linked records and cannot be deleted.",
        });
      }

      console.error("Project deletion failed:", error.message);
      return res.status(500).json({
        error: "Unable to delete project.",
      });
    }
  });

  return router;
};
