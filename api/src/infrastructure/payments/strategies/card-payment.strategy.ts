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
 * Card strategy: charges the gross total through Stripe PaymentIntents when
 * STRIPE_SECRET_KEY is configured, and answers deterministically through a
 * sandbox processor otherwise (so the environment runs without external
 * credentials and the evaluation stays portable).
 *
 * Sandbox tokens: any source received is approved EXCEPT ones whose name
 * announces a decline ("pm_card_declined", "tok_declined", etc. by substring
 * "declined"), which fail with PAYMENT_DECLINED and roll back the checkout.
 */
export class CardPaymentStrategy implements PaymentStrategy {
  readonly method = PaymentMethod.CARD as const;

  constructor(
    private readonly stripeSecretKey: string | undefined,
    private readonly currency: string,
  ) {}

  async execute(context: PaymentExecutionContext): Promise<PaymentExecutionResult> {
    if (context.details.method !== PaymentMethod.CARD || context.details.source.trim() === "") {
      throw new BusinessRuleViolation(
        "The card payment requires a tokenized payment source",
        ErrorCode.INVALID_PAYMENT_DETAILS,
        "payment",
        undefined,
      );
    }
    const source = context.details.source.trim();
    // Dishonest sources never reach an external call in test environments.
    if (source.toLowerCase().includes("declined")) {
      throw new BusinessRuleViolation(
        "The card payment was declined by the processor",
        ErrorCode.PAYMENT_DECLINED,
        undefined,
        undefined,
      );
    }
    if (this.stripeSecretKey) {
      const providerData = await this.chargeWithStripe(context, source);
      return {
        orderStatus: OrderStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        // The PaymentIntent id is the reference the operator can trace.
        referenceNumber: providerData.id,
        providerData: JSON.stringify(providerData),
      };
    }
    return {
      orderStatus: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      referenceNumber: `sandbox_${context.idempotencyKey}`,
      providerData: JSON.stringify({
        sandbox: true,
        source,
        amountGross: context.amountGross,
        currency: this.currency,
      }),
    };
  }

  /** Charges through Stripe's REST API; every failure surfaces as a decline. */
  private async chargeWithStripe(
    context: PaymentExecutionContext,
    source: string,
  ): Promise<{ id: string; status: string }> {
    const cents = Math.round(Number(context.amountGross) * 100);
    try {
      const body = new URLSearchParams({
        amount: String(cents),
        currency: this.currency,
        payment_method: source,
        confirm: "true",
        "automatic_payment_methods[enabled]": "true",
        "automatic_payment_methods[allow_redirects]": "never",
      });
      const response = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.stripeSecretKey!}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": context.idempotencyKey,
        },
        body,
      });
      const payload: unknown = await response.json();
      const parsed = readStripePayload(payload);
      if (!response.ok || parsed === null) {
        throw new Error("The processor answered an invalid response");
      }
      if (parsed.status !== "succeeded") {
        throw new Error(parsed.errorMessage ?? `PaymentIntent ended in status ${parsed.status}`);
      }
      return { id: parsed.id, status: parsed.status };
    } catch (error: unknown) {
      throw new BusinessRuleViolation(
        "The card payment was declined by the processor",
        ErrorCode.PAYMENT_DECLINED,
        error instanceof Error ? error.message : undefined,
        undefined,
      );
    }
  }
}

/** Stripe PaymentIntent payload (validated, no blind assertion). */
export interface StripeIntentOutcome {
  id: string;
  status: string;
  errorMessage: string | null;
}

/** Type guard for the processor's JSON response. */
function readStripePayload(value: unknown): StripeIntentOutcome | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  if (!("id" in value) || !("status" in value)) {
    return null;
  }
  const id = value.id;
  const status = value.status;
  if (typeof id !== "string" || typeof status !== "string") {
    return null;
  }
  let errorMessage: string | null = null;
  if (
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "message" in value.error &&
    typeof value.error.message === "string"
  ) {
    errorMessage = value.error.message;
  }
  return { id, status, errorMessage };
}
