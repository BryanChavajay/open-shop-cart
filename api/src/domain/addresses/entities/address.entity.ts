import { BusinessRuleViolation } from "../../shared/errors/business-error.js";
import { ErrorCode } from "../../shared/enums/error-code.enum.js";

/** Full state of a customer delivery address, used to restore the entity. */
export interface AddressSnapshot {
  /** Internal autoincremental identifier. Null until persisted. */
  id: number | null;
  /** Public identifier (UUID v7). Unique and immutable. */
  publicId: string;
  /** Internal id of the owning customer; set by the use case, never by input. */
  userId: number;
  /** Public id (UUID) of the municipality the address points at. */
  municipalityPublicId: string;
  /** First name of the person receiving the delivery. */
  recipientFirstName: string;
  /** Last name of the person receiving the delivery. */
  recipientLastName: string;
  /** Receiver phone, normalized to the 8-digit Guatemalan local format. */
  phone: string;
  exactAddress: string;
  reference: string;
  /** ISO UTC instant the address was registered. */
  registeredAt: string;
  /** ISO UTC instant of the last update. */
  updatedAt: string;
}

/** Detection of a suspended/deleted address by the read layer. */
export interface AddressDetail {
  publicId: string;
  recipientFirstName: string;
  recipientLastName: string;
  phone: string;
  municipalityPublicId: string;
  municipalityName: string;
  departmentName: string;
  exactAddress: string;
  reference: string;
  registeredAt: string;
  updatedAt: string;
}

/** Data of a brand new address or of an update, before persistence. */
export interface AddressInput {
  publicId: string;
  /** Public id of the municipality; the persistence resolves its internal id. */
  municipalityPublicId: string;
  recipientFirstName: string;
  recipientLastName: string;
  phone: string;
  exactAddress: string;
  reference: string;
}

/** Field bounds shared with the request schemas. */
export const FIELD_MAX = {
  NAME: 100,
  PHONE: 8,
  ADDRESS: 300,
  REFERENCE: 300,
} as const;

/** Strips the optional +502 country prefix and keeps digits only. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("502") && digits.length > 8 ? digits.slice(3) : digits;
  if (local.length !== FIELD_MAX.PHONE) {
    throw new BusinessRuleViolation(
      "The phone must carry the 8-digit Guatemalan local number",
      ErrorCode.INVALID_INPUT,
      "phone",
      undefined,
    );
  }
  return local;
}

/** Validates and normalizes a plain required text field. */
function requireText(value: string, field: string, maxLength: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length === 0) {
    throw new BusinessRuleViolation(
      `The field ${field} is required`,
      ErrorCode.REQUIRED_FIELD_MISSING,
      field,
      undefined,
    );
  }
  if (trimmed.length > maxLength) {
    throw new BusinessRuleViolation(
      `The field ${field} exceeds ${maxLength} characters`,
      ErrorCode.INVALID_INPUT,
      field,
      undefined,
    );
  }
  return trimmed;
}

/** Normalized fields of an address mutation, ready for the write layer. */
export interface NormalizedAddressFields {
  recipientFirstName: string;
  recipientLastName: string;
  phone: string;
  municipalityPublicId: string;
  exactAddress: string;
  reference: string;
}

/**
 * Customer delivery address entity. Every modification goes through methods
 * that enforce business rules; ownership of a foreign address is rejected at
 * the repository (404 ADDRESS_NOT_FOUND), never surfaced here.
 */
export class Address {
  private constructor(private state: AddressSnapshot) {}

  /**
   * Validates and normalizes the mutation input without touching state: the
   * entity cannot hold a foreign address, so updates rebuild field values
   * through this shared guard before the write layer resolves ownership.
   */
  static prepareFields(input: AddressInput): NormalizedAddressFields {
    return {
      municipalityPublicId: input.municipalityPublicId,
      recipientFirstName: requireText(input.recipientFirstName, "recipientFirstName", FIELD_MAX.NAME),
      recipientLastName: requireText(input.recipientLastName, "recipientLastName", FIELD_MAX.NAME),
      phone: normalizePhone(input.phone),
      exactAddress: requireText(input.exactAddress, "exactAddress", FIELD_MAX.ADDRESS),
      reference: requireText(input.reference, "reference", FIELD_MAX.REFERENCE),
    };
  }

  /** Creates a new address (not persisted yet). */
  static create(userId: number, input: AddressInput, registeredAt: string): Address {
    return new Address({
      id: null,
      publicId: input.publicId,
      userId,
      municipalityPublicId: input.municipalityPublicId,
      recipientFirstName: requireText(input.recipientFirstName, "recipientFirstName", FIELD_MAX.NAME),
      recipientLastName: requireText(input.recipientLastName, "recipientLastName", FIELD_MAX.NAME),
      phone: normalizePhone(input.phone),
      exactAddress: requireText(input.exactAddress, "exactAddress", FIELD_MAX.ADDRESS),
      reference: requireText(input.reference, "reference", FIELD_MAX.REFERENCE),
      registeredAt,
      updatedAt: registeredAt,
    });
  }

  /** Restores the entity from its persisted state, without revalidating. */
  static restore(snapshot: AddressSnapshot): Address {
    return new Address({ ...snapshot });
  }

  /** Merges the changed fields; timestamps seal the update at `occurredAt`. */
  update(input: AddressInput, occurredAt: string): void {
    this.state = {
      ...this.state,
      municipalityPublicId: input.municipalityPublicId,
      recipientFirstName: requireText(input.recipientFirstName, "recipientFirstName", FIELD_MAX.NAME),
      recipientLastName: requireText(input.recipientLastName, "recipientLastName", FIELD_MAX.NAME),
      phone: normalizePhone(input.phone),
      exactAddress: requireText(input.exactAddress, "exactAddress", FIELD_MAX.ADDRESS),
      reference: requireText(input.reference, "reference", FIELD_MAX.REFERENCE),
      updatedAt: occurredAt,
    };
  }

  /** Read-only complete state, handed to the repository for persistence. */
  toSnapshot(): AddressSnapshot {
    return { ...this.state };
  }
}
