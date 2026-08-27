# Incisor Trading — Progress log

Append-only. Newest entries at the bottom. One entry per session, always —
including sessions where nothing shipped.

Entry format:

```
## YYYY-MM-DD — T<id> <task name>
**Outcome:** shipped / partial / blocked
**Changed:** files touched
**Verified:** how, and what was observed
**Notes:** anything the next session needs to know
```

---

## For Key

A notes shelf, not a queue. Things the routine reached that are out of its bounds
(guide §3), each with a recommendation and a note on what it did instead. **The
routine is never blocked on these** — it records one and moves on, and never
re-raises the same item.

- **N1 — Data provider choice.** Comes out of T0. The routine researches and
  recommends; picking one means creating an account and accepting terms, which is
  Key's. Meanwhile everything is built against fixtures, so nothing waits.
- **N2 — Disclaimer wording.** The routine ships the wording in guide §11
  verbatim ("Educational only. Not investment advice. Delayed data. No real money
  is involved."). If Key wants different legal phrasing, that's his to set.

## Resolved

- **2026-08-27 — Data budget:** free tiers only, delayed data, clearly labeled.
- **2026-08-27 — Accounts:** none. `localStorage` only, no PII, no login. Accounts
  are a possible future phase, deliberately out of this backlog.
- **2026-08-27 — Build order:** dashboard first, then live paper trading, then
  historical replay, then hints.
- **2026-08-27 — Visibility:** the page ships hidden (`noindex`, no nav, no
  sitemap) and is promoted manually by Key.
- **2026-08-27 — Cost:** free on every end, permanently. Free-tier data, existing
  hardware, local Ollama, self-hosted assets. No cost to the user, no ads, no
  paywall, no account. Guide §4.
- **2026-08-27 — Autonomy:** the routine decides on its own by default. Approval
  is only needed for work that touches another page, changes `main`, reaches the
  server, costs money, requires a signup, or carries an unresolved security
  tradeoff. Guide §3.
- **2026-08-27 — Branching:** new branches may be created freely. Visual
  directions live on `incisor-look/*` and must be registered in
  `DESIGN-BRANCHES.md`; experiments live on `incisor-try/*`. Guide §7–8.
- **2026-08-27 — Commit style:** every routine commit starts with `C:`. Guide §7.
- **2026-08-27 — Name:** **Incisor Trading**, at `/incisor-trading/`. A play on
  "insider trading" and on the tooth that bites in first — eating, consuming,
  growing, sharpening. Branches renamed to `incisor-dev`, `incisor-look/*`,
  `incisor-try/*`. Guide §1.
- **2026-08-27 — Autonomy, restated:** the out-of-bounds list is not a set of
  things to seek approval for; they are simply not the routine's to decide or do.
  Inside the bounds it never asks. `PROGRESS.md → For Key` is a notes shelf, never
  a queue the routine waits on. Guide §3.

---

## Sessions

## 2026-08-27 — Planning
**Outcome:** shipped
**Changed:** `incisor-trading/docs/` — `AGENT-GUIDE.md` (v2), `BACKLOG.md`,
`PROGRESS.md`, `DESIGN-BRANCHES.md`, `.htaccess`, `shots/`
**Verified:** files written; the docs directory carries a deny-all `.htaccess` so
planning notes are never served publicly. `git status` shows changes only under
`incisor-trading/`.
**Notes:** No code yet. Guide v2 adds the cost rules (§4), security (§5), code
quality (§6), git and branch conventions (§7), the design review shelf (§8), and
the relaxed autonomy model (§3). Next session starts at T0 — data provider due
diligence, research only, no signups, no code; the provider choice is out of
bounds (needs Key's account and his acceptance of terms), so it lands under
`For Key` as a recommendation and the build continues on fixtures regardless.
