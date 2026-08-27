export type AuthResult = { kind: "ok" } | { kind: "denied" };

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < left.byteLength; i++) {
    const a = left[i];
    const b = right[i];
    if (a === undefined || b === undefined) return false;
    diff |= a ^ b;
  }
  return diff === 0;
}

export async function authenticate(
  request: Request,
  expectedToken: string,
): Promise<AuthResult> {
  if (expectedToken.length === 0) {
    return { kind: "denied" };
  }
  const header = request.headers.get("Authorization");
  if (header === null || !header.startsWith("Bearer ")) {
    return { kind: "denied" };
  }
  const presented = header.slice("Bearer ".length);
  const presentedBytes = encode(presented);
  const expectedBytes = encode(expectedToken);
  if (presentedBytes.byteLength !== expectedBytes.byteLength) {
    await crypto.subtle.digest("SHA-256", presentedBytes);
    return { kind: "denied" };
  }
  return timingSafeEqual(presentedBytes, expectedBytes) ? { kind: "ok" } : { kind: "denied" };
}

export function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Bearer realm="project-harness"' },
  });
}
