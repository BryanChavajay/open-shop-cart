import type { ReceivePurchaseStock } from "./receive-purchase-stock.js";
import type { AdjustStock } from "./adjust-stock.js";
import type { GetVariantStock } from "./get-variant-stock.js";
import type { ListInventory } from "./list-inventory.js";
import type { ListVariantKardex } from "./list-variant-kardex.js";
import type { ReserveStock } from "./reserve-stock.js";
import type { ReleaseStockReservation } from "./release-stock-reservation.js";
import type { ConsumeStockReservation } from "./consume-stock-reservation.js";
import type { ExpireStockReservations } from "./expire-stock-reservations.js";
import type { ReintegrateCancelledSale } from "./reintegrate-cancelled-sale.js";
import type { ReintegrateReturnedStock } from "./reintegrate-returned-stock.js";

export type { InventoryActor } from "./shared/dependencies.js";
export type { TransactionScope, UnitOfWork } from "../shared/unit-of-work.js";
export { runOrJoin } from "../shared/unit-of-work.js";
export { auditEntryForInventory } from "./shared/audit.js";
export { assembleStockMovement } from "./shared/movement-assembler.js";
export {
  EXPIRY_BATCH_SIZE,
  RESERVATION_DURATION_MINUTES,
  canonicalFingerprint,
} from "./shared/options.js";
export type {
  InventoryListFilter,
  MovementListFilter,
} from "../../domain/inventory/interfaces/repositories/inventory.repository.js";

export interface InventoryPurchasesUseCases {
  receive: ReceivePurchaseStock;
}

export interface InventoryAdjustmentsUseCases {
  apply: AdjustStock;
}

export interface InventoryQueriesUseCases {
  get: GetVariantStock;
  list: ListInventory;
  kardex: ListVariantKardex;
}

export interface InventoryReservationsUseCases {
  reserve: ReserveStock;
  release: ReleaseStockReservation;
  consume: ConsumeStockReservation;
  expire: ExpireStockReservations;
}

export interface InventoryReturnsUseCases {
  reintegrateCancellation: ReintegrateCancelledSale;
  reintegrateReturn: ReintegrateReturnedStock;
}

/** Plain grouped bag of inventory use cases (instanced by main wiring, stage 5). */
export interface InventoryUseCases {
  purchases: InventoryPurchasesUseCases;
  adjustments: InventoryAdjustmentsUseCases;
  queries: InventoryQueriesUseCases;
  reservations: InventoryReservationsUseCases;
  returns: InventoryReturnsUseCases;
}
