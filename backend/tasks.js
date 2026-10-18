const express = require("express");
const { z } = require("zod");

function validId(id) {
  return /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const year = Number(value.slice(0, 4));
  if (year < 1 || year > 9999) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

const taskDetails = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(""),
  status: z.enum(["todo", "in_progress", "completed"]).default("todo"),
  due_date: z.string().refine(validDate, {
    message: "Enter a valid date in YYYY-MM-DD format.",
  }),
});

const createSchema = taskDetails.extend({
  project_id: z.string().refine(validId, {
    message: "Invalid project ID.",
  }),
});

function invalidDetails(res, error) {
  return res.status(400).json({
    error: "Invalid task details.",
    details: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

module.exports = function createTasksRouter(pool) {
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
        `SELECT t.id, t.project_id, p.name AS project_name,
                t.title, t.description, t.status,
                to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
                t.created_at
         FROM tasks AS t
         JOIN projects AS p ON p.id = t.project_id
         JOIN clients AS c ON c.id = p.client_id
         WHERE c.user_id = $1
         ORDER BY t.due_date, t.id
         LIMIT 100`,
        [req.session.userId],
      );

      return res.json({ tasks: result.rows });
    } catch (error) {
      console.error("Task listing failed:", error.message);
      return res.status(500).json({
        error: "Unable to retrieve tasks.",
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
        `INSERT INTO tasks
           (project_id, title, description, status, due_date)
         SELECT p.id, $1, $2, $3, $4::date
         FROM projects AS p
         JOIN clients AS c ON c.id = p.client_id
         WHERE p.id = $5 AND c.user_id = $6
         RETURNING id, project_id, title, description, status,
                   to_char(due_date, 'YYYY-MM-DD') AS due_date,
                   created_at`,
        [
          data.title,
          data.description,
          data.status,
          data.due_date,
          data.project_id,
          req.session.userId,
        ],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Project not found." });
      }

      return res.status(201).json({ task: result.rows[0] });
    } catch (error) {
      if (error.code === "23503") {
        return res.status(409).json({
          error: "The selected project is no longer available.",
        });
      }

      console.error("Task creation failed:", error.message);
      return res.status(500).json({
        error: "Unable to create task.",
      });
    }
  });

  router.param("id", (req, res, next, id) => {
    if (!validId(id)) {
      return res.status(400).json({ error: "Invalid task ID." });
    }

    next();
  });

  router.get("/:id", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT t.id, t.project_id, p.name AS project_name,
                t.title, t.description, t.status,
                to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
                t.created_at
         FROM tasks AS t
         JOIN projects AS p ON p.id = t.project_id
         JOIN clients AS c ON c.id = p.client_id
         WHERE t.id = $1 AND c.user_id = $2`,
        [req.params.id, req.session.userId],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Task not found." });
      }

      return res.json({ task: result.rows[0] });
    } catch (error) {
      console.error("Task lookup failed:", error.message);
      return res.status(500).json({
        error: "Unable to retrieve task.",
      });
    }
  });

  // Replace editable details; the task's project remains fixed.
  router.put("/:id", async (req, res) => {
    const parsed = taskDetails.safeParse(req.body);

    if (!parsed.success) {
      return invalidDetails(res, parsed.error);
    }

    const data = parsed.data;

    try {
      const result = await pool.query(
        `UPDATE tasks AS t
         SET title = $1, description = $2,
             status = $3, due_date = $4::date
         FROM projects AS p, clients AS c
         WHERE t.project_id = p.id
           AND p.client_id = c.id
           AND t.id = $5 AND c.user_id = $6
         RETURNING t.id, t.project_id, t.title, t.description,
                   t.status,
                   to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
                   t.created_at`,
        [
          data.title,
          data.description,
          data.status,
          data.due_date,
          req.params.id,
          req.session.userId,
        ],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Task not found." });
      }

      return res.json({ task: result.rows[0] });
    } catch (error) {
      console.error("Task update failed:", error.message);
      return res.status(500).json({
        error: "Unable to update task.",
      });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM tasks AS t
         USING projects AS p, clients AS c
         WHERE t.project_id = p.id
           AND p.client_id = c.id
           AND t.id = $1 AND c.user_id = $2
         RETURNING t.id`,
        [req.params.id, req.session.userId],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: "Task not found." });
      }

      return res.json({ message: "Task deleted successfully." });
    } catch (error) {
      if (error.code === "23503") {
        return res.status(409).json({
          error: "This task has linked records and cannot be deleted.",
        });
      }

      console.error("Task deletion failed:", error.message);
      return res.status(500).json({
        error: "Unable to delete task.",
      });
    }
  });

  return router;
};
