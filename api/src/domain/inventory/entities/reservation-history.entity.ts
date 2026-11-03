import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";
import {
  REASON_MAX_LENGTH,
  requireInstant,
  requireOptionalTrimmedText,
  requirePositiveInteger,
  requirePublicId,
} from "./inventory-rules.js";
import { ReservationHistoryAction } from "../enums/reservation-history-action.enum.js";

/**
 * One entry of the reservation history ledger, used as the persistence
 * contract. Snapshot interfaces are plain data; entities built on them must
 * expose no setters (Phase 2).
 */
export interface ReservationHistorySnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7) of the related reservation. */
  reservationPublicId: string;
  /** Action recorded. */
  action: ReservationHistoryAction;
  /**
   * Internal identifier of the user who caused the action. Null means the
   * action was automatic (system-driven), for example an expiry.
   */
  userId: number | null;
  /** Optional reason documented for the action. Null for automatic actions. */
  reason: string | null;
  /** Instant when the action occurred, ISO string (UTC). */
  occurredAt: string;
}

/** Data required to append a new reservation history entry. */
export interface NewReservationHistoryData {
  reservationPublicId: string;
  action: ReservationHistoryAction;
  /** Null only for automatic actions such as the expiry. */
  userId: number | null;
  /** Optional reason; null for automatic actions. */
  reason: string | null;
  /** Instant when the action occurred, ISO string (UTC), provided by the use case clock. */
  occurredAt: string;
}

/**
 * Reservation history entry entity. The ledger is append-only: entries are
 * immutable after creation. Every human action must name the acting user;
 * only automatic expiries may leave the user and the reason null.
 */
export class ReservationHistory {
  private state: ReservationHistorySnapshot;

  private constructor(state: ReservationHistorySnapshot) {
    this.state = state;
  }

  /** Creates and validates a new history entry. */
  static create(data: NewReservationHistoryData): ReservationHistory {
    const action = requireKnownAction(data.action);
    if (action === ReservationHistoryAction.EXPIRED) {
      if (data.userId !== null) {
        throw new BusinessRuleViolation(
          "A reservation expiry is automatic and must not name a user",
          ErrorCode.INVALID_INPUT,
          "userId",
          undefined,
        );
      }
      if (data.reason !== null) {
        throw new BusinessRuleViolation(
          "An automatic reservation expiry must not carry a reason",
          ErrorCode.INVALID_INPUT,
          "reason",
          undefined,
        );
      }
    } else if (data.userId === null) {
      throw new BusinessRuleViolation(
        "The required field userId was not provided for a manually caused action",
        ErrorCode.REQUIRED_FIELD_MISSING,
        "userId",
        undefined,
      );
    } else if (data.reason === null) {
      throw new BusinessRuleViolation(
        "The required field reason was not provided for a manually caused action",
        ErrorCode.REQUIRED_FIELD_MISSING,
        "reason",
        undefined,
      );
    }
    requireInstant(data.occurredAt, "occurredAt");
    return new ReservationHistory({
      id: null,
      reservationPublicId: requirePublicId(data.reservationPublicId, "reservationPublicId"),
      action,
      userId: data.userId === null ? null : requirePositiveInteger(data.userId, "userId"),
      reason: requireOptionalTrimmedText(data.reason, "reason", REASON_MAX_LENGTH),
      occurredAt: data.occurredAt,
    });
  }

  /** Restores the entity from its persisted state, without revalidating. */
  static restore(snapshot: ReservationHistorySnapshot): ReservationHistory {
    return new ReservationHistory({ ...snapshot });
  }

  get id(): number | null {
    return this.state.id;
  }

  get reservationPublicId(): string {
    return this.state.reservationPublicId;
  }

  get action(): ReservationHistoryAction {
    return this.state.action;
  }

  get userId(): number | null {
    return this.state.userId;
  }

  get reason(): string | null {
    return this.state.reason;
  }

  get occurredAt(): string {
    return this.state.occurredAt;
  }

  /** Copy of the current state. */
  toSnapshot(): ReservationHistorySnapshot {
    return { ...this.state };
  }
}

function requireKnownAction(value: ReservationHistoryAction): ReservationHistoryAction {
  if (!Object.values(ReservationHistoryAction).includes(value)) {
    throw new BusinessRuleViolation(
      "The action must be a known reservation history action",
      ErrorCode.INVALID_INPUT,
      "action",
      undefined,
    );
  }
  return value;
}
