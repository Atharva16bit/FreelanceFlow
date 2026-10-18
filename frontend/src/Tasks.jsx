import { useEffect, useState } from "react";
import { api } from "./api";

const emptyForm = {
  project_id: "",
  title: "",
  description: "",
  status: "todo",
  due_date: "",
};

const statusLabels = {
  todo: "To do",
  in_progress: "In progress",
  completed: "Completed",
};

function describeError(error) {
  if (error.status === 401) {
    return "Your session expired. Sign out and sign in again.";
  }

  const details = error.details
    ?.map((item) => `${item.field}: ${item.message}`)
    .join(" ");

  return details ? `${error.message} ${details}` : error.message;
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setLoadError("");

      try {
        const [taskData, projectData] = await Promise.all([
          api("/tasks", { signal: controller.signal }),
          api("/projects", { signal: controller.signal }),
        ]);

        if (!controller.signal.aborted) {
          setTasks(taskData.tasks);
          setProjects(projectData.projects);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setLoadError(describeError(err));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [refresh]);

  function openForm(task = null) {
    setEditingId(task?.id || null);
    setForm(
      task
        ? {
            project_id: task.project_id,
            title: task.title,
            description: task.description,
            status: task.status,
            due_date: task.due_date,
          }
        : { ...emptyForm },
    );
    setDeleteTarget(null);
    setError("");
    setNotice("");
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function saveTask(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      due_date: form.due_date,
    };

    if (!editingId) payload.project_id = form.project_id;

    try {
      await api(editingId ? `/tasks/${editingId}` : "/tasks", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      setNotice(editingId ? "Task updated." : "Task created.");
      setForm(null);
      setEditingId(null);
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask() {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api(`/tasks/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setNotice("Task deleted.");
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="clients-section" aria-labelledby="tasks-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PLAN YOUR NEXT STEP</p>
          <h2 id="tasks-heading">Tasks</h2>
        </div>

        <div className="client-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setRefresh((value) => value + 1)}
            disabled={loading || saving}
          >
            {loading ? "Loading…" : "Refresh tasks"}
          </button>

          <button
            type="button"
            className="button-primary"
            onClick={() => openForm()}
            disabled={loading || saving || !!loadError || projects.length === 0}
          >
            Add task
          </button>
        </div>
      </div>

      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}

      {!loading && !loadError && projects.length === 0 && (
        <p className="muted">
          Add a project first, then refresh tasks to create a task.
        </p>
      )}

      {form && (
        <form className="client-form" onSubmit={saveTask}>
          <h3>{editingId ? "Edit task" : "Add task"}</h3>

          <fieldset disabled={saving}>
            <div className="client-form-grid">
              <div>
                <label htmlFor="task-title">Task title *</label>
                <input
                  id="task-title"
                  name="title"
                  value={form.title}
                  onChange={updateField}
                  maxLength={200}
                  required
                />
              </div>

              <div>
                <label htmlFor="task-project">Project *</label>
                <select
                  id="task-project"
                  name="project_id"
                  value={form.project_id}
                  onChange={updateField}
                  disabled={!!editingId}
                  required
                >
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} — {project.client_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="task-status">Status</label>
                <select
                  id="task-status"
                  name="status"
                  value={form.status}
                  onChange={updateField}
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="task-due-date">Due date *</label>
                <input
                  id="task-due-date"
                  name="due_date"
                  type="date"
                  min="0001-01-01"
                  max="9999-12-31"
                  value={form.due_date}
                  onChange={updateField}
                  required
                />
              </div>
            </div>

            <label htmlFor="task-description">Description</label>
            <textarea
              id="task-description"
              name="description"
              rows={3}
              value={form.description}
              onChange={updateField}
              maxLength={5000}
            />
          </fieldset>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <div className="client-actions">
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? "Saving…" : "Save task"}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setForm(null);
                setEditingId(null);
                setError("");
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {deleteTarget && (
        <div className="delete-confirmation">
          <h3>Delete {deleteTarget.title}?</h3>
          <p>This permanently deletes the task.</p>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <div className="client-actions">
            <button
              type="button"
              className="button-danger"
              onClick={deleteTask}
              disabled={saving}
            >
              {saving ? "Deleting…" : "Confirm deletion"}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setDeleteTarget(null);
                setError("");
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loadError ? (
        <p className="error-message" role="alert">
          {loadError}
        </p>
      ) : loading ? (
        <p className="muted" role="status">
          Loading tasks…
        </p>
      ) : tasks.length === 0 ? (
        <p className="empty-state">No tasks yet.</p>
      ) : (
        <div className="client-grid">
          {tasks.map((task) => (
            <article className="client-card" key={task.id}>
              <span className="status-badge">{statusLabels[task.status]}</span>

              <h3>{task.title}</h3>
              <p className="muted">{task.project_name}</p>
              <p className="project-description">
                {task.description || "No description provided."}
              </p>

              <dl className="client-details">
                <div>
                  <dt>Due date</dt>
                  <dd>
                    <time dateTime={task.due_date}>{task.due_date}</time>
                  </dd>
                </div>
              </dl>

              <div className="client-actions card-actions">
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`Edit ${task.title}`}
                  onClick={() => openForm(task)}
                  disabled={saving}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button-danger"
                  aria-label={`Delete ${task.title}`}
                  onClick={() => {
                    setDeleteTarget(task);
                    setForm(null);
                    setEditingId(null);
                    setError("");
                    setNotice("");
                  }}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
