import { ConfirmCheckout } from "./confirm-checkout.js";
import { InitiateCheckout } from "./initiate-checkout.js";
import { ReleaseCheckoutReservation } from "./release-checkout-reservation.js";
import { VerifyBankTransferPayment } from "./verify-bank-transfer-payment.js";

/** Use cases of the checkout module, grouped the way routers consume them. */
export interface CheckoutUseCases {
  initiate: InitiateCheckout;
  release: ReleaseCheckoutReservation;
  confirm: ConfirmCheckout;
  verification: VerifyBankTransferPayment;
}
