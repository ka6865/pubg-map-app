'use client';

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import DOMPurify from "isomorphic-dompurify";
import "react-quill-new/dist/quill.snow.css";
import Image from "next/image";
import CommentSection from "../CommentSection";
import { Post, Comment } from "@/types/board";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";

interface BoardDetailClientProps {
  initialPost: Post;
  initialComments: Comment[];
}

const sanitizeHTML = (html: string) => {
  if (!html) return "";
  return DOMPurify.sanitize(html, { 
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "ul", "ol", "li", 
      "h1", "h2", "h3", "blockquote", "img", "a", "span", "iframe", "div"
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "style", "class", "width", "height", "alt", "title", "frameborder", "allow", "allowfullscreen"]
  });
};

export default function BoardDetailClient({
  initialPost,
  initialComments
}: BoardDetailClientProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [post, setPost] = useState<Post>(initialPost);
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [displayName, setDisplayName] = useState("익명");
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setDisplayName("익명");
      return;
    }
    const fetchProfile = async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (data) {
        setIsAdmin(data.role === "admin");
        setDisplayName(data.nickname || "익명");
      }
    };
    fetchProfile();
  }, [user]);

  // 조회수 증가 및 동기화
  useEffect(() => {
    const viewedKey = `viewed_post_${post.id}`;
    if (!sessionStorage.getItem(viewedKey)) {
      supabase.rpc("increment_views", { row_id: post.id }).then(() => {
        sessionStorage.setItem(viewedKey, "true");
        setPost(prev => ({ ...prev, views: prev.views + 1 }));
      });
    }
  }, [post.id]);

  const fetchComments = async () => {
    const { data } = await supabase.from("comments").select("*").eq("post_id", post.id).order("created_at", { ascending: true });
    if (data) setComments(data);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    // SSR 단계 및 Hydration 시점에는 locale이나 dynamic time에 무관한 결정론적 날짜를 출력하여 에러를 원천 봉쇄합니다.
    if (!mounted) {
      return `${y}. ${m}. ${d}.`;
    }

    const diff = (new Date().getTime() - date.getTime()) / 1000;
    if (diff < 60) return "방금 전";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${y}. ${m}. ${d}.`;
  };

  const handleLikePost = async () => {
    if (!user) return toast.error("로그인 후 이용 가능합니다.");
    const { data } = await supabase.from("post_likes").select("*").eq("post_id", post.id).eq("user_id", user.id).single();
    if (data) return toast.info("이미 추천하신 게시글입니다.");

    await supabase.from("post_likes").insert([{ post_id: post.id, user_id: user.id }]);
    await supabase.rpc("increment_likes", { row_id: post.id });
    setPost(prev => ({ ...prev, likes: prev.likes + 1 }));
    toast.success("게시글을 추천했습니다!");
  };

  const handleSaveComment = async () => {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }
    if (!newComment.trim()) {
      toast.warning("댓글 내용을 입력해주세요.");
      return;
    }

    const finalComment = replyingTo ? `@${replyingTo.author} ${newComment}` : newComment;

    const { error } = await supabase.from("comments").insert([{
      post_id: post.id,
      user_id: user.id,
      author: displayName,
      content: finalComment,
      parent_id: replyingTo ? replyingTo.id : null,
    }]);

    if (!error) {
      const targetUserId = replyingTo ? replyingTo.user_id : post.user_id;
      // 본인 글/댓글에 본인이 달 때는 알림 생략
      if (targetUserId && targetUserId !== user.id) {
        const { error: notiError } = await supabase.from("notifications").insert([{
          user_id: targetUserId,
          sender_id: user.id,
          sender_name: displayName,
          type: replyingTo ? "reply" : "comment",
          post_id: post.id,
          preview_text: replyingTo ? replyingTo.content : post.title,
        }]);
        // 🔍 알림 INSERT 실패 시 콘솔에 RLS 에러 상세 출력 (디버깅용)
        if (notiError) {
          console.error("[notifications INSERT 실패]", notiError.message, notiError.code, notiError.details);
        }
      }
      setNewComment("");
      setReplyingTo(null);
      fetchComments();
    } else {
      toast.error("댓글 저장 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (!error) {
      fetchComments();
      toast.success("댓글이 삭제되었습니다.");
    } else {
      toast.error("댓글 삭제 실패");
    }
  };

  const handleDeletePost = async () => {
    if (comments.length > 0 && !isAdmin) return toast.warning("댓글이 작성된 게시글은 삭제할 수 없습니다.");
    if (!confirm("정말 게시물을 삭제하시겠습니까?")) return;

    try {
      if (isAdmin) {
        const adminRes = await fetch(`/api/admin/posts/delete?postId=${post.id}`, { method: "DELETE" });
        if (!adminRes.ok) throw new Error("관리자 삭제 실패");
      } else {
        const { error } = await supabase.from("posts").delete().eq("id", post.id);
        if (error) throw error;
      }
      toast.success("삭제되었습니다.");
      router.push("/board");
    } catch (e) {
      toast.error("삭제 실패");
    }
  };

  const processedContent = useMemo(() => {
    let sanitizedContent = sanitizeHTML(post.content || "");
    sanitizedContent = sanitizedContent
      .replace(/<p>\s*<\/p>/g, '<p><br/></p>')
      .replace(/<p><br><\/p>/g, '<p><br/></p>')
      .replace(/<p>&nbsp;<\/p>/g, '<p><br/></p>')
      .replace(/<div>\s*<\/div>/g, '<div><br/></div>');

    return sanitizedContent.replace(
      /<img/gi,
      '<img style="max-width:100%!important;height:auto!important;display:block;border-radius:8px;margin:20px auto;"'
    );
  }, [post.content]);

  return (
    <div className="w-full flex justify-center pb-20">
      <div className="w-full max-w-[900px]">
        <article className={`bg-[#1a1a1a] rounded-[8px] border border-[#333] w-full box-border ${isMobile ? "p-[15px]" : "p-[30px]"}`}>
          <div className="mb-[20px]">
            <span className="text-[#F2A900] text-[13px] font-bold">[{post.category}]</span>
            <h1 className={`mt-[10px] text-white break-all font-bold ${isMobile ? "text-[24px]" : "text-[32px]"}`}>{post.title}</h1>
            <div className="text-[12px] text-[#888] mt-[12px] flex gap-[10px] flex-wrap">
              <span>글쓴이: {post.author}</span>
              <span>작성: {formatTimeAgo(post.created_at)}</span>
              <span>조회: {post.views}</span>
            </div>

            {post.discord_url && (
              <div className="mt-[20px]">
                <a
                  href={post.discord_url.startsWith('http') ? post.discord_url : `https://${post.discord_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-[20px] py-[12px] bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-[8px] no-underline shadow-lg"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-3.5485-13.6604a.061.061 0 00-.0312-.0286z" />
                  </svg>
                  디스코드 음성 채널 입장하기
                </a>
              </div>
            )}

            {post.clan_info && (
              <div className="mt-[20px] bg-gradient-to-r from-amber-500/10 via-[#F2A900]/5 to-transparent border border-[#F2A900]/30 rounded-xl p-5 flex items-center gap-4 shadow-xl max-w-2xl">
                {/* 클랜 마크/로고 데코레이션 */}
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#F2A900] to-amber-600 flex items-center justify-center text-black font-black text-lg shadow-[0_0_15px_rgba(242,169,0,0.3)] shrink-0">
                  {post.clan_info.tag.substring(0, 3).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 bg-[#F2A900] text-black text-[11px] font-extrabold rounded">
                      [{post.clan_info.tag}]
                    </span>
                    <h3 className="text-white text-base font-bold leading-none">{post.clan_info.name}</h3>
                    <span className="text-white/40 text-[11px]">Lv. {post.clan_info.level}</span>
                  </div>
                  {/* 멤버 현황 프로그레스 바 */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="w-28 bg-white/5 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#F2A900] h-full rounded-full" 
                        style={{ width: `${Math.min(100, (post.clan_info.memberCount / 100) * 100)}%` }}
                      />
                    </div>
                    <span className="text-white/50 text-[11px] font-medium">멤버 {post.clan_info.memberCount} / 100명</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-y border-[#333] py-[30px] min-h-[200px] text-[#e5e5e5]">
            {post.image_url && !(post.content || "").includes(post.image_url) && (
              <Image priority={true} src={post.image_url} alt="기본 이미지" width={800} height={450} className="w-full h-auto mb-[20px] rounded-[8px]" />
            )}
            
            <style>{`
              .board-content > * { margin-bottom: 1.75rem !important; line-height: 1.85 !important; }
              .board-content p:empty::before, .board-content div:empty::before { content: "\\00a0" !important; display: inline-block !important; width: 100% !important; height: 1.2rem !important; }
              .board-content ul, .board-content ol { padding-left: 1.5rem !important; list-style-position: outside !important; margin-bottom: 2rem !important; }
              .board-content ul { list-style-type: disc !important; }
              .board-content ol { list-style-type: decimal !important; }
              .board-content li { margin-bottom: 0.75rem !important; display: list-item !important; }
              .board-content strong { color: #F2A900 !important; font-weight: 800 !important; }
              .board-content a { color: #F2A900 !important; text-decoration: underline !important; text-underline-offset: 4px !important; transition: opacity 0.2s !important; }
              .board-content a:hover { opacity: 0.7 !important; }
              .board-content { white-space: pre-wrap !important; word-break: break-word !important; font-family: inherit !important; color: #e5e5e5 !important; letter-spacing: -0.01em !important; }
              
              /* 패치노트 전용 AI 요약 영역 격리 리셋 */
              .board-content .patch-note-container { white-space: normal !important; }
              .board-content .patch-note-container * { white-space: normal !important; }
              .board-content .patch-note-container p,
              .board-content .patch-note-container div,
              .board-content .patch-note-container ul,
              .board-content .patch-note-container li,
              .board-content .patch-note-container h3,
              .board-content .patch-note-container a {
                margin-bottom: 0 !important;
                line-height: inherit !important;
              }
              .board-content .patch-note-container a {
                color: #000000 !important;
                text-decoration: none !important;
              }
              .board-content .patch-note-container a:hover {
                color: #000000 !important;
                opacity: 0.8 !important;
              }
              .board-content .patch-note-container ul {
                list-style-type: none !important;
                padding-left: 0 !important;
                margin-bottom: 0 !important;
              }
              .board-content .patch-note-container li {
                display: block !important;
                margin-bottom: 0 !important;
              }
              
              .ql-snow .ql-editor { background-color: transparent !important; color: inherit !important; padding: 0 !important; }
              .ql-container.ql-snow { border: none !important; }
            `}</style>
            
            <div className="ql-container ql-snow" style={{ border: 'none', font: 'inherit', color: 'inherit' }}>
              <div dangerouslySetInnerHTML={{ __html: processedContent }} className="ql-editor board-content text-[16px]" style={{ padding: 0 }} />
            </div>
          </div>

          <div className="flex justify-end mt-[20px]">
            <button onClick={handleLikePost} className="px-[16px] py-[8px] bg-[#252525] border border-[#F2A900] text-[#F2A900] rounded-[20px] text-[13px] hover:bg-[#F2A900] hover:text-black transition-colors">
              추천 {post.likes}
            </button>
          </div>

          <CommentSection
            comments={comments}
            currentUser={user}
            newComment={newComment}
            setNewComment={setNewComment}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            handleDeleteComment={handleDeleteComment}
            isAdmin={isAdmin}
            handleSaveComment={handleSaveComment}
            isMobile={isMobile}
            formatTimeAgo={formatTimeAgo}
          />

          <div className="mt-[40px] flex gap-[10px]">
            <button onClick={() => router.push("/board")} className="flex-1 p-[12px] bg-[#333] text-white border-none rounded-[4px] hover:bg-[#444] transition-colors text-[14px]">
              목록으로
            </button>

            {user?.id === post.user_id && (
              <button
                onClick={() => router.push(`/board/write?edit=${post.id}`)}
                className="px-[20px] py-[12px] bg-[#34A853] text-white border-none rounded-[4px] hover:bg-[#2a9040] transition-colors text-[14px]"
              >
                수정
              </button>
            )}

            {(user?.id === post.user_id || isAdmin) && (
              <button
                onClick={handleDeletePost}
                className="px-[20px] py-[12px] bg-[#dc3545] text-white border-none rounded-[4px] hover:bg-[#c82333] transition-colors text-[14px]"
              >
                삭제
              </button>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
