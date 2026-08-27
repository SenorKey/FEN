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
- **N1a — Alpha Vantage display permission (from T0, 2026-08-27).** No free tier
  from any commercial provider clearly permits public display of market data on a
  website; display is a separate paid licence layer everywhere. Alpha Vantage is
  the only one whose bar is scoped to *commercial* activity rather than stated
  flatly, so it is the recommendation — **conditional on a written yes**. One free
  email to `premium@alphavantage.co` (free, ad-free, non-commercial educational
  page; delayed data labeled; attribution as they require) settles it. Full
  reasoning and the quoted clauses are in `docs/DATA-PROVIDER.md`. *Meanwhile:*
  the routine stays in fixture mode and builds on, exactly as guide §10 directs.
- **N1b — SEC EDGAR needs nothing from Key (from T0).** `data.sec.gov` is public
  domain, requires no API key, no account, and no acceptance of terms, so it is
  inside the routine's bounds and it will be used for fundamentals (T11) without
  further input. It has no prices, so it does not replace N1a — it just means
  fundamentals never spend Alpha Vantage's 25-calls-a-day quota. Recorded here as
  a note, not a question.
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
- **2026-08-27 — Memory model:** `DECISIONS.md` is the routine's long-term
  memory, read in full every session; `PROGRESS.md` is a journal read from the
  tail only. Git history is evidence of what was kept, not a record of what was
  rejected, so lessons that must survive go in `DECISIONS.md`. Two hard rules
  added: never touch a dirty tree outside `incisor-trading/`, and a task that has
  failed twice gets marked blocked rather than attempted a third time. Guide §16.
- **2026-08-27 — Look branches:** stay local. Not pushed to GitHub.
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

## 2026-08-27 — Planning (cont.)
**Outcome:** shipped
**Changed:** `docs/DECISIONS.md` (new), `AGENT-GUIDE.md` (§16 plus hard rules 11
and 12, session protocol rewritten), `BACKLOG.md` (S6)
**Verified:** section numbering contiguous 1–16; the four docs each have one job
and the protocol names which to read in full versus from the tail.
**Notes:** The anti-loop mechanism is `DECISIONS.md`. Add to it in the same
session as the work, never "next time" — an undocumented dead end is
indistinguishable from an untried idea.

## 2026-08-27 — T0 Data provider due diligence
**Outcome:** shipped
**Changed:** `incisor-trading/docs/DATA-PROVIDER.md` (new), `BACKLOG.md` (T0
checked), `DECISIONS.md` (three entries), `PROGRESS.md` (N1a, N1b)
**Verified:** against the T0 acceptance criteria — the file exists; **eight**
providers are compared against the required three; every "public display
permitted?" cell quotes the operative clause with its section number and links
the source; a recommendation is stated with reasoning and a fallback. No account
was created, no terms accepted, no API key requested, and no upstream call made.
No code, as the task specifies. `git status` shows changes only under
`incisor-trading/`.
**Notes:** The research produced one finding that outranks the provider choice
itself: **market data is licensed in two layers — access and display — and free
tiers only ever grant access.** Finnhub, Massive (Polygon.io, rebranded October
2025), Twelve Data, Tiingo and FMP each forbid public display in plain language;
marketstack fails on volume alone at 100 requests/month. Alpha Vantage is the
only near-miss, because its restriction is scoped to *commercial* activity, and
this page is permanently non-commercial by guide §4 — hence the conditional
recommendation in N1a rather than a pick.

Two consequences the next sessions should carry:

1. **SEC EDGAR is usable immediately** and needs nothing from Key — no key, no
   account, no terms. Fundamentals (T11) should come from it, which also keeps
   them off Alpha Vantage's quota.
2. **25 requests/day is the binding constraint**, not the licence. It means the
   dashboard is end-of-day-oriented and honestly labeled, not a live ticker, and
   it makes T4's caching and T9's watchlist cap load-bearing rather than nice to
   have. Design for that from T6 onward instead of discovering it at T9.

Fixtures will be hand-written to Alpha Vantage's documented response shapes in
T3. That is deliberately reversible: T3's parser module is the only code that
ever sees provider JSON, so a different provider changes one file.
