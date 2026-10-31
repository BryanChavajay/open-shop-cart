import type { Clock } from "../../domain/shared/interfaces/providers/clock.js";

/** Clock backed by the system time. */
export class SystemClock implements Clock {
  /** Returns the current date and time. */
  now(): Date {
    return new Date();
  }
}
