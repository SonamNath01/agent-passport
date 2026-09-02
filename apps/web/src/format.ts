// Small shared formatters used across the console — money in paise and
// timestamps are the only two things enough screens need identically
// formatted to justify a shared file over local copies.

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export function truncateMiddle(value: string, headLen = 20): string {
  if (value.length <= headLen + 8) return value;
  return `${value.slice(0, headLen)}…${value.slice(-8)}`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour12: false });
}
