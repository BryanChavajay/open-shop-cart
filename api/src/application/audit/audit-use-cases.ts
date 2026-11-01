import type { GetAuditEntry } from "./get-audit-entry.js";
import type { ListAuditEntries } from "./list-audit-entries.js";

export interface AuditUseCases {
  get: GetAuditEntry;
  list: ListAuditEntries;
}
