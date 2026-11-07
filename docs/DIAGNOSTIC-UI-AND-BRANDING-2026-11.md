# Deep Diagnostic, dashboard UI and branding changes — November 2026

What shipped between 2026-11-06 and 2026-11-07 across the user dashboard, the landing site and the backend.
The financial model changes of the same period are in `DEEP-DIAGNOSTIC-FINANCIAL-CASE-2026-11.md` (PR #127).

All items below are live on prod unless marked otherwise. Nothing here touches billing: the credit ledger still
meters dollars.

## 1. Optional document upload (company context)

Website scraping can hit Cloudflare or a captcha. Solving captchas through third-party services was refused; the agreed
alternative is an optional upload the user can skip.

- **Chat step** `document` in `components/diagnostics/chat/ChatDiagnostic.tsx`, asked right after the website step.
  File picker plus a Skip chip.
- **API** `POST /api/diagnostics/document-text` (`app/api/diagnostics/document-text/route.ts`), gated by
  `requireRunLeft(request, 'snapshot')`. Limits: 5 MB, 12,000 extracted characters. Errors: 415 type, 413 size, 422 empty.
  Returns `{ text, chars }`. Helpers in `lib/documentContext.ts`.
- **Client** must use `authedFetch(asset('/api/...'))` (base path plus bearer token); a plain `fetch` returned 404/401 on prod
  (fixed in #138).
- **Bridge** (`AVRY-V2-Main/backend/vps-bridge`): `lib/diagnosticQueue.js` gained `takeDocumentText`; `lib/webContext.js` treats
  the document as page `uploaded-document` with status `document` (min 80 chars, no cache). The prompt says "your document".
  The summary page sends `_document_text`.
- **Insights view** (`lib/websiteInsightsView.ts`): source/state `document`, title "Your document" / "Dokumen Anda".
- Not covered by tests: real PDF/DOCX uploads end to end in a browser.

## 2. Form UI removed, chat is the only flow

The form-shaped Deep Diagnostic was deleted together with the components only it used (PR #140). The chat UI is the
default and only entry. Possibly dead and not yet removed: `DiagnosticPhase`, `DiagnosticSummary`, `NavigationControls`,
`ProgressIndicator`.

## 3. Chat polish

- **Skip chip** now sits under the current question (`.skipChip`) for optional steps (`isOptionalStep`).
- **Bottom padding** of the scroll area is `clamp(56px, 12vh, 140px)` with a scroll-margin on `.endAnchor`, so the latest
  message rests higher on screen.
- **Welcome message streams word by word** (38 ms per word, blinking caret, click completes it, composer hidden until done).
  It runs whenever the chat opens at its start (`cursor === 0`); saved progress and reduced-motion no longer skip it (#152).
  The resume offer appears after the text. The cause of "it does not stream" was inferred, not confirmed in a browser.

## 4. Result content

- **NPV/payback headline** with ROI as the companion; ROI at or above 999% reads "Very high" / "Sangat tinggi"
  (`lib/roiDisplay.ts`). Stored reports are re-run by `upgradeDiagnosticContext` so old reports stop showing three identical
  "Very high" values (#125).
- **Plan card**: the percentage was replaced by a selling sentence (`lib/planComparison.ts` `sellingLine`): about Nx the plan
  cost, "already covers this plan", or a number-free "right place to start" below 1x.
- **Capacity-value block** (`lib/capacityValueView.ts`): the confusing second ROI row became
  "Total yearly value if the growth happens: X/yr (scope value + cost avoided)".

## 5. Grainy-gradient headers

Shared `components/ui/GrainHeader.tsx` on top of `components/ui/BokehGradient.tsx` (verbatim port of the landing component:
WebGL shader, device-pixel grain, Fibonacci circles on the right edge). Each world is a six-colour dark-to-light ramp in
`field` mode so hues blend smoothly (the first `tri` blobs looked coarse and were rejected).

| World | Used on |
|---|---|
| `teal` | Diagnostic result header, Blueprint header |
| `sunset` | Agents hero, Roadmap header |
| `harbour` | Diagnostics landing hero card |
| `aubergine` | Templates hero |
| `lagoon` | spare |

Type on the gradient is white; primary buttons are solid white with dark ink, secondary ones are frosted. The Diagnostics hero
sub headline is bold (600). A standalone esbuild harness was used for colour checks because the dashboard gate blocks a dev server.

## 6. "Assessment" is now "Analysis"

"Assessment" read like a questionnaire. User-facing copy now says Analysis (Indonesian: Analisis):

- **Dashboard** (#153): Diagnostics hero badge ("4-phase business analysis"), report header, PDF, plan label, quota messages,
  Blueprint export, EN and ID.
- **Landing** (Frntend-nxt#104): hero, CTAs, pricing, showcase, FAQ and glossary SEO, free diagnostic, payment labels.
- **Left alone on purpose**: "Risk Assessment" sections, routes, analytics event names, API paths, SEO anchor ids
  (`#howto-assessment`, `#service-assessment`), and the de/nl/es/fr/pt/zh/ja/ar about pages (need native translation).

## 7. "Powered by Aivory Aether"

- Shared `components/ui/PoweredByAether.tsx` (white wordmark `public/Aivory_Aether_white.svg`; label "Didukung oleh" in
  Indonesian) on the Diagnostics hero, report header, Blueprint header and Roadmap header, with spacing tuned in #155.
- The chat already had the mark under the composer.
- **PDF** (#154): white mark on the dark letter page, dark mark (`public/Aivory_Aether_dark.svg`) on the light closing page.
  Both are rasterised PNGs inlined in `lib/pdfAssets.ts` (`AETHER_WHITE`, `AETHER_DARK`, `AETHER_SIZE`). The download is now
  `Business_Operations_Analysis_<company>.pdf`. Placement in the PDF has not been checked visually.

## 8. Token range on the pricing cards

Display only. Tokens per credit shown as 28,000 (peak) and 43,334 (off-peak), so Operational (1,500 credits) reads
"≈ 42M–65M AI tokens / month" and Business (6,500) "≈ 182M–282M". Changed in three mirrored places:
`PricingStepTwo.tsx` (Frntend-nxt#105), `lib/tiers.ts` (#156) and `TOKENS_PER_CREDIT_*` in the backend `tiers.py` (avry-backend#35).
Margins are unchanged: one credit is still $0.004365 of LLM spend. The old 13,000/26,000 figures were derived from model prices,
so if real usage per credit stays near them, customers will run out of credits sooner than the token count suggests.

## 9. Deploy state and operations

| Service | Commit on prod |
|---|---|
| avry-user-dashboard | `564bd1b` (drift guard `EXPECT_FROM` in `backend/vps-bridge/deploy-dashboard-web-context.sh` is set to it) |
| avry-website (landing) | `18f7bb2` |
| avry-backend | `853337c` |

- Dashboard deploy: `./deploy-dashboard-web-context.sh` from `backend/vps-bridge` (drift guard, rollback image, health check).
- Landing deploy: fetch Frntend-nxt `main` on the VPS checkout, `merge --ff-only`, build, `up -d --no-deps avry-website`. The VPS
  checkout carries about 100 uncommitted drift files; check overlap first. On 2026-11-07 three hotfixed files
  (`src/lib/auth.ts`, `config.ts`, `config.property.test.ts`) were byte-identical to the incoming versions and were discarded before the merge.
- Bridge deploy guard `EXPECT_DQ_MD5` in `deploy-web-context.sh` is `0263b24a`; update it after the next bridge deploy.
- CI flake: `next/font/google` can fail once; `gh run rerun --failed`. Never merge with `--admin`.

## Open items

- Visual check of everything behind the dashboard login (only the harness and the landing HTML were verified).
- Real PDF/DOCX upload test; PDF placement of the Aether mark.
- VPS swap is nearly full (about 1.95 of 1.99 GB, no OOM); `swapoff -a && swapon -a` needs approval.
- Translate the remaining about pages and decide whether other heroes (Templates, Agents, Roadmap, Blueprint) get bold subtitles.
- Confirm that 42M–65M matches real token usage per credit.
- Merge status of the financial-case docs PR #127.
