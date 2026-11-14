import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Helmet } from "react-helmet-async";

const TOKEN_KEY = "oswOutreachToken";
const ROW_HEIGHT = 44;
const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#1c1917"/><rect x="6" y="8" width="20" height="3" fill="#fafaf9"/><rect x="6" y="15" width="20" height="3" fill="#fafaf9"/><rect x="6" y="22" width="12" height="3" fill="#fafaf9"/></svg>',
  );

type Actor = { email: string; name: string | null };
type Column = { key: string; label: string; editable: boolean; choices: string[] | null };
type LeadRow = {
  id: string | null;
  table: string | null;
  entityType?: string;
  readOnly?: boolean;
  cells: Record<string, unknown>;
  ready: boolean;
  suppressed: boolean;
  badge: string | null;
  suppressionReason: string | null;
  latestNote: string;
  sandy: boolean;
  unmatchedKey?: string;
};
type LeadCounts = {
  leads: number;
  loaded: number;
  withEmail: number | null;
  missingEmail: number | null;
  statusNew: number | null;
  readyView: number | null;
  readyMatched: number;
  readyUnmatched: number;
  suppressed: number | null;
  suppressedMatched: number;
  suppressedUnmatched: number;
};
type LeadsPayload = {
  tab: string;
  unavailable?: string;
  columns: Column[];
  rows: LeadRow[];
  statuses: string[];
  categories: string[];
  statusColumn: string | null;
  categoryColumn: string | null;
  emailColumn: string | null;
  statusChoices: string[] | null;
  categoryChoices: string[] | null;
  counts: LeadCounts | null;
  truncated?: boolean;
  notesAvailable?: boolean;
  notices?: string[];
  readyView?: string | null;
};
type SavedView = { id: string; name: string; tab: string; config: Record<string, unknown> };
type WaitingItem = {
  kind: string;
  id: string | null;
  table?: string;
  column?: string;
  customer: string | null;
  ask: string | null;
  status?: string;
  daysOpen: number | null;
  closeChoices?: string[] | null;
  choices?: string[] | null;
  canSnooze?: boolean;
  canClose?: boolean;
  source?: string;
  readOnly?: boolean;
};
type NoteRow = {
  id: string;
  note: string;
  note_for_sandy: boolean;
  created_by: string;
  created_at: string;
  done: boolean;
};

async function api(path: string, options: RequestInit = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) sessionStorage.removeItem(TOKEN_KEY);
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return data;
}

function rowKey(row: LeadRow) {
  return row.id || row.unmatchedKey || "";
}

function textOf(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 16).replace("T", " ");
  return text;
}

function countLabel(value: number | null | undefined) {
  return value == null ? "Unavailable" : String(value);
}

function columnWidth(key: string) {
  if (key === "email") return 240;
  if (key === "full_name" || key === "name" || key === "company" || key === "company_name") return 180;
  if (key === "phone") return 150;
  if (key === "status" || key === "category" || key === "source") return 140;
  if (key.includes("note")) return 220;
  return 140;
}

export default function OutreachDesk() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const links = Array.from(document.querySelectorAll("link[rel~='icon']"));
    const previous = links.map((link) => ({ link, href: link.getAttribute("href") }));
    links.forEach((link) => link.setAttribute("href", ICON));
    let created: HTMLLinkElement | null = null;
    if (!links.length) {
      created = document.createElement("link");
      created.rel = "icon";
      created.href = ICON;
      document.head.appendChild(created);
    }
    return () => {
      previous.forEach((item) => {
        if (item.href) item.link.setAttribute("href", item.href);
      });
      created?.remove();
    };
  }, []);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const linkError = hash.get("error_description");
    if (accessToken || linkError) window.history.replaceState({}, "", "/admin/outreach");
    if (linkError) {
      setMessage(linkError);
      setReady(true);
      return;
    }
    const finish = (next: Actor | null) => {
      setActor(next);
      setReady(true);
    };
    if (accessToken) {
      api("/api/admin/outreach/session", { method: "POST", body: JSON.stringify({ accessToken }) })
        .then((data) => {
          sessionStorage.setItem(TOKEN_KEY, data.token);
          finish(data.actor);
        })
        .catch((error: Error) => {
          setMessage(error.message);
          finish(null);
        });
      return;
    }
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      finish(null);
      return;
    }
    api("/api/admin/outreach/me")
      .then((data) => finish(data.actor))
      .catch((error: Error) => {
        setMessage(error.message);
        finish(null);
      });
  }, []);

  return (
    <div className="osw-desk min-h-screen bg-stone-100 text-stone-900">
      <Helmet>
        <title>Outreach desk · Organic Soil Wholesale</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <style>{`
        .osw-desk button, .osw-desk input, .osw-desk select, .osw-desk textarea { font: inherit; }
        .osw-desk button { min-height: 44px; }
        .osw-grid-cell { min-height: 44px; }
      `}</style>
      {!ready ? (
        <p className="p-6 text-stone-600">Checking sign-in…</p>
      ) : actor ? (
        <Desk actor={actor} onSignOut={() => { sessionStorage.removeItem(TOKEN_KEY); setActor(null); }} />
      ) : (
        <Login initialMessage={message} onSignedIn={(next) => { setMessage(""); setActor(next); }} />
      )}
    </div>
  );
}

function Login({ initialMessage, onSignedIn }: { initialMessage: string; onSignedIn: (actor: Actor) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const data = await api("/api/admin/outreach/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      sessionStorage.setItem(TOKEN_KEY, data.token);
      onSignedIn(data.actor);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendLink() {
    setBusy(true);
    setMessage("");
    try {
      const data = await api("/api/admin/outreach/request-link", {
        method: "POST",
        body: JSON.stringify({ email, redirectTo: `${window.location.origin}/admin/outreach` }),
      });
      setMessage(data.message || "If this address is on the desk, a sign-in link is on its way.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The sign-in email could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Organic Soil Wholesale</p>
      <p className="text-sm text-stone-500">by Soil Seed &amp; Water</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Outreach desk</h1>
      <p className="mt-2 text-sm text-stone-600">Management only. This desk does not send outreach.</p>
      <form onSubmit={submitPassword} className="mt-6 space-y-3">
        <label className="block text-sm font-medium">
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-3"
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-3"
          />
        </label>
        <button type="submit" disabled={busy} className="w-full rounded-md bg-stone-900 px-3 text-white disabled:opacity-60">
          Sign in
        </button>
        <button type="button" disabled={busy || !email} onClick={sendLink} className="w-full rounded-md border border-stone-300 bg-white px-3">
          Email me a sign-in link
        </button>
      </form>
      {message ? <p className="mt-4 text-sm text-stone-700">{message}</p> : null}
    </main>
  );
}

function Desk({ actor, onSignOut }: { actor: Actor; onSignOut: () => void }) {
  const [tab, setTab] = useState<"waiting" | "leads" | "replies" | "metrics">("leads");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Organic Soil Wholesale</p>
          <p className="text-sm text-stone-500">by Soil Seed &amp; Water</p>
          <h1 className="text-xl font-semibold">Outreach desk</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-stone-600">{actor.name || actor.email}</p>
          <button type="button" onClick={onSignOut} className="rounded-md border border-stone-300 bg-white px-3">
            Sign out
          </button>
        </div>
      </header>
      <nav className="flex gap-2 overflow-x-auto border-b border-stone-200 bg-white px-3 py-2">
        {(
          [
            ["leads", "Leads"],
            ["waiting", "Waiting on Rodo"],
            ["replies", "Replies"],
            ["metrics", "Daily metrics"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`shrink-0 rounded-md px-3 ${tab === id ? "bg-stone-900 text-white" : "border border-stone-300 bg-white"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1">
        {tab === "leads" ? <LeadsTab /> : null}
        {tab === "waiting" ? <WaitingTab /> : null}
        {tab === "replies" ? <RepliesTab /> : null}
        {tab === "metrics" ? <MetricsTab /> : null}
      </div>
    </div>
  );
}

function LeadsTab() {
  const [payload, setPayload] = useState<LeadsPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("email");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [noteRow, setNoteRow] = useState<LeadRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, saved] = await Promise.all([
        api("/api/admin/outreach/rows?tab=leads"),
        api("/api/admin/outreach/views").catch(() => ({ views: [] })),
      ]);
      setPayload(rows);
      setViews((saved.views || []).filter((view: SavedView) => view.tab === "leads"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lead list could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = payload?.rows || [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "ready" && !row.ready) return false;
      if (filter === "bounced" && !row.suppressed) return false;
      if (status && payload?.statusColumn && String(row.cells[payload.statusColumn] ?? "") !== status) return false;
      if (category && payload?.categoryColumn && String(row.cells[payload.categoryColumn] ?? "") !== category) return false;
      if (!query) return true;
      const blob = [
        ...Object.values(row.cells).map((value) => textOf(value)),
        row.latestNote,
        row.badge,
        row.suppressionReason,
      ].join(" ").toLowerCase();
      return blob.includes(query);
    });
  }, [rows, filter, status, category, search, payload?.statusColumn, payload?.categoryColumn]);

  const sorted = useMemo(() => {
    const copy = filtered.slice();
    copy.sort((a, b) => {
      const av = sortKey === "_ready" ? (a.ready ? "1" : "0") : sortKey === "_badge" ? a.badge || "" : sortKey === "_note" ? a.latestNote : textOf(a.cells[sortKey]);
      const bv = sortKey === "_ready" ? (b.ready ? "1" : "0") : sortKey === "_badge" ? b.badge || "" : sortKey === "_note" ? b.latestNote : textOf(b.cells[sortKey]);
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function applyView(config: Record<string, unknown>) {
    setFilter(typeof config.filter === "string" ? config.filter : "all");
    setStatus(typeof config.status === "string" ? config.status : "");
    setCategory(typeof config.category === "string" ? config.category : "");
    setSearch(typeof config.search === "string" ? config.search : "");
    setSortKey(typeof config.sortKey === "string" ? config.sortKey : "email");
    setSortDir(config.sortDir === "desc" ? "desc" : "asc");
  }

  async function saveView() {
    const name = viewName.trim();
    if (!name) return;
    try {
      const saved = await api("/api/admin/outreach/views", {
        method: "POST",
        body: JSON.stringify({ name, tab: "leads", config: { filter, status, category, search, sortKey, sortDir } }),
      });
      setViews((current) => [saved.view, ...current]);
      setViewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The view was not saved.");
    }
  }

  const counts = payload?.counts;
  return (
    <section className="flex h-[calc(100vh-132px)] min-h-[480px] flex-col">
      <div className="space-y-3 border-b border-stone-200 bg-stone-50 px-3 py-3">
        <p className="text-sm text-stone-700">
          Live from Supabase. {counts ? `${countLabel(counts.leads)} leads` : "Lead count unavailable"}.
          {" "}
          {counts ? `${countLabel(counts.withEmail)} with email` : ""}.
          {" "}
          {counts ? `${countLabel(counts.statusNew)} status new` : ""}.
          {" "}
          Ready view {payload?.readyView || "sp_outbound_ready"}: {countLabel(counts?.readyView)}.
          {" "}
          Suppression list: {countLabel(counts?.suppressed)}. The ready view was not modified.
        </p>
        {payload?.truncated ? <p className="text-sm text-amber-800">The grid loaded the first {payload.counts?.loaded} rows. The live total is higher.</p> : null}
        {(payload?.notices || []).map((notice) => <p key={notice} className="text-sm text-amber-800">{notice}</p>)}
        {payload?.unavailable ? <p className="text-sm text-amber-800">{payload.unavailable}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
          <FilterChip active={filter === "ready"} onClick={() => setFilter("ready")}>
            Ready to send ({countLabel(counts?.readyView)})
          </FilterChip>
          <FilterChip active={filter === "bounced"} onClick={() => setFilter("bounced")} tone="danger">
            Bounced ({countLabel(counts?.suppressed)})
          </FilterChip>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-md border border-stone-300 bg-white px-2" aria-label="Status">
            <option value="">Any status</option>
            {(payload?.statuses || []).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-11 rounded-md border border-stone-300 bg-white px-2" aria-label="Category">
            <option value="">Any category</option>
            {(payload?.categories || []).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            aria-label="Search leads"
            className="min-h-11 min-w-[180px] flex-1 rounded-md border border-stone-300 bg-white px-3"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Saved views"
            className="min-h-11 rounded-md border border-stone-300 bg-white px-2"
            defaultValue=""
            onChange={(event) => {
              const id = event.target.value;
              if (id === "ready") applyView({ filter: "ready" });
              else if (id === "bounced") applyView({ filter: "bounced" });
              else if (id === "all") applyView({ filter: "all" });
              else {
                const view = views.find((item) => item.id === id);
                if (view) applyView(view.config);
              }
            }}
          >
            <option value="" disabled>Saved views</option>
            <option value="all">All leads</option>
            <option value="ready">Ready to send</option>
            <option value="bounced">Bounced</option>
            {views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
          </select>
          <input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Name this view" aria-label="View name" className="min-h-11 rounded-md border border-stone-300 bg-white px-3" />
          <button type="button" onClick={saveView} className="rounded-md border border-stone-300 bg-white px-3">Save view</button>
          <p className="text-sm text-stone-500">{loading ? "Loading live rows…" : `${sorted.length} shown`}. Arrows move. Enter edits. Esc cancels.</p>
        </div>
        {selected.length ? (
          <BulkBar
            ids={selected}
            statusChoices={payload?.statusChoices || payload?.statuses || []}
            categoryChoices={payload?.categoryChoices || payload?.categories || []}
            onDone={async () => { setSelected([]); await load(); }}
          />
        ) : null}
      </div>
      {payload ? (
        <LeadGrid
          columns={payload.columns}
          rows={sorted}
          selected={selected}
          onSelected={setSelected}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key) => {
            if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
            else {
              setSortKey(key);
              setSortDir("asc");
            }
          }}
          onOpenNote={setNoteRow}
          onEdited={load}
        />
      ) : null}
      {noteRow ? (
        <NoteDrawer
          row={noteRow}
          available={Boolean(payload?.notesAvailable)}
          onClose={() => setNoteRow(null)}
          onSaved={load}
        />
      ) : null}
    </section>
  );
}

function FilterChip({ active, tone, onClick, children }: { active: boolean; tone?: "danger"; onClick: () => void; children: ReactNode }) {
  const danger = tone === "danger";
  const activeClass = danger ? "bg-red-700 text-white" : "bg-stone-900 text-white";
  const idleClass = danger ? "border border-red-700 bg-white text-red-700" : "border border-stone-300 bg-white";
  return (
    <button type="button" onClick={onClick} className={`rounded-md px-3 ${active ? activeClass : idleClass}`}>
      {children}
    </button>
  );
}

function BulkBar({
  ids,
  statusChoices,
  categoryChoices,
  onDone,
}: {
  ids: string[];
  statusChoices: string[];
  categoryChoices: string[];
  onDone: () => Promise<void>;
}) {
  const [status, setStatus] = useState(statusChoices[0] || "");
  const [category, setCategory] = useState(categoryChoices[0] || "");
  const [note, setNote] = useState("");
  const [forSandy, setForSandy] = useState(false);
  const [confirmSuppress, setConfirmSuppress] = useState(false);
  const [error, setError] = useState("");

  async function run(action: string, extra: Record<string, unknown>) {
    setError("");
    try {
      await api("/api/admin/outreach/bulk", { method: "POST", body: JSON.stringify({ action, ids, ...extra }) });
      setConfirmSuppress(false);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The bulk change failed.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-stone-300 bg-white p-2">
      <p className="px-1 text-sm font-medium">{ids.length} selected</p>
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Bulk status" className="min-h-11 rounded-md border border-stone-300 px-2">
        {statusChoices.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <button type="button" className="rounded-md bg-stone-900 px-3 text-white disabled:opacity-50" disabled={!status} onClick={() => run("set_status", { value: status })}>Set status</button>
      <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Bulk category" className="min-h-11 rounded-md border border-stone-300 px-2">
        {categoryChoices.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <button type="button" className="rounded-md border border-stone-300 px-3 disabled:opacity-50" disabled={!category} onClick={() => run("set_category", { value: category })}>Set category</button>
      <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note for selected" aria-label="Bulk note" className="min-h-11 min-w-[180px] rounded-md border border-stone-300 px-3" />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={forSandy} onChange={(event) => setForSandy(event.target.checked)} />
        Note for Sandy
      </label>
      <button type="button" className="rounded-md border border-stone-300 px-3" onClick={() => run("add_note", { note, noteForSandy: forSandy })}>Add note</button>
      {confirmSuppress ? (
        <button type="button" className="rounded-md bg-red-700 px-3 text-white" onClick={() => run("suppress", {})}>Confirm do-not-email</button>
      ) : (
        <button type="button" className="rounded-md border border-red-700 px-3 text-red-700" onClick={() => setConfirmSuppress(true)}>Mark do not email</button>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function LeadGrid({
  columns,
  rows,
  selected,
  onSelected,
  sortKey,
  sortDir,
  onSort,
  onOpenNote,
  onEdited,
}: {
  columns: Column[];
  rows: LeadRow[];
  selected: string[];
  onSelected: (ids: string[]) => void;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onOpenNote: (row: LeadRow) => void;
  onEdited: () => Promise<void>;
}) {
  const displayColumns = useMemo(() => {
    const leading = [
      { key: "_select", label: "", editable: false, choices: null, width: 48 },
      { key: "_badge", label: "Flag", editable: false, choices: null, width: 116 },
      { key: "_ready", label: "Ready", editable: false, choices: null, width: 84 },
    ];
    const data = columns.map((column) => ({ ...column, width: columnWidth(column.key) }));
    const trailing = [
      { key: "_note", label: "Desk note", editable: false, choices: null, width: 240 },
      { key: "_sandy", label: "Sandy", editable: false, choices: null, width: 72 },
    ];
    return [...leading, ...data, ...trailing];
  }, [columns]);
  const template = displayColumns.map((column) => `${column.width}px`).join(" ");
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(560);
  const [cursor, setCursor] = useState({ row: 0, col: 3 });
  const [edit, setEdit] = useState<{ rowKey: string; column: string; value: string } | null>(null);
  const anchor = useRef(0);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () => setViewport(node.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 8);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + 8);

  function move(nextRow: number, nextCol: number) {
    const row = Math.max(0, Math.min(rows.length - 1, nextRow));
    const col = Math.max(1, Math.min(displayColumns.length - 1, nextCol));
    setCursor({ row, col });
    const node = scroller.current;
    if (!node) return;
    const top = row * ROW_HEIGHT;
    if (top < node.scrollTop) node.scrollTop = top;
    if (top + ROW_HEIGHT > node.scrollTop + node.clientHeight) node.scrollTop = top + ROW_HEIGHT - node.clientHeight;
  }

  function toggle(id: string, index: number, shift: boolean) {
    if (shift) {
      const [from, to] = index > anchor.current ? [anchor.current, index] : [index, anchor.current];
      const range = rows.slice(from, to + 1).map((row) => row.id).filter((idValue): idValue is string => Boolean(idValue));
      onSelected(Array.from(new Set([...selected, ...range])));
      return;
    }
    anchor.current = index;
    onSelected(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  async function commit(row: LeadRow, column: Column, value: string) {
    setEdit(null);
    if (!row.id || !row.table || row.readOnly) return;
    await api("/api/admin/outreach/cell", {
      method: "POST",
      body: JSON.stringify({ table: row.table, id: row.id, column: column.key, value }),
    });
    await onEdited();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (edit) {
      if (event.key === "Escape") {
        event.preventDefault();
        setEdit(null);
      }
      return;
    }
    const column = displayColumns[cursor.col];
    const row = rows[cursor.row];
    if (!column || !row) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(cursor.row + 1, cursor.col);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(cursor.row - 1, cursor.col);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      move(cursor.row, cursor.col + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(cursor.row, cursor.col - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (column.key === "_note") onOpenNote(row);
      else if (column.editable && row.id && !row.readOnly) {
        setEdit({ rowKey: rowKey(row), column: column.key, value: textOf(row.cells[column.key]) });
      }
    } else if (event.key === " " && row.id) {
      event.preventDefault();
      toggle(row.id, cursor.row, event.shiftKey);
    }
  }

  const visibleIds = rows.map((row) => row.id).filter((id): id is string => Boolean(id));
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  return (
    <div
      ref={scroller}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="min-h-0 flex-1 overflow-auto outline-none focus:ring-2 focus:ring-stone-400"
      role="grid"
      aria-label="Outreach leads"
      aria-rowcount={rows.length}
    >
      <div className="sticky top-0 z-10 grid border-b border-stone-300 bg-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-stone-600" style={{ gridTemplateColumns: template, width: displayColumns.reduce((sum, column) => sum + column.width, 0) }}>
        {displayColumns.map((column) => (
          <div key={column.key} className="flex items-center px-2" style={{ height: ROW_HEIGHT }} role="columnheader">
            {column.key === "_select" ? (
              <input
                type="checkbox"
                aria-label="Select shown rows"
                checked={allSelected}
                onChange={() => onSelected(allSelected ? [] : visibleIds)}
              />
            ) : (
              <button type="button" className="min-h-0 bg-transparent px-0 text-left" onClick={() => onSort(column.key)}>
                {column.label} {sortKey === column.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={{ height: rows.length * ROW_HEIGHT, position: "relative" }}>
        {rows.slice(start, end).map((row, offset) => {
          const index = start + offset;
          const active = cursor.row === index;
          return (
            <div
              key={rowKey(row) || index}
              role="row"
              className={`absolute left-0 grid border-b border-stone-200 text-sm ${row.suppressed ? "bg-red-50" : index % 2 ? "bg-white" : "bg-stone-50"}`}
              style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT, gridTemplateColumns: template, width: displayColumns.reduce((sum, column) => sum + column.width, 0) }}
            >
              {displayColumns.map((column, colIndex) => {
                const focused = active && cursor.col === colIndex;
                const editing = edit && edit.rowKey === rowKey(row) && edit.column === column.key;
                return (
                  <div
                    key={column.key}
                    role="gridcell"
                    className={`osw-grid-cell flex items-center overflow-hidden px-2 ${focused ? "ring-2 ring-inset ring-stone-900" : ""}`}
                    onClick={() => {
                      setCursor({ row: index, col: colIndex });
                      if (column.key === "_note") onOpenNote(row);
                      scroller.current?.focus();
                    }}
                    onDoubleClick={() => {
                      if (column.editable && row.id && !row.readOnly) {
                        setEdit({ rowKey: rowKey(row), column: column.key, value: textOf(row.cells[column.key]) });
                      }
                    }}
                  >
                    <Cell
                      column={column}
                      row={row}
                      editing={Boolean(editing)}
                      draft={edit?.value || ""}
                      onDraft={(value) => setEdit((current) => current ? { ...current, value } : current)}
                      onCommit={(value) => commit(row, column, value).catch((error: Error) => window.alert(error.message))}
                      onCancel={() => setEdit(null)}
                      checked={Boolean(row.id && selected.includes(row.id))}
                      onToggle={(shift) => row.id && toggle(row.id, index, shift)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cell({
  column,
  row,
  editing,
  draft,
  onDraft,
  onCommit,
  onCancel,
  checked,
  onToggle,
}: {
  column: Column & { width: number };
  row: LeadRow;
  editing: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
  checked: boolean;
  onToggle: (shift: boolean) => void;
}) {
  if (column.key === "_select") {
    return (
      <input
        type="checkbox"
        aria-label="Select row"
        checked={checked}
        disabled={!row.id}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(event.shiftKey);
        }}
        onChange={() => undefined}
      />
    );
  }
  if (column.key === "_badge") {
    if (!row.badge) return null;
    return (
      <span title={row.suppressionReason || row.badge} className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white">
        {row.badge}
      </span>
    );
  }
  if (column.key === "_ready") return <span>{row.ready ? "Ready" : ""}</span>;
  if (column.key === "_note") return <span className="truncate">{row.latestNote}</span>;
  if (column.key === "_sandy") return <span>{row.sandy ? "Yes" : ""}</span>;
  if (editing) {
    if (column.choices) {
      return (
        <select
          autoFocus
          value={draft}
          className="h-9 w-full rounded border border-stone-400 bg-white px-1"
          onChange={(event) => onCommit(event.target.value)}
          onBlur={onCancel}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
        >
          <option value="">(blank)</option>
          {column.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select>
      );
    }
    return (
      <DraftInput draft={draft} onDraft={onDraft} onCommit={onCommit} onCancel={onCancel} />
    );
  }
  return <span className="truncate">{textOf(row.cells[column.key])}</span>;
}

function DraftInput({ draft, onDraft, onCommit, onCancel }: { draft: string; onDraft: (value: string) => void; onCommit: (value: string) => void; onCancel: () => void }) {
  const sent = useRef(false);
  const latest = useRef(draft);
  function finish() {
    if (sent.current) return;
    sent.current = true;
    onCommit(latest.current);
  }
  return (
    <input
      autoFocus
      value={draft}
      className="h-9 w-full rounded border border-stone-400 bg-white px-1"
      onChange={(event) => {
        latest.current = event.target.value;
        onDraft(event.target.value);
      }}
      onBlur={() => finish()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          sent.current = true;
          onCancel();
        }
      }}
    />
  );
}

function NoteDrawer({ row, available, onClose, onSaved }: { row: LeadRow; available: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [note, setNote] = useState("");
  const [forSandy, setForSandy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!available || !row.id) return;
    const data = await api(`/api/admin/outreach/notes?entityType=outbound_lead&entityId=${encodeURIComponent(row.id)}`);
    setNotes(data.notes || []);
  }, [available, row.id]);

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, [load]);

  async function save() {
    if (!row.id) return;
    setError("");
    try {
      await api("/api/admin/outreach/note", {
        method: "POST",
        body: JSON.stringify({ entityType: "outbound_lead", entityId: row.id, note, noteForSandy: forSandy }),
      });
      setNote("");
      setForSandy(false);
      await load();
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The note was not saved.");
    }
  }

  async function markDone(id: string) {
    await api("/api/admin/outreach/note", { method: "POST", body: JSON.stringify({ id, done: true }) });
    await load();
    await onSaved();
  }

  const email = textOf(row.cells.email || row.cells.email_address);
  return (
    <aside className="fixed inset-x-0 bottom-0 z-20 max-h-[50vh] overflow-auto border-t border-stone-300 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Notes {email ? `· ${email}` : ""}</h2>
        <button type="button" onClick={onClose} className="rounded-md border border-stone-300 px-3">Close</button>
      </div>
      {!available ? <p className="text-sm text-amber-800">Notes are unavailable until the outreach tables are installed.</p> : null}
      {!row.id ? <p className="text-sm text-stone-600">This row is read-only, so a desk note cannot be attached.</p> : null}
      <div className="flex flex-wrap gap-2">
        <textarea value={note} onChange={(event) => setNote(event.target.value)} aria-label="Note" className="min-h-24 min-w-[240px] flex-1 rounded-md border border-stone-300 p-2" />
        <div className="flex flex-col gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={forSandy} onChange={(event) => setForSandy(event.target.checked)} />
            Note for Sandy
          </label>
          <button type="button" onClick={save} className="rounded-md bg-stone-900 px-3 text-white">Save note</button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {notes.map((item) => (
          <li key={item.id} className="rounded-md border border-stone-200 p-3 text-sm">
            <p>{item.note}</p>
            <p className="mt-1 text-stone-500">
              {item.created_by} · {textOf(item.created_at)}
              {item.note_for_sandy ? " · For Sandy" : ""}
              {item.done ? " · Done" : ""}
            </p>
            {!item.done ? (
              <button type="button" className="mt-2 rounded-md border border-stone-300 px-3" onClick={() => markDone(item.id)}>Mark done</button>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function WaitingTab() {
  const [data, setData] = useState<{ items: WaitingItem[]; opportunities: { available: boolean; reason: string | null; count: number | null; rows: WaitingItem[] }; openNotes: { id: string; note: string; forSandy: boolean; entityType: string; entityId: string; daysOpen: number | null }[] } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await api("/api/admin/outreach/rows?tab=waiting"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Waiting items could not be loaded.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>) {
    await api("/api/admin/outreach/decision", { method: "POST", body: JSON.stringify(body) });
    await load();
  }

  return (
    <section className="space-y-4 p-4">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {!data ? <p className="text-sm text-stone-600">Loading live items…</p> : null}
      <div className="space-y-3">
        {(data?.items || []).map((item) => (
          <article key={`${item.kind}-${item.id}`} className="rounded-md border border-stone-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-stone-500">{item.kind}</p>
            <h2 className="text-lg font-semibold">{item.customer || "Unavailable"}</h2>
            <p className="text-sm">{item.ask || "Unavailable"}</p>
            <p className="text-sm text-stone-500">Days open: {item.daysOpen == null ? "Unavailable" : item.daysOpen}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.kind === "followup" && item.canClose ? (
                (item.closeChoices || ["closed"]).map((reason) => (
                  <button key={reason} type="button" className="rounded-md bg-stone-900 px-3 text-white" onClick={() => act({ action: "close_followup", id: item.id, reason: reason === "closed" && !(item.closeChoices || []).length ? null : reason })}>
                    Close {reason === "closed" ? "" : reason}
                  </button>
                ))
              ) : null}
              {item.kind === "followup" && item.canSnooze ? (
                <button type="button" className="rounded-md border border-stone-300 px-3" onClick={() => act({ action: "snooze_followup", id: item.id, days: 2 })}>Snooze 2 days</button>
              ) : null}
              {item.kind === "reply" && item.table && item.column && item.id ? (
                (item.choices || []).map((choice) => (
                  <button key={choice} type="button" className="rounded-md border border-stone-300 px-3" onClick={async () => {
                    await api("/api/admin/outreach/cell", { method: "POST", body: JSON.stringify({ table: item.table, id: item.id, column: item.column, value: choice }) });
                    await load();
                  }}>{choice}</button>
                ))
              ) : null}
            </div>
          </article>
        ))}
        {data && !data.items.length ? <p className="text-sm text-stone-600">Nothing is waiting.</p> : null}
      </div>
      <div>
        <h2 className="text-lg font-semibold">Opportunities</h2>
        {data?.opportunities?.available ? (
          <ul className="mt-2 space-y-2">
            {data.opportunities.rows.map((row) => (
              <li key={row.id || row.ask} className="rounded-md border border-stone-200 bg-white p-3 text-sm">
                <p className="font-medium">{row.customer || "Unavailable"}</p>
                <p>{row.ask || "Unavailable"}</p>
                <p className="text-stone-500">Days open: {row.daysOpen == null ? "Unavailable" : row.daysOpen}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-stone-600">{data?.opportunities?.reason} {data?.opportunities?.count != null ? `(${data.opportunities.count} records)` : ""}</p>
        )}
      </div>
      <div>
        <h2 className="text-lg font-semibold">Open desk notes</h2>
        <ul className="mt-2 space-y-2">
          {(data?.openNotes || []).map((note) => (
            <li key={note.id} className="rounded-md border border-stone-200 bg-white p-3 text-sm">
              <p>{note.note}</p>
              <p className="text-stone-500">{note.entityType} {note.entityId} · {note.forSandy ? "For Sandy" : "For Rodo"} · Days open: {note.daysOpen == null ? "Unavailable" : note.daysOpen}</p>
              <button type="button" className="mt-2 rounded-md border border-stone-300 px-3" onClick={async () => {
                await api("/api/admin/outreach/note", { method: "POST", body: JSON.stringify({ id: note.id, done: true }) });
                await load();
              }}>Mark done</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RepliesTab() {
  const [rows, setRows] = useState<WaitingItem[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const data = await api("/api/admin/outreach/rows?tab=replies");
      setRows(data.rows || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replies could not be loaded.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <section className="overflow-auto p-4">
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
      <table className="w-full min-w-[720px] border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b border-stone-300 text-left">
            <th className="px-2 py-3">Source</th>
            <th className="px-2 py-3">Customer</th>
            <th className="px-2 py-3">Ask</th>
            <th className="px-2 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.source}-${row.id}-${index}`} className="border-b border-stone-200">
              <td className="px-2 py-2">{row.source}</td>
              <td className="px-2 py-2">{row.customer || "Unavailable"}</td>
              <td className="px-2 py-2">{row.ask || "Unavailable"}</td>
              <td className="px-2 py-2">
                {row.choices && row.table && row.column && row.id && !row.readOnly ? (
                  <select
                    aria-label="Status"
                    value={String(row.status || "")}
                    className="min-h-11 rounded-md border border-stone-300 px-2"
                    onChange={async (event) => {
                      await api("/api/admin/outreach/cell", { method: "POST", body: JSON.stringify({ table: row.table, id: row.id, column: row.column, value: event.target.value }) });
                      await load();
                    }}
                  >
                    {row.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                  </select>
                ) : (
                  row.status || "Unavailable"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && !error ? <p className="mt-3 text-sm text-stone-600">No positive replies, sample requests, or quotes were found.</p> : null}
    </section>
  );
}

function MetricsTab() {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/api/admin/outreach/rows?tab=metrics")
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);
  if (error) return <p className="p-4 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="p-4 text-sm text-stone-600">Loading live metrics…</p>;
  const cold = data.cold || {};
  const totals = cold.totals || {};
  return (
    <section className="space-y-6 p-4">
      <p className="text-sm text-stone-600">Counts come from the live tables. A blank rate means the underlying number is unavailable, not zero.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Leads" value={countLabel(data.counts?.leads)} />
        <Metric label="With email" value={countLabel(data.counts?.withEmail)} />
        <Metric label="Status new" value={countLabel(data.counts?.statusNew)} />
        <Metric label="Ready to send" value={countLabel(data.counts?.readyView)} detail="From sp_outbound_ready" />
        <Metric label="Suppression list" value={countLabel(data.suppression?.addresses)} detail="Not mixed into the reply rate" />
        <Metric label="Sent" value={countLabel(totals.sent)} detail={cold.reason || (cold.statusBasis ? `From ${cold.statusBasis}` : "")} />
        <Metric label="Bounced status" value={countLabel(totals.bounced)} />
        <Metric label="Replied" value={countLabel(totals.replied)} />
        <Metric label="Reply rate" value={totals.replyRate == null ? "Unavailable" : `${totals.replyRate}%`} />
      </div>
      {!cold.available ? <p className="text-sm text-amber-800">{cold.reason}</p> : null}
      {cold.dayBasis ? <BucketTable title={`By day (${cold.dayBasis}, Phoenix)`} rows={cold.byDay || []} /> : <p className="text-sm text-stone-600">Daily send counts are unavailable because no send timestamp was found. Created dates are not used as send days.</p>}
      {cold.categoryBasis ? <BucketTable title={`By ${cold.categoryBasis}`} rows={cold.byCategory || []} /> : <p className="text-sm text-stone-600">Category breakdown is unavailable.</p>}
      {cold.sourceBasis ? <BucketTable title={`By ${cold.sourceBasis}`} rows={cold.bySource || []} /> : <p className="text-sm text-stone-600">Source breakdown is unavailable.</p>}
      {(cold.unclassifiedStatuses || []).length ? (
        <div>
          <h2 className="font-semibold">Statuses not counted as sent</h2>
          <ul className="mt-2 text-sm">
            {cold.unclassifiedStatuses.map((item: { status: string; count: number }) => <li key={item.status}>{item.status}: {item.count}</li>)}
          </ul>
        </div>
      ) : null}
      <div>
        <h2 className="font-semibold">{data.websiteEmail?.label || "Website email"}</h2>
        {data.websiteEmail?.available ? (
          <ul className="mt-2 text-sm">
            {(data.websiteEmail.byType || []).map((item: { event: string; count: number }) => <li key={item.event}>{item.event}: {item.count}</li>)}
            <li>Reply rate: Unavailable</li>
          </ul>
        ) : <p className="mt-1 text-sm text-stone-600">{data.websiteEmail?.reason}</p>}
      </div>
      {data.permissions ? <p className="text-sm text-stone-600">Send permissions: {data.permissions.count}. {data.permissions.reason}</p> : null}
      {(data.suppression?.byReason || []).length ? (
        <div>
          <h2 className="font-semibold">Suppression reasons</h2>
          <ul className="mt-2 text-sm">
            {data.suppression.byReason.map((item: { reason: string; count: number }) => <li key={item.reason}>{item.reason}: {item.count}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-stone-500">{detail}</p> : null}
    </div>
  );
}

function BucketTable({ title, rows }: { title: string; rows: { key: string; sent: number; bounced: number; replied: number; replyRate: number | null }[] }) {
  return (
    <div>
      <h2 className="font-semibold">{title}</h2>
      <table className="mt-2 w-full max-w-3xl border-collapse bg-white text-sm">
        <thead>
          <tr className="border-b border-stone-300 text-left">
            <th className="px-2 py-2">Group</th>
            <th className="px-2 py-2">Sent</th>
            <th className="px-2 py-2">Bounced</th>
            <th className="px-2 py-2">Replied</th>
            <th className="px-2 py-2">Reply rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-stone-200">
              <td className="px-2 py-2">{row.key}</td>
              <td className="px-2 py-2">{row.sent}</td>
              <td className="px-2 py-2">{row.bounced}</td>
              <td className="px-2 py-2">{row.replied}</td>
              <td className="px-2 py-2">{row.replyRate == null ? "Unavailable" : `${row.replyRate}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
