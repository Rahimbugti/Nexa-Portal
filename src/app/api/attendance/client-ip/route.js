import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/attendance/client-ip
 * Dynamically detects and returns the caller's live public IP address from HTTP request headers.
 * Never caches response.
 */
export async function GET(request) {
  try {
    const headers = request.headers;

    const forwardedFor = headers.get("x-forwarded-for");
    const realIp = headers.get("x-real-ip");
    const cfConnectingIp = headers.get("cf-connecting-ip");
    const trueClientIp = headers.get("true-client-ip");
    const xClientIp = headers.get("x-client-ip");

    let clientIp = null;

    if (cfConnectingIp) {
      clientIp = cfConnectingIp.trim();
    } else if (trueClientIp) {
      clientIp = trueClientIp.trim();
    } else if (realIp) {
      clientIp = realIp.trim();
    } else if (forwardedFor) {
      const parts = forwardedFor.split(",").map(p => p.trim()).filter(Boolean);
      // Pick the first non-private / non-local IP if possible, or the first entry
      clientIp = parts[0] || null;
    } else if (xClientIp) {
      clientIp = xClientIp.trim();
    }

    if (clientIp) {
      // Clean port if present e.g. "39.46.75.147:54321" or ipv6 brackets
      if (clientIp.includes(":") && !clientIp.includes("::")) {
        const portSplit = clientIp.split(":");
        if (portSplit.length === 2 && /^\d+$/.test(portSplit[1])) {
          clientIp = portSplit[0];
        }
      }
      // Clean ipv6 localhost representation
      if (clientIp === "::1" || clientIp === "::ffff:127.0.0.1") {
        clientIp = "127.0.0.1";
      }
    }

    return NextResponse.json({
      success: true,
      client_ip: clientIp || null,
      timestamp: Date.now()
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      client_ip: null,
      error: err?.message || "Failed to resolve client IP"
    }, {
      status: 500,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache"
      }
    });
  }
}
