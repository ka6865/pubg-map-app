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

      await handleSavePost();
    } catch (err) {
      console.error("onSaveClick fatal error:", err);
      toast.error("저장을 준비하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
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
    // 🌟 [안전] 클립보드 붙여넣기 시 Base64 이미지 자동 필터링
    clipboard: {
      matchers: [
        ["IMG", (node: any, delta: any) => {
          const src = node.getAttribute("src");
          if (src && src.startsWith("data:image")) {
            toast.warning("이미지 직접 붙여넣기는 서버 부하 방지를 위해 차단되었습니다. 하단 업로드 버튼을 이용해 주세요.");
            return { ops: [] }; // 이미지를 제외한 빈 델타 반환
          }
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
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          style={{ padding: "10px", backgroundColor: "#252525", color: "white", border: "1px solid #333", borderRadius: "4px" }}
        >
          {BOARD_CATEGORIES.filter((c) => isAdmin || c !== "패치노트").map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="제목을 입력하세요 (최대 50자)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={50}
          style={{ flex: 1, padding: "10px", backgroundColor: "#252525", color: "white", border: "1px solid #333", borderRadius: "4px", fontSize: "16px" }}
        />
      </div>

      <div
        className="quill-wrapper"
        style={{ marginBottom: "50px", backgroundColor: "white", color: "black", borderRadius: "4px", position: "relative" }}
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
          <input type="checkbox" checked={newIsNotice} onChange={(e) => setNewIsNotice(e.target.checked)} /> 공지사항
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
