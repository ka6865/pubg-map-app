"use client";

import getApiUrl from "../lib/api-config";

import { useState, useEffect, useCallback } from "react"; // React 상태 및 생명주기 관리 훅
import { useRouter, useSearchParams } from "next/navigation"; // Next.js 라우터 및 쿼리 파라미터 로드 모듈
import { supabase } from "../lib/supabase"; // DB 통신용 Supabase 클라이언트
import { validatePost, extractImageUrl, sanitizeTitle } from "../lib/board-utils"; // 게시글 유효성 및 텍스트 데이터 가공 유틸리티 함수 로드
import { Post, Comment } from "../types/board"; // 게시판 관련 타입 명세 인터페이스 로드
import type { CurrentUser } from "../types/map";
import { toast } from "sonner";

// 게시판 설정 상수
const BOARD_CONFIG = {
  POSTS_PER_PAGE: 10,
  MIN_LIKES_FOR_RECOMMENDED: 5,
  MOBILE_BREAKPOINT: 768,
} as const;

interface BoardProps {
  currentUser: CurrentUser | null;
  displayName: string;
  isAdmin: boolean;
}

// 게시판 하위 화면 렌더링용 자식 컴포넌트 모음 로드
import BoardList from "./BoardList";
import BoardDetail from "./BoardDetail";
import BoardWrite from "./BoardWrite";

// 게시판 전체 상태 관리 및 자식 뷰 전환 라우팅 컨트롤러 컴포넌트
export default function Board({
  currentUser,
  displayName,
  isAdmin,
}: BoardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const postIdParam = searchParams?.get("postId");
  const boardFilter = searchParams?.get("f") || "전체";

  const [posts, setPosts] = useState<Post[]>([]); // 게시글 목록 데이터 배열 상태
  const [comments, setComments] = useState<Comment[]>([]); // 현재 선택된 게시글의 댓글 목록 상태
  const [selectedPost, setSelectedPost] = useState<Post | null>(null); // 현재 상세 조회 중인 게시글 객체 상태
  const [isWriting, setIsWriting] = useState(false); // 글 작성/수정 모드 활성화 여부 상태
  const [isLoading, setIsLoading] = useState(false); // 데이터 로딩 중 여부 상태 (스피너 제어)

  const [page, setPage] = useState(1); // 현재 페이지 번호 상태
  const [totalPosts, setTotalPosts] = useState(0); // 전체 게시글 수 상태 (페이지네이션 계산용)
  const [searchInput, setSearchInput] = useState(""); // 검색어 입력 필드 값 상태
  const [searchQuery, setSearchQuery] = useState(""); // 실제 검색에 사용될 확정된 검색어 상태
  const [searchOption, setSearchOption] = useState("all"); // 검색 옵션 (제목, 작성자 등) 상태
  const [isMobile, setIsMobile] = useState(false); // 모바일 환경 여부 상태

  const [newTitle, setNewTitle] = useState(""); // 새 글 제목 상태
  const [newContent, setNewContent] = useState(""); // 새 글 본문 상태
  const [newCategory, setNewCategory] = useState("자유"); // 새 글 카테고리 상태
  const [newDiscordUrl, setNewDiscordUrl] = useState(""); // 🌟 새 글 디스코드 링크 상태
  const [newDiscordChannelId, setNewDiscordChannelId] = useState(""); // 🌟 새 글 디스코드 채널 ID 상태
  const [newIsNotice, setNewIsNotice] = useState(false); // 공지사항 여부 상태
  const [newComment, setNewComment] = useState(""); // 새 댓글 내용 상태
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null); // 대댓글 작성 시 대상 댓글 상태
  const [editingPostId, setEditingPostId] = useState<number | null>(null); // 수정 중인 게시글의 ID 상태 (null이면 새 글 작성)

  // 🌟 [안정성] 비동기 함수에 타임아웃을 적용하는 헬퍼 함수
  const withTimeout = async <T,>(promise: Promise<T> | any, timeoutMs = 30000): Promise<T> => {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`네트워크 응답 지연 혹은 세션 오류가 발생했습니다. (${timeoutMs / 1000}초 초과)`)), timeoutMs)
    );
    return Promise.race([promise, timeout]) as Promise<T>;
  };

  // 브라우저 해상도 기반 렌더링 환경 분기점 할당
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 필터 및 검색어 조건 변경 시 페이지 인덱스 1 페이지 강제 초기화
  useEffect(() => {
    setPage(1);
  }, [boardFilter, searchQuery]);

  // 과거 타임스탬프를 읽기 편한 상대적 시간 문자열 포맷으로 파싱
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;
    if (diff < 60) return "방금 전";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
    return date.toLocaleDateString();
  };

  // 사용자 지정 필터 및 검색 조건 매핑 기반 게시물 목록 DB Fetch 동작
  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const from = (page - 1) * BOARD_CONFIG.POSTS_PER_PAGE;
      const to = from + BOARD_CONFIG.POSTS_PER_PAGE - 1;

      let query = supabase
        .from("posts")
        .select(
          "id, title, author, user_id, category, image_url, discord_url, discord_channel_id, is_notice, created_at, views, likes, comments(count)",
          { count: "exact" }
        );

      if (boardFilter !== "전체" && boardFilter !== "추천")
        query = query.eq("category", boardFilter);
      if (boardFilter === "추천") query = query.gte("likes", BOARD_CONFIG.MIN_LIKES_FOR_RECOMMENDED);

      if (searchQuery) {
        if (searchOption === "title")
          query = query.ilike("title", `%${searchQuery}%`);
        else if (searchOption === "author")
          query = query.ilike("author", `%${searchQuery}%`);
        else
          query = query.or(
            `title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`
          );
      }

      const { data, count, error } = await withTimeout<any>(
        query
          .order("is_notice", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to)
      );

      if (!error && data) {
        const postsWithCount = data.map((post: any) => ({
          ...post,
          comment_count:
            post.comments && post.comments[0] ? post.comments[0].count : 0,
        }));
        setPosts(postsWithCount);
        setTotalPosts(count || 0);
      } else if (error) {
        console.error("Fetch posts error:", error);
      }
    } catch (err) {
      console.error("Fetch posts exception:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, boardFilter, searchQuery, displayName]);

  // URL 내 postId 파라미터 유무 식별을 통한 상세 뷰 진입 여부 판별 트리거
  useEffect(() => {
    if (postIdParam) {
      fetchSinglePost(postIdParam);
    } else {
      setSelectedPost(null);
      setComments([]);
      setReplyingTo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postIdParam]);

  // 단일 게시글 객체 및 귀속된 댓글 리스트 병렬 DB 로드
  const fetchSinglePost = async (id: string) => {
    try {
      const postPromise = supabase
        .from("posts")
        .select("*")
        .eq("id", id)
        .single();
      const commentPromise = supabase
        .from("comments")
        .select("*")
        .eq("post_id", id)
        .order("created_at", { ascending: true });

      const [postResult, commentResult] = await withTimeout<[any, any]>(
        Promise.all([postPromise, commentPromise])
      );

      if (postResult.data) {
        setSelectedPost(postResult.data);

        const viewedKey = `viewed_post_${postResult.data.id}`;
        if (!sessionStorage.getItem(viewedKey)) {
          incrementViews(postResult.data.id);
          sessionStorage.setItem(viewedKey, "true");
        }
      }

      if (commentResult.data) {
        setComments(commentResult.data);
      }
    } catch (err) {
      console.error("fetchSinglePost error:", err);
    }
  };

  // 특정 게시물의 갱신된 전체 댓글 목록 재귀 로드
  const fetchComments = async (postId: number) => {
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (data) setComments(data);
  };

  // 특정 게시물 DB의 조회수 컬럼 카운트 1 상향 업데이트
  const incrementViews = async (postId: number) => {
    await supabase.rpc("increment_views", { row_id: postId });
  };

  // 신규 작성 포맷 삽입 혹은 수정 내역 DB 저장 및 미사용 스토리지 이미지 동반 폐기 수행
  const handleSavePost = async (): Promise<boolean> => {
    const validationError = validatePost(newTitle, newContent, currentUser);
    if (validationError) {
      toast.error(validationError);
      return false;
    }
    if (!currentUser?.id) {
      toast.error("로그인이 필요합니다.");
      return false;
    }

    setIsLoading(true);
    console.log("🚀 [Save Start]: Bypassing client session check for stability...");

    try {
      const trimmedTitle = sanitizeTitle(newTitle);
      const finalImageUrl = extractImageUrl(newContent);

      // 🌟 [우회 도로 적용] 브라우저 직접 통신 대신 서버 API를 호출하여 타임아웃 해결
      const payload = {
        title: trimmedTitle,
        content: newContent,
        category: newCategory,
        image_url: finalImageUrl,
        is_notice: isAdmin ? newIsNotice : false,
        author: displayName,
        user_id: currentUser.id,
        editingPostId: editingPostId,
        discord_url: newDiscordUrl, // 🌟 디스코드 링크 추가
        discord_channel_id: newDiscordChannelId, // 🌟 디스코드 채널 ID 추가
      };

      console.log("⬆️ [Requesting Bypass API]:", { title: trimmedTitle, editingPostId });

      const response = await withTimeout<Response>(
        fetch("/api/posts/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        30000
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "서버 저장 중 오류가 발생했습니다.");
      }

      console.log("🎉 [Server Bypass Success]: Transitioning UI...");

      // 성공 시 UI 전환 및 상태 초기화
      setIsWriting(false);
      setNewTitle("");
      setNewContent("");
      setNewDiscordUrl(""); // 🌟 초기화
      setNewDiscordChannelId(""); // 🌟 초기화

      if (editingPostId) {
        setEditingPostId(null);
        toast.success("게시글이 성공적으로 수정되었습니다.");
        fetchPosts();
        fetchSinglePost(String(editingPostId));
      } else {
        setPage(1);
        toast.success("새 게시글이 등록되었습니다.");
        fetchPosts();
      }

      return true;
    } catch (error: any) {
      console.error("🚨 [Save Critical Error]:", {
        message: error.message,
        userId: currentUser?.id,
        titleLength: newTitle.length,
        contentLength: newContent.length,
        stack: error.stack
      });
      
      if (error.message.includes("30초 초과")) {
        toast.error("서버 응답이 너무 늦습니다. 인터넷 연결이나 세션 상태를 확인하신 후 다시 시도해 주세요.");
      } else {
        // 🌟 서버에서 전달받은 구체적인 에러 메시지(예: 디스코드 링크 오류)를 사용자에게 보여줍니다.
        toast.error(error.message || "게시글을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // 하단 댓글/대댓글 DB 맵핑 기록 및 대상 타겟 유저 알림 객체 삽입
  const handleSaveComment = async () => {
    if (!currentUser || !selectedPost) return;
    if (!newComment.trim()) {
      toast.warning("댓글 내용을 입력해주세요.");
      return;
    }

    const finalComment = replyingTo
      ? `@${replyingTo.author} ${newComment}`
      : newComment;

    const { error } = await supabase.from("comments").insert([
      {
        post_id: selectedPost.id,
        user_id: currentUser.id,
        author: displayName,
        content: finalComment,
        parent_id: replyingTo ? replyingTo.id : null,
      },
    ]);

    if (!error) {
      const targetUserId = replyingTo
        ? replyingTo.user_id
        : selectedPost.user_id;
      if (targetUserId !== currentUser.id) {
        const notiType = replyingTo ? "reply" : "comment";
        const previewText = replyingTo
          ? replyingTo.content
          : selectedPost.title;

        await supabase.from("notifications").insert([
          {
            user_id: targetUserId,
            sender_id: currentUser.id,
            sender_name: displayName,
            type: notiType,
            post_id: selectedPost.id,
            preview_text: previewText,
          },
        ]);
      }
      setNewComment("");
      setReplyingTo(null);
      fetchComments(selectedPost.id);
      fetchPosts();
    }
  };

  // 개별 계정 종속형 게시글 추천 데이터 삽입 검증 및 좋아요 카운트 갱신
  const handleLikePost = async (postId: number, currentLikes: number) => {
    if (!currentUser) return toast.error("로그인 후 이용 가능합니다.");
    const { data } = await supabase
      .from("post_likes")
      .select("*")
      .eq("post_id", postId)
      .eq("user_id", currentUser.id)
      .single();
    if (data) return toast.info("이미 추천하신 게시글입니다.");

    await supabase
      .from("post_likes")
      .insert([{ post_id: postId, user_id: currentUser.id }]);
    await supabase.rpc("increment_likes", { row_id: postId });

    if (selectedPost?.id === postId)
      setSelectedPost({ ...selectedPost, likes: currentLikes + 1 });
    fetchPosts();
    toast.success("게시글을 추천했습니다!");
  };

  // 개별 댓글 및 답글 삭제
  const handleDeleteComment = async (commentId: number) => {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);
    if (!error && selectedPost) {
      fetchComments(selectedPost.id);
      fetchPosts();
      toast.success("댓글이 삭제되었습니다.");
    } else if (error) {
      toast.error("댓글을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  // 본문 이미지 주소 정규식 색출 및 스토리지 할당 파일 동반 DB 삭제 수행
  const handleDeletePost = async (postId: number) => {
    // 관리자가 아니면서 댓글이 존재하는 경우 삭제 차단
    if (comments.length > 0 && !isAdmin) {
      toast.warning("댓글이 작성된 게시글은 삭제할 수 없습니다.");
      return;
    }

    if (!confirm("정말 이 게시물을 삭제하시겠습니까?")) return;

    setIsLoading(true);
    try {
      const { data: postData, error: fetchError } = await supabase
        .from("posts")
        .select("content")
        .eq("id", postId)
        .single();
      if (fetchError) throw fetchError;

      if (postData?.content) {
        const imgRegex = /<img[^>]+src\s*=\s*["']?([^"'\s>]+)["']?/g;
        const matches = [...postData.content.matchAll(imgRegex)];

        const imagePaths = matches
          .map((match) => {
            const src = match[1];
            if (src.includes("/storage/v1/object/public/images/")) {
              const path = src.split("/storage/v1/object/public/images/")[1];
              return path ? decodeURIComponent(path) : null;
            }
            return null;
          })
          .filter((path): path is string => path !== null);

        if (imagePaths.length > 0) {
          await supabase.storage.from("images").remove(imagePaths);
        }
      }

      // 관리자라면 서버사이드 강제 삭제 API 호출 (RLS 우회)
      if (isAdmin) {
        const apiUrl = getApiUrl(`/api/admin/posts/delete?postId=${postId}`);
        const adminRes = await fetch(apiUrl, { method: "DELETE" });
        const adminResult = await adminRes.json();
        
        if (!adminRes.ok) throw new Error(adminResult.error || "관리자 삭제 실패");
        
        toast.success("관리자 권한으로 게시글을 강제 삭제했습니다.");
      } else {
        // 일반 사용자는 기존 RLS 삭제 시도
        const { error: deleteError } = await supabase.from("posts").delete().eq("id", postId);
        if (deleteError) throw deleteError;
        
        toast.success("게시글이 성공적으로 삭제되었습니다.");
      }

      router.push("/?tab=Board");
      await fetchPosts();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error("게시글을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  // 검색 인풋 조건 기반 목록 트리거 재호출 및 페이지 인덱스 1 초기화
  const handleSearch = () => {
    setPage(1);
    setSearchQuery(searchInput);
  };

  // 🌟 [최적화] 하위 컴포넌트(게시글 상세, 목록) 리렌더링 방지를 위한 콜백 캐싱
  const handleEditClick = useCallback(() => {
    if (selectedPost) {
      setEditingPostId(selectedPost.id);
      setNewTitle(selectedPost.title);
      setNewContent(selectedPost.content || "");
      setNewCategory(selectedPost.category);
      setNewDiscordUrl(selectedPost.discord_url || ""); // 🌟 수정 시 기존 링크 로드
      setNewDiscordChannelId(selectedPost.discord_channel_id || ""); // 🌟 수정 시 기존 채널 ID 로드
      setNewIsNotice(selectedPost.is_notice);
      setIsWriting(true);
    }
  }, [selectedPost]);

  const handleSetIsWriting = useCallback((v: boolean) => {
    if (v) {
      setEditingPostId(null);
      setNewTitle("");
      setNewContent("");
      setNewCategory("자유");
      setNewDiscordUrl(""); // 🌟 새 글 작성 시 초기화
      setNewDiscordChannelId(""); // 🌟 새 글 작성 시 초기화
      setNewIsNotice(false);
    }
    setIsWriting(v);
  }, []);

  if (isWriting || editingPostId) {
    return (
      <BoardWrite
        newTitle={newTitle}
        setNewTitle={setNewTitle}
        newContent={newContent}
        setNewContent={setNewContent}
        newCategory={newCategory}
        setNewCategory={setNewCategory}
        newDiscordUrl={newDiscordUrl} // 🌟 전달
        setNewDiscordUrl={setNewDiscordUrl} // 🌟 전달
        newDiscordChannelId={newDiscordChannelId} // 🌟 전달
        setNewDiscordChannelId={setNewDiscordChannelId} // 🌟 전달
        newIsNotice={newIsNotice}
        setNewIsNotice={setNewIsNotice}
        handleSavePost={handleSavePost}
        setIsWriting={(isWritingValue) => {
          if (!isWritingValue) setEditingPostId(null);
          setIsWriting(isWritingValue);
        }}
        isAdmin={isAdmin}
        isLoading={isLoading}
        isMobile={isMobile}
        isEditing={!!editingPostId}
      />
    );
  }

  if (selectedPost) {
    return (
      <BoardDetail
        selectedPost={selectedPost}
        comments={comments}
        currentUser={currentUser}
        isAdmin={isAdmin}
        isMobile={isMobile}
        boardFilter={boardFilter}
        newComment={newComment}
        setNewComment={setNewComment}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        handleSaveComment={handleSaveComment}
        handleLikePost={handleLikePost}
        handleDeletePost={handleDeletePost}
        formatTimeAgo={formatTimeAgo}
        handleDeleteComment={handleDeleteComment}
        handleEditClick={handleEditClick}
      />
    );
  }

  return (
    <BoardList
      posts={posts}
      boardFilter={boardFilter}
      totalPosts={totalPosts}
      page={page}
      setPage={setPage}
      searchInput={searchInput}
      setSearchInput={setSearchInput}
      searchOption={searchOption}
      setSearchOption={setSearchOption}
      handleSearch={handleSearch}
      isMobile={isMobile}
      formatTimeAgo={formatTimeAgo}
      setIsWriting={handleSetIsWriting}
    />
  );
}
