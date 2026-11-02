import { Router } from "express";
import { hello } from "./controllers/hello.controller.js";
import { createAuthRouter } from "./auth/router.js";
import { createUsersRouter } from "./users/router.js";
import { createAuditRouter } from "./audit/router.js";
import { createCatalogRouter } from "./catalog/router.js";
import { createInventoryRouter } from "./inventory/router.js";
import { createCartRouter } from "./cart/router.js";
import { createCouponsRouter } from "./coupons/router.js";
import { createAddressesRouter } from "./addresses/router.js";
import { createCheckoutRouter } from "./checkout/router.js";
import { createOrdersRouter } from "./orders/router.js";
import { createReportsRouter } from "./reports/router.js";
import type { Authentication } from "../../../application/auth/authentication.js";
import type { UserUseCases } from "../../../application/users/user-use-cases.js";
import type { AuditUseCases } from "../../../application/audit/audit-use-cases.js";
import type { CatalogUseCases } from "../../../application/catalog/catalog-use-cases.js";
import type { InventoryUseCases } from "../../../application/inventory/inventory-use-cases.js";
import type { CartUseCases } from "../../../application/cart/cart-use-cases.js";
import type { CouponUseCases } from "../../../application/coupons/coupon-use-cases.js";
import type { AddressUseCases } from "../../../application/addresses/address-use-cases.js";
import type { CheckoutUseCases } from "../../../application/checkout/checkout-use-cases.js";
import type { OrderUseCases } from "../../../application/orders/orders-use-cases.js";
import type { ReportsUseCases } from "../../../application/reports/reports-use-cases.js";
import type { Identity } from "./middleware/guard.middleware.js";

export interface RouterDependencies {
  auth: Authentication;
  users: UserUseCases;
  audit: AuditUseCases;
  catalog: CatalogUseCases;
  inventory: InventoryUseCases;
  cart: CartUseCases;
  coupons: CouponUseCases;
  addresses: AddressUseCases;
  checkout: CheckoutUseCases;
  orders: OrderUseCases;
  /** Read-only analytics/reporting use cases (RF-08). */
  reports: ReportsUseCases;
  identity: Identity;
  secureCookies: boolean;
}
export function createV1Router(deps: RouterDependencies): Router {
  const router = Router();
  router.get("/hello", hello);
  router.use("/auth", createAuthRouter(deps));
  router.use("/users", createUsersRouter(deps.users, deps.identity));
  router.use("/audit", createAuditRouter(deps.audit, deps.identity));
  // Public catalog routes carry their /catalog prefix; admin routes stay at "/".
  router.use("/", createCatalogRouter(deps.catalog, deps.identity));
  router.use("/", createInventoryRouter(deps.inventory, deps.identity));
  router.use("/cart", createCartRouter(deps));
  router.use("/coupons", createCouponsRouter(deps.coupons, deps.identity));
  router.use(
    "/addresses",
    createAddressesRouter(deps.addresses, deps.identity),
  );
  router.use("/checkout", createCheckoutRouter(deps.checkout, deps.identity));
  router.use("/orders", createOrdersRouter(deps.orders, deps.identity));
  router.use("/reports", createReportsRouter(deps));
  return router;
}
