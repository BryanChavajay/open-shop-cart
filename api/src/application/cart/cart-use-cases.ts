import type { RegisterCartActivity } from "./register-cart-activity.js";
import type { EmptyCart } from "./empty-cart.js";
import type { ConvertCart } from "./convert-cart.js";
import type { ListAbandonedCarts } from "./list-abandoned-carts.js";

export type { TransactionScope, UnitOfWork } from "../shared/unit-of-work.js";
export { runOrJoin } from "../shared/unit-of-work.js";
export type {
  CartSnapshot,
  NewCartData,
} from "../../domain/cart/entities/cart.entity.js";
export { CartStatus } from "../../domain/cart/enums/cart-status.enum.js";
export type {
  CartReadRepository,
  CartWriteRepository,
  CartRepository,
  AbandonedCartRow,
  AbandonedCartListItem,
} from "../../domain/cart/interfaces/repositories/cart.repository.js";
export type { RegisterCartActivityCommand, CartActivityResult } from "./register-cart-activity.js";
export type { EmptyCartCommand, EmptyCartResult } from "./empty-cart.js";
export type { ConvertCartCommand, ConvertedCartReadModel } from "./convert-cart.js";
export type { ListAbandonedCartsQuery } from "./list-abandoned-carts.js";
export {
  ABANDONED_CARTS_DEFAULT_PAGE,
  ABANDONED_CARTS_DEFAULT_PAGE_SIZE,
} from "./list-abandoned-carts.js";

export type { PaginatedReadModel } from "../../domain/shared/readmodels/paginated.read-model.js";

/**
 * Default inactivity window of the abandoned-cart report, injected into
 * `ListAbandonedCarts` by main wiring instead of importing env there.
 */
export const CART_ABANDONMENT_INACTIVITY_DAYS = 3;

export interface CartActivityUseCases {
  register: RegisterCartActivity;
}

export interface CartReportsUseCases {
  listAbandoned: ListAbandonedCarts;
}

/** Plain grouped bag of cart use cases (instanced by main wiring, stage 5). */
export interface CartUseCases {
  activity: CartActivityUseCases;
  empty: EmptyCart;
  convert: ConvertCart;
  reports: CartReportsUseCases;
}
