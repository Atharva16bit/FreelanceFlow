import { useEffect, useState } from "react";
import { api } from "./api";

const emptyForm = {
  project_id: "",
  description: "",
  started_at: "",
  ended_at: "",
};

function formatDuration(value) {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;

  return [hours, minutes, remaining]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function describeError(error) {
  if (error.status === 401) {
    return "Your session expired. Sign out and sign in again.";
  }

  const details = error.details
    ?.map((item) => `${item.field}: ${item.message}`)
    .join(" ");

  return details
    ? `${error.message} ${details}`
    : error.message || "Unable to reach the server.";
}

export default function TimeLogs() {
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ ...emptyForm });
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setLoadError("");

      try {
        const [entryData, projectData] = await Promise.all([
          api(`/time-entries?page=${page}&limit=10`, {
            signal: controller.signal,
          }),
          api("/projects", { signal: controller.signal }),
        ]);

        if (!controller.signal.aborted) {
          setEntries(entryData.entries);
          setHasMore(entryData.pagination.has_more);
          setProjects(projectData.projects);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(describeError(error));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [page, refresh]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function saveEntry(event) {
    event.preventDefault();
    setFormError("");
    setNotice("");

    // datetime-local values represent the browser's local timezone.
    const start = new Date(form.started_at);
    const end = new Date(form.ended_at);

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      setFormError("Enter valid start and end times.");
      return;
    }

    if (end <= start) {
      setFormError("End time must be after start time.");
      return;
    }

    if (start.getTime() > Date.now() || end.getTime() > Date.now()) {
      setFormError("Manual entries cannot contain future times.");
      return;
    }

    setSaving(true);

    try {
      await api("/time-entries/manual", {
        method: "POST",
        body: JSON.stringify({
          project_id: form.project_id,
          description: form.description,
          started_at: start.toISOString(),
          ended_at: end.toISOString(),
        }),
      });

      setNotice("Manual time entry saved.");
      setForm({ ...emptyForm });
      setFormOpen(false);
      setPage(1);
      setRefresh((value) => value + 1);
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setSaving(false);
    }
  }

  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Local timezone";

  return (
    <section className="clients-section" aria-labelledby="time-logs-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR RECORDED WORK</p>
          <h2 id="time-logs-heading">Time logs</h2>
        </div>

        <div className="client-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setRefresh((value) => value + 1)}
            disabled={loading || saving}
          >
            {loading ? "Loading…" : "Refresh logs"}
          </button>

          <button
            type="button"
            className="button-primary"
            onClick={() => {
              setFormOpen(true);
              setFormError("");
              setNotice("");
            }}
            disabled={loading || saving || !!loadError || projects.length === 0}
          >
            Add manual entry
          </button>
        </div>
      </div>

      <p className="muted">
        Times are displayed and entered in {timezone}. Running timers appear in
        Time tracker until stopped.
      </p>

      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}

      {formOpen && (
        <form className="client-form" onSubmit={saveEntry}>
          <h3>Record completed work</h3>

          <fieldset disabled={saving}>
            <label htmlFor="log-project">Project *</label>
            <select
              id="log-project"
              name="project_id"
              value={form.project_id}
              onChange={updateField}
              required
            >
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} — {project.client_name}
                </option>
              ))}
            </select>

            <div className="client-form-grid">
              <div>
                <label htmlFor="log-start">Start time *</label>
                <input
                  id="log-start"
                  name="started_at"
                  type="datetime-local"
                  value={form.started_at}
                  onChange={updateField}
                  required
                />
              </div>

              <div>
                <label htmlFor="log-end">End time *</label>
                <input
                  id="log-end"
                  name="ended_at"
                  type="datetime-local"
                  value={form.ended_at}
                  onChange={updateField}
                  required
                />
              </div>
            </div>

            <label htmlFor="log-description">Description</label>
            <textarea
              id="log-description"
              name="description"
              value={form.description}
              onChange={updateField}
              maxLength={2000}
              rows={3}
            />
          </fieldset>

          {formError && (
            <p className="error-message" role="alert">
              {formError}
            </p>
          )}

          <div className="client-actions">
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? "Saving…" : "Save entry"}
            </button>

            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setFormOpen(false);
                setFormError("");
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loadError ? (
        <p className="error-message" role="alert">
          {loadError}
        </p>
      ) : loading ? (
        <p className="muted" role="status">
          Loading time logs…
        </p>
      ) : entries.length === 0 ? (
        <p className="empty-state">No finished entries on this page.</p>
      ) : (
        <div className="client-grid">
          {entries.map((entry) => (
            <article className="client-card" key={entry.id}>
              <span className="status-badge">{entry.source}</span>
              <h3>{entry.project_name}</h3>
              <p className="muted">{entry.client_name}</p>

              <p className="project-description">
                {entry.description || "No description provided."}
              </p>

              <dl className="client-details">
                <div>
                  <dt>Started</dt>
                  <dd>
                    <time dateTime={entry.started_at}>
                      {new Date(entry.started_at).toLocaleString()}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Finished</dt>
                  <dd>
                    <time dateTime={entry.ended_at}>
                      {new Date(entry.ended_at).toLocaleString()}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Duration — hours:minutes:seconds</dt>
                  <dd>{formatDuration(entry.duration_seconds)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}

      <div className="client-actions card-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => setPage((value) => value - 1)}
          disabled={page === 1 || loading || saving}
        >
          Previous
        </button>

        <span>Page {page}</span>

        <button
          type="button"
          className="button-secondary"
          onClick={() => setPage((value) => value + 1)}
          disabled={!hasMore || loading || saving || !!loadError}
        >
          Next
        </button>
      </div>
    </section>
  );
}
