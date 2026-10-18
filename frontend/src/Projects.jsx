import { useEffect, useState } from "react";
import { api } from "./api";

const emptyForm = {
  client_id: "",
  name: "",
  description: "",
  status: "active",
  budget: "0.00",
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

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
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
        const [projectData, clientData] = await Promise.all([
          api("/projects", { signal: controller.signal }),
          api("/clients", { signal: controller.signal }),
        ]);

        if (!controller.signal.aborted) {
          setProjects(projectData.projects);
          setClients(clientData.clients);
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

  function openForm(project = null) {
    setEditingId(project?.id || null);
    setForm(
      project
        ? {
            client_id: project.client_id,
            name: project.name,
            description: project.description,
            status: project.status,
            budget: project.budget,
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

  async function saveProject(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      status: form.status,
      budget: form.budget,
    };

    if (!editingId) payload.client_id = form.client_id;

    try {
      await api(editingId ? `/projects/${editingId}` : "/projects", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      setNotice(editingId ? "Project updated." : "Project created.");
      setForm(null);
      setEditingId(null);
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject() {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      await api(`/projects/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setNotice("Project deleted.");
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="clients-section" aria-labelledby="projects-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">DELIVER YOUR WORK</p>
          <h2 id="projects-heading">Projects</h2>
        </div>

        <div className="client-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setRefresh((value) => value + 1)}
            disabled={loading || saving}
          >
            {loading ? "Loading…" : "Refresh projects"}
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={() => openForm()}
            disabled={loading || saving || !!loadError || clients.length === 0}
          >
            Add project
          </button>
        </div>
      </div>

      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}

      {!loading && !loadError && clients.length === 0 && (
        <p className="muted">
          Add a client first, then refresh projects to create a project.
        </p>
      )}

      {form && (
        <form className="client-form" onSubmit={saveProject}>
          <h3>{editingId ? "Edit project" : "Add project"}</h3>

          <fieldset disabled={saving}>
            <div className="client-form-grid">
              <div>
                <label htmlFor="project-name">Project name *</label>
                <input
                  id="project-name"
                  name="name"
                  value={form.name}
                  onChange={updateField}
                  maxLength={150}
                  required
                />
              </div>

              <div>
                <label htmlFor="project-client">Client *</label>
                <select
                  id="project-client"
                  name="client_id"
                  value={form.client_id}
                  onChange={updateField}
                  disabled={!!editingId}
                  required
                >
                  <option value="">Select a client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="project-status">Status</label>
                <select
                  id="project-status"
                  name="status"
                  value={form.status}
                  onChange={updateField}
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div>
                <label htmlFor="project-budget">Budget *</label>
                <input
                  id="project-budget"
                  name="budget"
                  type="number"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  value={form.budget}
                  onChange={updateField}
                  required
                />
              </div>
            </div>

            <label htmlFor="project-description">Description</label>
            <textarea
              id="project-description"
              name="description"
              value={form.description}
              onChange={updateField}
              maxLength={5000}
              rows={3}
            />
          </fieldset>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <div className="client-actions">
            <button className="button-primary" disabled={saving}>
              {saving ? "Saving…" : "Save project"}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setForm(null);
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
          <h3>Delete {deleteTarget.name}?</h3>
          <p>
            This permanently deletes the project. Projects with linked tasks or
            other records cannot be deleted.
          </p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="client-actions">
            <button
              type="button"
              className="button-danger"
              onClick={deleteProject}
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
          Loading projects…
        </p>
      ) : projects.length === 0 ? (
        <p className="empty-state">No projects yet.</p>
      ) : (
        <div className="client-grid">
          {projects.map((project) => (
            <article className="client-card" key={project.id}>
              <span className="status-badge">{project.status}</span>
              <h3>{project.name}</h3>
              <p className="muted">{project.client_name}</p>
              <p className="project-description">
                {project.description || "No description provided."}
              </p>
              <dl className="client-details">
                <div>
                  <dt>Budget</dt>
                  <dd>
                    {Number(project.budget).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </dd>
                </div>
              </dl>
              <div className="client-actions card-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => openForm(project)}
                  disabled={saving}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button-danger"
                  onClick={() => {
                    setDeleteTarget(project);
                    setForm(null);
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
