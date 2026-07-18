import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BoardWriteScope = "post" | "comment";

export type BoardWriteQuotaResult =
  | { ok: true }
  | { ok: false; status: 429 | 503; error: string };

const QUOTA_UNAVAILABLE_ERROR =
  "게시판 요청 제한을 확인하지 못했습니다.";

const QUOTAS = {
  post: {
    windowSeconds: 60,
    limit: 1,
    error: "게시글은 1분에 한 번만 작성할 수 있습니다.",
  },
  comment: {
    windowSeconds: 10,
    limit: 1,
    error: "댓글은 10초에 한 번만 작성할 수 있습니다.",
  },
} as const satisfies Record<
  BoardWriteScope,
  { windowSeconds: number; limit: number; error: string }
>;

export function buildBoardWriteActorHash(
  scope: BoardWriteScope,
  actor: string,
): string {
  return createHash("sha256").update(`${scope}:${actor}`).digest("hex");
}

export async function consumeBoardWriteQuota(input: {
  supabaseAdmin: SupabaseClient;
  scope: BoardWriteScope;
  actor: string;
}): Promise<BoardWriteQuotaResult> {
  const actor = input.actor.trim();
  if (!actor) {
    return { ok: false, status: 503, error: QUOTA_UNAVAILABLE_ERROR };
  }

  const quota = QUOTAS[input.scope];

  try {
    const { data, error } = await input.supabaseAdmin.rpc(
      "consume_board_write_quota",
      {
        p_scope: input.scope,
        p_actor_hash: buildBoardWriteActorHash(input.scope, actor),
        p_window_seconds: quota.windowSeconds,
        p_limit: quota.limit,
      },
    );

    if (error || typeof data !== "boolean") {
      return { ok: false, status: 503, error: QUOTA_UNAVAILABLE_ERROR };
    }

    return data
      ? { ok: true }
      : { ok: false, status: 429, error: quota.error };
  } catch {
    return { ok: false, status: 503, error: QUOTA_UNAVAILABLE_ERROR };
  }
}
