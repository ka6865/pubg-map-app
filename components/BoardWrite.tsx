"use client";

import { useMemo, useRef, useState, useEffect } from "react"; // React 상태 관리 및 참조 훅
import dynamic from "next/dynamic"; // Next.js 동적 임포트 모듈
import { supabase } from "../lib/supabase"; // DB 및 스토리지 연동용 Supabase 클라이언트
import "react-quill-new/dist/quill.snow.css"; // Quill 에디터 코어 스타일시트
import imageCompression from "browser-image-compression"; // 이미지 압축 라이브러리

// React-Quill 라이브러리 브라우저 window 객체 필수 의존으로 인한 SSR 렌더링 무효화 래퍼
const ReactQuill = dynamic(() => import("react-quill-new"), {
  ssr: false,
}) as any;

const BOARD_CATEGORIES = ["자유", "듀오/스쿼드 모집", "클럽홍보", "제보/문의"];

// 🌟 [최적화] 타이핑 시마다 스타일이 재계산되지 않도록 컴포넌트 외부로 분리
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

// 게시글 텍스트 및 이미지 편집 에디터 UI 컴포넌트
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
  const quillRef = useRef<any>(null); // Quill 에디터 인스턴스 접근용 Ref

  const uploadedImagesRef = useRef<string[]>([]); // 현재 작성 세션 중 업로드된 이미지 경로 추적용 Ref
  const [isUploadingImage, setIsUploadingImage] = useState(false); // 이미지 업로드 중 로딩 상태

  // 컴포넌트 파괴 감지 시 현재 작성 세션에 남은 미사용 스토리지 이미지 일괄 정리
  useEffect(() => {
    return () => {
      if (uploadedImagesRef.current.length > 0) {
        supabase.storage.from("images").remove(uploadedImagesRef.current);
      }
    };
  }, []);

  // 선택한 로컬 이미지를 Supabase 스토리지에 전달 및 public 접속 URL 반환
  const uploadImage = async (file: File) => {
    try {
      // 1. 이미지 압축 옵션 설정 (최대 1MB, 가로세로 최대 1920px)
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };

      // 2. 압축 실행! (10MB 사진이 순식간에 200~500KB로 쪼그라듭니다)
      const compressedFile = await imageCompression(file, options);

      const fileExt = compressedFile.name.split(".").pop() || "jpeg";
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 15)}.${fileExt}`;

      // 3. 압축된 파일을 Supabase에 업로드
      const { error } = await supabase.storage
        .from("images")
        .upload(fileName, compressedFile);

      if (error) throw error;

      uploadedImagesRef.current.push(fileName);
      const { data } = supabase.storage.from("images").getPublicUrl(fileName);
      return data.publicUrl;
    } catch (error: any) {
      console.error("게시글 업로드/압축 에러:", error);
      alert("일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  // 에디터 상단 이미지 첨부 아이콘 클릭 트리거 오버라이딩 커스텀 핸들러
  const imageHandler = () => {
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
      const maxSize = 20 * 1024 * 1024;

      if (file.size > maxSize) {
        alert("이미지 파일 크기는 20MB를 초과할 수 없습니다.");
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
          alert("이미지 업로드에 실패했습니다. 네트워크 상태를 확인해 주세요.");
        }
      } catch (e) {
        console.error("에디터 이미지 삽입 에러:", e);
        alert("이미지 처리 중 예기치 못한 오류가 발생했습니다.");
      } finally {
        editor.enable(true);
        setIsUploadingImage(false);

        if (document.body.contains(input)) {
          document.body.removeChild(input);
        }
      }
    };
  };

  // 작성 창 수동 취소 시 현재까지 업로드된 임시 이미지 URL 완전 폐기
  const handleCancel = async () => {
    try {
      if (uploadedImagesRef.current.length > 0) {
        const { error } = await supabase.storage
          .from("images")
          .remove(uploadedImagesRef.current);
        if (error) {
          console.error("스토리지 삭제 실패:", error);
          alert("임시 이미지 삭제 중 오류가 발생했습니다.");
        }
      }
    } catch (err) {
      console.error("예기치 못한 에러:", err);
    } finally {
      setIsWriting(false);
    }
  };

  // 폼 저장 시 본문 문자열 검증을 통해 삭제된 이미지 파악 및 스토리지 동반 제거
  const onSaveClick = async () => {
    const unusedImages = uploadedImagesRef.current.filter(
      (fileName) => !newContent.includes(fileName)
    );

    if (unusedImages.length > 0) {
      await supabase.storage.from("images").remove(unusedImages);
      uploadedImagesRef.current = uploadedImagesRef.current.filter(
        (f) => !unusedImages.includes(f)
      );
    }

    const success = await handleSavePost();
    if (success) {
      uploadedImagesRef.current = [];
    }
  };

  // Quill 에디터 툴바 설정 메모이제이션
  const modules = useMemo(
    () => ({
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
    }),
    []
  );

  return (
    <div
      style={{
        backgroundColor: "#1a1a1a",
        padding: isMobile ? "15px" : "30px",
        borderRadius: "8px",
        border: "1px solid #333",
      }}
    >
      <h2
        style={{
          marginBottom: "20px",
          color: "#F2A900",
          fontSize: "20px",
          fontWeight: "bold",
        }}
      >
        {isEditing ? "게시글 수정" : "새 게시글 작성"}
      </h2>

      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: "10px",
          marginBottom: "15px",
        }}
      >
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          style={{
            padding: "10px",
            backgroundColor: "#252525",
            color: "white",
            border: "1px solid #333",
            borderRadius: "4px",
          }}
        >
          {BOARD_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="제목을 입력하세요 (최대 50자)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={50}
          style={{
            flex: 1,
            padding: "10px",
            backgroundColor: "#252525",
            color: "white",
            border: "1px solid #333",
            borderRadius: "4px",
            fontSize: "16px",
          }}
        />
      </div>

      <div
        className="quill-wrapper"
        style={{
          marginBottom: "50px",
          backgroundColor: "white",
          color: "black",
          borderRadius: "4px",
          position: "relative",
        }}
      >
        {QuillGlobalStyles}

        {isUploadingImage && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(255, 255, 255, 0.8)",
              zIndex: 2000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              fontWeight: "bold",
              color: "#F2A900",
              borderRadius: "4px",
            }}
          >
            이미지를 서버에 업로드 중입니다...
          </div>
        )}

        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={newContent}
          onChange={setNewContent}
          modules={modules}
        />
      </div>

      {isAdmin ? (
        <label
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "20px",
            color: "#F2A900",
          }}
        >
          <input
            type="checkbox"
            checked={newIsNotice}
            onChange={(e) => setNewIsNotice(e.target.checked)}
          />{" "}
          공지사항
        </label>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <button
          onClick={handleCancel}
          disabled={isLoading || isUploadingImage}
          style={{
            padding: "10px 20px",
            backgroundColor: isLoading || isUploadingImage ? "#222" : "#333",
            color: isLoading || isUploadingImage ? "#666" : "#ccc",
            borderRadius: "4px",
            border: "none",
            cursor: isLoading || isUploadingImage ? "not-allowed" : "pointer",
          }}
        >
          취소
        </button>
        <button
          onClick={onSaveClick}
          disabled={isLoading}
          style={{
            padding: "10px 30px",
            backgroundColor: "#F2A900",
            color: "black",
            fontWeight: "bold",
            borderRadius: "4px",
            border: "none",
            cursor: "pointer",
          }}
        >
          {isLoading ? "처리 중..." : isEditing ? "수정하기" : "등록하기"}
        </button>
      </div>
    </div>
  );
}
