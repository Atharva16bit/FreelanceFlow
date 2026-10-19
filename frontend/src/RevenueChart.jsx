import { useEffect, useState } from "react";
import { api } from "./api";

const moneyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

function money(value) {
  return moneyFormatter.format(Number(value));
}

export default function RevenueChart() {
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRevenue() {
      setLoading(true);
      setError("");

      try {
        const data = await api("/dashboard/revenue", {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setMonths(data.months);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message || "Unable to load financial overview.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadRevenue();

    return () => controller.abort();
  }, [refreshKey]);

  const maximum = Math.max(
    0,
    ...months.flatMap((month) => [
      Number(month.collected_revenue),
      Number(month.outstanding_amount),
    ]),
  );

  function barWidth(value) {
    return maximum > 0 ? `${(Number(value) / maximum) * 100}%` : "0%";
  }

  return (
    <section className="revenue-section" aria-labelledby="revenue-title">
      <div className="dashboard-heading">
        <div>
          <h2 id="revenue-title">Financial overview</h2>
          <p className="muted">The last six calendar months, in INR.</p>
        </div>

        <button
          type="button"
          className="button-secondary"
          disabled={loading}
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          {loading ? "Loading…" : "Refresh finances"}
        </button>
      </div>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <p className="muted" role="status">
          Updating financial overview…
        </p>
      )}

      {months.length > 0 && (
        <>
          <p className="muted">
            Collected revenue uses the payment month. Outstanding amounts show
            currently unpaid invoices grouped by issue month.
          </p>

          {maximum === 0 && (
            <p className="muted">
              No collected revenue or outstanding amounts in this period.
            </p>
          )}

          <div className="revenue-chart">
            {months.map((month) => (
              <div className="revenue-month" key={month.month}>
                <h3>{month.label}</h3>

                <div className="revenue-series">
                  <div className="revenue-series-label">
                    <span>Collected</span>
                    <strong>{money(month.collected_revenue)}</strong>
                  </div>

                  <div className="revenue-track" aria-hidden="true">
                    <div
                      className="revenue-bar revenue-bar-collected"
                      style={{
                        width: barWidth(month.collected_revenue),
                      }}
                    />
                  </div>
                </div>

                <div className="revenue-series">
                  <div className="revenue-series-label">
                    <span>Outstanding</span>
                    <strong>{money(month.outstanding_amount)}</strong>
                  </div>

                  <div className="revenue-track" aria-hidden="true">
                    <div
                      className="revenue-bar revenue-bar-outstanding"
                      style={{
                        width: barWidth(month.outstanding_amount),
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="muted">
            These figures reflect current invoice statuses, not historical
            month-end balances. Older unpaid invoices remain included in the
            business overview’s outstanding total.
          </p>
        </>
      )}
    </section>
  );
}
