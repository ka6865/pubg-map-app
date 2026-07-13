import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { withAuthGuard } from "@/utils/supabase/guard";
import { checkProfanity } from "@/lib/board/profanityFilter";
import { extractClientIp, checkIpBlacklist } from "@/lib/board/ipUtils";
import { toBoardImageProxyUrl } from "@/lib/board-image-proxy";

const clean = (value: string | undefined) => (value || "").replace(/['";\s]+/g, "").trim();
const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const validCategories = new Set(["free", "strategy", "question", "notice", "clan", "자유", "공략", "질문", "공지", "클랜"]);

type BoardPostCursor = {
  isNotice: boolean;
  createdAt: string;
  id: number;
};

function adminClient() {
  return createAdminClient<any>(supabaseUrl, supabaseServiceKey);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function originOf(request: Request) {
  return new URL(request.url).origin;
}

function hasImagePayload(content: string) {
  return /<img\b|data:image\/|!\[[^\]]*]\([^)]*\)/i.test(content);
}

function encodeCursor(row: any) {
  const cursor: BoardPostCursor = {
    isNotice: Boolean(row.is_notice),
    createdAt: row.created_at,
    id: Number(row.id),
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null): BoardPostCursor | null {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      typeof parsed?.isNotice === "boolean" &&
      typeof parsed?.createdAt === "string" &&
      Number.isFinite(Number(parsed?.id))
    ) {
      return {
        isNotice: parsed.isNotice,
        createdAt: parsed.createdAt,
        id: Number(parsed.id),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function applyCursor(query: any, rawCursor: string | null) {
  const cursor = decodeCursor(rawCursor);
  if (!rawCursor) return query;
  if (!cursor) return query.lt("created_at", rawCursor);

  const sameNoticeOlderRows = `and(is_notice.eq.${cursor.isNotice},created_at.lt.${cursor.createdAt})`;
  const sameNoticeSameTimeOlderRows = `and(is_notice.eq.${cursor.isNotice},created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;

  if (cursor.isNotice) {
    return query.or(`${sameNoticeOlderRows},${sameNoticeSameTimeOlderRows},is_notice.eq.false`);
  }

  return query.or(`${sameNoticeOlderRows},${sameNoticeSameTimeOlderRows}`);
}

function authorName(row: any) {
  return row.user_id
    ? row.profiles?.nickname || row.author || "알 수 없음"
    : row.author || "익명";
}

function mapPost(row: any, origin: string) {
  const commentCount = Array.isArray(row.comments) && row.comments[0]?.count
    ? Number(row.comments[0].count)
    : 0;

  return {
    id: row.id,
    title: row.title,
    author: authorName(row),
    category: row.category,
    imageUrl: toBoardImageProxyUrl(row.image_url, origin) || null,
    isNotice: Boolean(row.is_notice),
    createdAt: row.created_at,
    views: Number(row.views || 0),
    likes: Number(row.likes || 0),
    commentCount,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), 20);
  const cursor = url.searchParams.get("cursor");
  const category = url.searchParams.get("category");
  const queryText = url.searchParams.get("q")?.trim();
  const origin = originOf(request);

  let query = adminClient()
    .from("posts")
    .select("id,title,author,user_id,category,image_url,is_notice,created_at,views,likes,status,comments(count),profiles(nickname)")
    .eq("status", "published")
    .order("is_notice", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  query = applyCursor(query, cursor);
  if (category && category !== "all") query = query.eq("category", category);
  if (queryText) {
    const safeQuery = queryText.replace(/[%_]/g, "");
    if (safeQuery) query = query.or(`title.ilike.%${safeQuery}%,content.ilike.%${safeQuery}%`);
  }

  query = query.limit(limit + 1);

  const { data, error } = await query;
  if (error) return jsonError("게시글 목록을 불러오지 못했습니다.", 500);

  const rows = data || [];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => mapPost(row, origin));

  return NextResponse.json(
    {
      items,
      nextCursor: hasMore ? encodeCursor(rows[limit - 1]) : null,
      hasMore,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180",
      },
    }
  );
}

export async function POST(request: Request) {
  const auth = await withAuthGuard();
  if (auth.error) return auth.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("요청 본문이 올바르지 않습니다.", 400);
  }

  const title = String(body.title || "").trim();
  const content = String(body.content || "").trim();
  const category = validCategories.has(String(body.category || ""))
    ? String(body.category)
    : "free";

  if (title.length < 2 || title.length > 80) {
    return jsonError("제목은 2~80자로 입력해주세요.", 400);
  }
  if (content.length < 2 || content.length > 5000) {
    return jsonError("본문은 2~5000자로 입력해주세요.", 400);
  }
  if (body.image_url || body.imageUrl || hasImagePayload(content)) {
    return jsonError("모바일 앱에서는 사진 첨부를 지원하지 않습니다.", 400);
  }

  const clientIp = extractClientIp(request);
  const isBlocked = await checkIpBlacklist(clientIp, auth.supabaseAdmin);
  if (isBlocked) return jsonError("차단된 IP입니다. 관리자에게 문의해주세요.", 403);

  if (checkProfanity(title).blocked) return jsonError("제목에 부적절한 표현이 포함되어 있습니다.", 400);
  if (checkProfanity(content).blocked) return jsonError("본문에 부적절한 표현이 포함되어 있습니다.", 400);

  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: recentPost } = await auth.supabaseAdmin
    .from("posts")
    .select("id")
    .eq("user_id", auth.user.id)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  if (recentPost) return jsonError("게시글은 1분에 한 번만 작성할 수 있습니다.", 429);

  const { data: profile } = await auth.supabaseAdmin
    .from("profiles")
    .select("nickname")
    .eq("id", auth.user.id)
    .maybeSingle();

  const author = profile?.nickname || auth.user.email || "알 수 없음";
  const { data, error } = await auth.supabaseAdmin
    .from("posts")
    .insert([{
      title,
      content,
      author,
      user_id: auth.user.id,
      category,
      status: "published",
      image_url: null,
      ip_address: clientIp,
      is_notice: false,
      views: 0,
      likes: 0,
    }])
    .select("id")
    .single();

  if (error || !data) return jsonError("게시글 저장 중 오류가 발생했습니다.", 500);

  return NextResponse.json({ success: true, id: data.id });
}
