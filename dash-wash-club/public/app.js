/**
 * App shell, hash routing and action wiring for the DASH Wash Club console.
 */
import { createStore, PRIMARY_MEMBERSHIP } from "./lib/store.js";
import { searchMembers, membershipCode, formatPhone } from "./lib/format.js";
import { renderDashboard, renderMembers, renderMemberDetail, renderMemberForm, element } from "./views.js";

const store = createStore(window.localStorage);

const state = {
  view: "dashboard", // dashboard | members | member | form
  selectedId: null,
  editingId: null,
  query: "",
};

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  if (!parts.length) return { view: "dashboard" };
  if (parts[0] === "new") return { view: "form", editingId: null };
  if (parts[0] === "members" && parts[1] && parts[2] === "edit") return { view: "form", editingId: parts[1] };
  if (parts[0] === "members" && parts[1]) return { view: "member", selectedId: parts[1] };
  if (parts[0] === "members") return { view: "members" };
  return { view: "dashboard" };
}

function applyRoute() {
  Object.assign(state, { view: "dashboard", selectedId: null, editingId: null }, parseHash());
  render();
}

const go = (hash) => {
  if (window.location.hash === hash) applyRoute();
  else window.location.hash = hash;
};

window.addEventListener("hashchange", applyRoute);

/* ------------------------------------------------------------------ *
 * Messages shown in the bottom-right corner
 * ------------------------------------------------------------------ */

let toastTimer = null;

function toast(message, tone = "note") {
  const node = shell.toast;
  node.textContent = message;
  node.className = `toast show ${tone}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.className = "toast";
  }, 2800);
}

/* ------------------------------------------------------------------ *
 * Actions passed to the views
 * ------------------------------------------------------------------ */

const actions = {
  openMember: (id) => go(`/members/${id}`),
  setView: (view) => go(view === "members" ? "/members" : "/"),
  newMember: () => go("/new"),
  openForm: (id) => go(`/members/${id}/edit`),
  cancelForm: (id) => go(id ? `/members/${id}` : "/members"),
  setQuery: (value) => {
    state.query = value;
    if (state.view !== "members" && state.view !== "dashboard") state.view = "members";
    render();
    return state.query;
  },
  clearQuery: () => {
    state.query = "";
    shell.search.value = "";
    render();
  },
  logWash: (id) => {
    const result = store.logWash(id);
    if (!result.ok) return toast("Could not log that wash.", "error");
    toast(`Wash logged for ${result.member.name} — ${result.member.washes.length} washes on record.`, "success");
    render();
  },
  undoWash: (id, iso) => {
    store.undoWash(id, iso);
    toast("Wash entry removed.");
    render();
  },
  setStatus: (id, status) => {
    const result = store.setStatus(id, status);
    if (!result.ok) return toast("Could not update that membership.", "error");
    toast(`${result.member.name} is now ${status}.`);
    render();
  },
  remove: (id) => {
    const member = store.find(id);
    if (!member) return;
    if (!window.confirm(`Delete ${member.name} (${membershipCode(member)}) and their wash history?`)) return;
    store.remove(id);
    toast(`${member.name} was deleted.`);
    go("/members");
  },
  reset: () => {
    if (!window.confirm("Restore the starting list? Any memberships you added will be lost.")) return;
    store.reset();
    shell.search.value = "";
    state.query = "";
    toast("Original memberships restored.");
    render();
  },
  create: (payload) => {
    const result = store.add(payload);
    if (!result.ok) return result;
    toast(`${result.member.name} added — ${membershipCode(result.member)}.`, "success");
    go(`/members/${result.member.id}`);
    return result;
  },
  update: (id, payload) => {
    const result = store.update(id, payload);
    if (!result.ok) return result;
    toast("Membership updated.", "success");
    go(`/members/${id}`);
    return result;
  },
};

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

function buildShell() {
  const search = element("input", {
    class: "input search",
    type: "search",
    placeholder: "Search by name, membership code or phone number…",
    "aria-label": "Search memberships",
    onInput: (event) => actions.setQuery(event.target.value),
    onKeydown: (event) => {
      if (event.key === "Escape") actions.clearQuery();
    },
  });

  const navButtons = [
    { label: "My dashboard", hash: "/", view: "dashboard" },
    { label: "Member directory", hash: "/members", view: "members" },
  ].map((entry) =>
    element("a", { class: "nav-link", href: `#${entry.hash}`, dataset: { nav: entry.view }, text: entry.label }),
  );

  const toastNode = element("div", { class: "toast", role: "status", "aria-live": "polite" });

  const root = element(
    "div",
    { class: "app" },
    element(
      "header",
      { class: "topbar" },
      element(
        "div",
        { class: "brand-block" },
        element("span", { class: "logo", text: "DASH" }),
        element(
          "div",
          {},
          element("h1", { class: "brand-title", text: "Wash Club" }),
          element("span", { class: "brand-sub", text: `Membership ${membershipCode(PRIMARY_MEMBERSHIP)} · ${formatPhone(PRIMARY_MEMBERSHIP.phone)}` }),
        ),
      ),
      element("nav", { class: "nav" }, navButtons),
      element("div", { class: "topbar-tools" }, search, element("button", { class: "button ghost small", type: "button", onClick: actions.reset }, "Reset data")),
    ),
    element("main", { class: "main", id: "main" }),
    element(
        "footer",
        { class: "footer" },
        element("span", { text: `DASH Wash Club · membership ${membershipCode(PRIMARY_MEMBERSHIP)} · everything stays in this browser` }),
      ),
    toastNode,
  );

  return { root, main: root.querySelector("#main"), search, nav: navButtons, toast: toastNode };
}

const shell = buildShell();

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

function currentView() {
  const members = store.all();
  const context = {
    members,
    visibleMembers: searchMembers(members, state.query),
    state,
    actions,
    now: new Date(),
  };

  if (state.view === "form") return renderMemberForm(context, state.editingId);
  if (state.view === "member") return renderMemberDetail(context, state.selectedId);
  if (state.view === "members") return renderMembers(context);
  return renderDashboard(context);
}

function render() {
  shell.main.replaceChildren(currentView());
  for (const link of shell.nav) {
    const active = link.dataset.nav === state.view || (link.dataset.nav === "members" && state.view === "member");
    link.classList.toggle("active", active);
  }
}

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing = target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
  if (event.key === "/" && !typing) {
    event.preventDefault();
    shell.search.focus();
  }
});

document.body.append(shell.root);
applyRoute();

// Surface a small hint in the console for anyone poking around the data model.
console.info(
  "DASH Wash Club ready. Your membership code is 906-S12 — log washes, print the card, or add members. Everything is stored in this browser.",
);
