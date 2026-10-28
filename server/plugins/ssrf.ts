/**
 * SSRF and Host Allowlist Protection for Capability Network Operations.
 * Strictly blocks private networks, loopback interfaces, link-local addresses,
 * and cloud instance metadata services (AWS/GCP/Azure/DigitalOcean).
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::",
  "metadata.google.internal",
  "instance-data",
  "metadata",
]);

/**
 * Checks if an IPv4 address string falls into private, loopback, or cloud metadata ranges.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;

  // 10.0.0.0/8 (Private)
  if (b0 === 10) return true;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 169.254.0.0/16 (Link-local / Cloud metadata service e.g. 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.168.0.0/16 (Private)
  if (b0 === 192 && b1 === 168) return true;

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (b0 >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 address string falls into loopback, unique local or link-local ranges.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const clean = ip.toLowerCase().trim();

  // Loopback and unspecified
  if (clean === "::1" || clean === "::") return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (clean.startsWith("::ffff:")) {
    const v4Part = clean.slice("::ffff:".length);
    return isPrivateOrReservedIPv4(v4Part);
  }

  // Link-local unicast (fe80::/10)
  if (clean.startsWith("fe8") || clean.startsWith("fe9") || clean.startsWith("fea") || clean.startsWith("feb")) {
    return true;
  }

  // Unique local addresses (fc00::/7)
  if (clean.startsWith("fc") || clean.startsWith("fd")) {
    return true;
  }

  return false;
}

/**
 * Validates whether a URL target is safe from SSRF vulnerabilities.
 */
export function validateUrlForSsrf(urlInput: string | URL): {
  safe: boolean;
  reason?: string;
  url?: URL;
} {
  let parsed: URL;
  try {
    parsed = typeof urlInput === "string" ? new URL(urlInput) : urlInput;
  } catch {
    return { safe: false, reason: "Malformed or invalid URL string" };
  }

  // Only http and https protocols are permitted
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      safe: false,
      reason: `Forbidden protocol "${parsed.protocol}". Only HTTP/HTTPS allowed.`,
    };
  }

  let hostname = parsed.hostname.toLowerCase();
  // Strip brackets from IPv6 hostnames [::1] -> ::1
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }

  // 1. Direct blocklist check
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
    return {
      safe: false,
      reason: `Blocked target: Hostname "${hostname}" resolves to local or cloud metadata service.`,
    };
  }

  // 2. IPv4 range checks
  if (isPrivateOrReservedIPv4(hostname)) {
    return {
      safe: false,
      reason: `Blocked target: IP "${hostname}" is within a private, loopback, or link-local range.`,
    };
  }

  // 3. IPv6 range checks
  if (isPrivateOrReservedIPv6(hostname)) {
    return {
      safe: false,
      reason: `Blocked target: IPv6 "${hostname}" is within a private or link-local range.`,
    };
  }

  return { safe: true, url: parsed };
}

/**
 * Validates that a hostname matches a list of allowed hosts declared by net permissions.
 */
export function isHostAllowed(hostname: string, allowedHosts: string[]): boolean {
  if (allowedHosts.includes("*")) {
    return true;
  }

  const cleanHost = hostname.toLowerCase();
  for (const pattern of allowedHosts) {
    const cleanPattern = pattern.toLowerCase();
    if (cleanHost === cleanPattern) {
      return true;
    }

    if (cleanPattern.startsWith("*.")) {
      const rootDomain = cleanPattern.slice(2);
      if (cleanHost === rootDomain || cleanHost.endsWith(`.${rootDomain}`)) {
        return true;
      }
    }
  }

  return false;
}
