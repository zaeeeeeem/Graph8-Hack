"use client";

// The open task / lead lives in the URL (`?task=6`, `?lead=<id>`): shareable, survives reload,
// Back closes it. Only one drawer at a time — opening one clears the other.
// Native history methods sync with Next's useSearchParams without a server round-trip.

export function openTask(n: number, { replace = false }: { replace?: boolean } = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set("task", String(n));
  url.searchParams.delete("lead");
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

export function closeTask() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("task")) return;
  url.searchParams.delete("task");
  window.history.replaceState(null, "", url);
}

export function openLead(id: string, { replace = false }: { replace?: boolean } = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set("lead", id);
  url.searchParams.delete("task");
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

export function closeLead() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("lead")) return;
  url.searchParams.delete("lead");
  window.history.replaceState(null, "", url);
}

/** Pipeline stage filter (`?stage=replied`) — replaces, does not add history entries. */
export function setStageFilter(key: string | null) {
  const url = new URL(window.location.href);
  if (key) url.searchParams.set("stage", key);
  else url.searchParams.delete("stage");
  window.history.replaceState(null, "", url);
}

/** Generic filter in the URL (e.g. `?kind=standup`) — replaces, does not add history entries. */
export function setFilterParam(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState(null, "", url);
}
