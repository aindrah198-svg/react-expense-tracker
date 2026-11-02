import { describe, it, expect } from "vitest";
import {
  blankWorkspace,
  validateWorkspace,
  validateTransaction,
  parseAmount,
  validDate,
  validMonth,
  summarize,
  filterTransactions,
  csvExport,
  makeDemo,
} from "./domain";
const transaction = (extra = {}) => ({
  id: "tx-1",
  type: "expense",
  category: "Food & drink",
  description: "Groceries",
  date: "2026-10-03",
  amount: 25000,
  ...extra,
});
describe("whole rupiah and calendar validation", () => {
  it.each([
    "0",
    "-1",
    "1.5",
    "1,000",
    "1e3",
    "NaN",
    "Infinity",
    "1000000000",
    " 25",
    "01",
  ])("rejects invalid money %s", (value) =>
    expect(() => parseAmount(value)).toThrow(),
  );
  it("preserves allowed integer boundaries", () => {
    expect(parseAmount("1")).toBe(1);
    expect(parseAmount("999999999")).toBe(999999999);
  });
  it("accepts leap dates and rejects normalized impossible dates", () => {
    expect(validDate("2024-02-29")).toBe(true);
    for (const d of [
      "2026-02-29",
      "2026-04-31",
      "2026-2-03",
      "2026-00-01",
      "bad",
    ])
      expect(validDate(d)).toBe(false);
    expect(validMonth("2026-10")).toBe(true);
    expect(validMonth("2026-13")).toBe(false);
  });
});
describe("workspace contract", () => {
  it.each([
    { amount: 1.1 },
    { amount: -1 },
    { amount: Infinity },
    { type: "transfer" },
    { category: "Salary" },
    { description: "" },
    { description: "x".repeat(101) },
    { description: "bad\u0000value" },
    { description: "line\nbreak" },
    { date: "2026-02-30" },
    { id: "bad/id" },
  ])("rejects invalid transaction %j", (extra) =>
    expect(() => validateTransaction(transaction(extra))).toThrow(),
  );
  it("rejects duplicate IDs and unsupported versions", () => {
    expect(() =>
      validateWorkspace({
        ...blankWorkspace(),
        transactions: [transaction(), transaction()],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      validateWorkspace({ ...blankWorkspace(), schemaVersion: 2 }),
    ).toThrow();
    expect(() => validateWorkspace(null)).toThrow();
  });
  it("rejects invalid budget values and keys", () => {
    for (const budgets of [
      { "2026-10": 0 },
      { "2026-13": 100 },
      { "2026-10": 1.5 },
      [],
    ])
      expect(() =>
        validateWorkspace({ ...blankWorkspace(), budgets }),
      ).toThrow();
  });
  it("rejects transaction count beyond limit", () =>
    expect(() =>
      validateWorkspace({
        ...blankWorkspace(),
        transactions: Array.from({ length: 5001 }, (_, i) =>
          transaction({ id: "tx-" + i }),
        ),
      }),
    ).toThrow());
  it("round-trips a large valid backup under 5 MB", () => {
    const w = {
      ...blankWorkspace(),
      transactions: Array.from({ length: 5000 }, (_, i) =>
        transaction({ id: "tx-" + i, description: "漢".repeat(100) }),
      ),
    };
    const body = JSON.stringify(validateWorkspace(w), null, 2);
    expect(new TextEncoder().encode(body).length).toBeLessThan(5 * 1024 * 1024);
    expect(validateWorkspace(JSON.parse(body)).transactions).toHaveLength(5000);
  });
});
describe("month, filter and reporting semantics", () => {
  const workspace = {
    ...blankWorkspace(),
    transactions: [
      transaction(),
      transaction({
        id: "tx-2",
        amount: 35000,
        category: "Bills",
        description: "Internet",
        date: "2026-10-09",
      }),
      transaction({
        id: "tx-3",
        type: "income",
        category: "Salary",
        description: "Salary",
        amount: 100000,
        date: "2026-10-01",
      }),
      transaction({ id: "tx-4", amount: 99000, date: "2026-09-30" }),
    ],
    budgets: { "2026-10": 50000 },
  };
  it("separates income, expense, net balance and over-budget values", () => {
    const s = summarize(workspace, "2026-10");
    expect(s.income).toBe(100000);
    expect(s.expense).toBe(60000);
    expect(s.balance).toBe(40000);
    expect(s.remaining).toBe(-10000);
    expect(s.groups).toEqual([
      { category: "Bills", amount: 35000 },
      { category: "Food & drink", amount: 25000 },
    ]);
    expect(s.daily.reduce((n, d) => n + d.amount, 0)).toBe(60000);
  });
  it("filters literally, sorts by date and does not change month summaries", () => {
    expect(
      filterTransactions(workspace, {
        month: "2026-10",
        type: "expense",
        category: "Bills",
        q: "NET",
      }).map((t) => t.id),
    ).toEqual(["tx-2"]);
    expect(
      filterTransactions(workspace, { month: "2026-10", q: ".*" }),
    ).toEqual([]);
    expect(filterTransactions(workspace, { month: "2026-10" })[0].id).toBe(
      "tx-2",
    );
    expect(summarize(workspace, "2026-10").expense).toBe(60000);
  });
  it("handles empty month and leap-year daily series", () => {
    const s = summarize(workspace, "2024-02");
    expect(s.daily).toHaveLength(29);
    expect(s.budget).toBe(null);
    expect(s.income).toBe(0);
    expect(s.expense).toBe(0);
  });
  it("protects formulas and quotes commas in export", () => {
    const csv = csvExport([
      transaction({ description: '=HYPERLINK("bad")' }),
      transaction({ description: "Coffee, lunch" }),
    ]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('"Coffee, lunch"');
    expect(csv).toContain('""bad""');
    expect(csv.startsWith("\ufeff")).toBe(true);
  });
  it("sample has predictable totals and valid category mapping", () => {
    const w = makeDemo("2026-10");
    const s = summarize(w, "2026-10");
    expect(w.transactions).toHaveLength(14);
    expect(s.income).toBe(14500000);
    expect(s.expense).toBe(4457000);
    expect(s.remaining).toBe(1543000);
    expect(validateWorkspace(w)).toEqual(w);
  });
});
