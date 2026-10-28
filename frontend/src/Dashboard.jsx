import { useEffect, useState } from "react";
import RevenueChart from "./RevenueChart";
import { api } from "./api";

const moneyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

function money(value) {
  return moneyFormatter.format(Number(value));
}

function displayDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const data = await api("/dashboard", {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setDashboard(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message || "Unable to load dashboard.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => controller.abort();
  }, [refreshKey]);

  const summary = dashboard?.summary;

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-title">
      <div className="dashboard-heading">
        <div>
          <h2 id="dashboard-title">Business overview</h2>

        </div>

        <button
          type="button"
          className="button-secondary"
          disabled={loading}
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          {loading ? "Loading..." : "Refresh overview"}
        </button>
      </div>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <p className="muted" role="status">
          Updating your overview...
        </p>
      )}

      {summary && (
        <>
          <div className="dashboard-grid">
            <article className="dashboard-stat">
              <h3>Active projects</h3>
              <p className="dashboard-value">{summary.active_projects}</p>
            </article>

            <article className="dashboard-stat">
              <h3>Unpaid invoices</h3>
              <p className="dashboard-value">{summary.pending_invoices}</p>
              <p className="muted">{summary.overdue_invoices} overdue</p>
            </article>

            <article className="dashboard-stat">
              <h3>Outstanding amount</h3>
              <p className="dashboard-value">
                {money(summary.outstanding_amount)}
              </p>
            </article>

            <article className="dashboard-stat">
              <h3>Collected revenue</h3>
              <p className="dashboard-value">
                {money(summary.collected_revenue)}
              </p>
              <p className="muted">Recorded as paid.</p>
            </article>
          </div>

          <div className="dashboard-deadlines">
            <h3>Upcoming deadlines</h3>

            <p className="muted">
              Today and the next 7 days (IST).
            </p>

            {summary.overdue_tasks > 0 && (
              <p className="error-message" role="status">
                You also have {summary.overdue_tasks} overdue{" "}
                {summary.overdue_tasks === 1 ? "task" : "tasks"}.
              </p>
            )}

            {dashboard.upcoming_tasks.length === 0 ? (
              <p className="muted">No upcoming deadlines.</p>
            ) : (
              <ul className="dashboard-task-list">
                {dashboard.upcoming_tasks.map((task) => (
                  <li key={task.id} className="dashboard-task">
                    <div>
                      <strong>{task.title}</strong>
                      <p className="muted">
                        {task.project_name} / {task.client_name}
                      </p>
                    </div>

                    <div className="dashboard-task-meta">
                      <time dateTime={task.due_date}>
                        {displayDate(task.due_date)}
                      </time>
                      <span className="status-badge" data-status={task.status}>
                        {task.status === "in_progress"
                          ? "In progress"
                          : "To do"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {dashboard.upcoming_tasks.length > 0 && (
              <p className="muted">Up to 10 unfinished tasks in active projects.</p>
            )}
          </div>
        </>
      )}

      <RevenueChart />
    </section>
  );
}
