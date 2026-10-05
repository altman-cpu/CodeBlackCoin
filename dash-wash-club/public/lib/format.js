/**
 * Pure helpers shared by the browser app and the Node test suite.
 * This module must stay DOM-free so it can run in both environments.
 */

export const PLANS = [
  { id: "bath", name: "Bath", price: 24.99 },
  { id: "shine", name: "Shine", price: 29.99 },
  { id: "elite", name: "Elite", price: 29.99 },
];

export const STATUSES = ["active", "paused", "canceled"];

/** Digits only, e.g. "(802) 428-9009" -> "8024289009". */
export const digitsOnly = (value) => String(value ?? "").replace(/\D+/g, "");

/** Normalize a US phone number to 10 digits (strips a leading country code). */
export function normalizePhone(value) {
  let digits = digitsOnly(value);
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
}

/** "(802) 428-9009" when we have 10 digits, otherwise the trimmed input. */
export function formatPhone(value) {
  const digits = normalizePhone(value);
  if (digits.length !== 10) return String(value ?? "").trim();
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Uppercase and keep only characters Code 39 can encode. */
export function sanitizeCodePart(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z. \-$/+%]/g, "")
    .trim();
}

/** Human-readable membership code, e.g. "906-S12". */
export function membershipCode(member) {
  const site = sanitizeCodePart(member?.siteCode).replace(/[\s-]+/g, "");
  const code = sanitizeCodePart(member?.memberCode).replace(/[\s-]+/g, "");
  return [site, code].filter(Boolean).join("-");
}

/** Same code, stripped down to the subset we draw as bars, e.g. "906S12". */
export function barcodeText(member) {
  return membershipCode(member).replace(/[^0-9A-Z]/g, "");
}

export function planByName(name) {
  const key = String(name ?? "").trim().toLowerCase();
  return PLANS.find((plan) => plan.id === key || plan.name.toLowerCase() === key) ?? null;
}

export function planName(member) {
  return planByName(member?.plan)?.name ?? "Member";
}

export function planPrice(member) {
  const plan = planByName(member?.plan);
  return plan ? `$${plan.price.toFixed(2)}/mo` : "";
}

export function initials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

/** Free-text search across name, phone, site, code, plan and notes. */
export function searchMembers(members, query) {
  const text = String(query ?? "").trim().toLowerCase();
  if (!text) return members.slice();
  const queryDigits = digitsOnly(text);
  return members.filter((member) => {
    const haystack = [
      member?.name,
      member?.plan,
      member?.status,
      member?.siteCode,
      member?.memberCode,
      member?.notes,
      membershipCode(member),
    ]
      .join(" ")
      .toLowerCase();
    if (haystack.includes(text)) return true;
    if (queryDigits.length >= 2 && digitsOnly(member?.phone).includes(queryDigits)) return true;
    return false;
  });
}

/**
 * Validate a member draft coming from the form.
 * Returns { ok, errors, value } where value is the normalized record.
 */
export function validateMember(draft, others = [], currentId = null) {
  const errors = {};

  const name = String(draft?.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) errors.name = "Enter a name with at least 2 characters.";

  const phone = normalizePhone(draft?.phone);
  if (phone.length !== 10) errors.phone = "Enter a 10-digit phone number.";

  const siteCode = sanitizeCodePart(draft?.siteCode).replace(/[\s-]+/g, "").slice(0, 6);
  if (!siteCode) errors.siteCode = "Site code is required.";

  const memberCode = sanitizeCodePart(draft?.memberCode).replace(/[\s-]+/g, "").slice(0, 12);
  if (!memberCode) errors.memberCode = "Membership code is required.";

  const plan = planByName(draft?.plan)?.id ?? null;
  if (!plan) errors.plan = "Choose a plan.";

  const status = STATUSES.includes(draft?.status) ? draft.status : "active";

  const duplicate = others.find(
    (member) => member?.id !== currentId && normalizePhone(member?.phone) === phone && phone.length === 10,
  );
  if (duplicate && !errors.phone) {
    errors.phone = `Already used by ${duplicate.name || "another member"}.`;
  }

  const notes = String(draft?.notes ?? "").trim().slice(0, 240);

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { name, phone, siteCode, memberCode, plan, status, notes },
  };
}

/** "Sep 27, 2026" style formatting. */
export function formatDateTime(iso, options = { month: "short", day: "numeric", year: "numeric" }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** "today", "yesterday", "4 days ago", "3 weeks ago", then a date. */
export function relativeDay(iso, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return formatDateTime(iso);
}

/** How many of the timestamps fall inside the current calendar month. */
export function thisMonthCount(timestamps, now = new Date()) {
  const month = now.getMonth();
  const year = now.getFullYear();
  return timestamps.filter((iso) => {
    const date = new Date(iso);
    return !Number.isNaN(date.getTime()) && date.getMonth() === month && date.getFullYear() === year;
  }).length;
}

/**
 * Bucket timestamps into per-week counts (Monday-based), oldest week first.
 * The last bucket is the current week.
 */
export function weekBuckets(timestamps, weeks = 8, now = new Date()) {
  const buckets = new Array(weeks).fill(0);
  const startOfWeek = (value) => {
    const date = startOfDay(value);
    const offset = (date.getDay() + 6) % 7; // Monday = 0
    date.setDate(date.getDate() - offset);
    return date;
  };
  const currentWeek = startOfWeek(now);
  for (const iso of timestamps) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    const weeksAgo = Math.round((currentWeek - startOfWeek(date)) / 604800000);
    if (weeksAgo >= 0 && weeksAgo < weeks) buckets[weeks - 1 - weeksAgo] += 1;
  }
  return buckets;
}
