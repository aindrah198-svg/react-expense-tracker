export const categories = {
  expense: [
    "Food & drink",
    "Transport",
    "Shopping",
    "Bills",
    "Health",
    "Other",
  ],
  income: ["Salary", "Freelance", "Other income"],
};
export const MAX_AMOUNT = 999999999;
export const money = (value) =>
  "Rp " +
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
export function localDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function validMonth(value) {
  return (
    typeof value === "string" && /^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(value)
  );
}
export function validDate(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]{3}-(0[1-9]|1[0-2])-[0-9]{2}$/.test(value)
  )
    return false;
  const d = new Date(value + "T12:00:00Z");
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}
export function parseAmount(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,8}$/.test(value))
    throw Error("Enter whole rupiah from 1 to 999999999, without separators.");
  return Number(value);
}
export function validateTransaction(t) {
  if (
    !t ||
    typeof t !== "object" ||
    typeof t.id !== "string" ||
    !/^[A-Za-z0-9-]{1,64}$/.test(t.id) ||
    !Object.hasOwn(categories, t.type) ||
    !categories[t.type].includes(t.category) ||
    !validDate(t.date) ||
    !Number.isSafeInteger(t.amount) ||
    t.amount < 1 ||
    t.amount > MAX_AMOUNT ||
    typeof t.description !== "string" ||
    t.description.trim().length < 2 ||
    t.description.length > 100 ||
    t.description !== t.description.trim() ||
    [...t.description].some(
      (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    )
  )
    throw Error(
      "Transaction data is invalid. Check the date, amount, description and category.",
    );
  return {
    id: t.id,
    type: t.type,
    category: t.category,
    date: t.date,
    amount: t.amount,
    description: t.description,
  };
}
export function blankWorkspace() {
  return { schemaVersion: 1, revision: 0, transactions: [], budgets: {} };
}
export function validateWorkspace(value) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Array.isArray(value.transactions) ||
    value.transactions.length > 5000 ||
    !value.budgets ||
    typeof value.budgets !== "object" ||
    Array.isArray(value.budgets) ||
    Object.keys(value.budgets).length > 240
  )
    throw Error(
      "The workspace format or version is unsupported. No data was replaced.",
    );
  const ids = new Set();
  const transactions = value.transactions.map((t) => {
    const row = validateTransaction(t);
    if (ids.has(row.id)) throw Error("Duplicate transaction IDs in backup.");
    ids.add(row.id);
    return row;
  });
  const budgets = {};
  for (const [month, amount] of Object.entries(value.budgets)) {
    if (
      !validMonth(month) ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > MAX_AMOUNT
    )
      throw Error("Invalid monthly budget in saved data.");
    budgets[month] = amount;
  }
  return { schemaVersion: 1, revision: value.revision, transactions, budgets };
}
export function summarize(workspace, month) {
  const rows = workspace.transactions.filter((t) =>
    t.date.startsWith(month + "-"),
  );
  const income = rows
    .filter((t) => t.type === "income")
    .reduce((n, t) => n + t.amount, 0);
  const expense = rows
    .filter((t) => t.type === "expense")
    .reduce((n, t) => n + t.amount, 0);
  const budget = workspace.budgets[month] ?? null;
  const groups = categories.expense
    .map((category) => ({
      category,
      amount: rows
        .filter((t) => t.type === "expense" && t.category === category)
        .reduce((n, t) => n + t.amount, 0),
    }))
    .filter((g) => g.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const days = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  const daily = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    amount: rows
      .filter((t) => t.type === "expense" && Number(t.date.slice(8)) === i + 1)
      .reduce((n, t) => n + t.amount, 0),
  }));
  return {
    income,
    expense,
    balance: income - expense,
    budget,
    remaining: budget === null ? null : budget - expense,
    groups,
    daily,
  };
}
export function filterTransactions(
  workspace,
  { month, type = "", category = "", q = "" },
) {
  return workspace.transactions
    .filter(
      (t) =>
        t.date.startsWith(month + "-") &&
        (!type || t.type === type) &&
        (!category || t.category === category) &&
        (!q || t.description.toLowerCase().includes(q.toLowerCase())),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.description.localeCompare(b.description) ||
        a.id.localeCompare(b.id),
    );
}
export function csvExport(rows) {
  const cell = (value) => {
    let s = String(value);
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\ufeff" +
    [
      ["Date", "Description", "Type", "Category", "Amount IDR"],
      ...rows.map((t) => [t.date, t.description, t.type, t.category, t.amount]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
export function makeDemo(month = localDate().slice(0, 7)) {
  const entries = [
    ["income", "Salary", 12000000, "Monthly salary", 1],
    ["income", "Freelance", 2500000, "Website project milestone", 5],
    ["expense", "Bills", 2400000, "Home rent", 1],
    ["expense", "Food & drink", 185000, "Weekly groceries", 3],
    ["expense", "Transport", 75000, "Train and ride fares", 4],
    ["expense", "Shopping", 349000, "Desk essentials", 6],
    ["expense", "Food & drink", 64000, "Coffee with a friend", 8],
    ["expense", "Bills", 325000, "Internet and phone", 10],
    ["expense", "Health", 150000, "Routine check-up", 12],
    ["expense", "Food & drink", 210000, "Lunch and groceries", 15],
    ["expense", "Transport", 95000, "Transport top-up", 18],
    ["expense", "Other", 125000, "A birthday gift", 20],
    ["expense", "Food & drink", 280000, "Weekend groceries", 22],
    ["expense", "Shopping", 199000, "A new notebook set", 24],
  ];
  return validateWorkspace({
    schemaVersion: 1,
    revision: 0,
    transactions: entries.map(([type, category, amount, description, day]) => ({
      id: crypto.randomUUID(),
      type,
      category,
      amount,
      description,
      date: month + "-" + String(day).padStart(2, "0"),
    })),
    budgets: { [month]: 6000000 },
  });
}
