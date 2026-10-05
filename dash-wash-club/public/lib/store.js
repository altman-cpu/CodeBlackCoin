/**
 * Persistence + domain logic for the DASH Wash Club console.
 * It touches no browser document objects, so the web app and the Node test suite share it.
 */

import { thisMonthCount, validateMember, membershipCode } from "./format.js";

export const STORAGE_KEY = "dash-wash-club/v1";
export const SCHEMA_VERSION = 1;

const DAY = 86400000;
const daysAgo = (days, now = new Date()) => new Date(now.getTime() - days * DAY).toISOString();

/** The membership details this console was created for. */
export const PRIMARY_MEMBERSHIP = {
  name: "Dash Car Wash",
  phone: "8024289009",
  siteCode: "906",
  memberCode: "S12",
  plan: "elite",
  status: "active",
  notes: "Your Elite membership was entered on 5 October 2026 — site code 906, membership code S12.",
  vehicle: "2021 Toyota Camry — midnight black",
  preferredLocation: "Craig Road, North Las Vegas",
};

export function createSeed(now = new Date()) {
  const members = [
    {
      ...PRIMARY_MEMBERSHIP,
      id: "mbr-906-s12",
      joinedAt: daysAgo(96, now),
      washes: [daysAgo(21, now), daysAgo(12, now), daysAgo(5, now), daysAgo(2, now)],
    },
    {
      id: "mbr-906-4412",
      name: "Marcus Webb",
      phone: "7025550147",
      siteCode: "906",
      memberCode: "4412",
      plan: "elite",
      status: "active",
      notes: "Prefers the tunnel on weekday mornings.",
      vehicle: "2016 Ford F-150 — silver",
      preferredLocation: "Craig Road, North Las Vegas",
      joinedAt: daysAgo(212, now),
      washes: [daysAgo(26, now), daysAgo(19, now), daysAgo(12, now), daysAgo(4, now), daysAgo(0, now)],
    },
    {
      id: "mbr-812-2277",
      name: "Priya Raman",
      phone: "7025550188",
      siteCode: "812",
      memberCode: "2277",
      plan: "shine",
      status: "active",
      notes: "",
      vehicle: "2022 Honda CR-V — grey",
      preferredLocation: "Centennial Parkway, Las Vegas",
      joinedAt: daysAgo(140, now),
      washes: [daysAgo(45, now), daysAgo(31, now), daysAgo(17, now), daysAgo(9, now)],
    },
    {
      id: "mbr-906-8891",
      name: "Tomas Delgado",
      phone: "7025550163",
      siteCode: "906",
      memberCode: "8891",
      plan: "bath",
      status: "paused",
      notes: "Paused for the season — resume in spring.",
      vehicle: "2014 Chevrolet Silverado — blue",
      preferredLocation: "Craig Road, North Las Vegas",
      joinedAt: daysAgo(305, now),
      washes: [daysAgo(120, now), daysAgo(96, now), daysAgo(71, now)],
    },
  ];

  return { version: SCHEMA_VERSION, members };
}

export function createStore(storage) {
  let state = load();

  function persist() {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Could not save DASH Wash Club data:", error);
    }
  }

  function load() {
    const fallback = createSeed();
    if (!storage) return fallback;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.members)) return fallback;
      return { version: SCHEMA_VERSION, members: parsed.members };
    } catch (error) {
      console.warn("Stored membership data was unreadable, starting fresh:", error);
      return fallback;
    }
  }

  function find(id) {
    return state.members.find((member) => member.id === id) ?? null;
  }

  function newId(name, siteCode, memberCode) {
    const slug = `${siteCode}-${memberCode}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
    let id = `mbr-${slug || "member"}`;
    let suffix = 2;
    while (find(id)) id = `mbr-${slug}-${suffix++}`;
    return id;
  }

  return {
    get state() {
      return state;
    },
    all() {
      return state.members.slice();
    },
    find,
    byCode(code) {
      return state.members.filter((member) => membershipCode(member).includes(String(code).toUpperCase()));
    },
    add(draft) {
      const result = validateMember(draft, state.members);
      if (!result.ok) return { ok: false, errors: result.errors };
      const member = {
        id: newId(result.value.name, result.value.siteCode, result.value.memberCode),
        ...result.value,
        joinedAt: new Date().toISOString(),
        washes: [],
      };
      state.members = [member, ...state.members];
      persist();
      return { ok: true, member };
    },
    update(id, draft) {
      const current = find(id);
      if (!current) return { ok: false, errors: { form: "Member not found." } };
      const result = validateMember(draft, state.members, id);
      if (!result.ok) return { ok: false, errors: result.errors };
      const updated = { ...current, ...result.value };
      state.members = state.members.map((member) => (member.id === id ? updated : member));
      persist();
      return { ok: true, member: updated };
    },
    remove(id) {
      const before = state.members.length;
      state.members = state.members.filter((member) => member.id !== id);
      if (state.members.length === before) return { ok: false };
      persist();
      return { ok: true };
    },
    logWash(id, at = new Date()) {
      const member = find(id);
      if (!member) return { ok: false, error: "not-found" };
      member.washes = [at.toISOString(), ...(member.washes ?? [])];
      persist();
      return { ok: true, member, count: member.washes.length };
    },
    undoWash(id, iso) {
      const member = find(id);
      if (!member) return { ok: false };
      member.washes = (member.washes ?? []).filter((entry) => entry !== iso);
      persist();
      return { ok: true, member };
    },
    setStatus(id, status) {
      const member = find(id);
      if (!member) return { ok: false, error: "not-found" };
      member.status = status;
      persist();
      return { ok: true, member };
    },
    reset() {
      state = createSeed();
      persist();
      return state;
    },
  };
}

export function memberStats(member, now = new Date()) {
  const washes = member?.washes ?? [];
  return {
    total: washes.length,
    thisMonth: thisMonthCount(washes, now),
    lastWash: washes[0] ?? null,
  };
}

export function clubStats(members, now = new Date()) {
  const active = members.filter((member) => member.status === "active").length;
  const washesThisMonth = members.reduce((sum, member) => sum + memberStats(member, now).thisMonth, 0);
  const totalWashes = members.reduce((sum, member) => sum + (member.washes?.length ?? 0), 0);
  return {
    members: members.length,
    active,
    washesThisMonth,
    totalWashes,
    avgPerMember: members.length ? washesThisMonth / members.length : 0,
  };
}
