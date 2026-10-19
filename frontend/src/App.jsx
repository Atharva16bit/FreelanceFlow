import { useEffect, useState } from "react";
import Clients from "./Clients";
import Projects from "./Projects";
import Tasks from "./Tasks";
import Timer from "./Timer";
import TimeLogs from "./TimeLogs";
import Invoices from "./Invoices";
import { api } from "./api";
import "./App.css";

function errorMessage(error) {
  const details = error.details
    ?.map((item) => `${item.field}: ${item.message}`)
    .join(" ");

  return details
    ? `${error.message} ${details}`
    : error.message || "Unable to reach the server.";
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState("login");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const registering = mode === "register";

  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        const data = await api("/auth/me", {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setUser(data.user);
        }
      } catch (err) {
        if (!controller.signal.aborted && err.status !== 401) {
          setError(errorMessage(err));
        }
      } finally {
        if (!controller.signal.aborted) {
          setCheckingSession(false);
        }
      }
    }

    checkSession();

    return () => controller.abort();
  }, []);

  function switchMode() {
    setMode(registering ? "login" : "register");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setNotice("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (registering && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (registering && new TextEncoder().encode(password).length > 72) {
      setError("Password must not exceed 72 bytes.");
      return;
    }

    setBusy(true);

    try {
      if (registering) {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name,
            email,
            password,
          }),
        });

        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setNotice("Account created. Sign in with your new credentials.");
      } else {
        const data = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
          }),
        });

        setUser(data.user);
        setPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api("/auth/logout", {
        method: "POST",
      });

      setUser(null);
      setMode("login");
      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="loading-screen" role="status">
        Opening your workspace…
      </main>
    );
  }

  if (user) {
    return (
      <main className="workspace">
        <header className="workspace-header">
          <a className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              F
            </span>
            FreelanceFlow
          </a>

          <button
            type="button"
            className="button-secondary"
            onClick={handleLogout}
            disabled={busy}
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </header>

        <section className="welcome-card">
          <p className="eyebrow">YOUR WORKSPACE</p>

          <h1>Welcome, {user.name}.</h1>

          <p className="muted">
            Manage clients and projects, track your working time, and invoice
            completed work.
          </p>

          <dl className="account-details">
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>

            <div>
              <dt>Plan</dt>
              <dd className="plan-name">{user.plan}</dd>
            </div>
          </dl>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <Clients key={`clients-${user.id}`} />

          <Projects key={`projects-${user.id}`} />

          <Tasks key={`tasks-${user.id}`} />

          <Timer key={`timer-${user.id}`} />

          <TimeLogs key={`time-logs-${user.id}`} />

          <Invoices key={`invoices-${user.id}`} />
        </section>
      </main>
    );
  }

  return (
    <main className="login-layout">
      <section className="intro-panel">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          FreelanceFlow
        </a>

        <div className="intro-copy">
          <p className="eyebrow">A CLEARER WORKDAY</p>

          <h1>
            Your clients.
            <br />
            Your work.
            <br />
            One place.
          </h1>

          <p>
            Keep projects organised, track your time, and turn completed work
            into invoices.
          </p>
        </div>

        <p className="intro-footer">Built for independent professionals.</p>
      </section>

      <section className="form-panel">
        <div className="login-card">
          <p className="eyebrow">
            {registering ? "GET STARTED" : "WELCOME BACK"}
          </p>

          <h2>
            {registering ? "Create your account" : "Sign in to your workspace"}
          </h2>

          <p className="muted">
            {registering
              ? "Start with the Free plan and manage up to two clients."
              : "Enter your account details to continue."}
          </p>

          {notice && (
            <p className="success-message" role="status">
              {notice}
            </p>
          )}

          <form onSubmit={handleSubmit} aria-busy={busy}>
            {registering && (
              <>
                <label htmlFor="name">Your name</label>

                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                  disabled={busy}
                />
              </>
            )}

            <label htmlFor="email">Email address</label>

            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              required
              disabled={busy}
            />

            <label htmlFor="password">Password</label>

            <input
              id="password"
              type="password"
              autoComplete={registering ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={registering ? 12 : 1}
              aria-describedby={registering ? "password-help" : undefined}
              required
              disabled={busy}
            />

            {registering && (
              <>
                <p id="password-help" className="password-help">
                  Use at least 12 characters. Maximum: 72 UTF-8 bytes.
                </p>

                <label htmlFor="confirm-password">Confirm password</label>

                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  disabled={busy}
                />
              </>
            )}

            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="button-primary" disabled={busy}>
              {busy
                ? registering
                  ? "Creating account…"
                  : "Signing in…"
                : registering
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <div className="auth-switch">
            <span>
              {registering
                ? "Already have an account?"
                : "New to FreelanceFlow?"}
            </span>

            <button
              type="button"
              className="text-button"
              onClick={switchMode}
              disabled={busy}
            >
              {registering ? "Sign in" : "Create an account"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
