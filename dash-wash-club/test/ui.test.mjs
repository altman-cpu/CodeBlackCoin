/**
 * End-to-end smoke test of the rendered user interface.
 *
 * jsdom is an optional devDependency: with it installed (`npm install` inside
 * dash-wash-club) this test drives the real app — dashboard, search, member
 * detail, barcode card, wash logging, status changes and the create form.
 * Without it the test is skipped so `node --test` still passes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "..", "public");

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  /* optional dependency not installed — the test below is skipped */
}

const skip = JSDOM ? false : "jsdom is not installed (run `npm install` in dash-wash-club)";

test("ui smoke: dashboard, search, card, wash logging, status and the create form", { skip }, async (t) => {
  const dom = new JSDOM(readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8"), {
    url: "http://localhost:4173/#/",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  t.after(() => window.close());

  const restore = [];
  for (const key of ["window", "document", "Node", "HTMLElement"]) {
    restore.push([key, globalThis[key]]);
    globalThis[key] = key === "window" ? window : window[key];
  }
  t.after(() => {
    for (const [key, value] of restore) globalThis[key] = value;
  });

  window.confirm = () => true;
  window.print = () => {};

  const errors = [];
  window.addEventListener("error", (event) => errors.push(event.message));

  await import(`${PUBLIC_DIR}/app.js`);

  const q = (selector) => document.querySelector(selector);
  const qa = (selector) => [...document.querySelectorAll(selector)];
  const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const goTo = async (hash) => {
    window.location.hash = hash;
    window.dispatchEvent(new window.Event("hashchange"));
    await tick();
  };

  /* dashboard */
  assert.ok(q(".topbar") && q("#main"), "shell renders");
  assert.match(q(".hero").textContent, /906-S12/, "hero shows the 906-S12 membership");
  assert.match(q(".hero").textContent, /\(802\) 428-9009/, "hero shows the phone number");
  assert.match(q(".hero").textContent, /Your membership on file/, "hero addresses the member directly");
  assert.match(q(".topbar").textContent, /Membership 906-S12/, "header shows the membership code");
  assert.match(q(".hero").textContent, /2021 Toyota Camry/, "hero shows the vehicle");
  assert.match(q(".hero").textContent, /Craig Road, North Las Vegas/, "hero shows the favourite location");
  assert.ok(q(".hero-barcode svg rect[width]"), "hero barcode draws bars");
  assert.equal(qa(".stat").length, 4, "four statistic cards");
  assert.equal(qa(".chart-column").length, 8, "eight week buckets");
  assert.ok(
    qa(".chart-label").every((node) => /^(this week|\d{1,2}\/\d{1,2})$/.test(node.textContent)),
    "week labels are spelled out, not abbreviated",
  );
  assert.ok(qa(".feed li").length > 0, "recent activity is populated");
  assert.ok(qa(".avatar").length > 0, "member badges render");
  assert.ok(
    qa(".avatar").every((node) => !/[A-Za-z0-9]/.test(node.textContent)),
    "member badges stand in for names without abbreviating them to initials",
  );

  /* log a wash from the hero */
  const washCount = () => Number(/(\d+) washes on record/.exec(q(".hero").textContent)?.[1] ?? -1);
  const before = washCount();
  click(qa(".hero-actions .button.primary")[0]);
  await tick();
  assert.equal(washCount(), before + 1, "logging a wash increments the hero count");
  assert.match(q(".toast").textContent, /Wash logged/, "toast confirms the wash");

  /* member table + search */
  await goTo("#/members");
  assert.equal(qa(".table tbody tr").length, 4, "member table lists the seeded members");
  const search = q(".search");
  search.value = "priya";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(qa(".table tbody tr").length, 1, "search filters the table");
  search.value = "";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(qa(".table tbody tr").length, 4, "clearing the search restores rows");

  /* member detail + card */
  await goTo("#/members/mbr-906-s12");
  assert.ok(q(".membership-card"), "membership card renders");
  assert.match(q(".card-barcode").innerHTML, /barcode for 906S12/, "card barcode encodes 906S12");
  assert.match(q(".membership-card").textContent, /906-S12/, "card prints the full code");
  assert.match(q(".membership-card").textContent, /MEMBER SINCE [A-Z]+ \d{4}/, "card prints the join month in full");
  assert.ok(qa(".timeline li").length >= 4, "wash history is listed");

  const timelineBefore = qa(".timeline li").length;
  click(qa(".timeline .button")[0]);
  await tick();
  assert.equal(qa(".timeline li").length, timelineBefore - 1, "undo removes one visit");

  const button = (label) => qa(".button").find((node) => node.textContent.trim() === label);
  click(button("Pause"));
  await tick();
  assert.match(q(".view-head").textContent, /paused/, "status chip goes to paused");
  click(button("Reactivate"));
  await tick();
  assert.match(q(".view-head").textContent, /active/, "status chip goes back to active");

  /* create form validation + create */
  await goTo("#/new");
  const form = q("form");
  const setField = (name, value) => {
    const input = form.querySelector(`[data-key="${name}"]`);
    input.value = value;
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  setField("phone", "702");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.match(
    form.querySelector('[data-key="phone"]').closest(".field").querySelector(".field-error").textContent,
    /10-digit/,
    "invalid phone is reported",
  );

  setField("name", "Test Member");
  setField("phone", "(702) 555-0199");
  setField("memberCode", "s12");
  setField("siteCode", "906");
  setField("vehicle", "2019 Subaru Outback — white");
  setField("preferredLocation", "Centennial Parkway, Las Vegas");
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  assert.match(q(".view-head").textContent, /Test Member/, "new member opens after saving");
  assert.match(q("#main").textContent, /No washes recorded/, "new member starts with an empty history");

  const stored = JSON.parse(window.localStorage.getItem("dash-wash-club/v1"));
  const saved = stored.members.find((member) => member.name === "Test Member");
  assert.ok(saved, "member is persisted");
  assert.equal(saved.vehicle, "2019 Subaru Outback — white", "vehicle is saved");
  assert.equal(saved.preferredLocation, "Centennial Parkway, Las Vegas", "favourite location is saved");
  assert.equal(errors.length, 0, `no uncaught window errors: ${errors.join("; ")}`);
});
