import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "./api";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const axisFormatter = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function money(value) {
  return currencyFormatter.format(Number(value));
}

function parseMonths(value) {
  if (!Array.isArray(value)) {
    throw new Error("The server returned invalid financial data.");
  }

  return value.map((item) => {
    const collected = Number(item.collected_revenue);
    const outstanding = Number(item.outstanding_amount);

    if (
      typeof item.month !== "string" ||
      typeof item.label !== "string" ||
      !Number.isFinite(collected) ||
      !Number.isFinite(outstanding) ||
      collected < 0 ||
      outstanding < 0
    ) {
      throw new Error("The server returned invalid financial data.");
    }

    return {
      month: item.month,
      label: item.label,
      collected_revenue: collected,
      outstanding_amount: outstanding,
    };
  });
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

        const nextMonths = parseMonths(data.months);

        if (!controller.signal.aborted) {
          setMonths(nextMonths);
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

  const hasAmounts = months.some(
    (month) => month.collected_revenue > 0 || month.outstanding_amount > 0,
  );

  return (
    <section
      className="revenue-section"
      aria-labelledby="revenue-title"
      aria-busy={loading}
    >
      <div className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-4">
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
          {loading ? "Loading..." : "Refresh finances"}
        </button>
      </div>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <p className="muted" role="status">
          Updating financial overview...
        </p>
      )}

      {!loading && !error && months.length === 0 && (
        <p className="muted">No financial data is available yet.</p>
      )}

      {months.length > 0 && (
        <>
          {error && (
            <p className="muted">Previously loaded figures are shown below.</p>
          )}

          <p className="muted">
            Collected revenue uses the payment month. Outstanding amounts show
            currently unpaid invoices grouped by issue month.
          </p>

          {!hasAmounts && (
            <p className="muted">
              No collected revenue or outstanding amounts in this period.
            </p>
          )}

          <div className="tw:mt-5 tw:rounded-xl tw:border tw:border-solid tw:border-[#dce1d7] tw:bg-white tw:p-3 tw:sm:p-5">
            <div
              className="tw:h-80 tw:w-full tw:min-w-0"
              role="group"
              aria-label="Monthly collected revenue and outstanding payments chart"
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={months}
                  accessibilityLayer
                  margin={{
                    top: 16,
                    right: 8,
                    bottom: 8,
                    left: 0,
                  }}
                  barGap={4}
                >
                  <CartesianGrid
                    stroke="#e4e9e2"
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fill: "#52645b",
                      fontSize: 11,
                    }}
                    minTickGap={12}
                    tickMargin={10}
                  />

                  <YAxis
                    width={62}
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fill: "#52645b",
                      fontSize: 11,
                    }}
                    tickFormatter={(value) => `₹${axisFormatter.format(value)}`}
                    domain={hasAmounts ? [0, "auto"] : [0, 1]}
                  />

                  <Tooltip
                    formatter={(value) => money(value)}
                    cursor={{ fill: "#f0f4ed" }}
                    contentStyle={{
                      border: "1px solid #dce1d7",
                      borderRadius: 10,
                      backgroundColor: "#ffffff",
                      color: "#182820",
                    }}
                  />

                  <Legend
                    wrapperStyle={{
                      paddingTop: 16,
                      fontSize: 12,
                    }}
                  />

                  <Bar
                    dataKey="collected_revenue"
                    name="Collected"
                    fill="#286347"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  />

                  <Bar
                    dataKey="outstanding_amount"
                    name="Outstanding"
                    fill="#c1832d"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <details className="tw:mt-4">
            <summary className="tw:cursor-pointer tw:font-semibold">
              View exact monthly amounts
            </summary>

            <div className="tw:mt-3 tw:overflow-x-auto">
              <table className="tw:w-full tw:border-collapse tw:text-left tw:text-sm">
                <caption className="tw:sr-only">
                  Monthly collected revenue and outstanding payments in Indian
                  rupees
                </caption>

                <thead>
                  <tr className="tw:bg-[#edf2e8]">
                    <th scope="col" className="tw:p-3">
                      Month
                    </th>
                    <th scope="col" className="tw:p-3">
                      Collected
                    </th>
                    <th scope="col" className="tw:p-3">
                      Outstanding
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {months.map((month) => (
                    <tr key={month.month}>
                      <th scope="row" className="tw:p-3 tw:font-medium">
                        {month.label}
                      </th>

                      <td className="tw:p-3 tw:whitespace-nowrap">
                        {money(month.collected_revenue)}
                      </td>

                      <td className="tw:p-3 tw:whitespace-nowrap">
                        {money(month.outstanding_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <p className="muted">
            These figures reflect current invoice statuses, not historical
            month-end balances. Older unpaid invoices remain included in the
            business overview&apos;s outstanding total.
          </p>
        </>
      )}
    </section>
  );
}
