import { useEffect, useState } from "react";
import { api } from "./api";

function describeError(error) {
  const details = error.details
    ?.map((item) => `${item.field}: ${item.message}`)
    .join(" ");

  return details
    ? `${error.message} ${details}`
    : error.message || "Unable to complete the request.";
}

// Sum rounded preview amounts using integer paise.
function totalAmount(entries) {
  const paise = entries.reduce((sum, entry) => {
    const [whole, fraction = ""] = entry.estimated_amount.split(".");
    return sum + BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  }, 0n);

  return `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
}

export default function InvoiceCreator({ onCreated }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [selection, setSelection] = useState({
    client_id: "",
    from: "",
    to: "",
  });

  const [preview, setPreview] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [dueOn, setDueOn] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadClients() {
      try {
        const data = await api("/clients", {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) setClients(data.clients);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(describeError(err));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadClients();
    return () => controller.abort();
  }, []);

  function updateSelection(event) {
    const { name, value } = event.target;

    setSelection((previous) => ({ ...previous, [name]: value }));
    setPreview(null);
    setSelectedIds([]);
    setError("");
    setNotice("");
  }

  async function loadPreview(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setPreview(null);
    setSelectedIds([]);

    try {
      const query = new URLSearchParams(selection);
      const data = await api(`/invoices/unbilled?${query}`);
      setPreview(data);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleEntry(id) {
    setSelectedIds((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id],
    );
  }

  async function createInvoice(event) {
    event.preventDefault();

    if (selectedIds.length === 0) {
      setError("Select at least one time entry.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await api("/invoices", {
        method: "POST",
        body: JSON.stringify({
          client_id: preview.client.id,
          time_entry_ids: selectedIds,
          due_on: dueOn,
          notes,
        }),
      });

      setPreview(null);
      setSelectedIds([]);
      setDueOn("");
      setNotes("");
      setNotice(
        `Invoice FF-${data.invoice.id} created. ` +
          `Total: INR ${data.invoice.total}.`,
      );

      onCreated();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const selectedEntries =
    preview?.entries.filter((entry) => selectedIds.includes(entry.id)) || [];

  return (
    <div className="invoice-detail">
      <h3>Create invoice</h3>

      <p className="muted">
        Select a client and work dates, then choose the entries to bill. Dates
        use India time and match when the work started.
      </p>

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
        <p role="status">Loading clients…</p>
      ) : (
        <form className="client-form" onSubmit={loadPreview}>
          <fieldset disabled={busy}>
            <label htmlFor="invoice-client">Client *</label>
            <select
              id="invoice-client"
              name="client_id"
              value={selection.client_id}
              onChange={updateSelection}
              required
            >
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>

            <div className="client-form-grid">
              <div>
                <label htmlFor="invoice-from">Work from *</label>
                <input
                  id="invoice-from"
                  name="from"
                  type="date"
                  value={selection.from}
                  onChange={updateSelection}
                  required
                />
              </div>

              <div>
                <label htmlFor="invoice-to">Work through *</label>
                <input
                  id="invoice-to"
                  name="to"
                  type="date"
                  min={selection.from || undefined}
                  value={selection.to}
                  onChange={updateSelection}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="button-secondary"
              disabled={clients.length === 0}
            >
              {busy ? "Please wait…" : "Load unbilled entries"}
            </button>
          </fieldset>
        </form>
      )}

      {preview &&
        (preview.entries.length === 0 ? (
          <p className="empty-state">
            No finished, unbilled entries match this selection.
          </p>
        ) : (
          <form onSubmit={createInvoice}>
            <fieldset className="invoice-selection" disabled={busy}>
              <legend>Select work to bill</legend>

              {preview.entries.map((entry) => (
                <label className="invoice-entry-option" key={entry.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(entry.id)}
                    onChange={() => toggleEntry(entry.id)}
                  />

                  <span>
                    <strong>{entry.project_name}</strong>
                    <br />
                    {entry.description || "Recorded work"}
                    <br />
                    {new Date(entry.started_at).toLocaleString("en-GB", {
                      timeZone: "Asia/Kolkata",
                    })}
                    {" IST"}
                    <br />
                    {(Number(entry.duration_seconds) / 3600).toFixed(4)}
                    {" hours · INR "}
                    {entry.estimated_amount}
                  </span>
                </label>
              ))}

              <p className="invoice-total">
                Preview total: INR {totalAmount(selectedEntries)}
              </p>

              <p className="metric-note">
                Preview rate: INR {preview.client.hourly_rate}/hour. The backend
                rechecks the current rate and billing availability when creating
                the invoice.
              </p>

              <label htmlFor="invoice-due">Payment due date *</label>
              <input
                id="invoice-due"
                type="date"
                value={dueOn}
                onChange={(event) => setDueOn(event.target.value)}
                required
              />

              <label htmlFor="invoice-notes">Notes</label>
              <textarea
                id="invoice-notes"
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />

              <button
                type="submit"
                className="button-primary"
                disabled={selectedIds.length === 0}
              >
                {busy ? "Creating…" : "Create unpaid invoice"}
              </button>
            </fieldset>
          </form>
        ))}
    </div>
  );
}
