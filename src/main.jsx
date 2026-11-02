import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  categories,
  money,
  localDate,
  validMonth,
  parseAmount,
  validateWorkspace,
  validateTransaction,
  summarize,
  filterTransactions,
  csvExport,
  makeDemo,
} from "./domain";
import { storage } from "./storage";
import "./style.css";
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const monthLabel = (m) =>
  new Date(m + "-15T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
const shortDate = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
function App() {
  const [workspace, setWorkspace] = useState(null),
    [fatal, setFatal] = useState(""),
    [month, setMonth] = useState(localDate().slice(0, 7)),
    [type, setType] = useState(""),
    [category, setCategory] = useState(""),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [dialog, setDialog] = useState(null),
    [notice, setNotice] = useState("");
  const channel = useRef(null);
  async function reload() {
    try {
      const next = await storage.load();
      setWorkspace((current) =>
        !current || next.revision >= current.revision ? next : current,
      );
      setFatal("");
    } catch (e) {
      setFatal(e.message);
    }
  }
  useEffect(() => {
    let alive = true;
    storage
      .load()
      .then((data) => {
        if (alive) setWorkspace(data);
      })
      .catch((e) => {
        if (alive) setFatal(e.message);
      });
    if ("BroadcastChannel" in window) {
      const bc = new BroadcastChannel("penny-expenses-updates");
      channel.current = bc;
      bc.onmessage = () => reload();
      return () => {
        alive = false;
        bc.close();
        channel.current = null;
      };
    }
    return () => {
      alive = false;
    };
  }, []);
  async function commit(change, revision) {
    const updated = await storage.mutate(revision, change);
    setWorkspace(updated);
    channel.current?.postMessage({ revision: updated.revision });
    return updated;
  }
  function open(kind, item) {
    setDialog({ kind, item, revision: workspace.revision });
    setNotice("");
  }
  function resetFilters() {
    setType("");
    setCategory("");
    setQ("");
    setPage(1);
  }
  const summary = workspace ? summarize(workspace, month) : null;
  const rows = workspace
    ? filterTransactions(workspace, { month, type, category, q })
    : [];
  const pages = Math.max(1, Math.ceil(rows.length / 8)),
    safePage = Math.min(page, pages),
    shown = rows.slice((safePage - 1) * 8, safePage * 8);
  function done(message) {
    setDialog(null);
    setNotice(message);
  }
  async function sample() {
    try {
      await commit((current) => {
        if (current.transactions.length || Object.keys(current.budgets).length)
          throw Error(
            "Sample data can only be loaded into a completely empty workspace.",
          );
        return makeDemo(month);
      }, workspace.revision);
      setNotice("Fictional sample data loaded for " + monthLabel(month) + ".");
    } catch (e) {
      setNotice(e.message);
    }
  }
  return (
    <>
      <a className="skip" href="#main">
        Skip to overview
      </a>
      <aside className="sidebar">
        <a className="brand" href="/">
          ◈{" "}
          <span>
            penny<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">
          <span>P</span>
          <div>
            Personal workspace<small>Small steps. Clearer habits.</small>
          </div>
        </div>
        <div className="nav-label">YOUR MONEY, IN FOCUS</div>
        <nav aria-label="Transaction views">
          {[
            ["", "All transactions", "▤"],
            ["expense", "Expenses", "↗"],
            ["income", "Income", "↙"],
          ].map(([value, label, icon]) => (
            <button
              key={label}
              className={type === value ? "active" : ""}
              onClick={() => {
                setType(value);
                setCategory("");
                setPage(1);
              }}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
          <a href="#budget-panel">
            <span>◷</span>Monthly budget
          </a>
        </nav>
        <div className="sidebar-note">
          <span>✳</span>
          <h3>
            A little awareness.
            <br />A lot of possibility.
          </h3>
          <p>Make room for the things that matter to you.</p>
          <small>LOCAL PORTFOLIO DEMO</small>
        </div>
        <div className="local-profile">
          <span className="avatar">PW</span>
          <div>
            Personal wallet<small>Saved in this browser</small>
          </div>
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <span>
            Workspace <i>/</i>
            <strong>Money overview</strong>
          </span>
          <button
            disabled={!workspace || !!fatal}
            onClick={() => open("backup")}
          >
            Backup & restore ↗
          </button>
        </header>
        <main id="main">
          <div className="heading">
            <div>
              <div className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</div>
              <h1>
                Your money.
                <br className="mobile-br" /> A clearer picture<span>.</span>
              </h1>
              <p>Small everyday choices, all in one place.</p>
            </div>
            <button
              disabled={!workspace || !!fatal}
              className="primary"
              onClick={() => open("transaction")}
            >
              + Add transaction
            </button>
          </div>
          {fatal ? (
            <section className="recovery" role="alert">
              <h2>Let’s keep your saved data safe.</h2>
              <p>{fatal}</p>
              <p>The app will not replace unreadable data automatically.</p>
              <button className="primary" onClick={reload}>
                Retry loading
              </button>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    download(
                      "penny-stored-data.json",
                      JSON.stringify(await storage.readRaw(), null, 2),
                      "application/json",
                    );
                  } catch (e) {
                    setFatal(e.message);
                  }
                }}
              >
                Export stored data
              </button>
            </section>
          ) : !workspace ? (
            <p className="loading">Opening your local workspace…</p>
          ) : (
            <>
              <div className="period">
                <label>
                  Viewing month
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => {
                      if (validMonth(e.target.value)) {
                        setMonth(e.target.value);
                        resetFilters();
                      }
                    }}
                  />
                </label>
                <span>
                  All amounts in IDR · Monthly totals ignore table filters
                </span>
              </div>
              {notice && (
                <div className="notice" role="status">
                  {notice}
                </div>
              )}
              <section className="metrics" aria-label="Monthly summary">
                {[
                  ["Income", summary.income, "All income this month", "↙"],
                  ["Expenses", summary.expense, "All expenses this month", "↗"],
                  [
                    "Net balance",
                    summary.balance,
                    "Income minus expenses",
                    "◈",
                  ],
                  [
                    "Monthly budget",
                    summary.budget,
                    "Expense limit for this month",
                    "◷",
                  ],
                ].map(([label, value, note, icon]) => (
                  <article key={label}>
                    <div>
                      {label}
                      <span>{icon}</span>
                    </div>
                    <strong data-testid={label.toLowerCase().replace(" ", "-")}>
                      {value === null ? "Not set" : money(value)}
                    </strong>
                    <small>{note}</small>
                  </article>
                ))}
              </section>
              {workspace.transactions.length === 0 &&
                Object.keys(workspace.budgets).length === 0 && (
                  <div className="welcome">
                    <span>↗</span>
                    <div>
                      <strong>A fresh start, or a little inspiration?</strong>
                      <p>
                        Add your first transaction, or explore fictional sample
                        data.
                      </p>
                    </div>
                    <button className="secondary" onClick={sample}>
                      Load sample data
                    </button>
                  </div>
                )}
              <section className="charts">
                <article className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Where it goes</h2>
                      <p>Expenses by category · {monthLabel(month)}</p>
                    </div>
                    <span className="legend">● Expenses</span>
                  </div>
                  <div className="category-total">
                    {money(summary.expense)}
                    <small>Monthly spending</small>
                  </div>
                  <div className="stacked" aria-hidden="true">
                    {summary.groups.map((g, i) => (
                      <span
                        key={g.category}
                        className={"color-" + i}
                        style={{
                          width: (g.amount / summary.expense) * 100 + "%",
                        }}
                      />
                    ))}
                  </div>
                  <div className="category-rows">
                    {summary.groups.length ? (
                      summary.groups.map((g, i) => (
                        <div key={g.category}>
                          <i className={"color-" + i} />
                          <span>{g.category}</span>
                          <small>
                            {Math.round((g.amount / summary.expense) * 100)}%
                          </small>
                          <strong>{money(g.amount)}</strong>
                        </div>
                      ))
                    ) : (
                      <p className="chart-empty">
                        No expenses in this month yet.
                      </p>
                    )}
                  </div>
                </article>
                <article className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>A month in motion</h2>
                      <p>Daily expenses · {monthLabel(month)}</p>
                    </div>
                    <span className="chart-unit">IDR</span>
                  </div>
                  <Trend daily={summary.daily} />
                  <details className="daily-details">
                    <summary>View daily amounts</summary>
                    <div>
                      {summary.daily.map((d) => (
                        <p key={d.day}>
                          <span>
                            {month}-{String(d.day).padStart(2, "0")}
                          </span>
                          <strong>{money(d.amount)}</strong>
                        </p>
                      ))}
                    </div>
                  </details>
                </article>
              </section>
              <section className="budget-panel" id="budget-panel">
                <div className="budget-icon">◷</div>
                <div className="budget-copy">
                  <h2>A little room in your budget.</h2>
                  <p>
                    {summary.budget === null
                      ? "Set a monthly expense limit to see how much room remains."
                      : summary.remaining < 0
                        ? "Over budget by " +
                          money(-summary.remaining) +
                          ". Your actual spending is shown in full."
                        : money(summary.remaining) +
                          " remaining from your " +
                          money(summary.budget) +
                          " budget."}
                  </p>
                  {summary.budget !== null && (
                    <>
                      <div
                        className={
                          "budget-track " +
                          (summary.remaining < 0 ? "over" : "")
                        }
                      >
                        <span
                          style={{
                            width:
                              Math.min(
                                (summary.expense / summary.budget) * 100,
                                100,
                              ) + "%",
                          }}
                        />
                      </div>
                      <small>
                        {Math.round((summary.expense / summary.budget) * 100)}%
                        used · {money(summary.expense)} spent
                      </small>
                    </>
                  )}
                </div>
                <button className="secondary" onClick={() => open("budget")}>
                  {summary.budget === null ? "Set budget" : "Edit budget"} ↗
                </button>
              </section>
              <section className="panel transactions">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Your transactions{" "}
                      <span className="count">{rows.length}</span>
                    </h2>
                    <p>The details behind your everyday.</p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      download(
                        "penny-" + month + "-filtered.csv",
                        csvExport(rows),
                        "text/csv;charset=utf-8",
                      )
                    }
                  >
                    Export CSV ↓
                  </button>
                </div>
                <div className="filters">
                  <label className="search">
                    Search descriptions
                    <input
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value);
                        setPage(1);
                      }}
                      maxLength={100}
                      placeholder="Groceries, a project, a little treat…"
                    />
                  </label>
                  <label>
                    Type
                    <select
                      aria-label="Type"
                      value={type}
                      onChange={(e) => {
                        setType(e.target.value);
                        setCategory("");
                        setPage(1);
                      }}
                    >
                      <option value="">All types</option>
                      <option value="expense">Expenses</option>
                      <option value="income">Income</option>
                    </select>
                  </label>
                  <label>
                    Category
                    <select
                      aria-label="Category"
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All categories</option>
                      {(type
                        ? categories[type]
                        : [...categories.expense, ...categories.income]
                      ).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <button className="reset" onClick={resetFilters}>
                    Reset
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Description / category</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th className="amount">Amount</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.length ? (
                        shown.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <strong>{t.description}</strong>
                              <small>{t.category}</small>
                            </td>
                            <td>{shortDate(t.date)}</td>
                            <td>
                              <span className={"badge " + t.type}>
                                {t.type === "income" ? "↙ Income" : "↗ Expense"}
                              </span>
                            </td>
                            <td className={"amount " + t.type + "-amount"}>
                              {t.type === "income" ? "+" : "−"}{" "}
                              {money(t.amount)}
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  aria-label={"Edit " + t.description}
                                  onClick={() => open("transaction", t)}
                                >
                                  Edit
                                </button>
                                <button
                                  aria-label={"Delete " + t.description}
                                  onClick={() => open("delete", t)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="empty">
                            <strong>No matching transactions.</strong>
                            <p>Try another month or reset the table filters.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="pagination">
                  <span>
                    {rows.length ? (safePage - 1) * 8 + 1 : 0}–
                    {Math.min(safePage * 8, rows.length)} of {rows.length}{" "}
                    transactions
                  </span>
                  <div>
                    <button
                      disabled={safePage === 1}
                      onClick={() => setPage(safePage - 1)}
                    >
                      ← Previous
                    </button>
                    <span>
                      {safePage} / {pages}
                    </span>
                    <button
                      disabled={safePage === pages}
                      onClick={() => setPage(safePage + 1)}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </section>
              <div className="scope-note">
                ◈{" "}
                <span>
                  Private to this browser origin. No bank connection, cloud sync
                  or financial advice. Download a JSON backup to keep a portable
                  copy.
                </span>
              </div>
            </>
          )}
          <footer>
            Penny · Built by Afrijal Indra Hendrawan
            <span>React / IndexedDB · Portfolio demo</span>
          </footer>
        </main>
      </div>
      {dialog && workspace && !fatal && (
        <Dialog
          title={
            {
              transaction: dialog.item ? "Edit transaction" : "Add transaction",
              budget: "Monthly budget",
              backup: "Backup & restore",
              delete: "Delete transaction",
            }[dialog.kind]
          }
          onClose={() => setDialog(null)}
        >
          {dialog.kind === "transaction" ? (
            <TransactionForm
              initial={dialog.item}
              month={month}
              onSave={async (value) => {
                await commit((current) => {
                  if (dialog.item) {
                    if (
                      !current.transactions.some((t) => t.id === dialog.item.id)
                    )
                      throw Error("This transaction no longer exists.");
                    current.transactions = current.transactions.map((t) =>
                      t.id === value.id ? value : t,
                    );
                  } else current.transactions.push(value);
                  return current;
                }, dialog.revision);
                done("Transaction saved.");
                setPage(1);
              }}
            />
          ) : dialog.kind === "budget" ? (
            <BudgetForm
              month={month}
              current={workspace.budgets[month]}
              onSave={async (amount) => {
                await commit((current) => {
                  if (amount === null) delete current.budgets[month];
                  else current.budgets[month] = amount;
                  return current;
                }, dialog.revision);
                done("Monthly budget updated.");
              }}
            />
          ) : dialog.kind === "backup" ? (
            <BackupForm
              workspace={workspace}
              onRestore={async (value) => {
                await commit(() => value, dialog.revision);
                done("Workspace restored from the validated backup.");
                resetFilters();
              }}
            />
          ) : (
            <DeleteForm
              item={dialog.item}
              onCancel={() => setDialog(null)}
              onConfirm={async () => {
                await commit((current) => {
                  current.transactions = current.transactions.filter(
                    (t) => t.id !== dialog.item.id,
                  );
                  return current;
                }, dialog.revision);
                done("Transaction deleted.");
              }}
            />
          )}
        </Dialog>
      )}
    </>
  );
}
function Trend({ daily }) {
  const w = 650,
    h = 190,
    left = 45,
    right = 15,
    bottom = 30,
    top = 15,
    max = Math.max(1000, ...daily.map((d) => d.amount));
  const x = (i) => left + ((w - left - right) * i) / (daily.length - 1),
    y = (v) => h - bottom - ((h - top - bottom) * v) / max;
  const points = daily.map((d, i) => x(i) + "," + y(d.amount)).join(" ");
  return (
    <div
      className="trend"
      role="img"
      aria-label="Daily expenses chart. A daily amounts table is available below."
    >
      <svg viewBox={"0 0 " + w + " " + h} aria-hidden="true">
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7d9c64" stopOpacity=".25" />
            <stop offset="100%" stopColor="#7d9c64" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={left}
              x2={w - right}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="#e9efdf"
              strokeDasharray="3 4"
            />
            <text x={left - 8} y={y(max * f) + 3} textAnchor="end">
              {max * f >= 1000000
                ? ((max * f) / 1000000).toFixed(1) + "m"
                : max * f >= 1000
                  ? ((max * f) / 1000).toLocaleString("en-US", {
                      maximumFractionDigits: 1,
                    }) + "k"
                  : String(Math.round(max * f))}
            </text>
          </g>
        ))}
        <polygon
          points={
            left +
            "," +
            (h - bottom) +
            " " +
            points +
            " " +
            (w - right) +
            "," +
            (h - bottom)
          }
          fill="url(#area)"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#789b60"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {daily
          .filter((_, i) => i === 0 || i === daily.length - 1 || i % 5 === 0)
          .map((d) => (
            <text key={d.day} x={x(d.day - 1)} y={h - 7} textAnchor="middle">
              {d.day}
            </text>
          ))}
      </svg>
    </div>
  );
}
function Dialog({ title, onClose, children }) {
  const ref = useRef(null),
    previous = useRef(document.activeElement);
  useEffect(() => {
    ref.current.showModal();
    return () => previous.current?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-header">
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function TransactionForm({ initial, month, onSave }) {
  const [type, setType] = useState(initial?.type || "expense"),
    [category, setCategory] = useState(
      initial?.category || categories.expense[0],
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit(e) {
    e.preventDefault();
    if (lock.current) return;
    setError("");
    try {
      const form = new FormData(e.currentTarget);
      const value = validateTransaction({
        id: initial?.id || crypto.randomUUID(),
        type,
        category,
        description: form.get("description").trim(),
        date: form.get("date"),
        amount: parseAmount(form.get("amount")),
      });
      lock.current = true;
      setBusy(true);
      await onSave(value);
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const defaultDate =
    initial?.date ||
    (localDate().startsWith(month) ? localDate() : month + "-01");
  return (
    <form className="dialog-body" onSubmit={submit}>
      <div className="eyebrow">A LITTLE DETAIL. A CLEARER PICTURE.</div>
      <p className="form-intro">
        All amounts are whole rupiah (IDR). No decimals or separators.
      </p>
      <label>
        Description
        <input
          name="description"
          defaultValue={initial?.description || ""}
          required
          minLength={2}
          maxLength={100}
          placeholder="What was it for?"
        />
      </label>
      <div className="form-grid">
        <label>
          Type
          <select
            aria-label="Type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setCategory(categories[e.target.value][0]);
            }}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>
        <label>
          Category
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories[type].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-grid">
        <label>
          Amount (IDR)
          <input
            name="amount"
            inputMode="numeric"
            pattern="[1-9][0-9]{0,8}"
            defaultValue={initial?.amount ?? ""}
            required
            placeholder="25000"
            title="1–999999999 whole rupiah, without separators"
          />
        </label>
        <label>
          Date
          <input
            name="date"
            type="date"
            defaultValue={defaultDate}
            required
            min="1000-01-01"
            max="9999-12-31"
          />
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? "Saving…" : "Save transaction ↗"}
      </button>
    </form>
  );
}
function BudgetForm({ month, current, onSave }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(amount) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave(amount);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          save(parseAmount(new FormData(e.currentTarget).get("budget")));
        } catch (e) {
          setError(e.message);
        }
      }}
    >
      <div className="eyebrow">A LITTLE INTENTION FOR THE MONTH AHEAD</div>
      <h3>{monthLabel(month)}</h3>
      <p className="form-intro">
        One overall expense budget. Income does not increase the budget limit.
      </p>
      <label>
        Monthly limit (IDR)
        <input
          name="budget"
          inputMode="numeric"
          pattern="[1-9][0-9]{0,8}"
          required
          defaultValue={current ?? ""}
          placeholder="6000000"
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy}>
        Save budget ↗
      </button>
      {current !== undefined && (
        <button
          type="button"
          className="remove-budget"
          disabled={busy}
          onClick={() => save(null)}
        >
          Remove budget for this month
        </button>
      )}
    </form>
  );
}
function BackupForm({ workspace, onRestore }) {
  const [preview, setPreview] = useState(null),
    [consent, setConsent] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function read(file) {
    setError("");
    setPreview(null);
    setConsent(false);
    try {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) throw Error("Backup limit is 5 MB.");
      setPreview(validateWorkspace(JSON.parse(await file.text())));
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "Choose a valid Penny JSON backup."
          : e.message,
      );
    }
  }
  async function restore() {
    if (!preview || !consent || busy) return;
    setBusy(true);
    try {
      await onRestore(preview);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dialog-body">
      <div className="eyebrow">YOUR DATA, WITH A WAY BACK</div>
      <h3>Keep a portable copy.</h3>
      <p className="form-intro">
        JSON backups include every transaction and monthly budget. CSV exports
        only the currently filtered month.
      </p>
      <button
        className="secondary full"
        onClick={() =>
          download(
            "penny-backup.json",
            JSON.stringify(workspace, null, 2),
            "application/json",
          )
        }
      >
        Download JSON backup ↓
      </button>
      <div className="restore-section">
        <h3>Restore a workspace</h3>
        <label>
          Choose JSON backup
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => read(e.target.files[0])}
          />
        </label>
        {preview && (
          <div className="restore-preview">
            {preview.transactions.length} transactions ·{" "}
            {Object.keys(preview.budgets).length} budget months
          </div>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I understand this replaces all saved transactions and budgets in this
          workspace.
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary full"
          disabled={!preview || !consent || busy}
          onClick={restore}
        >
          Replace this workspace ↗
        </button>
      </div>
    </div>
  );
}
function DeleteForm({ item, onCancel, onConfirm }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="dialog-body">
      <h3>Remove this transaction?</h3>
      <p className="delete-description">
        {item.description}
        <strong>{money(item.amount)}</strong>
      </p>
      <p className="form-intro">
        This changes the month’s totals. Your budget limit stays the same.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="delete-actions">
        <button className="secondary" onClick={onCancel}>
          Keep transaction
        </button>
        <button
          className="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Delete transaction
        </button>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
