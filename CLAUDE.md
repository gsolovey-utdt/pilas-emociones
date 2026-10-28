# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

**Pilas de emociones**, an anonymous word-sorting classroom activity for first-year students in **NyPE** (Neurociencia y Psicología Experimental), UTDT. Students sort 17 emotion words into 2–6 groups on their phones; the teacher reveals aggregate word maps, families, profiles and written criteria. Built by Guillermo Solovey in 2026.

Deployed to **GitHub Pages** from the root of `main` — no build step, pure static files. Follow the conventions of `gsolovey-utdt/two-armed-bandit`.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Student screens: welcome, sorting, criterion, sent; inline public Supabase constants |
| `app.js` | Tap selection/movement, local draft, participant UUID, insert-only submission and retry |
| `admin.html` | Teacher shell, QR, tabs, collapsed technical panel; no password |
| `admin.js` | Session polling, freeze, SVG rendering, label placement, simulation toggle, CSV |
| `analysis.js` | Shared CONFIG at the top; pure analysis, validation and simulation; browser + CommonJS exports |
| `styles.css` | Reference NyPE stylesheet copied intact, then activity-specific extensions |
| `test.html`, `tests.js` | Browser PASS/FAIL suite; same tests can run with Node |
| `schema.sql` | New table only, exact-partition checks, unique session/participant, RLS |

## Stack and design system

- Vanilla JS ES6+, no framework, dependency installation, bundler or build step.
- Supabase JS v2 CDN; qrcodejs 1.0.0 CDN on teacher page. No other runtime libraries. Handwritten SVG charts.
- Google Fonts: Playfair Display (headings/numbers), DM Sans (body), DM Mono (labels/code).
- Dark `#0d0e12`, surface `#161820`, gold `#e8c547`, blue `#5b8dee`; NyPE badge.
- Minimum student word size 16 px and touch target 44 px. Verify at 360 px without horizontal scrolling.
- Projector word labels 23 px; measure labels in screen coordinates, repel boxes and retain leader lines.
- Up to 12 colors, starting from Okabe–Ito, plus family numbers in legend/tree.

## Language and teaching constraints

All UI copy is Argentine Spanish with voseo. Preserve supplied strings. Never display `valencia`, `activación`, `arousal`, `MDS`, `clustering`, `co-ocurrencia`, or `dimensión` in student screens or main projector views. Technical terms belong ONLY inside the collapsed **Detalles técnicos** panel. Axes are **Eje 1** / **Eje 2**. Do not name or interpret them for students. Do not collect personal data.

## Student state and persistence

- URL parameter `s` is the session code. Missing code shows only “Pedile el link a tu docente.”
- Storage keys: `pilas:<code>:participant`, `draft`, `pending`, `submitted`.
- Generate `crypto.randomUUID()` once per device/browser and session. Shuffle independently via Fisher–Yates; persist original order and assignment draft. Timer starts at Empezar.
- Start with two empty groups, add one at a time up to six; remove empty groups. Never submit empty groups.
- Before submitting, every configured word occurs exactly once, 2–6 nonempty groups, criterion 2–120 characters, valid word order and duration.
- Save pending payload BEFORE requesting insert. Use INSERT only, never UPDATE/upsert. A 23505 conflict is success only after checking that this participant already has a saved row. Retain pending payload on failure.
- On reload check local receipt, then server receipt, then retry pending data. No analysis or family hints on student pages.

## Data

Same project and public key as two-armed-bandit, inlined in both HTML files. Never put service-role credentials in frontend code.

`pilas_responses`: id, session_code, participant_id, groups (JSON array of arrays), n_groups, word_order, criterio, duration_ms, created_at. Unique `(session_code,participant_id)`. SQL validates the exact 17-word multiset too. Anonymous INSERT and SELECT only. Table creation is an explicit setup step; changing a frontend file does not provision Supabase.

## Analysis

- `coOccurrence` ignores malformed partitions, divides by valid response count, diagonal 1. `distances`: 1−P.
- Classical Torgerson MDS: double-centered squared distances; handwritten symmetric Jacobi eigensolver. Sorted eigenvalues; coordinates use sqrt(max(lambda,0)). Five axis shares divide positive eigenvalues by positive mass. Negative mass share = sum(abs(negative)) / sum(abs(all)). Tiny numerical eigenvalues become zero.
- Orient each map axis so alegría is positive; if zero, first nonzero word breaks the sign tie. Teacher's orthogonal transform is applied on top and stored per session. No latent demo coordinates influence real maps.
- UPGMA averages ALL cross-leaf distances, so unequal cluster sizes are handled correctly. Stable pair ties, child order by minimum leaf; cut labels ordered by dendrogram leaf order. A tied merge height may not have a unique geometric cut: colors still encode the requested exact k.
- Pure functions live only in analysis.js; no DOM, fetch or storage there. CONFIG has one authoritative definition shared by both pages and tests.

## Teacher panel

- Hidden results initially: count + QR + student link. Reveal is a separate explicit action.
- Poll every 5000 ms, session-scoped and paginated in 1000-row pages with stable ordering. Filter malformed rows and duplicate participant IDs. Do not overlap requests.
- Freeze cancels the timer and in-flight request and increments an epoch to discard stale results. Resume immediately fetches all valid responses, including late submissions.
- Warn below 25 responses. Draw nothing below 3. Family k from 2 to 12 (default 5), shared by map/tree.
- The technical panel includes a teaching explanation of binary pair matrices, proportions, distances, classical MDS, optional spectral algebra and UPGMA. Its circumplex diagram is an explicitly theoretical comparison, never fitted to class points. Keep theory, citations and any axis interpretations inside this outer collapsed panel. Spectral shares do not establish circumplex fit. Demo similarity to the theory is designed into the invented data, not independent evidence.
- Display criterion text with textContent, never innerHTML. Shuffle on dataset changes, keep order during view changes.
- Demo uses 40 local participants, independent noisy coordinates (sd .25), social scaled .6, k uniform 3–6; nostalgia and sorpresa draw x ±.5 before noise. Drop empty groups. Stop live polling, never INSERT demo data, show permanent DATOS SIMULADOS banner. Returning restores live cache and resumes unless frozen.
- CSV exports the current snapshot as two UTF-8 BOM files, quoted fields, spreadsheet-formula neutralization; explicit fallback links. Mark demo files in their names.

## Supabase persistence — verified 2026-10-28

The user executed `schema.sql` in project `irryksaoygdklwtsjsru`. Anonymous storage is now verified on the published GitHub Pages app at `https://gsolovey-utdt.github.io/pilas-emociones/`.

Verification used only the public frontend key: one response was submitted through the live student UI, read back from Supabase, rejected on duplicate INSERT with HTTP 409 / PostgreSQL 23505, and correctly recognized as already submitted after reload. A concurrent API test made 120 attempts for 60 participants: 60 inserts, 60 duplicate rejections, 60 valid unique stored responses. The live projector displayed 60 with demo mode off.

Test sessions were `qa-envio-20261028-f84b5f4b` and `qa-carga-20261028-f84b5f4b`, separate from all pilot/class sessions. These contain synthetic verification data. Demo mode and local `/qa/` fixtures still do not write to Supabase. The Supabase setup task is complete; do not repeat schema creation in this existing project.

## Tests and deploy

Open `test.html`; all rows must PASS. Tests are reused from Node through CommonJS. Add meaningful numerical/behavioral checks for substantive changes. Check taps, pending retry, duplicate submissions, hidden results, freeze races, demo isolation, projector readability and 360 px layout when touching those paths.

Push to `main`; GitHub Pages serves root. No build. Use different session codes for pilot and class. Never write synthetic responses to a real class code.
