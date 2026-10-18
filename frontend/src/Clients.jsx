import { useEffect, useRef, useState } from "react";
import { api } from "./api";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  company: "",
  hourly_rate: "0.00",
};

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

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);

  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const nameInput = useRef(null);
  const isFormOpen = form !== null;

  useEffect(() => {
    const controller = new AbortController();

    async function loadClients() {
      setLoading(true);
      setLoadError("");

      try {
        const data = await api("/clients", {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setClients(data.clients);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(describeError(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadClients();

    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (isFormOpen) {
      nameInput.current?.focus();
    }
  }, [editingId, isFormOpen]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDeleteTarget(null);
    setActionError("");
    setNotice("");
  }

  function openEdit(client) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      company: client.company || "",
      hourly_rate: client.hourly_rate,
    });
    setDeleteTarget(null);
    setActionError("");
    setNotice("");
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
    setActionError("");
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function saveClient(event) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    setNotice("");

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      company: form.company.trim(),
      hourly_rate: form.hourly_rate,
    };

    if (form.email.trim()) {
      payload.email = form.email.trim();
    }

    try {
      await api(editingId ? `/clients/${editingId}` : "/clients", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      setNotice(editingId ? "Client updated." : "Client created.");
      setForm(null);
      setEditingId(null);
      setAttempt((value) => value + 1);
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setSaving(false);
    }
  }

  async function deleteClient() {
    setSaving(true);
    setActionError("");
    setNotice("");

    try {
      await api(`/clients/${deleteTarget.id}`, {
        method: "DELETE",
      });

      setNotice("Client deleted.");
      setDeleteTarget(null);
      setAttempt((value) => value + 1);
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="clients-section" aria-labelledby="clients-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR BUSINESS</p>
          <h2 id="clients-heading">Clients</h2>
        </div>

        <div className="client-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setAttempt((value) => value + 1)}
            disabled={loading || saving}
          >
            {loading ? "Loading…" : "Refresh clients"}
          </button>

          <button
            type="button"
            className="button-primary"
            onClick={openCreate}
            disabled={saving}
          >
            Add client
          </button>
        </div>
      </div>

      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}

      {isFormOpen && (
        <form className="client-form" onSubmit={saveClient}>
          <h3>{editingId ? "Edit client" : "Add client"}</h3>

          <fieldset disabled={saving}>
            <div className="client-form-grid">
              <div>
                <label htmlFor="client-name">Client name *</label>
                <input
                  ref={nameInput}
                  id="client-name"
                  name="name"
                  value={form.name}
                  onChange={updateField}
                  maxLength={150}
                  required
                />
              </div>

              <div>
                <label htmlFor="client-company">Company</label>
                <input
                  id="client-company"
                  name="company"
                  value={form.company}
                  onChange={updateField}
                  maxLength={150}
                />
              </div>

              <div>
                <label htmlFor="client-email">Email</label>
                <input
                  id="client-email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={updateField}
                  maxLength={254}
                />
              </div>

              <div>
                <label htmlFor="client-phone">Phone</label>
                <input
                  id="client-phone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={updateField}
                  maxLength={30}
                />
              </div>

              <div>
                <label htmlFor="client-rate">Hourly rate *</label>
                <input
                  id="client-rate"
                  name="hourly_rate"
                  type="number"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  value={form.hourly_rate}
                  onChange={updateField}
                  required
                />
              </div>
            </div>
          </fieldset>

          {actionError && (
            <p className="error-message" role="alert">
              {actionError}
            </p>
          )}

          <div className="client-actions">
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? "Saving…" : "Save client"}
            </button>

            <button
              type="button"
              className="button-secondary"
              onClick={closeForm}
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
            This permanently deletes the client. Clients with linked projects
            cannot be deleted.
          </p>

          {actionError && (
            <p className="error-message" role="alert">
              {actionError}
            </p>
          )}

          <div className="client-actions">
            <button
              type="button"
              className="button-danger"
              onClick={deleteClient}
              disabled={saving}
            >
              {saving ? "Deleting…" : "Confirm deletion"}
            </button>

            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setDeleteTarget(null);
                setActionError("");
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
          Loading your clients…
        </p>
      ) : clients.length === 0 ? (
        <p className="empty-state">
          No clients yet. Select Add client to get started.
        </p>
      ) : (
        <div className="client-grid">
          {clients.map((client) => (
            <article className="client-card" key={client.id}>
              <div className="client-avatar" aria-hidden="true">
                {client.name.slice(0, 1).toUpperCase()}
              </div>

              <h3>{client.name}</h3>

              <p className="muted">{client.company || "Independent client"}</p>

              <dl className="client-details">
                <div>
                  <dt>Email</dt>
                  <dd>{client.email || "Not provided"}</dd>
                </div>

                <div>
                  <dt>Phone</dt>
                  <dd>{client.phone || "Not provided"}</dd>
                </div>

                <div>
                  <dt>Hourly rate</dt>
                  <dd>
                    {Number(client.hourly_rate).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    {" / hour"}
                  </dd>
                </div>
              </dl>

              <div className="client-actions card-actions">
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`Edit ${client.name}`}
                  onClick={() => openEdit(client)}
                  disabled={saving}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className="button-danger"
                  aria-label={`Delete ${client.name}`}
                  onClick={() => {
                    setDeleteTarget(client);
                    setForm(null);
                    setEditingId(null);
                    setActionError("");
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
