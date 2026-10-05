/**
 * Browser rendering for the DASH Wash Club console.
 * Every view returns a detached element; app.js owns the shell and routing.
 */
import {
  PLANS,
  weekStart,
  membershipCode,
  barcodeText,
  formatPhone,
  formatDateTime,
  relativeDay,
  planName,
  planPrice,
  weekBuckets,
  STATUSES,
} from "./lib/format.js";
import { memberStats, clubStats } from "./lib/store.js";
import { code39Svg } from "./lib/code39.js";

/* ------------------------------------------------------------------ *
 * Small element helpers
 * ------------------------------------------------------------------ */

export function element(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    // `html` is only ever fed by code39Svg(), which builds markup from
    // A-Z0-9 input, so there is no untrusted content going through here.
    else if (key === "html") node.innerHTML = value;
    else if (key === "style") Object.assign(node.style, value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const AVATAR_COLORS = ["#1f6feb", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#0369a1", "#4d7c0f"];

function avatarColor(seed) {
  const text = String(seed ?? "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) % 9973;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/* A colour-coded water droplet stands in for each member, so no name is
   shortened to initials anywhere in the interface. */
const DROPLET =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M12 2.4c3.3 4.2 6.6 7.9 6.6 11.5a6.6 6.6 0 1 1-13.2 0C5.4 10.3 8.7 6.6 12 2.4Z"/>' +
  "</svg>";

function avatar(member, size = "") {
  return element("span", {
    class: `avatar ${size}`.trim(),
    style: { backgroundColor: avatarColor(member?.id ?? member?.name) },
    html: DROPLET,
    "aria-hidden": "true",
  });
}

function statusChip(status) {
  return element("span", { class: `chip chip-${status}` }, status);
}

function planChip(member) {
  return element("span", { class: `chip plan-${member.plan}` }, `${planName(member)} · ${planPrice(member)}`);
}

function sectionCard(title, subtitle, ...children) {
  return element(
    "section",
    { class: "card" },
    element("header", { class: "card-head" }, element("h2", { text: title }), subtitle ? element("p", { class: "muted", text: subtitle }) : null),
    ...children,
  );
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export function renderDashboard(context) {
  const { members, actions, now } = context;
  const stats = clubStats(members, now);
  const primary = members.find((member) => member.id === "mbr-906-s12") ?? null;

  const statistics = [
    { label: "Memberships", value: stats.members, hint: `${stats.active} active` },
    { label: "Washes this month", value: stats.washesThisMonth, hint: "all sites" },
    { label: "Average washes per member", value: stats.avgPerMember.toFixed(1), hint: "this month" },
    { label: "Washes on record", value: stats.totalWashes, hint: "all time" },
  ];

  const statisticsRow = element(
    "div",
    { class: "stats-row" },
    statistics.map((statistic) =>
      element(
        "div",
        { class: "stat" },
        element("span", { class: "stat-label", text: statistic.label }),
        element("strong", { class: "stat-value", text: String(statistic.value) }),
        element("span", { class: "stat-hint", text: statistic.hint }),
      ),
    ),
  );

  /* recent washes across the club */
  const recent = members
    .flatMap((member) => (member.washes ?? []).map((iso) => ({ member, iso })))
    .sort((a, b) => new Date(b.iso) - new Date(a.iso))
    .slice(0, 6);

  const recentList = recent.length
    ? element(
        "ul",
        { class: "feed" },
        recent.map(({ member, iso }) =>
          element(
            "li",
            {},
            avatar(member, "small"),
            element(
              "div",
              { class: "feed-body" },
              element("button", { class: "link", type: "button", onClick: () => actions.openMember(member.id) }, member.name),
              element("span", { class: "muted small", text: `${membershipCode(member)} · ${planName(member)}` }),
            ),
            element("time", { class: "muted small", datetime: iso, text: relativeDay(iso, now) }),
          ),
        ),
      )
    : element("p", { class: "muted", text: "No washes logged yet — open a member and record the first one." });

  /* washes per week */
  const weeks = 8;
  const buckets = weekBuckets(
    members.flatMap((member) => member.washes ?? []),
    weeks,
    now,
  );
  const peak = Math.max(1, ...buckets);
  const firstWeek = weekStart(now);
  firstWeek.setDate(firstWeek.getDate() - (weeks - 1) * 7);
  const chart = element(
    "div",
    { class: "chart", role: "img", "aria-label": `Washes per week for the last ${weeks} weeks: ${buckets.join(", ")}. Each column is one week starting Monday.` },
    buckets.map((count, index) => {
      const start = new Date(firstWeek);
      start.setDate(start.getDate() + index * 7);
      const weeksAgo = weeks - 1 - index;
      const label = weeksAgo === 0 ? "this week" : `${formatDateTime(start, { month: "numeric", day: "numeric" })}`;
      const spoken = weeksAgo === 0 ? "the current week" : `the week of ${formatDateTime(start)}`;
      return element(
        "div",
        { class: "chart-column", title: `${count} wash${count === 1 ? "" : "es"} in ${spoken}` },
        element("span", { class: "chart-count", text: count ? String(count) : "" }),
        element("div", { class: "chart-track" }, element("div", { class: "chart-bar", style: { height: `${Math.round((count / peak) * 100)}%` } })),
        element("span", { class: "chart-label", text: label }),
      );
    }),
  );

  /* per-member load */
  const ranked = members
    .map((member) => ({ member, stats: memberStats(member, now) }))
    .sort((a, b) => b.stats.thisMonth - a.stats.thisMonth || a.member.name.localeCompare(b.member.name));
  const loadMax = Math.max(1, ...ranked.map((entry) => entry.stats.thisMonth));
  const loadList = element(
    "ul",
    { class: "load" },
    ranked.map(({ member, stats: memberStat }) =>
      element(
        "li",
        {},
        element("button", { class: "link load-name", type: "button", onClick: () => actions.openMember(member.id) }, member.name),
        element("div", { class: "load-track" }, element("div", { class: "load-bar", style: { width: `${(memberStat.thisMonth / loadMax) * 100}%` } })),
        element("span", { class: "muted small load-count", text: `${memberStat.thisMonth} this month` }),
      ),
    ),
  );

  return element(
    "div",
    { class: "view" },
    element(
      "div",
      { class: "view-head" },
      element("div", {}, element("h1", { text: "Your club at a glance" }), element(
        "p",
        { class: "muted" },
        "Your Elite membership, wash activity and member load across every DASH site.",
      )),
      element("button", { class: "button primary", type: "button", onClick: () => actions.newMember() }, "＋ Add membership"),
    ),
    primary ? heroCard(primary, context) : null,
    statisticsRow,
    element("div", { class: "grid two" }, sectionCard("Washes per week", "Last 8 weeks, weeks start on Monday", chart), sectionCard("Recent activity", "Most recent washes across the club", recentList)),
    element("div", { class: "grid two" }, sectionCard("Wash load by member", "Current calendar month", loadList), sectionCard("Membership plans", "How your members spread across the three plans", planMix(members))),
  );
}

function heroCard(member, context) {
  const stats = memberStats(member, context.now);
  return element(
    "section",
    { class: "hero" },
    element(
      "div",
      { class: "hero-body" },
      element("span", { class: "eyebrow", text: "Your membership on file" }),
      element("h2", {}, member.name),
      element(
        "div",
        { class: "hero-facts" },
        fact("Phone number", formatPhone(member.phone)),
        fact("Site code", member.siteCode),
        fact("Membership code", member.memberCode),
        fact("Full code", membershipCode(member)),
        fact("Plan", `${planName(member)} · ${planPrice(member)}`),
        fact("Member since", formatDateTime(member.joinedAt)),
        fact("Vehicle", member.vehicle || "Not recorded"),
        fact("Favourite location", member.preferredLocation || "Not recorded"),
      ),
      element(
        "div",
        { class: "hero-actions" },
        element("button", { class: "button primary", type: "button", onClick: () => context.actions.logWash(member.id) }, "✓ Log a wash"),
        element("button", { class: "button", type: "button", onClick: () => context.actions.openMember(member.id) }, "Open membership"),
      ),
      element(
        "p",
        { class: "muted small" },
        `${stats.total} washes on record · ${stats.thisMonth} this month · last ${relativeDay(stats.lastWash, context.now) || "not yet"}`,
      ),
    ),
    element("div", { class: "hero-barcode", html: code39Svg(barcodeText(member), { height: 54, moduleWidth: 1.5 }) }),
  );
}

function fact(label, value) {
  return element("div", { class: "fact" }, element("span", { class: "fact-label", text: label }), element("strong", { text: String(value ?? "—") }));
}

function planMix(members) {
  const rows = PLANS.map((plan) => {
    const count = members.filter((member) => member.plan === plan.id).length;
    const share = members.length ? Math.round((count / members.length) * 100) : 0;
    return element(
      "li",
      {},
      element("span", { class: `chip plan-${plan.id}`, text: plan.name }),
      element("div", { class: "load-track" }, element("div", { class: "load-bar", style: { width: `${share}%` } })),
      element("span", { class: "muted small", text: `${count} · ${share}%` }),
    );
  });
  return element("ul", { class: "load" }, rows);
}

/* ------------------------------------------------------------------ *
 * Member list
 * ------------------------------------------------------------------ */

export function renderMembers(context) {
  const { visibleMembers, state, actions, now } = context;

  if (!visibleMembers.length) {
    return element(
      "div",
      { class: "view" },
      element("div", { class: "view-head" }, element("h1", { text: "Member directory" }), element("button", { class: "button primary", type: "button", onClick: () => actions.newMember() }, "＋ Add membership")),
      element(
        "div",
        { class: "empty" },
        element("p", { text: state.query ? `No memberships match “${state.query}”.` : "No memberships yet." }),
        element("button", { class: "button", type: "button", onClick: () => actions.clearQuery() }, "Clear search"),
      ),
    );
  }

  const rows = visibleMembers.map((member) => {
    const stats = memberStats(member, now);
    return element(
      "tr",
      {
        class: "row",
        tabindex: "0",
        onClick: () => actions.openMember(member.id),
        onKeydown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            actions.openMember(member.id);
          }
        },
      },
      element(
        "td",
        {},
        element("div", { class: "cell-member" }, avatar(member), element("div", {}, element("strong", { text: member.name }), element("span", { class: "muted small", text: `member since ${formatDateTime(member.joinedAt)}` }))),
      ),
      element("td", {}, element("span", { class: "monospace", text: membershipCode(member) })),
      element("td", {}, planChip(member)),
      element("td", {}, statusChip(member.status)),
      element("td", { class: "number" }, String(stats.thisMonth)),
      element("td", { class: "muted" }, relativeDay(stats.lastWash, now) || "never"),
      element(
        "td",
        { class: "actions" },
        element(
          "button",
          {
            class: "button tiny",
            type: "button",
            onClick: (event) => {
              event.stopPropagation();
              actions.logWash(member.id);
            },
          },
          "Log a wash",
        ),
      ),
    );
  });

  return element(
    "div",
    { class: "view" },
    element(
      "div",
      { class: "view-head" },
      element("div", {}, element("h1", { text: "Member directory" }), element("p", { class: "muted", text: `${visibleMembers.length} memberships shown${state.query ? ` · filtered by “${state.query}”` : ""}` })),
      element("button", { class: "button primary", type: "button", onClick: () => actions.newMember() }, "＋ Add membership"),
    ),
    element(
      "div",
      { class: "table-wrap" },
      element(
        "table",
        { class: "table" },
        element(
          "thead",
          {},
          element(
            "tr",
            {},
            element("th", { text: "Member name" }),
            element("th", { text: "Membership code" }),
            element("th", { text: "Plan" }),
            element("th", { text: "Status" }),
            element("th", { class: "number", text: "Washes this month" }),
            element("th", { text: "Last wash" }),
            element("th", { text: "" }),
          ),
        ),
        element("tbody", {}, rows),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Member detail
 * ------------------------------------------------------------------ */

export function renderMemberDetail(context, id) {
  const member = context.members.find((entry) => entry.id === id);
  if (!member) {
    return element(
      "div",
      { class: "view" },
      element("div", { class: "empty" }, element("p", { text: "That membership no longer exists." }), element("button", { class: "button", type: "button", onClick: () => context.actions.setView("members") }, "Back to members")),
    );
  }

  const stats = memberStats(member, context.now);
  const code = barcodeText(member);

  const details = element(
    "dl",
    { class: "details" },
    detailRow("Phone number", formatPhone(member.phone)),
    detailRow("Site code", member.siteCode),
    detailRow("Membership code", member.memberCode),
    detailRow("Full code", membershipCode(member)),
    detailRow("Plan", `${planName(member)} · ${planPrice(member)}`),
    detailRow("Vehicle", member.vehicle || "Not recorded"),
    detailRow("Favourite location", member.preferredLocation || "Not recorded"),
    detailRow("Status", statusChip(member.status)),
    detailRow("Member since", formatDateTime(member.joinedAt)),
    detailRow("Washes", `${stats.total} total · ${stats.thisMonth} this month`),
    detailRow("Last wash", stats.lastWash ? `${formatDateTime(stats.lastWash)} (${relativeDay(stats.lastWash, context.now)})` : "never"),
    detailRow("Notes", member.notes || "—"),
  );

  const history = (member.washes ?? []).length
    ? element(
        "ul",
        { class: "timeline" },
        (member.washes ?? []).map((iso) =>
          element(
            "li",
            {},
            element("span", { class: "dot" }),
            element("div", {}, element("strong", { text: formatDateTime(iso, { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) }), element("span", { class: "muted small", text: relativeDay(iso, context.now) })),
            element("button", { class: "button tiny ghost", type: "button", onClick: () => context.actions.undoWash(member.id, iso) }, "Undo"),
          ),
        ),
      )
    : element("p", { class: "muted", text: "No washes recorded for this member yet." });

  const statusButtons = STATUSES.filter((status) => status !== member.status).map((status) =>
    element(
      "button",
      { class: "button tiny", type: "button", onClick: () => context.actions.setStatus(member.id, status) },
      status === "active" ? "Reactivate" : status === "paused" ? "Pause" : "Cancel membership",
    ),
  );

  return element(
    "div",
    { class: "view" },
    element(
      "div",
      { class: "view-head" },
      element(
        "div",
        { class: "head-stack" },
        element("button", { class: "button tiny ghost", type: "button", onClick: () => context.actions.setView("members") }, "← Member directory"),
        element("h1", {}, member.name, " ", statusChip(member.status)),
      ),
      element(
        "div",
        { class: "button-row" },
        element("button", { class: "button primary", type: "button", onClick: () => context.actions.logWash(member.id) }, "✓ Log a wash"),
        element("button", { class: "button", type: "button", onClick: () => context.actions.openForm(member.id) }, "Edit"),
        element("button", { class: "button", type: "button", onClick: () => window.print() }, "Print card"),
      ),
    ),
    element(
      "div",
      { class: "grid detail" },
      element(
        "section",
        { class: "card card-tight" },
        element(
          "div",
          { class: "membership-card" },
          element(
            "div",
            { class: "membership-top" },
            element("span", { class: "brand", text: "DASH" }),
            element("span", { class: "brand-sub", text: "CAR WASH · UNLIMITED" }),
          ),
          element(
            "div",
            { class: "membership-mid" },
            element(
              "div",
              {},
              element("span", { class: "card-label", text: "Member" }),
              element("strong", { class: "card-name", text: member.name }),
              member.vehicle ? element("span", { class: "card-vehicle", text: member.vehicle }) : null,
            ),
            element("div", { class: "card-plan" }, element("span", { class: "chip plan-" + member.plan }, planName(member).toUpperCase())),
          ),
          element("div", { class: "card-barcode", html: code39Svg(code, { height: 58, moduleWidth: 1.7 }) || "" }),
          element(
            "div",
            { class: "membership-bottom" },
            element("span", { class: "monospace", text: membershipCode(member) }),
            element("span", { class: "monospace", text: formatPhone(member.phone) }),
            element("span", { class: "monospace", text: `MEMBER SINCE ${formatDateTime(member.joinedAt, { month: "long", year: "numeric" }).toUpperCase()}` }),
            element("span", { class: "monospace", text: member.status.toUpperCase() }),
          ),
        ),
        element("p", { class: "muted small center", text: `Code 39 barcode · scan at the gate or read ${membershipCode(member)} to the attendant.` }),
      ),
      sectionCard("Membership details", `Site code ${member.siteCode} · recorded from your DASH membership`, details, element("div", { class: "button-row" }, statusButtons, element("button", { class: "button tiny danger", type: "button", onClick: () => context.actions.remove(member.id) }, "Delete"))),
    ),
    sectionCard("Wash history", `${(member.washes ?? []).length} recorded visit${(member.washes ?? []).length === 1 ? "" : "s"}`, history),
  );
}

function detailRow(label, value) {
  return element("div", { class: "detail-row" }, element("dt", { text: label }), element("dd", {}, value));
}

/* ------------------------------------------------------------------ *
 * Member form (create + edit)
 * ------------------------------------------------------------------ */

export function renderMemberForm(context, id) {
  const existing = id ? context.members.find((member) => member.id === id) : null;
  const draft = {
    name: existing?.name ?? "",
    phone: existing ? formatPhone(existing.phone) : "",
    siteCode: existing?.siteCode ?? "906",
    memberCode: existing?.memberCode ?? "",
    plan: existing?.plan ?? "elite",
    status: existing?.status ?? "active",
    notes: existing?.notes ?? "",
    vehicle: existing?.vehicle ?? "",
    preferredLocation: existing?.preferredLocation ?? "",
  };

  const fields = {};
  const errorNodes = {};

  const field = (name, label, input, hint) => {
    const error = element("span", { class: "field-error" });
    errorNodes[name] = error;
    input.setAttribute("data-key", name);
    return element(
      "label",
      { class: "field" },
      element("span", { class: "field-label", text: label }),
      input,
      hint ? element("span", { class: "field-hint muted small", text: hint }) : null,
      error,
    );
  };

  function textInput(name, options = {}) {
    const input = element("input", {
      class: "input",
      type: options.type ?? "text",
      value: options.value ?? "",
      placeholder: options.placeholder ?? "",
      inputmode: options.inputmode,
      autocomplete: "off",
      onInput: () => {
        fields[name] = input.value;
        errorNodes[name].textContent = "";
      },
    });
    fields[name] = input.value;
    return input;
  }

  function selectInput(name, options) {
    const select = element(
      "select",
      {
        class: "input",
        onChange: () => {
          fields[name] = select.value;
          errorNodes[name].textContent = "";
        },
      },
      options.map((option) => element("option", { value: option.value, selected: option.value === (draft[name] ?? "") ? true : null }, option.label)),
    );
    fields[name] = select.value;
    return select;
  }

  const form = element(
    "form",
    {
      class: "form",
      onSubmit: (event) => {
        event.preventDefault();
        const payload = { ...draft, ...fields };
        const result = existing ? context.actions.update(existing.id, payload) : context.actions.create(payload);
        if (result.ok) return;
        for (const [key, message] of Object.entries(result.errors)) {
          if (errorNodes[key]) errorNodes[key].textContent = message;
        }
      },
    },
    element(
      "div",
      { class: "grid two" },
      field("name", "Member name", textInput("name", { value: draft.name, placeholder: "Dash Car Wash" })),
      field("phone", "Phone number", textInput("phone", { value: draft.phone, placeholder: "(802) 428-9009", inputmode: "tel" }), "Ten digits — used to spot duplicate memberships."),
      field("siteCode", "Site code", textInput("siteCode", { value: draft.siteCode, placeholder: "906" })),
      field("memberCode", "Membership code", textInput("memberCode", { value: draft.memberCode, placeholder: "S12" }), "Letters, digits and - . / + % $"),
      field(
        "plan",
        "Plan",
        selectInput(
          "plan",
          PLANS.map((plan) => ({ value: plan.id, label: `${plan.name} — $${plan.price.toFixed(2)} per month` })),
        ),
      ),
      field(
        "status",
        "Membership status",
        selectInput(
          "status",
          STATUSES.map((status) => ({ value: status, label: status[0].toUpperCase() + status.slice(1) })),
        ),
      ),
      field("vehicle", "Vehicle", textInput("vehicle", { value: draft.vehicle, placeholder: "2021 Toyota Camry — midnight black" }), "Optional — shown on the dashboard and card."),
      field("preferredLocation", "Favourite DASH location", textInput("preferredLocation", { value: draft.preferredLocation, placeholder: "Craig Road, North Las Vegas" }), "Optional — where this member usually washes."),
    ),
    field("notes", "Notes", textInput("notes", { value: draft.notes, placeholder: "Optional — wash preferences, reminders, anything useful." })),
    element(
      "div",
      { class: "button-row" },
      element("button", { class: "button primary", type: "submit" }, existing ? "Save changes" : "Create membership"),
      element("button", { class: "button ghost", type: "button", onClick: () => context.actions.cancelForm(existing?.id ?? null) }, "Cancel"),
    ),
  );

  return element(
    "div",
    { class: "view narrow" },
    element(
      "div",
      { class: "view-head" },
      element("div", {}, element("h1", { text: existing ? "Edit membership" : "New membership" }), element("p", { class: "muted", text: existing ? `Updating ${existing.name}` : "Register a DASH unlimited wash membership." })),
    ),
    element("section", { class: "card" }, form),
  );
}
