'use client';

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BoardWrite from "../BoardWrite";
import { useAuth } from "../AuthProvider";
import { supabase } from "@/lib/supabase";
import { validatePost, extractImageUrl, sanitizeTitle } from "@/lib/board-utils";
import { toast } from "sonner";
import type { Post } from "@/types/board";

export default function BoardWriteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editPostId = searchParams?.get("edit");
  const { user } = useAuth();

  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("자유");
  const [newDiscordUrl, setNewDiscordUrl] = useState("");
  const [newDiscordChannelId, setNewDiscordChannelId] = useState("");
  const [newIsNotice, setNewIsNotice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [displayName, setDisplayName] = useState("익명");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("*").eq("id", user.id).single().then(({ data }) => {
        if (data) {
          setIsAdmin(data.role === "admin");
          setDisplayName(data.nickname || "익명");
        }
      });
    }
  }, [user]);

  // 수정 모드일 때 기존 데이터 페칭
  useEffect(() => {
    if (editPostId) {
      supabase.from("posts").select("*").eq("id", editPostId).single().then(({ data }) => {
        if (data) {
          setNewTitle(data.title);
          setNewContent(data.content || "");
          setNewCategory(data.category);
          setNewDiscordUrl(data.discord_url || "");
          setNewDiscordChannelId(data.discord_channel_id || "");
          setNewIsNotice(data.is_notice);
        }
      });
    }
  }, [editPostId]);

  const handleSavePost = async (): Promise<boolean> => {
    const validationError = validatePost(newTitle, newContent, user);
    if (validationError) {
      toast.error(validationError);
      return false;
    }
    if (!user?.id) {
      toast.error("로그인이 필요합니다.");
      return false;
    }

    setIsLoading(true);

    try {
      const trimmedTitle = sanitizeTitle(newTitle);
      const finalImageUrl = extractImageUrl(newContent);

      const payload = {
        title: trimmedTitle,
        content: newContent,
        category: newCategory,
        image_url: finalImageUrl,
        is_notice: isAdmin ? newIsNotice : false,
        author: displayName,
        user_id: user.id,
        editingPostId: editPostId ? Number(editPostId) : null,
        discord_url: newDiscordUrl,
        discord_channel_id: newDiscordChannelId,
      };

      const response = await fetch("/api/posts/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "서버 저장 중 오류가 발생했습니다.");
      }

      toast.success(editPostId ? "게시글이 수정되었습니다." : "새 게시글이 등록되었습니다.");
      
      // 저장 완료 후 상세 페이지로 이동
      const newPostId = result.id || editPostId;
      if (newPostId) {
        router.push(`/board/${newPostId}`);
      } else {
        router.push("/board");
      }
      return true;
    } catch (error: any) {
      toast.error(error.message || "게시글을 저장하지 못했습니다.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetIsWriting = (val: boolean) => {
    if (!val) {
      router.back();
    }
  };

  return (
    <div className="w-full flex justify-center pb-20 pt-6 bg-[#121212] min-h-[calc(100vh-56px)]">
      <div className="w-full max-w-[900px]">
        <BoardWrite
          newTitle={newTitle}
          setNewTitle={setNewTitle}
          newContent={newContent}
          setNewContent={setNewContent}
          newCategory={newCategory}
          setNewCategory={setNewCategory}
          newDiscordUrl={newDiscordUrl}
          setNewDiscordUrl={setNewDiscordUrl}
          newDiscordChannelId={newDiscordChannelId}
          setNewDiscordChannelId={setNewDiscordChannelId}
          newIsNotice={newIsNotice}
          setNewIsNotice={setNewIsNotice}
          handleSavePost={handleSavePost}
          setIsWriting={handleSetIsWriting}
          isAdmin={isAdmin}
          isLoading={isLoading}
          isMobile={isMobile}
          isEditing={!!editPostId}
        />
      </div>
    </div>
  );
}
