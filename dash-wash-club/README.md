# DASH Wash Club

Your Elite membership console for DASH Car Wash, built around the membership entered
on 5 October 2026:

| Field | Value |
| --- | --- |
| Account name | Dash Car Wash |
| Phone number | (802) 428-9009 |
| Site code | 906 |
| Membership code | S12 |
| Full code | **906-S12** |
| Plan | Elite — $29.99 per month |
| Vehicle | 2021 Toyota Camry — midnight black |
| Favourite DASH location | Craig Road, North Las Vegas |
| Membership status | Active |

It stores memberships, renders a scannable **Code 39** card for each member, keeps a
record of unlimited-wash visits, and tracks wash activity per week and per member.

There are no runtime dependencies, no build step, no secret keys and no network
calls: it is a set of static files plus a small Node web server, and every record
lives in your browser's own storage.

---

## Run it

```bash
cd dash-wash-club
node server.mjs                 # http://localhost:4173
node server.mjs --port 8080     # a different port
node server.mjs --host 0.0.0.0  # the default address, for containers and previews
```

Then open <http://localhost:4173>.

Any static file host also works — GitHub Pages, `npx serve public`, or
`python3 -m http.server` inside the `public` folder — because the app is pure
static files.

## Test it

```bash
cd dash-wash-club
node --test                 # four suites: membership store, formatting, Code 39, web server
npm install && npm test     # adds the jsdom browser test, which is skipped when jsdom is absent
```

The tests load the same modules the browser loads, so passing tests mean the
membership rules, the barcode encoder, the rendered pages and the served files all
line up. The optional browser suite drives the real app: dashboard, search, the
membership card, wash logging, status changes and the create form.

---

## What the app does

- **My dashboard** — your membership card at the top with one-tap *Log a wash*, your
  phone number, site code, membership code, plan, join date, vehicle and favourite
  location. Below it: memberships, washes this month, average washes per member and
  total washes on record, then a wash chart for the last eight weeks with each week
  labelled by its Monday start date, recent washes across the club, wash load per
  member and how memberships spread across the three plans.
- **Member directory** — every membership with its plan, status, washes this month
  and last visit. Choose a row to open it, or search from the top bar by name,
  membership code (`906-s12`), plan or phone number digits (press `/` to jump to the
  search box).
- **Membership card** — a white, print-ready card showing the site code, membership
  code and a real Code 39 barcode built from your full code, plus the member name,
  vehicle, plan, phone number and join month. *Print card* prints only the card.
- **Wash history** — every visit is timestamped, and single entries can be undone.
- **Membership plans** — Bath at $24.99 per month, Shine at $29.99 per month and
  Elite at $29.99 per month; statuses are active, paused or canceled.
- **Your data** — saved in this browser under `dash-wash-club/v1`; *Restore the
  starting list* brings back the original memberships. Stored data that is unknown or
  unreadable quietly falls back to that starting list instead of breaking the page.

## Layout

```
dash-wash-club/
├── server.mjs               # web server with no dependencies; serves GET and HEAD, refuses path tricks
├── package.json             # start and test commands, jsdom as the only (optional) dev dependency
├── public/
│   ├── index.html           # page shell
│   ├── styles.css           # dark theme, membership card and print styles
│   ├── app.js               # page shell, address routing, actions, messages
│   ├── views.js             # dashboard, member directory, member detail, create and edit form
│   └── lib/
│       ├── code39.js        # Code 39 encoder that draws the barcode as SVG
│       ├── format.js        # plans, phone number and code formatting, validation, search, statistics
│       └── store.js         # starting memberships, browser storage, member and club statistics
└── test/                    # node:test suites for everything above
```

Page addresses use the part after `#`: `#/`, `#/members`, `#/members/:id`, `#/new`
and `#/members/:id/edit`.

## Notes

- Barcodes use the Code 39 character set (digits, capital letters and `- . $ / + %`).
  Codes are cleaned to that character set when saved, so `906-S12` is drawn as
  `906S12` between the start and stop guards.
- Every label and date is written out in full: “$29.99 per month” rather than “/mo”,
  “Average washes per member” rather than “avg”, full month names, a 24-hour clock so
  no “AM” or “PM” is needed, week columns labelled by their Monday start date, and
  identifiers such as `element`, `context`, `statistics` and `number` spelled out as
  well. Member badges are colour-coded water droplets instead of name initials, and the
  sample membership codes are plain digits so no plan name is shortened to letters.
  The only shortened forms left are platform names that cannot be renamed (JavaScript,
  HTTP, SVG, `console.info`).
- The starting list contains three illustrative memberships alongside your own
  906-S12 record; replace or delete them whenever you like.
