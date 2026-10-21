import { lazy, Suspense, useEffect, useRef, useState } from "react";
import Clients from "./Clients";
import Projects from "./Projects";
import Tasks from "./Tasks";
import Timer from "./Timer";
import TimeLogs from "./TimeLogs";
import Invoices from "./Invoices";
import "./Workspace.css";

const Dashboard = lazy(() => import("./Dashboard"));

const sections = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "clients", label: "Clients", icon: "clients" },
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "time", label: "Time", icon: "time" },
  { id: "invoices", label: "Invoices", icon: "invoices" },
];

const descriptions = {
  overview: "A clear view of your business, at a glance.",
  clients: "The people and businesses you work with.",
  projects: "Manage deliverables, budgets, and project progress.",
  tasks: "Keep the next step clear and the deadlines in sight.",
  time: "Track your work and keep an accurate time history.",
  invoices: "Turn completed work into clear, professional invoices.",
};

function NavigationIcon({ name }) {
  const paths = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    clients: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-3-5.2"/></>,
    projects: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h18"/></>,
    tasks: <><rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 4V2h6v2M8 11l2 2 5-5M8 17h8"/></>,
    time: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    invoices: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 8h6M9 12h6"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function sectionFromHash() {
  const id = window.location.hash.slice(1).replace(/^ff-/, "");
  return sections.some((section) => section.id === id) ? id : "overview";
}

export default function Workspace({ user, busy, error, onLogout }) {
  const [activeSection, setActiveSection] = useState(sectionFromHash);
  const navRef = useRef(null);
  const headerRef = useRef(null);
  const menuButtonRef = useRef(null);
  const focusMenuAfterOpening = useRef(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const panelRef = useRef(null);
  const focusAfterNavigation = useRef(false);
  const selected = sections.find((section) => section.id === activeSection);

  useEffect(() => {
    function syncNavigation() {
      setActiveSection(sectionFromHash());
      setMobileMenuOpen(false);
    }

    window.addEventListener("hashchange", syncNavigation);
    window.addEventListener("popstate", syncNavigation);

    return () => {
      window.removeEventListener("hashchange", syncNavigation);
      window.removeEventListener("popstate", syncNavigation);
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    if (focusMenuAfterOpening.current) {
      navRef.current?.querySelector('a[aria-current="page"]')?.focus();
      focusMenuAfterOpening.current = false;
    }

    function dismissOnEscape(event) {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    function dismissOutside(event) {
      if (!headerRef.current?.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    }

    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("pointerdown", dismissOutside);

    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    // Keep the selected item in view if the navigation area scrolls.
    const nav = navRef.current;
    const item = nav?.querySelector('[aria-current="page"]');

    if (nav && item) {
      const left = item.offsetLeft;
      const right = left + item.offsetWidth;

      if (left < nav.scrollLeft) nav.scrollLeft = left;
      else if (right > nav.scrollLeft + nav.clientWidth) {
        nav.scrollLeft = right - nav.clientWidth;
      }
    }

    if (focusAfterNavigation.current) {
      panelRef.current?.focus({ preventScroll: true });
      focusAfterNavigation.current = false;
    }
  }, [activeSection]);

  function navigate(event, id) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    setMobileMenuOpen(false);
    if (id === activeSection) {
      if (event.detail === 0) panelRef.current?.focus({ preventScroll: true });
      return;
    }

    window.history.pushState(null, "", `#ff-${id}`);
    focusAfterNavigation.current = event.detail === 0;
    setActiveSection(id);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  return (
    <main className="workspace workspace-with-navigation">
      <a className="workspace-skip-link" href="#workspace-content">
        Skip to workspace content
      </a>

      <header className="workspace-header" ref={headerRef}>
        <a
          className="brand"
          href="#ff-overview"
          onClick={(event) => navigate(event, "overview")}
        >
          <span className="brand-mark" aria-hidden="true">F</span>
          FreelanceFlow
        </a>

      <nav
        id="workspace-navigation"
        className="workspace-navigation"
        aria-label="Workspace"
        data-mobile-open={mobileMenuOpen}
      >
        <div className="workspace-navigation-scroll" ref={navRef}>
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#ff-${section.id}`}
              className="workspace-navigation-link"
              aria-current={activeSection === section.id ? "page" : undefined}
              onClick={(event) => navigate(event, section.id)}
            >
              <NavigationIcon name={section.icon} />
              <span>{section.label}</span>
            </a>
          ))}
        </div>
      </nav>

        <div className="workspace-account">
          <span className="workspace-plan">{user.plan}</span>
          <button
            type="button"
            className="button-secondary"
            onClick={onLogout}
            disabled={busy}
          >
            {busy ? "Signing out..." : "Sign out"}
          </button>
          <button
            ref={menuButtonRef}
            type="button"
            className="workspace-menu-toggle"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="workspace-navigation"
            onClick={(event) => {
              focusMenuAfterOpening.current = event.detail === 0 && !mobileMenuOpen;
              setMobileMenuOpen((open) => !open);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              {mobileMenuOpen ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </header>



      <section
        id="workspace-content"
        className="welcome-card workspace-content"
        tabIndex={-1}
        aria-labelledby="workspace-page-title"
        ref={panelRef}
      >
        <div className="workspace-page-heading">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1 id="workspace-page-title">
            {activeSection === "overview" ? `Welcome back, ${user.name}.` : activeSection === "time" ? "Time tracking" : selected.label}
          </h1>
          <p className="muted workspace-description">{descriptions[activeSection]}</p>
        </div>

        {error && <p className="error-message" role="alert">{error}</p>}

        <div className="workspace-view" hidden={activeSection !== "overview"}>
          {activeSection === "overview" && (
            <Suspense fallback={<p className="muted" role="status">Loading overview...</p>}>
              <Dashboard />
            </Suspense>
          )}
        </div>

        <div className="workspace-view" hidden={activeSection !== "clients"}>
          {activeSection === "clients" && <Clients />}
        </div>

        <div className="workspace-view" hidden={activeSection !== "projects"}>
          {activeSection === "projects" && <Projects />}
        </div>

        <div className="workspace-view" hidden={activeSection !== "tasks"}>
          {activeSection === "tasks" && <Tasks />}
        </div>

        {/* This stays mounted at a stable position so navigation cannot reset it. */}
        <div className="workspace-view" hidden={activeSection !== "time"}>
          <Timer />
          {activeSection === "time" && <TimeLogs />}
        </div>

        <div className="workspace-view" hidden={activeSection !== "invoices"}>
          {activeSection === "invoices" && <Invoices />}
        </div>
      </section>
    </main>
  );
}
