# Phase 3 — Fix & Verify Plan (Membership Categories audit remediation)

Scope: fix the 3 confirmed bugs, the E2E re-runnability bug, the 23505 race, add missing test coverage, then run full verification and bring the tracking docs up to date. The "minor" items M2–M5 and S2 (dead `read` permission) are deliberately NOT changed — they need design decisions; flagged only.

## 1. Code fixes
- **B1 (uuid 500):** add `ParseUUIDPipe` to the three `:id` params in `membership-categories.controller.ts` (GET /:id, PATCH /:id, PATCH /:id/status) → invalid uuid now returns 400 VALIDATION_ERROR.
- **B2 (validity_days overflow):** add `@Max(36500)` to `validity_days` in create + update DTOs.
- **B3 (fee overflow):** add `@Max(9999999999.99)` to `fee` in create + update DTOs.
- **M1 (23505 race):** wrap `save()` in create/update with a catch mapping pg error code `23505` to the existing ConflictException codes (`CATEGORY_NAME_TAKEN` / `CATEGORY_CODE_TAKEN` based on constraint name), so concurrent duplicates return 409 instead of 500.

## 2. Test fixes
- `test/e2e-membership-categories.sh`: make identities unique per run (timestamped email/mobile suffix) and clean up the two users at the end, so the suite is re-runnable.
- Add a TC to test-scenarios.md for invalid-uuid `:id` (400 VALIDATION_ERROR) and overflow validations (400).
- Unit spec: add the update-by-duplicate-`code` conflict test and a `updateStatus` 404 test.

## 3. Verification pass (the DoD gate)
- `npm run migration:show` — if `1790420422144` is pending, run `npm run migration:run` and verify.
- `npm run build` — clean compile.
- `npm test` — full unit suite green (incl. the new tests).
- Boot the dev server (background, watch the port-3000 orphan gotcha from memory.md) and run `bash test/e2e-membership-categories.sh` — all 12 TC-CAT cases must pass; record results.

## 4. Docs (rule.md §5.7 / §2.10)
- `phases.md`: tracker row Phase 3 → ✅ Done with verified date; verification note under the Phase 3 section; add Migration Issue Log row for `1790420422144` (clean or with any issue found).
- `memory.md`: Current State lists Phase 3 as done; Next → Phase 4.
- Note the flagged-but-not-fixed items (M2–M5, S2) in the Phase 3 notes so they surface for Phase 4 planning.

## 5. Out of scope
- M2 (clearing `code`), M3 (no-op PATCH audit), M4 (LIKE escaping), M5 (unchanged-status audit), S2 (dead read permission), rate limiting, git commit (everything is currently uncommitted — say the word if you want commits on a `feature/phase-3` branch).
