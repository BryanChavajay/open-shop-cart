import { BusinessRuleViolation } from "../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../domain/shared/enums/error-code.enum.js";
import { PaymentMethod } from "../../domain/checkout/enums/payment-method.enum.js";
import type {
  PaymentStrategy,
  PaymentStrategyRegistry,
} from "../../domain/checkout/interfaces/payment-strategy.js";
import { BankTransferPaymentStrategy } from "./strategies/bank-transfer-payment.strategy.js";
import { CashOnDeliveryPaymentStrategy } from "./strategies/cash-on-delivery-payment.strategy.js";
import { CardPaymentStrategy } from "./strategies/card-payment.strategy.js";

/**
 * Registry of payment strategies. Holds one shared instance per strategy
 * (all are stateless, so a single instance serves every call) and resolves
 * them by payment method.
 */
export class DefaultPaymentStrategyRegistry implements PaymentStrategyRegistry {
  private readonly bankTransfer: PaymentStrategy = new BankTransferPaymentStrategy();
  private readonly cashOnDelivery: PaymentStrategy = new CashOnDeliveryPaymentStrategy();
  private readonly card: PaymentStrategy;
  private readonly cardEnabled: boolean;

  constructor(
    stripeSecretKey?: string | null,
    stripeCurrency: string = "gtq",
    cardEnabled: boolean = true,
  ) {
    this.card = new CardPaymentStrategy(
      stripeSecretKey ?? undefined,
      stripeCurrency.toLowerCase(),
    );
    this.cardEnabled = cardEnabled;
  }

  getStrategy(method: PaymentMethod): PaymentStrategy {
    switch (method) {
      case PaymentMethod.BANK_TRANSFER:
        return this.bankTransfer;
      case PaymentMethod.CASH_ON_DELIVERY:
        return this.cashOnDelivery;
      case PaymentMethod.CARD:
        if (!this.cardEnabled) {
          throw new BusinessRuleViolation(
            "Card payments are disabled by configuration",
            ErrorCode.PAYMENT_METHOD_DISABLED,
            "payment",
            undefined,
          );
        }
        return this.card;
      default: {
        // Exhaustiveness guard: adding an enum member without a strategy here
        // fails to compile.
        const unhandledMethod: never = method;
        throw new BusinessRuleViolation(
          `There is no payment strategy registered for "${String(unhandledMethod)}"`,
          ErrorCode.INVALID_PAYMENT_DETAILS,
          undefined,
          undefined,
        );
      }
    }
  }
}
