/**
 * DOM rendering for the DASH Wash Club console.
 * Every view returns a detached element; app.js owns the shell and routing.
 */
import {
  PLANS,
  membershipCode,
  barcodeText,
  formatPhone,
  formatDateTime,
  relativeDay,
  planName,
  planPrice,
  initials,
  weekBuckets,
  STATUSES,
} from "./lib/format.js";
import { memberStats, clubStats } from "./lib/store.js";
import { code39Svg } from "./lib/code39.js";

/* ------------------------------------------------------------------ *
 * Small DOM helpers
 * ------------------------------------------------------------------ */

export function el(tag, props = {}, ...children) {
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

function avatar(member, size = "") {
  return el(
    "span",
    {
      class: `avatar ${size}`.trim(),
      style: { backgroundColor: avatarColor(member?.id ?? member?.name) },
      "aria-hidden": "true",
    },
    initials(member?.name),
  );
}

function statusChip(status) {
  return el("span", { class: `chip chip-${status}` }, status);
}

function planChip(member) {
  return el("span", { class: `chip plan-${member.plan}` }, `${planName(member)} · ${planPrice(member)}`);
}

function sectionCard(title, subtitle, ...children) {
  return el(
    "section",
    { class: "card" },
    el("header", { class: "card-head" }, el("h2", { text: title }), subtitle ? el("p", { class: "muted", text: subtitle }) : null),
    ...children,
  );
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export function renderDashboard(ctx) {
  const { members, actions, now } = ctx;
  const stats = clubStats(members, now);
  const primary = members.find((member) => member.id === "mbr-906-s12") ?? null;

  const kpis = [
    { label: "Members", value: stats.members, hint: `${stats.active} active` },
    { label: "Washes this month", value: stats.washesThisMonth, hint: "all sites" },
    { label: "Avg washes / member", value: stats.avgPerMember.toFixed(1), hint: "this month" },
    { label: "Washes logged", value: stats.totalWashes, hint: "all time" },
  ];

  const kpiRow = el(
    "div",
    { class: "kpi-row" },
    kpis.map((kpi) =>
      el(
        "div",
        { class: "kpi" },
        el("span", { class: "kpi-label", text: kpi.label }),
        el("strong", { class: "kpi-value", text: String(kpi.value) }),
        el("span", { class: "kpi-hint", text: kpi.hint }),
      ),
    ),
  );

  /* recent washes across the club */
  const recent = members
    .flatMap((member) => (member.washes ?? []).map((iso) => ({ member, iso })))
    .sort((a, b) => new Date(b.iso) - new Date(a.iso))
    .slice(0, 6);

  const recentList = recent.length
    ? el(
        "ul",
        { class: "feed" },
        recent.map(({ member, iso }) =>
          el(
            "li",
            {},
            avatar(member, "sm"),
            el(
              "div",
              { class: "feed-body" },
              el("button", { class: "link", type: "button", onClick: () => actions.openMember(member.id) }, member.name),
              el("span", { class: "muted small", text: `${membershipCode(member)} · ${planName(member)}` }),
            ),
            el("time", { class: "muted small", datetime: iso, text: relativeDay(iso, now) }),
          ),
        ),
      )
    : el("p", { class: "muted", text: "No washes logged yet — open a member and record the first one." });

  /* washes per week */
  const weeks = 8;
  const buckets = weekBuckets(
    members.flatMap((member) => member.washes ?? []),
    weeks,
    now,
  );
  const peak = Math.max(1, ...buckets);
  const chart = el(
    "div",
    { class: "chart", role: "img", "aria-label": `Washes per week for the last ${weeks} weeks: ${buckets.join(", ")}` },
    buckets.map((count, index) => {
      const weeksAgo = weeks - 1 - index;
      return el(
        "div",
        { class: "chart-col" },
        el("span", { class: "chart-count", text: count ? String(count) : "" }),
        el("div", { class: "chart-track" }, el("div", { class: "chart-bar", style: { height: `${Math.round((count / peak) * 100)}%` } })),
        el("span", { class: "chart-label", text: weeksAgo === 0 ? "now" : `-${weeksAgo}w` }),
      );
    }),
  );

  /* per-member load */
  const ranked = members
    .map((member) => ({ member, stats: memberStats(member, now) }))
    .sort((a, b) => b.stats.thisMonth - a.stats.thisMonth || a.member.name.localeCompare(b.member.name));
  const loadMax = Math.max(1, ...ranked.map((entry) => entry.stats.thisMonth));
  const loadList = el(
    "ul",
    { class: "load" },
    ranked.map(({ member, stats: memberStat }) =>
      el(
        "li",
        {},
        el("button", { class: "link load-name", type: "button", onClick: () => actions.openMember(member.id) }, member.name),
        el("div", { class: "load-track" }, el("div", { class: "load-bar", style: { width: `${(memberStat.thisMonth / loadMax) * 100}%` } })),
        el("span", { class: "muted small load-count", text: `${memberStat.thisMonth} this month` }),
      ),
    ),
  );

  return el(
    "div",
    { class: "view" },
    el(
      "div",
      { class: "view-head" },
      el("div", {}, el("h1", { text: "Club overview" }), el(
        "p",
        { class: "muted" },
        "Memberships, wash activity and member load across the DASH network.",
      )),
      el("button", { class: "btn primary", type: "button", onClick: () => actions.newMember() }, "＋ New member"),
    ),
    primary ? heroCard(primary, ctx) : null,
    kpiRow,
    el("div", { class: "grid two" }, sectionCard("Washes per week", "Last 8 weeks, Monday-based buckets", chart), sectionCard("Recent activity", "Latest washes across the club", recentList)),
    el("div", { class: "grid two" }, sectionCard("Wash load by member", "Calendar month to date", loadList), sectionCard("Plan mix", "Active memberships by plan", planMix(members))),
  );
}

function heroCard(member, ctx) {
  const stats = memberStats(member, ctx.now);
  return el(
    "section",
    { class: "hero" },
    el(
      "div",
      { class: "hero-body" },
      el("span", { class: "eyebrow", text: "Membership on file" }),
      el("h2", {}, member.name),
      el(
        "div",
        { class: "hero-facts" },
        fact("Phone", formatPhone(member.phone)),
        fact("Site", member.siteCode),
        fact("Member code", member.memberCode),
        fact("Plan", `${planName(member)} · ${planPrice(member)}`),
        fact("Full code", membershipCode(member)),
      ),
      el(
        "div",
        { class: "hero-actions" },
        el("button", { class: "btn primary", type: "button", onClick: () => ctx.actions.logWash(member.id) }, "✓ Log a wash"),
        el("button", { class: "btn", type: "button", onClick: () => ctx.actions.openMember(member.id) }, "Open card"),
      ),
      el(
        "p",
        { class: "muted small" },
        `${stats.total} washes on record · ${stats.thisMonth} this month · last ${relativeDay(stats.lastWash, ctx.now) || "—"}`,
      ),
    ),
    el("div", { class: "hero-qr", html: code39Svg(barcodeText(member), { height: 54, moduleWidth: 1.5 }) }),
  );
}

function fact(label, value) {
  return el("div", { class: "fact" }, el("span", { class: "fact-label", text: label }), el("strong", { text: String(value ?? "—") }));
}

function planMix(members) {
  const rows = PLANS.map((plan) => {
    const count = members.filter((member) => member.plan === plan.id).length;
    const share = members.length ? Math.round((count / members.length) * 100) : 0;
    return el(
      "li",
      {},
      el("span", { class: `chip plan-${plan.id}`, text: plan.name }),
      el("div", { class: "load-track" }, el("div", { class: "load-bar", style: { width: `${share}%` } })),
      el("span", { class: "muted small", text: `${count} · ${share}%` }),
    );
  });
  return el("ul", { class: "load" }, rows);
}

/* ------------------------------------------------------------------ *
 * Member list
 * ------------------------------------------------------------------ */

export function renderMembers(ctx) {
  const { visibleMembers, state, actions, now } = ctx;

  if (!visibleMembers.length) {
    return el(
      "div",
      { class: "view" },
      el("div", { class: "view-head" }, el("h1", { text: "Members" }), el("button", { class: "btn primary", type: "button", onClick: () => actions.newMember() }, "＋ New member")),
      el(
        "div",
        { class: "empty" },
        el("p", { text: state.query ? `No members match “${state.query}”.` : "No memberships yet." }),
        el("button", { class: "btn", type: "button", onClick: () => actions.clearQuery() }, "Clear search"),
      ),
    );
  }

  const rows = visibleMembers.map((member) => {
    const stats = memberStats(member, now);
    return el(
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
      el(
        "td",
        {},
        el("div", { class: "cell-member" }, avatar(member), el("div", {}, el("strong", { text: member.name }), el("span", { class: "muted small", text: `joined ${formatDateTime(member.joinedAt)}` }))),
      ),
      el("td", {}, el("span", { class: "mono", text: membershipCode(member) })),
      el("td", {}, planChip(member)),
      el("td", {}, statusChip(member.status)),
      el("td", { class: "num" }, String(stats.thisMonth)),
      el("td", { class: "muted" }, relativeDay(stats.lastWash, now) || "never"),
      el(
        "td",
        { class: "actions" },
        el(
          "button",
          {
            class: "btn tiny",
            type: "button",
            onClick: (event) => {
              event.stopPropagation();
              actions.logWash(member.id);
            },
          },
          "Log wash",
        ),
      ),
    );
  });

  return el(
    "div",
    { class: "view" },
    el(
      "div",
      { class: "view-head" },
      el("div", {}, el("h1", { text: "Members" }), el("p", { class: "muted", text: `${visibleMembers.length} shown${state.query ? ` · filtered by “${state.query}”` : ""}` })),
      el("button", { class: "btn primary", type: "button", onClick: () => actions.newMember() }, "＋ New member"),
    ),
    el(
      "div",
      { class: "table-wrap" },
      el(
        "table",
        { class: "table" },
        el(
          "thead",
          {},
          el(
            "tr",
            {},
            el("th", { text: "Member" }),
            el("th", { text: "Code" }),
            el("th", { text: "Plan" }),
            el("th", { text: "Status" }),
            el("th", { class: "num", text: "Washes / mo" }),
            el("th", { text: "Last wash" }),
            el("th", { text: "" }),
          ),
        ),
        el("tbody", {}, rows),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Member detail
 * ------------------------------------------------------------------ */

export function renderMemberDetail(ctx, id) {
  const member = ctx.members.find((entry) => entry.id === id);
  if (!member) {
    return el(
      "div",
      { class: "view" },
      el("div", { class: "empty" }, el("p", { text: "That membership no longer exists." }), el("button", { class: "btn", type: "button", onClick: () => ctx.actions.setView("members") }, "Back to members")),
    );
  }

  const stats = memberStats(member, ctx.now);
  const code = barcodeText(member);

  const details = el(
    "dl",
    { class: "details" },
    detailRow("Phone", formatPhone(member.phone)),
    detailRow("Site", member.siteCode),
    detailRow("Member code", member.memberCode),
    detailRow("Plan", `${planName(member)} · ${planPrice(member)}`),
    detailRow("Status", statusChip(member.status)),
    detailRow("Joined", formatDateTime(member.joinedAt)),
    detailRow("Washes", `${stats.total} total · ${stats.thisMonth} this month`),
    detailRow("Last wash", stats.lastWash ? `${formatDateTime(stats.lastWash)} (${relativeDay(stats.lastWash, ctx.now)})` : "never"),
    detailRow("Notes", member.notes || "—"),
  );

  const history = (member.washes ?? []).length
    ? el(
        "ul",
        { class: "timeline" },
        (member.washes ?? []).map((iso) =>
          el(
            "li",
            {},
            el("span", { class: "dot" }),
            el("div", {}, el("strong", { text: formatDateTime(iso, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) }), el("span", { class: "muted small", text: relativeDay(iso, ctx.now) })),
            el("button", { class: "btn tiny ghost", type: "button", onClick: () => ctx.actions.undoWash(member.id, iso) }, "Undo"),
          ),
        ),
      )
    : el("p", { class: "muted", text: "No washes recorded for this member yet." });

  const statusButtons = STATUSES.filter((status) => status !== member.status).map((status) =>
    el(
      "button",
      { class: "btn tiny", type: "button", onClick: () => ctx.actions.setStatus(member.id, status) },
      status === "active" ? "Reactivate" : status === "paused" ? "Pause" : "Cancel membership",
    ),
  );

  return el(
    "div",
    { class: "view" },
    el(
      "div",
      { class: "view-head" },
      el(
        "div",
        { class: "head-stack" },
        el("button", { class: "btn tiny ghost", type: "button", onClick: () => ctx.actions.setView("members") }, "← Members"),
        el("h1", {}, member.name, " ", statusChip(member.status)),
      ),
      el(
        "div",
        { class: "btn-row" },
        el("button", { class: "btn primary", type: "button", onClick: () => ctx.actions.logWash(member.id) }, "✓ Log a wash"),
        el("button", { class: "btn", type: "button", onClick: () => ctx.actions.openForm(member.id) }, "Edit"),
        el("button", { class: "btn", type: "button", onClick: () => window.print() }, "Print card"),
      ),
    ),
    el(
      "div",
      { class: "grid detail" },
      el(
        "section",
        { class: "card card-tight" },
        el(
          "div",
          { class: "membership-card" },
          el(
            "div",
            { class: "membership-top" },
            el("span", { class: "brand", text: "DASH" }),
            el("span", { class: "brand-sub", text: "CAR WASH · UNLIMITED" }),
          ),
          el(
            "div",
            { class: "membership-mid" },
            el("div", {}, el("span", { class: "card-label", text: "Member" }), el("strong", { class: "card-name", text: member.name })),
            el("div", { class: "card-plan" }, el("span", { class: "chip plan-" + member.plan }, planName(member).toUpperCase())),
          ),
          el("div", { class: "card-barcode", html: code39Svg(code, { height: 58, moduleWidth: 1.7 }) || "" }),
          el(
            "div",
            { class: "membership-bottom" },
            el("span", { class: "mono", text: membershipCode(member) }),
            el("span", { class: "mono", text: formatPhone(member.phone) }),
            el("span", { class: "mono", text: member.status.toUpperCase() }),
          ),
        ),
        el("p", { class: "muted small center", text: "Code 39 · scan at the gate, or read the code to the attendant." }),
      ),
      sectionCard("Membership details", "Site 906 · entered from the DASH card", details, el("div", { class: "btn-row" }, statusButtons, el("button", { class: "btn tiny danger", type: "button", onClick: () => ctx.actions.remove(member.id) }, "Delete"))),
    ),
    sectionCard("Wash history", `${(member.washes ?? []).length} recorded visit${(member.washes ?? []).length === 1 ? "" : "s"}`, history),
  );
}

function detailRow(label, value) {
  return el("div", { class: "detail-row" }, el("dt", { text: label }), el("dd", {}, value));
}

/* ------------------------------------------------------------------ *
 * Member form (create + edit)
 * ------------------------------------------------------------------ */

export function renderMemberForm(ctx, id) {
  const existing = id ? ctx.members.find((member) => member.id === id) : null;
  const draft = {
    name: existing?.name ?? "",
    phone: existing ? formatPhone(existing.phone) : "",
    siteCode: existing?.siteCode ?? "906",
    memberCode: existing?.memberCode ?? "",
    plan: existing?.plan ?? "elite",
    status: existing?.status ?? "active",
    notes: existing?.notes ?? "",
  };

  const fields = {};
  const errorNodes = {};

  const field = (name, label, input, hint) => {
    const error = el("span", { class: "field-error" });
    errorNodes[name] = error;
    input.setAttribute("data-key", name);
    return el(
      "label",
      { class: "field" },
      el("span", { class: "field-label", text: label }),
      input,
      hint ? el("span", { class: "field-hint muted small", text: hint }) : null,
      error,
    );
  };

  function textInput(name, options = {}) {
    const input = el("input", {
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
    const select = el(
      "select",
      {
        class: "input",
        onChange: () => {
          fields[name] = select.value;
          errorNodes[name].textContent = "";
        },
      },
      options.map((option) => el("option", { value: option.value, selected: option.value === (draft[name] ?? "") ? true : null }, option.label)),
    );
    fields[name] = select.value;
    return select;
  }

  const form = el(
    "form",
    {
      class: "form",
      onSubmit: (event) => {
        event.preventDefault();
        const payload = { ...draft, ...fields };
        const result = existing ? ctx.actions.update(existing.id, payload) : ctx.actions.create(payload);
        if (result.ok) return;
        for (const [key, message] of Object.entries(result.errors)) {
          if (errorNodes[key]) errorNodes[key].textContent = message;
        }
      },
    },
    el(
      "div",
      { class: "grid two" },
      field("name", "Member name", textInput("name", { value: draft.name, placeholder: "Dash Car Wash" })),
      field("phone", "Phone", textInput("phone", { value: draft.phone, placeholder: "(802) 428-9009", inputmode: "tel" }), "10 digits — used to spot duplicates."),
      field("siteCode", "Site code", textInput("siteCode", { value: draft.siteCode, placeholder: "906" })),
      field("memberCode", "Membership code", textInput("memberCode", { value: draft.memberCode, placeholder: "S12" }), "Letters, digits and - . / + % $"),
      field(
        "plan",
        "Plan",
        selectInput(
          "plan",
          PLANS.map((plan) => ({ value: plan.id, label: `${plan.name} — $${plan.price.toFixed(2)}/mo` })),
        ),
      ),
      field(
        "status",
        "Status",
        selectInput(
          "status",
          STATUSES.map((status) => ({ value: status, label: status[0].toUpperCase() + status.slice(1) })),
        ),
      ),
    ),
    field("notes", "Notes", textInput("notes", { value: draft.notes, placeholder: "Optional — vehicle, preferences, reminders." })),
    el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn primary", type: "submit" }, existing ? "Save changes" : "Create membership"),
      el("button", { class: "btn ghost", type: "button", onClick: () => ctx.actions.cancelForm(existing?.id ?? null) }, "Cancel"),
    ),
  );

  return el(
    "div",
    { class: "view narrow" },
    el(
      "div",
      { class: "view-head" },
      el("div", {}, el("h1", { text: existing ? "Edit membership" : "New membership" }), el("p", { class: "muted", text: existing ? `Updating ${existing.name}` : "Register a DASH unlimited wash membership." })),
    ),
    el("section", { class: "card" }, form),
  );
}
