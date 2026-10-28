import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;

  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function timerSnapshot(timer) {
  if (!timer) return null;

  return {
    ...timer,
    initialSeconds:
      (Date.parse(timer.server_now) - Date.parse(timer.started_at)) / 1000,
    measuredAt: performance.now(),
  };
}

export default function Timer({ headerSlot }) {
  const [timer, setTimer] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [timerData, projectData] = await Promise.all([
          api("/time-entries/running", { signal: controller.signal }),
          api("/projects", { signal: controller.signal }),
        ]);

        if (!controller.signal.aborted) {
          setTimer(timerSnapshot(timerData.timer));
          setProjects(
            projectData.projects.filter(
              (project) => project.status === "active",
            ),
          );
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message || "Unable to load timer.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!timer) return;

    function updateDisplay() {
      setSeconds(
        timer.initialSeconds + (performance.now() - timer.measuredAt) / 1000,
      );
    }

    updateDisplay();
    const interval = window.setInterval(updateDisplay, 250);

    return () => window.clearInterval(interval);
  }, [timer]);

  async function startTimer(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await api("/time-entries/start", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          description,
        }),
      });

      setTimer(timerSnapshot(data.timer));
      setNotice("Timer started.");
    } catch (err) {
      setError(err.message);

      // Another browser tab may have started a timer.
      if (err.status === 409) {
        try {
          const data = await api("/time-entries/running");
          setTimer(timerSnapshot(data.timer));
        } catch {
          // Keep the original error visible; Refresh timer can retry.
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function stopTimer() {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await api(`/time-entries/${timer.id}/stop`, {
        method: "POST",
      });

      setTimer(null);
      setDescription("");
      setNotice(`Time saved: ${formatDuration(data.entry.duration_seconds)}.`);
    } catch (err) {
      setError(err.message);

      if (err.status === 404) {
        try {
          const data = await api("/time-entries/running");
          setTimer(timerSnapshot(data.timer));
        } catch {
          // Keep the displayed timer until its state can be recovered.
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {timer && headerSlot && createPortal(
        <div className="running-timer">
          <a href="#ff-time" className="running-timer-link" aria-label="Open running timer">
            <span className="running-timer-dot" aria-hidden="true" />
            <span className="running-timer-project">{timer.project_name || projects.find((project) => project.id === timer.project_id)?.name || "Current project"}</span>
            <span className="running-timer-clock">{formatDuration(seconds)}</span>
          </a>
          <button type="button" className="button-secondary" disabled={busy || loading} onClick={stopTimer}>{busy ? "Saving…" : "Stop"}</button>
          {error && <a className="running-timer-error" href="#ff-time" role="alert">Could not update timer. Open Time for details.</a>}
        </div>, headerSlot
      )}
    <section className="clients-section" aria-labelledby="timer-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">TRACK YOUR WORK</p>
          <h2 id="timer-heading">Time tracker</h2>
        </div>

        <button
          type="button"
          className="button-secondary"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={loading || busy}
        >
          {loading ? "Loading…" : "Refresh timer"}
        </button>
      </div>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="muted" role="status">
          Checking your timer…
        </p>
      ) : timer ? (
        <div className="client-card">
          <span className="status-badge" data-status="running">Running</span>

          <h3>
            {timer.project_name ||
              projects.find((project) => project.id === timer.project_id)
                ?.name ||
              "Current project"}
          </h3>

          <p className="project-description">
            {timer.description || "No description provided."}
          </p>

          <p className="timer-clock" aria-label="Elapsed time">
            {formatDuration(seconds)}
          </p>

          <button
            type="button"
            className="button-secondary"
            onClick={stopTimer}
            disabled={busy}
          >
            {busy ? "Stopping…" : "Stop and save"}
          </button>

          <p className="muted">
            The timer continues if you refresh or close this page.
          </p>
        </div>
      ) : (
        <form className="client-form" onSubmit={startTimer}>
          <fieldset disabled={busy || !!error}>
            <label htmlFor="timer-project">Active project *</label>
            <select
              id="timer-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              required
            >
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} — {project.client_name}
                </option>
              ))}
            </select>

            <label htmlFor="timer-description">What are you working on?</label>
            <input
              id="timer-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
            />

            <button
              type="submit"
              className="button-primary"
              disabled={projects.length === 0}
            >
              {busy ? "Starting…" : "Start timer"}
            </button>
          </fieldset>

          {!error && projects.length === 0 && (
            <p className="muted">
              Create an active project, then refresh the timer.
            </p>
          )}
        </form>
      )}
    </section>
    </>
  );
}
