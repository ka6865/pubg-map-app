import { NextResponse } from "next/server";
import { extractClientIp } from "@/lib/board/ipUtils";
import { verifyTurnstileToken } from "@/lib/board/turnstile.server";
import { TURNSTILE_ACTIONS } from "@/lib/board/turnstileContract";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const token = body && typeof body === "object" && "token" in body
    ? (body as { token?: unknown }).token
    : undefined;
  const result = await verifyTurnstileToken({
    token,
    remoteIp: extractClientIp(request),
    expectedAction: TURNSTILE_ACTIONS.comment,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ success: true });
}
