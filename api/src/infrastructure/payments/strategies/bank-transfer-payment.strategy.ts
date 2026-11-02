import { OrderStatus } from "../../../domain/checkout/enums/order-status.enum.js";
import { PaymentMethod } from "../../../domain/checkout/enums/payment-method.enum.js";
import { PaymentStatus } from "../../../domain/checkout/enums/payment-status.enum.js";
import type {
  PaymentExecutionContext,
  PaymentExecutionResult,
  PaymentStrategy,
} from "../../../domain/checkout/interfaces/payment-strategy.js";
import { BusinessRuleViolation } from "../../../domain/shared/errors/business-error.js";
import { ErrorCode } from "../../../domain/shared/enums/error-code.enum.js";

/**
 * Bank transfer / deposit strategy. The charge is not captured here: the
 * customer's evidence (bank + receipt number) is frozen on the payment and the
 * order waits for an operator verification (PENDING_PAYMENT_VERIFICATION /
 * PENDING_VERIFICATION). Approving the verification later moves
 * the order to CONFIRMED/PAID; rejecting moves it to CANCELLED/REJECTED.
 */
export class BankTransferPaymentStrategy implements PaymentStrategy {
  readonly method = PaymentMethod.BANK_TRANSFER as const;

  async execute(context: PaymentExecutionContext): Promise<PaymentExecutionResult> {
    if (
      context.details.method !== PaymentMethod.BANK_TRANSFER ||
      context.details.bankName.trim() === "" ||
      context.details.referenceNumber.trim() === ""
    ) {
      throw new BusinessRuleViolation(
        "The bank transfer payment requires the origin bank and the receipt reference number",
        ErrorCode.INVALID_PAYMENT_DETAILS,
        "payment",
        undefined,
      );
    }
    return {
      orderStatus: OrderStatus.PENDING_PAYMENT_VERIFICATION,
      paymentStatus: PaymentStatus.PENDING_VERIFICATION,
      referenceNumber: context.details.referenceNumber.trim(),
      providerData: JSON.stringify({
        bankName: context.details.bankName.trim(),
      }),
    };
  }
}
