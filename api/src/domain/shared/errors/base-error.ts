export class BaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details: string | undefined,
    public readonly location: string | undefined,
    public readonly status_code: number,
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);

    if (!location) {
      Error.captureStackTrace(this, new.target);
      const frame = this.stack?.split("\n")[1]?.trim();
      location = frame ? frame.replace(/^at\s+/, "") : "unknown_location";
    }
    this.location = location;
  }
}
