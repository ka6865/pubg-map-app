import { NextResponse } from "next/server";
import { withAuthGuard } from "@/utils/supabase/guard";

type PromoteResult = {
  result_code: "ok" | "revision_conflict" | "not_found" | "forbidden" | "already_promoted";
  post_id: number | null;
  revision: number | null;
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
};

function isPromoteResult(value: unknown): value is PromoteResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (row.result_code === "ok" || row.result_code === "revision_conflict" || row.result_code === "not_found"
    || row.result_code === "forbidden" || row.result_code === "already_promoted")
    && (typeof row.post_id === "number" || row.post_id === null)
    && (typeof row.revision === "number" || row.revision === null);
}

function parseRequestBody(value: unknown): { postId: number; expectedParentRevision: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (!keys.every((key) => key === "postId" || key === "expectedParentRevision")) return null;
  if (!Number.isSafeInteger(body.postId) || (body.postId as number) < 1
    || !Number.isSafeInteger(body.expectedParentRevision) || (body.expectedParentRevision as number) < 0) return null;
  return { postId: body.postId as number, expectedParentRevision: body.expectedParentRevision as number };
}

async function sendDiscordNotification(post: PromoteResult) {
  const webhookUrl = process.env.DISCORD_PATCH_NOTES_WEBHOOK_URL
    || process.env.DISCORD_COMMUNITY_WEBHOOK_URL
    || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl || post.post_id === null) return;

  const content = post.content ?? "";
  const summary = content.replace(/<[^>]+>/g, "").trim().slice(0, 1000) || "새로운 배그 소식이 게시판에 등록되었습니다.";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: `🆕 [배그 소식] ${post.title ?? ""}`,
          description: summary.slice(0, 2000),
          url: `${siteUrl}/board/${post.post_id}`,
          thumbnail: post.image_url ? { url: post.image_url } : undefined,
          color: 0xf2a900,
          footer: { text: "BGMS 통합 지도 봇 | 업데이트 알리미" },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch {
    // Discord 전달 실패는 이미 커밋된 승격 결과를 되돌리지 않는다.
  }
}

export async function POST(request: Request) {
  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const { user, supabaseAdmin } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const input = parseRequestBody(body);
  if (!input) return NextResponse.json({ error: "필수 입력 데이터가 올바르지 않습니다." }, { status: 400 });

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError) return NextResponse.json({ error: "게시글을 승격하지 못했습니다." }, { status: 503 });
    if (profile?.role !== "admin") return NextResponse.json({ error: "어드민 권한이 필요합니다." }, { status: 403 });

    const { data, error } = await supabaseAdmin.rpc("merge_board_post_draft_with_images", {
      p_draft_post_id: input.postId,
      p_actor_user_id: user.id,
      p_expected_parent_revision: input.expectedParentRevision,
    });
    if (error || !Array.isArray(data) || !isPromoteResult(data[0])) {
      return NextResponse.json({ error: "게시글을 승격하지 못했습니다." }, { status: 503 });
    }
    const result = data[0];
    if (result.result_code === "revision_conflict") {
      return NextResponse.json({ error: "게시글이 다른 곳에서 수정되었습니다." }, { status: 409 });
    }
    if (result.result_code === "forbidden") return NextResponse.json({ error: "어드민 권한이 필요합니다." }, { status: 403 });
    if (result.result_code === "not_found") return NextResponse.json({ error: "승격할 초안 게시글을 찾을 수 없습니다." }, { status: 404 });
    if (result.result_code === "already_promoted") return NextResponse.json({ error: "이미 승격(발행)된 게시글입니다." }, { status: 409 });

    await sendDiscordNotification(result);
    return NextResponse.json({
      success: true,
      message: "수정 사항이 원본 게시글에 성공적으로 반영되었습니다.",
      data: { id: result.post_id, revision: result.revision },
    });
  } catch {
    return NextResponse.json({ error: "게시글을 승격하지 못했습니다." }, { status: 503 });
  }
}
