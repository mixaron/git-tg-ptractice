import crypto from "crypto";
import { IncomingHttpHeaders } from "http";

export function isValidSignature(
  req: object,
  secret: string,
  body: object,
  headers: IncomingHttpHeaders
): boolean {
  const signature = headers["x-hub-signature-256"] as string;
  if (!signature || !secret) return false;

  const payload = JSON.stringify(body);
  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");

  return signature === digest;
}
