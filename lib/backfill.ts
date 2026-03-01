export type DateWindow = {
  startDate: Date;
  endDate: Date;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function buildDateWindows(startDate: Date, endDate: Date, windowDays: number): DateWindow[] {
  if (windowDays <= 0 || !Number.isFinite(windowDays)) {
    throw new Error("windowDays must be a positive integer.");
  }
  if (endDate < startDate) {
    throw new Error("endDate must be greater than or equal to startDate.");
  }

  const windows: DateWindow[] = [];
  let cursor = new Date(startDate);

  while (cursor <= endDate) {
    const windowStart = new Date(cursor);
    const windowEnd = new Date(
      Math.min(
        endDate.getTime(),
        windowStart.getTime() + windowDays * ONE_DAY_MS - 1,
      ),
    );
    windows.push({ startDate: windowStart, endDate: windowEnd });
    cursor = new Date(windowEnd.getTime() + 1);
  }

  return windows;
}
