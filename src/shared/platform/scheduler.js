export function createDebouncer(delayMs) {
  const safeDelay = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 0;
  let timerId = null;

  return {
    schedule(fn) {
      if (typeof fn !== "function") return;
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(() => {
        timerId = null;
        fn();
      }, safeDelay);
    },
    cancel() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
    isPending() {
      return timerId !== null;
    },
  };
}

let itemCounter = 0;

export function generateItemId() {
  itemCounter += 1;
  if (itemCounter >= Number.MAX_SAFE_INTEGER) {
    itemCounter = 1;
  }
  const randomSuffix = Math.random().toString(36).slice(2, 7).padEnd(5, "0");
  return `f_${itemCounter}_${randomSuffix}`;
}
