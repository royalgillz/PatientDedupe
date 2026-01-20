// Display helpers. Dates render like "12 Jun 2025" in cells (never ISO), with the
// exact timestamp available on hover elsewhere.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(iso)}, ${hh}:${mm}`;
}

export function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const score2 = (n: number) => n.toFixed(2);

export const FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  dob: "Date of birth",
  gender: "Gender",
  address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  mrn: "MRN",
  source_system: "Source",
};
