"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabase";
import "react-quill-new/dist/quill.snow.css";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";

const ReactQuill = dynamic(() => import("react-quill-new"), {
  ssr: false,
}) as any;

const BOARD_CATEGORIES = ["패치노트", "자유", "듀오/스쿼드 모집", "클럽홍보", "제보/문의"];
const IMAGE_CONFIG = {
  MAX_FILE_SIZE_MB: 20,
  COMPRESSION_MAX_SIZE_MB: 1,
  COMPRESSION_MAX_WIDTH_OR_HEIGHT: 1920,
} as const;

const QuillGlobalStyles = (
  <style>{`
    .quill-wrapper .ql-toolbar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background-color: #f3f4f6;
      border-top-left-radius: 4px;
      border-top-right-radius: 4px;
    }
    .quill-wrapper .ql-container {
      min-height: 350px;
      max-height: 50vh;
      overflow-y: auto;
      border-bottom-left-radius: 4px;
      border-bottom-right-radius: 4px;
      font-size: 16px;
      cursor: text;
    }
    .quill-wrapper .ql-editor {
      min-height: 350px;
    }
    .quill-wrapper .ql-editor.ql-blank::before {
      color: #adb5bd;
      font-style: normal;
    }
  `}</style>
);

interface BoardWriteProps {
  newTitle: string;
  setNewTitle: (title: string) => void;
  newContent: string;
  setNewContent: (content: string) => void;
  newCategory: string;
  setNewCategory: (category: string) => void;
  newDiscordUrl: string; // 🌟 추가
  setNewDiscordUrl: (url: string) => void; // 🌟 추가
  newDiscordChannelId: string; // 🌟 추가
  setNewDiscordChannelId: (id: string) => void; // 🌟 추가
  newIsNotice: boolean;
  setNewIsNotice: (isNotice: boolean) => void;
  handleSavePost: () => Promise<boolean>;
  setIsWriting: (isWriting: boolean) => void;
  isAdmin: boolean;
  isLoading: boolean;
  isMobile: boolean;
  isEditing?: boolean;
}

export default function BoardWrite({
  newTitle,
  setNewTitle,
  newContent,
  setNewContent,
  newCategory,
  setNewCategory,
  newDiscordUrl,
  setNewDiscordUrl,
  newDiscordChannelId,
  setNewDiscordChannelId,
  newIsNotice,
  setNewIsNotice,
  handleSavePost,
  setIsWriting,
  isAdmin,
  isLoading,
  isMobile,
  isEditing,
}: BoardWriteProps) {
  const quillRef = useRef<any>(null);
  const uploadedImagesRef = useRef<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false); // 🌟 디스코드 방 생성 로딩 상태

  // 🌟 디스코드 음성 채널 자동 생성 함수
  const createDiscordRoom = async (type: "duo" | "squad") => {
    if (isCreatingRoom) return;

    // 닉네임 정보 (author) - 닉네임 표시되는 태그에서 추출 시도
    const authorElement = document.querySelector(".nickname-display");
    const author = authorElement?.textContent?.trim() || "익명";

    const confirmMsg = `${type === "duo" ? "2인 듀오" : "4인 스쿼드"} 전용 보이스 채널을 생성하시겠습니까?\n\n* 사람이 모두 나가면 봇이 자동으로 삭제합니다.`;
    if (!confirm(confirmMsg)) return;

    setIsCreatingRoom(true);
    const toastId = toast.loading(`${type.toUpperCase()} 채널 생성 중...`);

    try {
      const res = await fetch("/api/discord/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, author }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "채널 생성 실패");

      // 성공 시 주소와 ID 저장
      setNewDiscordUrl(data.inviteUrl);
      setNewDiscordChannelId(data.channelId);

      toast.success(`${type.toUpperCase()} 채널이 생성되었습니다!`, { id: toastId });
    } catch (err: any) {
      console.error("🚨 [Room Create Error]:", err);
      toast.error(err.message || "채널 생성 중 오류가 발생했습니다.", { id: toastId });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  useEffect(() => {
    return () => {
      if (uploadedImagesRef.current.length > 0) {
        supabase.storage.from("images").remove(uploadedImagesRef.current);
      }
    };
  }, []);

  const uploadImage = async (file: File) => {
    try {
      const options = {
        maxSizeMB: IMAGE_CONFIG.COMPRESSION_MAX_SIZE_MB,
        maxWidthOrHeight: IMAGE_CONFIG.COMPRESSION_MAX_WIDTH_OR_HEIGHT,
        useWebWorker: true,
      };

      const compressedFile = await imageCompression(file, options);
      const fileExt = compressedFile.name.split(".").pop() || "jpeg";
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;

      const { error } = await supabase.storage
        .from("images")
        .upload(fileName, compressedFile);

      if (error) throw error;

      uploadedImagesRef.current.push(fileName);
      const { data } = supabase.storage.from("images").getPublicUrl(fileName);
      return data.publicUrl;
    } catch (error: any) {
      console.error("Image upload/compression error:", error);
      toast.error("이미지 업로드 중 오류가 발생했습니다.");
    }
  };

  const imageHandler = useCallback(() => {
    const existingInputs = document.querySelectorAll(".quill-image-input");
    existingInputs.forEach((el) => el.remove());

    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "image/*");
    input.setAttribute("id", "quill-image-upload"); // 🌟 ID 추가
    input.setAttribute("name", "quill-image");     // 🌟 Name 추가
    input.classList.add("quill-image-input");
    input.style.display = "none";
    input.style.position = "absolute";
    input.style.left = "-9999px";

    document.body.appendChild(input);
    input.click();

    input.onchange = async () => {
      if (!input.files || input.files.length === 0) {
        if (document.body.contains(input)) document.body.removeChild(input);
        return;
      }

      const file = input.files[0];
      const maxSize = IMAGE_CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;

      if (file.size > maxSize) {
        toast.warning(`이미지 크기는 ${IMAGE_CONFIG.MAX_FILE_SIZE_MB}MB를 초과할 수 없습니다.`);
        if (document.body.contains(input)) document.body.removeChild(input);
        return;
      }

      const editor = quillRef.current.getEditor();
      const range = editor.getSelection(true) || { index: editor.getLength() };

      try {
        setIsUploadingImage(true);
        editor.enable(false);
        const url = await uploadImage(file);
        if (url) {
          editor.insertEmbed(range.index, "image", url);
          editor.setSelection(range.index + 1);
        } else {
          toast.error("이미지 업로드 실패");
        }
      } catch (e) {
        console.error("Editor image insert error:", e);
      } finally {
        editor.enable(true);
        setIsUploadingImage(false);
        if (document.body.contains(input)) document.body.removeChild(input);
      }
    };
  }, []);

  const handleWrapperClick = useCallback(() => {
    if (quillRef.current) {
      const editor = quillRef.current.getEditor();
      if (!editor.hasFocus()) {
        editor.focus();
      }
    }
  }, []);

  // 🌟 [추가] 드래그 앤 드롭 이미지 업로드 핸들러
  useEffect(() => {
    if (!quillRef.current) return;
    const editor = quillRef.current.getEditor();
    const root = editor.root;

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith("image/")) {
          const maxSize = IMAGE_CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
          if (file.size > maxSize) {
            toast.warning(`이미지 크기는 ${IMAGE_CONFIG.MAX_FILE_SIZE_MB}MB를 초과할 수 없습니다.`);
            return;
          }

          const range = editor.getSelection(true) || { index: editor.getLength() };
          try {
            setIsUploadingImage(true);
            editor.enable(false);
            const url = await uploadImage(file);
            if (url) {
              editor.insertEmbed(range.index, "image", url);
              editor.setSelection(range.index + 1);
            }
          } finally {
            editor.enable(true);
            setIsUploadingImage(false);
          }
        }
      }
    };

    root.addEventListener("drop", handleDrop);
    return () => root.removeEventListener("drop", handleDrop);
  }, [uploadImage]);

  const handleCancel = async () => {
    try {
      if (uploadedImagesRef.current.length > 0) {
        await supabase.storage.from("images").remove(uploadedImagesRef.current);
      }
    } catch (err) {
      console.error("Cancel cleanup error:", err);
    } finally {
      setIsWriting(false);
    }
  };

  const onSaveClick = async () => {
    // 🌟 이미 업로드 중이거나 저장 중이면 차단 (안전장치)
    if (isLoading || isUploadingImage) return;

    try {
      const unusedImages = uploadedImagesRef.current.filter(
        (fileName) => !newContent.includes(fileName)
      );

      if (unusedImages.length > 0) {
        // 이미지 삭제 중 오류가 나도 저장은 진행할 수 있도록 독립적 에러 핸들링
        try {
          await supabase.storage.from("images").remove(unusedImages);
          uploadedImagesRef.current = uploadedImagesRef.current.filter(
            (f) => !unusedImages.includes(f)
          );
        } catch (storageErr) {
          console.error("Storage cleanup failed:", storageErr);
        }
      }

      // 🌟 [검증] 디스코드 링크 형식만 간단히 체크 (상세 검증은 서버 API에서 수행)
      if (newCategory === "듀오/스쿼드 모집" && newDiscordUrl) {
        const isDiscordUrl = /discord\.(gg|com)/.test(newDiscordUrl);
        if (!isDiscordUrl) {
          toast.error("올바른 디스코드 링크 형식이 아닙니다.");
          return;
        }
      }

      await handleSavePost();
    } catch (err) {
      console.error("onSaveClick fatal error:", err);
      toast.error("저장을 준비하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  // 🌟 [추가] 텍스트 스타일 전체 초기화 함수
  const handleClearFormatting = () => {
    if (!quillRef.current) return;
    const editor = quillRef.current.getEditor();
    const length = editor.getLength();
    
    if (length <= 1) return; // 내용이 없을 때

    if (confirm("글의 모든 스타일(배경색, 글자색 등)을 초기화하시겠습니까? (이미지는 유지됩니다)")) {
      const range = { index: 0, length: length };
      // 1. Quill의 기본 서식 제거
      editor.removeFormat(range.index, range.length);
      
      // 2. 인라인 스타일(배경색 등)이 남아있을 수 있으므로 강제 세척 처리
      const cleanContent = newContent.replace(/style="[^"]*"/g, (match) => {
        // 이미지 태그의 인라인 스타일은 유지 (크기 등 때문)
        if (match.includes("max-width") || match.includes("display:block")) return match;
        return "";
      });
      setNewContent(cleanContent);
      
      toast.success("스타일이 초기화되었습니다.");
    }
  };

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, false] }],
        ["bold", "italic", "underline", "strike", "blockquote"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "image"],
        ["clean"],
      ],
      handlers: { image: imageHandler },
    },
    // 🌟 [안전] 클립보드 붙여넣기 시 Base64 이미지 자동 필터링 및 스타일 클리닝
    clipboard: {
      matchers: [
        ["IMG", (node: any, delta: any) => {
          const src = node.getAttribute("src");
          if (src && src.startsWith("data:image")) {
            // Base64 이미지는 용량 문제로 차단하고 사용자에게 안내
            toast.warning("이미지 직접 붙여넣기는 서버 부하 방지를 위해 제한됩니다. 상단 업로드 버튼이나 드래그 앤 드롭을 이용해 주세요.", {
              duration: 5000,
              description: "고화질 이미지는 DB 저장 시 글이 잘릴 원인이 됩니다."
            });
            return { ops: [] }; 
          }
          return delta;
        }],
        [Node.ELEMENT_NODE, (node: HTMLElement, delta: any) => {
          // 외부에서 복사된 배경색(특히 흰색 배경) 및 스타일 제거
          delta.ops.forEach((op: any) => {
            if (op.attributes) {
              // 배경색 무조건 제거
              if (op.attributes.background) delete op.attributes.background;
              
              // 글자색이 검은색 계열이거나 너무 어두우면 제거하여 기본 밝은색이 나오게 함
              if (op.attributes.color) {
                const color = op.attributes.color.toLowerCase();
                if (color === "black" || color === "#000000" || color === "#000" || color.startsWith("rgb(0,0,0)")) {
                  delete op.attributes.color;
                }
              }
            }
          });
          return delta;
        }]
      ]
    }
  }), [imageHandler]);

  return (
    <div
      style={{
        backgroundColor: "#1a1a1a",
        padding: isMobile ? "15px" : "30px",
        borderRadius: "8px",
        border: "1px solid #333",
      }}
    >
      {QuillGlobalStyles}
      <h2 style={{ marginBottom: "20px", color: "#F2A900", fontSize: "20px", fontWeight: "bold" }}>
        {isEditing ? "게시글 수정" : "새 게시글 작성"}
      </h2>

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: "10px", marginBottom: "15px" }}>
        <select
          id="post-category"
          name="category"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          style={{ padding: "10px", backgroundColor: "#252525", color: "white", border: "1px solid #333", borderRadius: "4px" }}
        >
          {BOARD_CATEGORIES.filter((c) => isAdmin || c !== "패치노트").map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          id="post-title"
          name="title"
          type="text"
          placeholder="제목을 입력하세요 (최대 50자)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={50}
          style={{ flex: 1, padding: "10px", backgroundColor: "#252525", color: "white", border: "1px solid #333", borderRadius: "4px", fontSize: "16px" }}
        />
        <button
          type="button"
          onClick={handleClearFormatting}
          style={{ padding: "0 15px", backgroundColor: "#333", color: "#F2A900", border: "1px solid #F2A900", borderRadius: "4px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F2A900", e.currentTarget.style.color = "black")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#333", e.currentTarget.style.color = "#F2A900")}
        >
          스타일 초기화
        </button>
      </div>

      {/* 🌟 디스코드 링크 입력 섹션 (듀오/스쿼드 모집 카테고리 전용) */}
      {newCategory === "듀오/스쿼드 모집" && (
        <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#7289da", fontWeight: "bold", fontSize: "14px" }}>👾 디스코드 채널 링크</span>
            <div 
              style={{ 
                position: "relative", 
                cursor: "help",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                backgroundColor: "#444",
                color: "#ddd",
                fontSize: "12px"
              }}
              className="group"
            >
              ?
              <div className="invisible group-hover:visible absolute left-[25px] top-0 w-[300px] p-4 bg-[#333] text-white text-[12px] rounded-lg shadow-2xl border border-[#444] z-[3000] leading-relaxed">
                <p style={{ fontWeight: "bold", color: "#F2A900", marginBottom: "8px", fontSize: "13px" }}>🔗 디스코드 채널 링크 넣는 법</p>
                <div style={{ marginBottom: "10px" }}>
                  <strong style={{ color: "#7289da" }}>방식 A. 초대 링크 (추천)</strong><br/>
                  1. 보이스 채널 우클릭 - [초대하기]<br/>
                  2. [링크 편집] - 만료 기간 [무제한] 설정<br/>
                  3. 생성된 주소(discord.gg/...) 복사
                </div>
                <div>
                  <strong style={{ color: "#7289da" }}>방식 B. 채널 링크</strong><br/>
                  1. 보이스 채널 우클릭 - [링크 복사]<br/>
                  2. 주소창의 링크 그대로 붙여넣기
                </div>
                <p style={{ marginTop: "10px", color: "#ff4444", fontSize: "11px", borderTop: "1px solid #444", paddingTop: "8px" }}>
                  * 다른 디스코드 서버 링크는 자동으로 차단됩니다.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => createDiscordRoom("duo")}
                disabled={isCreatingRoom}
                className="flex-1 py-[8px] bg-[#5865F2] hover:bg-[#4752C4] text-white rounded font-bold text-[12px] transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingRoom ? "생성 중..." : "🎮 듀오 방 자동 생성 (2인)"}
              </button>
              <button
                type="button"
                onClick={() => createDiscordRoom("squad")}
                disabled={isCreatingRoom}
                className="flex-1 py-[8px] bg-[#5865F2] hover:bg-[#4752C4] text-white rounded font-bold text-[12px] transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingRoom ? "생성 중..." : "🎮 스쿼드 방 자동 생성 (4인)"}
              </button>
            </div>

            <div className="relative">
              <input
                id="post-discord-url"
                name="discord_url"
                type="text"
                placeholder="자동 생성 버튼을 누르거나 직접 링크를 입력하세요."
                value={newDiscordUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewDiscordUrl(val);
                  // 직접 입력 시에는 채널 ID 초기화 (자동 삭제 대상 제외)
                  if (newDiscordChannelId) {
                    setNewDiscordChannelId("");
                  }
                }}
                className={`w-full p-2 bg-[#252525] text-white border rounded text-[14px] outline-none transition-colors ${
                  newDiscordChannelId ? "border-[#43b581] border-2" : "border-[#333] focus:border-[#5865F2]"
                }`}
              />
              {newDiscordChannelId && (
                <div className="mt-1 text-[11px] text-[#43b581] flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  전용 채널이 생성되었습니다. (종료 시 자동 삭제됨)
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className="quill-wrapper"
        style={{ marginBottom: "50px", backgroundColor: "#252525", color: "#e5e5e5", borderRadius: "4px", position: "relative", border: "1px solid #333" }}
        onClick={handleWrapperClick}
      >
        {isUploadingImage && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(255,255,255,0.8)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "bold", color: "#F2A900", borderRadius: "4px" }}>
            이미지를 서버에 업로드 중입니다...
          </div>
        )}
        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={newContent}
          onChange={setNewContent}
          modules={modules}
          placeholder="생존자님의 소중한 정보를 공유해 주세요! (이미지는 드래그 혹은 아이콘 클릭으로 첨부 가능)"
        />
      </div>

      {isAdmin && (
        <label style={{ display: "flex", gap: "8px", marginBottom: "20px", color: "#F2A900" }}>
          <input 
            id="post-notice-check"
            name="is_notice"
            type="checkbox" 
            checked={newIsNotice} 
            onChange={(e) => setNewIsNotice(e.target.checked)} 
          /> 공지사항
        </label>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <button
          onClick={handleCancel}
          disabled={isLoading || isUploadingImage}
          style={{ padding: "10px 20px", backgroundColor: (isLoading || isUploadingImage) ? "#222" : "#333", color: (isLoading || isUploadingImage) ? "#666" : "#ccc", borderRadius: "4px", border: "none" }}
        >
          취소
        </button>
        <button
          onClick={onSaveClick}
          disabled={isLoading || isUploadingImage}
          style={{ padding: "10px 30px", backgroundColor: "#F2A900", color: "black", fontWeight: "bold", borderRadius: "4px", border: "none" }}
        >
          {isLoading ? "처리 중..." : isEditing ? "수정하기" : "등록하기"}
        </button>
      </div>
    </div>
  );
}
