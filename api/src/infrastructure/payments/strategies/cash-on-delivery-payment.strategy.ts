import { OrderStatus } from "../../../domain/checkout/enums/order-status.enum.js";
import { PaymentMethod } from "../../../domain/checkout/enums/payment-method.enum.js";
import { PaymentStatus } from "../../../domain/checkout/enums/payment-status.enum.js";
import type {
  PaymentExecutionContext,
  PaymentExecutionResult,
  PaymentStrategy,
} from "../../../domain/checkout/interfaces/payment-strategy.js";

/**
 * Cash on delivery (pago contra entrega) strategy. The customer pays in cash
 * when the order arrives, so the order is instantly CONFIRMED for preparation
 * while the payment stays PENDING_ON_DELIVERY until the courier records the
 * collection.
 */
export class CashOnDeliveryPaymentStrategy implements PaymentStrategy {
  readonly method = PaymentMethod.CASH_ON_DELIVERY as const;

  async execute(_context: PaymentExecutionContext): Promise<PaymentExecutionResult> {
    return {
      orderStatus: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PENDING_ON_DELIVERY,
      referenceNumber: null,
      providerData: null,
    };
  }
}
