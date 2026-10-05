# DASH Wash Club

An Elite membership console for DASH Car Wash, built around the membership entered
on 2026-10-05:

| Field | Value |
| --- | --- |
| Account | Dash Car Wash |
| Phone | (802) 428-9009 |
| Site code | 906 |
| Membership code | S12 |
| Plan | Elite — $29.99/mo |
| Full code | **906-S12** |

It stores memberships, renders a scannable **Code 39** card for each member, logs
unlimited-wash visits, and tracks wash activity per week and per member.

Zero runtime dependencies, no build step, no API keys, no network calls: it is a
static app plus a small Node static server, and data lives in the browser's
`localStorage`.

---

## Run it

```bash
cd dash-wash-club
node server.mjs                 # http://localhost:4173
node server.mjs --port 8080     # different port
node server.mjs --host 0.0.0.0  # default; bind address for containers and previews
```

Then open <http://localhost:4173>.

Any static host also works (GitHub Pages, `npx serve public`, `python3 -m http.server`
inside `public/`) — the app is pure static files.

## Test it

```bash
cd dash-wash-club
node --test                 # 4 suites: store, format, code39 encoder, static server
npm install && npm test     # adds the jsdom UI smoke test (skipped when jsdom is absent)
```

The tests import the same modules the browser loads, so passing tests mean the
domain logic, the barcode encoder and the served files all line up. The optional
UI suite drives the real app in jsdom: dashboard → search → member card → wash
logging → status change → create form (26 assertions).

---

## What the app does

- **Dashboard** — hero card for the 906-S12 membership with one-tap *Log a wash*,
  club KPIs (members, washes this month, average per member, all-time washes),
  an 8-week wash chart, recent club-wide activity, wash load by member and plan mix.
- **Members** — sortable-feel table of every membership with plan, status,
  washes this month and last visit. Click a row to open it; search by name,
  membership code (`906-s12`), plan or phone digits from the top bar (or press `/`).
- **Membership card** — a white, print-ready card with the site code, member code
  and a real Code 39 barcode rendered from the membership code (`906S12`).
  *Print card* prints only the card.
- **Wash history** — every visit timestamped; undo individual entries.
- **Plans** — Bath $24.99, Shine $29.99, Elite $29.99; statuses active / paused / canceled.
- **Data** — saved to `localStorage` under `dash-wash-club/v1`; *Reset data* restores
  the sample members. Unknown or corrupt stored data falls back to the seed safely.

## Layout

```
dash-wash-club/
├── server.mjs               # dependency-free static server (GET/HEAD, path-traversal safe)
├── public/
│   ├── index.html
│   ├── styles.css           # dark theme, membership-card + print styles
│   ├── app.js               # shell, hash routing, actions, toasts
│   ├── views.js             # dashboard / member list / detail / form renderers
│   └── lib/
│       ├── code39.js        # Code 39 encoder → SVG
│       ├── format.js        # plans, phone + code formatting, validation, search, stats
│       └── store.js         # seed data, localStorage store, member + club stats
└── test/                    # node:test suites for the above
```

Routes are hash-based: `#/`, `#/members`, `#/members/:id`, `#/new`, `#/members/:id/edit`.

## Notes

- Barcodes use the Code 39 subset (0-9, A-Z and `- . SPACE $ / + %`). Codes are
  sanitized to that alphabet on save, so `906-S12` encodes as `906S12` between guards.
- The seed data is illustrative; only the 906-S12 membership details above came
  from the user. Replace or delete the sample members as needed.
