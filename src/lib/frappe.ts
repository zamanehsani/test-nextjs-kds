import { cookies } from "next/headers";

export const FRAPPE_URL =
  process.env.FRAPPE_URL || "https://portal.kababrayhan.com";
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "kababrayhan.com";
export const SITE_NAMESPACE = `/${SITE_NAME.replace(/^\/+|\/+$/g, "")}`;

export function tokenHeaders(): Record<string, string> {
  const key = process.env.FRAPPE_API_KEY;
  const secret = process.env.FRAPPE_API_SECRET;
  return key && secret ? { Authorization: `token ${key}:${secret}` } : {};
}

export async function authenticatedHeaders() {
  const sid = (await cookies()).get("sid")?.value;
  const headers = tokenHeaders();
  if (sid) headers.Cookie = `sid=${sid}`;
  return headers;
}

export function extractSid(response: Response) {
  return response.headers
    .get("set-cookie")
    ?.match(/(?:^|,\s*)sid=([^;]+)/)?.[1];
}
