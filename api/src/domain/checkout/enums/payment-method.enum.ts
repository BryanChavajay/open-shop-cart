/** Payment methods accepted at checkout. */
export enum PaymentMethod {
  /** Deposit or bank transfer verified by an operator. */
  BANK_TRANSFER = "BANK_TRANSFER",
  /** Cash on delivery (pago contra entrega). */
  CASH_ON_DELIVERY = "CASH_ON_DELIVERY",
  /** Card charge via the payment processor (Stripe when configured). */
  CARD = "CARD",
}
