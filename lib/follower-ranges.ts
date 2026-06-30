export type FollowerRangeId =
  | "under-10k"
  | "10k-50k"
  | "50k-100k"
  | "100k-500k"
  | "500k-plus";

export type NumericRange = {
  id: FollowerRangeId;
  label: string;
  min: number;
  max: number | null;
};

export const FOLLOWER_RANGES: NumericRange[] = [
  { id: "under-10k", label: "Under 10K", min: 0, max: 9999 },
  { id: "10k-50k", label: "10K – 50K", min: 10000, max: 50000 },
  { id: "50k-100k", label: "50K – 100K", min: 50000, max: 100000 },
  { id: "100k-500k", label: "100K – 500K", min: 100000, max: 500000 },
  { id: "500k-plus", label: "500K+", min: 500000, max: null },
];

export function getFollowerRange(id: string): NumericRange | undefined {
  return FOLLOWER_RANGES.find((r) => r.id === id);
}

export function countInRange(count: number, range: NumericRange): boolean {
  if (count < range.min) return false;
  if (range.max !== null && count > range.max) return false;
  return true;
}

export function formatRangeLabel(range: NumericRange): string {
  if (range.max === null) return `${range.min.toLocaleString()}+ followers`;
  if (range.min === 0) return `Under ${(range.max + 1).toLocaleString()} followers`;
  return `${range.min.toLocaleString()} – ${range.max.toLocaleString()} followers`;
}
