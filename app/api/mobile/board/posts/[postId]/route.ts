import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { rewriteBoardImageUrls, toBoardImageProxyUrl } from "@/lib/board-image-proxy";

const clean = (value: string | undefined) => (value || "").replace(/['";\s]+/g, "").trim();
const supabase = createAdminClient<any>(
  clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function extractImageUrls(html: string, origin: string) {
  const urls = new Set<string>();
  const rewritten = rewriteBoardImageUrls(html);
  const imageRegex = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match = imageRegex.exec(rewritten);
  while (match) {
    const src = match[1];
    urls.add(src.startsWith("/api/") ? `${origin}${src}` : src);
    match = imageRegex.exec(rewritten);
  }
  return [...urls];
}

function authorName(row: any) {
  return row.user_id
    ? row.profiles?.nickname || row.author || "알 수 없음"
    : row.author || "익명";
}

function mapComment(row: any) {
  return {
    id: row.id,
    postId: row.post_id,
    author: authorName(row),
    content: stripHtml(String(row.content || "")),
    parentId: row.parent_id,
    createdAt: row.created_at,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const id = Number(postId);
  if (!Number.isFinite(id)) return jsonError("게시글 ID가 올바르지 않습니다.", 400);

  const origin = new URL(request.url).origin;
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id,title,content,author,user_id,category,image_url,is_notice,created_at,views,likes,status,profiles(nickname)")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  if (postError) return jsonError("게시글을 불러오지 못했습니다.", 500);
  if (!post) return jsonError("게시글을 찾을 수 없습니다.", 404);

  const { data: comments, error: commentsError } = await supabase
    .from("comments")
    .select("id,post_id,user_id,author,content,parent_id,created_at,profiles(nickname)")
    .eq("post_id", id)
    .order("created_at", { ascending: true })
    .limit(50);

  if (commentsError) return jsonError("댓글을 불러오지 못했습니다.", 500);

  const content = String(post.content || "");
  const coverImage = toBoardImageProxyUrl(post.image_url, origin);
  const imageUrls = extractImageUrls(content, origin);
  if (coverImage) imageUrls.unshift(coverImage);

  return NextResponse.json(
    {
      post: {
        id: post.id,
        title: post.title,
        author: authorName(post),
        category: post.category,
        contentText: stripHtml(content),
        imageUrls: [...new Set(imageUrls)],
        isNotice: Boolean(post.is_notice),
        createdAt: post.created_at,
        views: Number(post.views || 0),
        likes: Number(post.likes || 0),
      },
      comments: (comments || []).map(mapComment),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    }
  );
}
