import { useEffect, useState } from "react";
import InvoiceCreator from "./InvoiceCreator";
import { api } from "./api";

function money(value) {
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function describeError(error) {
  return error.status === 401
    ? "Your session expired. Sign out and sign in again."
    : error.message || "Unable to complete the request.";
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const data = await api(`/invoices?page=${page}&limit=10`, {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setInvoices(data.invoices);
          setHasMore(data.pagination.has_more);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(describeError(err));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => controller.abort();
  }, [page, refresh]);

  function handleCreated() {
    setSelected(null);
    setNotice("");
    setPage(1);
    setRefresh((value) => value + 1);
  }

  async function viewInvoice(id) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await api(`/invoices/${id}`);
      setSelected(data.invoice);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(invoice) {
    const status = invoice.status === "paid" ? "unpaid" : "paid";

    const confirmed = window.confirm(
      `Mark invoice FF-${invoice.id} as ${status}? ` +
        "This records payment status; it does not process a payment.",
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await api(`/invoices/${invoice.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setInvoices((previous) =>
        previous.map((item) =>
          item.id === invoice.id ? { ...item, ...data.invoice } : item,
        ),
      );

      setSelected((previous) =>
        previous?.id === invoice.id
          ? { ...previous, ...data.invoice }
          : previous,
      );

      setNotice(`Invoice FF-${invoice.id} marked ${status}.`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf(id) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/invoices/${id}/pdf`, {
        credentials: "same-origin",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        const failure = new Error(data?.error || "Unable to download invoice.");

        failure.status = response.status;
        throw failure;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `invoice-FF-${id}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 10000);

      setNotice("PDF download requested.");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="clients-section" aria-labelledby="invoices-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BILL YOUR WORK</p>
          <h2 id="invoices-heading">Invoices</h2>
        </div>

        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            setSelected(null);
            setRefresh((value) => value + 1);
          }}
          disabled={loading || busy}
        >
          {loading ? "Loading…" : "Refresh invoices"}
        </button>
      </div>

      <p className="muted">Downloadable PDFs require the Pro plan.</p>

      <InvoiceCreator onCreated={handleCreated} />

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

      <h3 className="invoice-list-heading">Saved invoices</h3>

      {loading ? (
        <p className="muted" role="status">
          Loading invoices…
        </p>
      ) : !error && invoices.length === 0 ? (
        <p className="empty-state">No invoices on this page.</p>
      ) : (
        <div className="client-grid">
          {invoices.map((invoice) => (
            <article className="client-card" key={invoice.id}>
              <span className="status-badge">{invoice.status}</span>

              <h3>Invoice FF-{invoice.id}</h3>

              <p className="muted">{invoice.client_name}</p>

              <dl className="client-details">
                <div>
                  <dt>Total</dt>
                  <dd>
                    {invoice.currency} {money(invoice.total)}
                  </dd>
                </div>

                <div>
                  <dt>Issued</dt>
                  <dd>{invoice.issued_on}</dd>
                </div>

                <div>
                  <dt>Due</dt>
                  <dd>{invoice.due_on}</dd>
                </div>
              </dl>

              <div className="client-actions card-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => viewInvoice(invoice.id)}
                  disabled={busy || loading}
                >
                  View
                </button>

                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => changeStatus(invoice)}
                  disabled={busy || loading}
                >
                  Mark {invoice.status === "paid" ? "unpaid" : "paid"}
                </button>

                <button
                  type="button"
                  className="button-primary"
                  onClick={() => downloadPdf(invoice.id)}
                  disabled={busy || loading}
                >
                  Download PDF
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <article
          className="invoice-detail"
          aria-labelledby="invoice-detail-heading"
        >
          <div className="section-heading">
            <h3 id="invoice-detail-heading">
              Invoice FF-{selected.id} details
            </h3>

            <button
              type="button"
              className="button-secondary"
              onClick={() => setSelected(null)}
              disabled={busy}
            >
              Close details
            </button>
          </div>

          <p>
            {selected.client_name}
            {selected.client_company ? ` — ${selected.client_company}` : ""}
          </p>

          {selected.client_email && <p>{selected.client_email}</p>}

          <p>
            Status: <strong>{selected.status}</strong>
            {" · "}Due: {selected.due_on}
          </p>

          <div className="invoice-table-wrap">
            <table className="invoice-table">
              <caption>Saved invoice line items</caption>

              <thead>
                <tr>
                  <th scope="col">Work</th>
                  <th scope="col">Hours</th>
                  <th scope="col">Rate (INR)</th>
                  <th scope="col">Amount (INR)</th>
                </tr>
              </thead>

              <tbody>
                {selected.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.project_name}</strong>
                      <div>{item.description || "Recorded work"}</div>
                    </td>

                    <td>{(Number(item.duration_seconds) / 3600).toFixed(4)}</td>

                    <td>{money(item.hourly_rate)}</td>

                    <td>{money(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="invoice-total">
            Total: {selected.currency} {money(selected.total)}
          </p>

          {selected.notes && (
            <p className="project-description">{selected.notes}</p>
          )}

          <p className="metric-note">
            Hours are rounded for display. Totals use the saved, rounded line
            amounts.
          </p>
        </article>
      )}

      <div className="client-actions card-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            setSelected(null);
            setPage((value) => value - 1);
          }}
          disabled={page === 1 || loading || busy}
        >
          Previous
        </button>

        <span>Page {page}</span>

        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            setSelected(null);
            setPage((value) => value + 1);
          }}
          disabled={!hasMore || loading || busy || !!error}
        >
          Next
        </button>
      </div>
    </section>
  );
}
