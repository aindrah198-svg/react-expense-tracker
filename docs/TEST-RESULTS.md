# Verification record

Verified 2026-11-03 (Asia/Jakarta), Node 26.13.0, React/Vite, local Chrome.

- Vitest: **38 tests passed**. Covers integer rupiah boundaries, real calendar dates, transaction/category/schema validation, duplicate IDs, budget validation, 5000-record limits, a large UTF-8 backup round-trip, monthly totals, daily/category sums, filter semantics, CSV quoting/formula protection and deterministic sample totals.
- IndexedDB tests use fake-indexeddb to exercise real request/transaction semantics: fresh load, persistence through a new storage instance, simultaneous writer conflict, aborted invalid mutation, stale restore, corrupt-null preservation and targeted deletion/budget removal.
- Production build passed.
- Chrome end-to-end checks passed on both development and production preview: sample initialization; pagination; CSV export of all 14 matching records across pages; table filters without altering monthly totals; create/edit/cancel-delete/confirm-delete; budget changes and over-budget state; another month; JSON download, invalid restore rejection and confirmed restore; persistence after reload.
- Actual two-tab check: tab A opens a form, tab B saves, and tab A's stale save is rejected. The newer transaction remains stored. Test cleanup removes only its own fictional transaction through the UI.
- 1440px desktop and 390px mobile screenshots inspected; no horizontal document overflow. The wide transaction table scrolls inside its own container. Native dialog fits mobile and closes with Escape. No JavaScript exceptions recorded.
- npm audit --omit=dev: zero known production dependency vulnerabilities reported.

Sample defaults: 14 transactions, Rp 14500000 income, Rp 4457000 expenses, Rp 10043000 monthly net, Rp 6000000 budget and Rp 1543000 budget remaining. Browser checks set a Rp 1000000 budget to demonstrate Rp 3457000 over budget; screenshots reflect that scenario.

Calculation and persistence tests run locally without any bank, network API or real personal finance data. Fake IndexedDB is complemented by actual browser persistence/conflict tests. This is not a bank integration, financial advice, full accessibility or multi-browser compatibility audit. GitHub Actions runs tests, build and Chromium production-preview checks independently.
