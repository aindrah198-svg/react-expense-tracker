import { it, expect } from "vitest";
import { createStorage, ConflictError } from "./storage";
import { blankWorkspace } from "./domain";
const row = {
  id: "tx-1",
  type: "expense",
  category: "Bills",
  description: "Internet",
  date: "2026-10-01",
  amount: 100000,
};
function create() {
  return createStorage("penny-test-" + crypto.randomUUID());
}
it("loads an empty workspace and persists across a fresh instance", async () => {
  const name = "penny-test-" + crypto.randomUUID(),
    a = createStorage(name);
  expect(await a.load()).toEqual(blankWorkspace());
  const saved = await a.mutate(0, (w) => {
    w.transactions.push(row);
    return w;
  });
  expect(saved.revision).toBe(1);
  expect((await createStorage(name).load()).transactions).toEqual([row]);
});
it("two simultaneous writers cannot overwrite each other", async () => {
  const s = create();
  const results = await Promise.allSettled([
    s.mutate(0, (w) => {
      w.transactions.push(row);
      return w;
    }),
    s.mutate(0, (w) => {
      w.budgets["2026-10"] = 500000;
      return w;
    }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((r) => r.status === "rejected");
  expect(rejected.reason).toBeInstanceOf(ConflictError);
  expect((await s.load()).revision).toBe(1);
});
it("invalid mutation rolls back and leaves original data intact", async () => {
  const s = create();
  await s.mutate(0, (w) => {
    w.transactions.push(row);
    return w;
  });
  await expect(
    s.mutate(1, (w) => {
      w.transactions[0].amount = -1;
      return w;
    }),
  ).rejects.toThrow();
  const after = await s.load();
  expect(after.revision).toBe(1);
  expect(after.transactions[0].amount).toBe(100000);
});
it("restore cannot overwrite a newer revision", async () => {
  const s = create();
  await s.mutate(0, (w) => {
    w.transactions.push(row);
    return w;
  });
  await expect(s.mutate(0, () => blankWorkspace())).rejects.toBeInstanceOf(
    ConflictError,
  );
  expect((await s.load()).transactions).toHaveLength(1);
});
it("corrupt saved null is not treated as an empty workspace", async () => {
  const name = "penny-test-" + crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("state");
    req.onsuccess = () => {
      const db = req.result,
        tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(null, "workspace");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = reject;
    };
  });
  const s = createStorage(name);
  await expect(s.load()).rejects.toThrow();
  await expect(s.mutate(0, () => blankWorkspace())).rejects.toThrow();
  expect(await s.readRaw()).toBe(null);
});
it("delete and budget removal persist without touching other months", async () => {
  const s = create();
  await s.mutate(0, (w) => {
    w.transactions.push(row);
    w.budgets = { "2026-10": 500000, "2026-11": 700000 };
    return w;
  });
  await s.mutate(1, (w) => {
    w.transactions = [];
    delete w.budgets["2026-10"];
    return w;
  });
  const after = await s.load();
  expect(after.transactions).toHaveLength(0);
  expect(after.budgets).toEqual({ "2026-11": 700000 });
});
