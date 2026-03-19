"use client";

import { useState, useEffect } from "react"; // React 상태 제어 훅 로드
import { supabase } from "../lib/supabase"; // DB 및 인증 서버 통신용 Supabase 클라이언트 로드

interface MyPageProps {
  currentUser: any;
  userProfile: any;
  setIsMyPage: (v: boolean) => void;
  fetchUserProfile: (user: any) => void;
  setOptimisticNickname: (name: string) => void;
}

// 사용자 개인 설정(닉네임 변경 및 회원 탈퇴) 화면 컴포넌트
export default function MyPage({
  currentUser,
  userProfile,
  setIsMyPage,
  fetchUserProfile,
  setOptimisticNickname,
}: MyPageProps) {
  const [editNickname, setEditNickname] = useState(userProfile?.nickname || ""); // 닉네임 수정 입력값 상태

  // 진입 시점 사용자 프로필 데이터를 참조하여 닉네임 입력 폼 초기화
  useEffect(() => {
    if (userProfile?.nickname) {
      setEditNickname(userProfile.nickname);
    }
  }, [userProfile]);

  // 닉네임 변경 검증, DB 프로필 테이블 갱신 및 기존 게시물/댓글 작성자명 동기화 처리
  const handleUpdateProfile = async () => {
    if (!currentUser) return;

    const newNickname = editNickname.trim();

    if (newNickname.length < 2 || newNickname.length > 15) {
      alert("닉네임은 2글자 이상 15글자 이하로 입력해주세요.");
      return;
    }

    setOptimisticNickname(newNickname);

    const { error } = await supabase.from("profiles").upsert({
      id: currentUser.id,
      nickname: newNickname,
      updated_at: new Date(),
    });

    if (!error) {
      alert("프로필이 업데이트되었습니다.");
      setEditNickname(newNickname);
      fetchUserProfile(currentUser);

      await supabase
        .from("posts")
        .update({ author: newNickname })
        .eq("user_id", currentUser.id);
      await supabase
        .from("comments")
        .update({ author: newNickname })
        .eq("user_id", currentUser.id);
      await supabase
        .from("notifications")
        .update({ sender_name: newNickname })
        .eq("sender_id", currentUser.id);

      setIsMyPage(false);
    } else {
      if (error.code === "23505") {
        alert("이미 사용중인 닉네임입니다.");
      } else {
        alert("프로필 수정 실패: " + error.message);
      }
    }
  };

  // 사용자 계정 탈퇴 시 작성 게시글 탐색을 통한 스토리지 이미지 선행 삭제 후 DB 레코드 일괄 제거
  const handleDeleteAccount = async () => {
    if (
      !confirm(
        "정말로 탈퇴하시겠습니까?\n탈퇴 시 작성한 모든 글과 댓글, 프로필 정보가 삭제되며 복구할 수 없습니다."
      )
    )
      return;
    if (!currentUser) return;

    try {
      const { data: userPosts } = await supabase
        .from("posts")
        .select("content")
        .eq("user_id", currentUser.id);

      if (userPosts && userPosts.length > 0) {
        const imgRegex = /<img[^>]+src\s*=\s*["']?([^"'\s>]+)["']?/g;
        const allImagePaths: string[] = [];

        userPosts.forEach((post) => {
          const matches = [...post.content.matchAll(imgRegex)];
          matches.forEach((match) => {
            const src = match[1];
            if (src.includes("/storage/v1/object/public/images/")) {
              const path = src.split("/storage/v1/object/public/images/")[1];
              if (path) allImagePaths.push(decodeURIComponent(path));
            }
          });
        });

        if (allImagePaths.length > 0) {
          await supabase.storage.from("images").remove(allImagePaths);
        }
      }

      await supabase.from("comments").delete().eq("user_id", currentUser.id);
      await supabase.from("post_likes").delete().eq("user_id", currentUser.id);
      await supabase.from("posts").delete().eq("user_id", currentUser.id);
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", currentUser.id);

      if (profileError) throw profileError;

      await supabase.auth.signOut();

      alert("회원탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.");
      setIsMyPage(false);
      window.location.reload();
    } catch (error: any) {
      alert("탈퇴 처리 중 오류가 발생했습니다: " + error.message);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#1a1a1a",
        padding: "40px",
        borderRadius: "12px",
        border: "1px solid #333",
      }}
    >
      <h2
        style={{
          marginBottom: "30px",
          color: "#F2A900",
          fontSize: "24px",
          fontWeight: "bold",
        }}
      >
        마이페이지
      </h2>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          maxWidth: "500px",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "13px",
              color: "#888",
              fontWeight: "bold",
            }}
          >
            닉네임 변경
          </label>
          <input
            type="text"
            value={editNickname}
            onChange={(e) => setEditNickname(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#252525",
              border: "1px solid #444",
              color: "white",
              borderRadius: "6px",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button
            onClick={handleUpdateProfile}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "#F2A900",
              border: "none",
              borderRadius: "6px",
              fontWeight: "bold",
              color: "black",
              cursor: "pointer",
            }}
          >
            저장하기
          </button>
          <button
            onClick={() => setIsMyPage(false)}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "#333",
              border: "none",
              borderRadius: "6px",
              color: "white",
              cursor: "pointer",
            }}
          >
            돌아가기
          </button>
        </div>

        <div
          style={{
            marginTop: "30px",
            paddingTop: "20px",
            borderTop: "1px solid #333",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            onClick={() => {
              supabase.auth.signOut();
              setIsMyPage(false);
            }}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              cursor: "pointer",
              fontSize: "13px",
              textDecoration: "underline",
            }}
          >
            로그아웃
          </button>
          <button
            onClick={handleDeleteAccount}
            style={{
              background: "none",
              border: "none",
              color: "#ff4d4d",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: "bold",
            }}
          >
            회원탈퇴
          </button>
        </div>
      </div>
    </div>
  );
}
