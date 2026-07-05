import { NextResponse } from "next/server";
import { withAuthGuard } from "@/utils/supabase/guard";
import { checkProfanity } from "@/lib/board/profanityFilter";
import { extractClientIp, checkIpBlacklist } from "@/lib/board/ipUtils";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function hasImagePayload(content: string) {
  return /<img\b|data:image\/|!\[[^\]]*]\([^)]*\)/i.test(content);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const id = Number(postId);
  if (!Number.isFinite(id)) return jsonError("게시글 ID가 올바르지 않습니다.", 400);

  const auth = await withAuthGuard();
  if (auth.error) return auth.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("요청 본문이 올바르지 않습니다.", 400);
  }

  const content = String(body.content || "").trim();
  const parentId = body.parent_id ? Number(body.parent_id) : null;

  if (content.length < 1 || content.length > 1000) {
    return jsonError("댓글은 1~1000자로 입력해주세요.", 400);
  }
  if (hasImagePayload(content)) {
    return jsonError("모바일 앱에서는 사진 첨부를 지원하지 않습니다.", 400);
  }

  const { data: post } = await auth.supabaseAdmin
    .from("posts")
    .select("id,status")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (!post) return jsonError("게시글을 찾을 수 없습니다.", 404);

  const clientIp = extractClientIp(request);
  const isBlocked = await checkIpBlacklist(clientIp, auth.supabaseAdmin);
  if (isBlocked) return jsonError("차단된 IP입니다. 관리자에게 문의해주세요.", 403);
  if (checkProfanity(content).blocked) {
    return jsonError("부적절한 표현이 포함되어 있습니다. 내용을 수정해주세요.", 400);
  }

  const since = new Date(Date.now() - 10_000).toISOString();
  const { data: recentComment } = await auth.supabaseAdmin
    .from("comments")
    .select("id")
    .eq("user_id", auth.user.id)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  if (recentComment) return jsonError("댓글은 10초에 한 번만 작성할 수 있습니다.", 429);

  const { data: profile } = await auth.supabaseAdmin
    .from("profiles")
    .select("nickname")
    .eq("id", auth.user.id)
    .maybeSingle();

  const author = profile?.nickname || auth.user.email || "알 수 없음";
  const { data, error } = await auth.supabaseAdmin
    .from("comments")
    .insert([{
      post_id: id,
      user_id: auth.user.id,
      author,
      content,
      parent_id: Number.isFinite(parentId) ? parentId : null,
      ip_address: clientIp,
    }])
    .select("id")
    .single();

  if (error || !data) return jsonError("댓글 저장 중 오류가 발생했습니다.", 500);

  return NextResponse.json({ success: true, id: data.id });
}
