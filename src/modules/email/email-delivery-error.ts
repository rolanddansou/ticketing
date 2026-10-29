export class ResendDeliveryError extends Error {
  readonly provider = "resend";

  constructor(readonly httpStatus: number) {
    super("Resend email delivery failed");
    this.name = "ResendDeliveryError";
  }
}
