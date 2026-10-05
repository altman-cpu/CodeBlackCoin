/**
 * DOM is not available in Node, so tests provide a tiny localStorage stand-in.
 * These tests exercise the same store the browser uses.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createStore, createSeed, memberStats, clubStats, STORAGE_KEY } from "../public/lib/store.js";
import { validateMember, searchMembers, membershipCode, barcodeText, formatPhone, weekBuckets, thisMonthCount } from "../public/lib/format.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const primaryDraft = {
  name: "Dash Car Wash",
  phone: "8024289009",
  siteCode: "906",
  memberCode: "S12",
  plan: "elite",
  status: "active",
  notes: "",
};

test("seed ships the membership the console was built for", () => {
  const seed = createSeed();
  const primary = seed.members.find((member) => member.id === "mbr-906-s12");
  assert.ok(primary, "primary member exists");
  assert.equal(formatPhone(primary.phone), "(802) 428-9009");
  assert.equal(membershipCode(primary), "906-S12");
  assert.equal(primary.plan, "elite");
  assert.equal(primary.status, "active");
});

test("add() persists a member and rejects duplicates by phone", () => {
  const store = createStore(memoryStorage());
  const created = store.add({ ...primaryDraft, name: "Ana Ruiz", phone: "702 555 0111", memberCode: "ELT-9001" });
  assert.equal(created.ok, true);
  assert.equal(store.all().length, createSeed().members.length + 1);
  assert.equal(created.member.washes.length, 0);

  const duplicate = store.add({ ...primaryDraft, name: "Copy Cat", phone: "7025550111" });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.phone, /Already used/);
});

test("validateMember flags missing fields and normalizes input", () => {
  const result = validateMember({ name: "a", phone: "123", siteCode: "", memberCode: "", plan: "platinum" });
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["memberCode", "name", "phone", "plan", "siteCode"]);

  const good = validateMember({ ...primaryDraft, name: "  dash   car wash ", plan: "Elite" });
  assert.equal(good.ok, true);
  assert.equal(good.value.name, "dash car wash");
  assert.equal(good.value.plan, "elite");
});

test("logWash prepends a timestamp and undoWash removes only that entry", () => {
  const store = createStore(memoryStorage());
  const at = new Date("2026-10-05T17:30:00Z");
  const logged = store.logWash("mbr-906-s12", at);
  assert.equal(logged.ok, true);
  assert.equal(logged.member.washes[0], at.toISOString());

  const undo = store.undoWash("mbr-906-s12", at.toISOString());
  assert.equal(undo.ok, true);
  assert.ok(!undo.member.washes.includes(at.toISOString()));
});

test("status changes and removal round-trip through storage", () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.setStatus("mbr-906-s12", "paused");
  assert.equal(store.find("mbr-906-s12").status, "paused");

  const reloaded = createStore(storage);
  assert.equal(reloaded.find("mbr-906-s12").status, "paused");

  reloaded.remove("mbr-906-s12");
  assert.equal(reloaded.find("mbr-906-s12"), null);
  assert.ok(storage.getItem(STORAGE_KEY).includes("mbr-906-elt4412"));
});

test("corrupt or unknown storage falls back to the seed", () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, "{not json");
  assert.equal(createStore(storage).all().length, createSeed().members.length);

  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, members: [] }));
  assert.equal(createStore(storage).all().length, createSeed().members.length);
});

test("searchMembers matches name, code and phone digits", () => {
  const members = createSeed().members;
  assert.equal(searchMembers(members, "priya")[0].name, "Priya Raman");
  assert.equal(searchMembers(members, "906-s12")[0].id, "mbr-906-s12");
  assert.equal(searchMembers(members, "8024289009")[0].id, "mbr-906-s12");
  assert.equal(searchMembers(members, "  ").length, members.length);
});

test("stats and week buckets line up with the calendar", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const member = { washes: ["2026-10-05T09:00:00Z", "2026-10-04T10:00:00Z", "2026-09-20T10:00:00Z"] };
  const stats = memberStats(member, now);
  assert.equal(stats.total, 3);
  assert.equal(stats.thisMonth, 2);
  assert.equal(stats.lastWash, "2026-10-05T09:00:00Z");

  // weeks are Monday-based; 2026-10-05 is a Monday, so Oct 4 sits in the week before
  const buckets = weekBuckets(member.washes, 4, now);
  assert.equal(buckets.length, 4);
  assert.equal(buckets[3], 1, "Oct 5 lands in the current week");
  assert.equal(buckets[2], 1, "Oct 4 lands in the previous week");
  assert.equal(buckets[0], 1, "Sep 20 lands three weeks back");

  assert.equal(thisMonthCount(member.washes, now), 2);
  assert.equal(barcodeText({ siteCode: "906", memberCode: "S12" }), "906S12");
  assert.equal(clubStats(createSeed().members, now).members, 4);
});
