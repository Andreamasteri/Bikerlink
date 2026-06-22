export function formatDateInput(val: string): string {
  const nums = val.replace(/\D/g, "");
  if (nums.length <= 2) return nums;
  if (nums.length <= 4) return nums.slice(0, 2) + "/" + nums.slice(2);
  return nums.slice(0, 2) + "/" + nums.slice(2, 4) + "/" + nums.slice(4, 8);
}

export function formatTimeInput(val: string): string {
  const nums = val.replace(/\D/g, "");
  if (nums.length <= 2) return nums;
  return nums.slice(0, 2) + ":" + nums.slice(2, 4);
}

export function autoCompleteTime(val: string): string {
  const trimmed = val.trim();
  if (!trimmed || trimmed.includes(":")) return trimmed;
  const nums = trimmed.replace(/\D/g, "");
  if (nums.length === 0) return "";
  const h = parseInt(nums.slice(0, 2), 10);
  if (isNaN(h) || h > 23) return trimmed;
  return String(h).padStart(2, "0") + ":00";
}

export function formatDateDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

export function parseDateAndTime(dateStr: string, timeStr: string): Date | null {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  const timeParts = timeStr.split(":");
  if (timeParts.length !== 2) return null;
  const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), parseInt(timeParts[0]), parseInt(timeParts[1]));
  return isNaN(d.getTime()) ? null : d;
}
