import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
const base = process.env.BASE_URL || "http://127.0.0.1:5179";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const p = await context.newPage();
p.setDefaultTimeout(15000);
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
mkdirSync("docs", { recursive: true });
const dialog = () => p.getByRole("dialog");
async function expense(page, description, amount, date) {
  const d = page.getByRole("dialog");
  await d.getByLabel("Description", { exact: true }).fill(description);
  await d.getByLabel("Amount (IDR)", { exact: true }).fill(String(amount));
  await d.getByLabel("Date", { exact: true }).fill(date);
  await d.getByRole("button", { name: "Save transaction ↗" }).click();
}
try {
  await p.goto(base);
  await p.getByRole("button", { name: "Load sample data" }).click();
  await p
    .getByTestId("income")
    .getByText("Rp 14.500.000", { exact: true })
    .waitFor();
  assert.equal(await p.getByTestId("expenses").textContent(), "Rp 4.457.000");
  const month = await p.getByLabel("Viewing month").inputValue();
  await p.getByRole("button", { name: "Next →", exact: true }).click();
  assert.equal(await p.locator("tbody tr").count(), 6);
  const csvPromise = p.waitForEvent("download");
  await p.getByRole("button", { name: "Export CSV ↓" }).click();
  const csv = readFileSync(await (await csvPromise).path(), "utf8");
  assert.equal(csv.trim().split("\r\n").length, 15);
  await p.getByLabel("Category", { exact: true }).selectOption("Food & drink");
  assert.equal(await p.locator("tbody tr").count(), 4);
  assert.equal(await p.getByTestId("expenses").textContent(), "Rp 4.457.000");
  await p.getByRole("button", { name: "Reset", exact: true }).click();
  await p
    .getByRole("button", { name: "+ Add transaction", exact: true })
    .click();
  await expense(p, "Browser expense", 25000, month + "-11");
  await dialog().waitFor({ state: "hidden" });
  assert.equal(await p.getByTestId("expenses").textContent(), "Rp 4.482.000");
  await p
    .getByRole("button", { name: "Edit Browser expense", exact: true })
    .click();
  await expense(p, "Browser expense updated", 50000, month + "-11");
  await dialog().waitFor({ state: "hidden" });
  assert.equal(await p.getByTestId("expenses").textContent(), "Rp 4.507.000");
  await p
    .getByRole("button", {
      name: "Delete Browser expense updated",
      exact: true,
    })
    .click();
  await dialog()
    .getByRole("button", { name: "Keep transaction", exact: true })
    .click();
  await p
    .getByRole("button", {
      name: "Delete Browser expense updated",
      exact: true,
    })
    .click();
  await dialog()
    .getByRole("button", { name: "Delete transaction", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(await p.getByTestId("expenses").textContent(), "Rp 4.457.000");
  await p.getByRole("button", { name: "Edit budget ↗", exact: true }).click();
  await dialog().getByLabel("Monthly limit (IDR)").fill("1000000");
  await dialog().getByRole("button", { name: "Save budget ↗" }).click();
  await dialog().waitFor({ state: "hidden" });
  await p.getByText(/Over budget by Rp 3.457.000/).waitFor();
  const otherMonth = month.slice(0, 5) + (month.endsWith("01") ? "02" : "01");
  await p.getByLabel("Viewing month").fill(otherMonth);
  assert.equal(await p.getByTestId("expenses").textContent(), "Rp 0");
  await p.getByLabel("Viewing month").fill(month);
  await p.getByRole("button", { name: "Backup & restore ↗" }).click();
  const jsonPromise = p.waitForEvent("download");
  await dialog()
    .getByRole("button", { name: "Download JSON backup ↓" })
    .click();
  const backup = readFileSync(await (await jsonPromise).path(), "utf8"),
    data = JSON.parse(backup);
  assert.equal(data.transactions.length, 14);
  assert.equal(data.budgets[month], 1000000);
  await dialog()
    .getByLabel("Choose JSON backup")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"schemaVersion":99}'),
    });
  await dialog().getByRole("alert").waitFor();
  await dialog()
    .getByLabel("Choose JSON backup")
    .setInputFiles({
      name: "valid.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup),
    });
  await dialog()
    .getByText("14 transactions · 1 budget months", { exact: true })
    .waitFor();
  await dialog().getByRole("checkbox").check();
  await dialog()
    .getByRole("button", { name: "Replace this workspace ↗" })
    .click();
  await dialog().waitFor({ state: "hidden" });
  await p.reload();
  await p
    .getByTestId("expenses")
    .getByText("Rp 4.457.000", { exact: true })
    .waitFor();
  assert.equal(
    await p.getByTestId("monthly-budget").textContent(),
    "Rp 1.000.000",
  );
  await p
    .getByRole("button", { name: "+ Add transaction", exact: true })
    .click();
  const second = await context.newPage();
  second.setDefaultTimeout(15000);
  await second.goto(base);
  await second
    .getByRole("button", { name: "+ Add transaction", exact: true })
    .click();
  await expense(second, "Tab B saved", 12345, month + "-10");
  await second.getByRole("dialog").waitFor({ state: "hidden" });
  await expense(p, "Tab A stale", 45678, month + "-10");
  assert.match(
    await dialog().getByRole("alert").textContent(),
    /changed in another tab/,
  );
  await dialog().getByRole("button", { name: "Close dialog" }).click();
  await second.close();
  await p.getByLabel("Search descriptions").fill("Tab B saved");
  await p
    .getByRole("button", { name: "Delete Tab B saved", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Delete transaction", exact: true })
    .click();
  await dialog().waitFor({ state: "hidden" });
  await p.getByRole("button", { name: "Reset", exact: true }).click();
  await p.reload();
  await p.getByTestId("expenses").getByText("Rp 4.457.000", {exact:true}).waitFor();
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: "docs/desktop.png", fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({ path: "docs/mobile.png", fullPage: true });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p
    .getByRole("button", { name: "+ Add transaction", exact: true })
    .click();
  assert.ok(
    await dialog().evaluate(
      (d) => d.getBoundingClientRect().right <= innerWidth,
    ),
  );
  await p.keyboard.press("Escape");
  await dialog().waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log(
    "Browser passed: sample, pagination, filtered CSV, category totals, add/edit/delete, budget, month, JSON backup/restore, reload persistence, cross-tab conflict, mobile and Escape; no JS errors.",
  );
} catch (error) {
  console.error(await p.locator("dialog").allTextContents());
  throw error;
} finally {
  await browser.close();
}
