import * as crypto from "crypto";
import axios from "axios";

const PF_API_BASE = "https://api.payfast.co.za";

function nowTimestamp(): string {
  // PayFast wants YYYY-MM-DDTHH:MM:SS, no milliseconds, no Z
  return new Date().toISOString().split(".")[0];
}

function buildSignature(
  params: Record<string, string>,
  passphrase: string,
): string {
  const withPassphrase: Record<string, string> = { ...params, passphrase };
  const sortedKeys = Object.keys(withPassphrase).sort();
  const paramString = sortedKeys
    .map(
      (key) =>
        `${key}=${encodeURIComponent(withPassphrase[key]).replace(/%20/g, "+")}`,
    )
    .join("&");
  return crypto.createHash("md5").update(paramString).digest("hex");
}

interface PfApiCallOptions {
  merchantId: string;
  passphrase: string;
  method: "GET" | "PUT" | "PATCH" | "POST";
  path: string; // e.g. "/subscriptions/{token}/cancel"
  body?: Record<string, string>;
  sandbox: boolean;
}

export async function callPayFastApi({
  merchantId,
  passphrase,
  method,
  path,
  body = {},
  sandbox,
}: PfApiCallOptions): Promise<any> {
  const timestamp = nowTimestamp();
  const version = "v1";

  // Signature covers header fields + body fields together
  const signatureInput: Record<string, string> = {
    "merchant-id": merchantId,
    version,
    timestamp,
    ...body,
  };
  const signature = buildSignature(signatureInput, passphrase);

  const url = `${PF_API_BASE}${path}${sandbox ? "?testing=true" : ""}`;

  const headers = {
    "merchant-id": merchantId,
    version,
    timestamp,
    signature,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const hasBody = Object.keys(body).length > 0;

  const response = await axios({
    method,
    url,
    headers,
    data: hasBody ? new URLSearchParams(body).toString() : undefined,
    timeout: 15_000,
    validateStatus: () => true, // we inspect status ourselves below
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `PayFast API ${method} ${path} failed: ${response.status} ${JSON.stringify(response.data)}`,
    );
  }

  return response.data;
}
