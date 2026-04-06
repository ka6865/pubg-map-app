"use client";

import { useState, useEffect } from "react"; // React 상태 제어 훅 로드
import { supabase } from "../lib/supabase"; // DB 및 인증 서버 통신용 Supabase 클라이언트 로드
import type { CurrentUser } from "../types/map";
import { toast } from "sonner";
import MiniStatWidget from "./stat/MiniStatWidget";

// 유저 설정 상수
const USER_CONFIG = {
  MIN_NICKNAME_LENGTH: 2,
  MAX_NICKNAME_LENGTH: 15,
} as const;

interface MyPageProps {
  currentUser: CurrentUser | null;
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
  const [editPubgNickname, setEditPubgNickname] = useState(userProfile?.pubg_nickname || ""); // 배틀그라운드 닉네임 연동 상태
  const [editPubgPlatform, setEditPubgPlatform] = useState(userProfile?.pubg_platform || "steam"); // 플랫폼 선택 상태 (기본값 스팀)

  // 진입 시점 사용자 프로필 데이터를 참조하여 닉네임 입력 폼 초기화
  useEffect(() => {
    if (userProfile?.nickname) setEditNickname(userProfile.nickname);
    if (userProfile?.pubg_nickname) setEditPubgNickname(userProfile.pubg_nickname);
    if (userProfile?.pubg_platform) setEditPubgPlatform(userProfile.pubg_platform);
  }, [userProfile]);

  // 닉네임 변경 검증, DB 프로필 테이블 갱신 및 기존 게시물/댓글 작성자명 동기화 처리
  const handleUpdateProfile = async () => {
    if (!currentUser) return;

    const newNickname = editNickname.trim();
    const newPubgNickname = editPubgNickname.trim();
    const newPubgPlatform = editPubgPlatform;

    if (
      newNickname === userProfile?.nickname && 
      newPubgNickname === (userProfile?.pubg_nickname || "") &&
      newPubgPlatform === (userProfile?.pubg_platform || "steam")
    ) {
      toast.info("변경된 내용이 없습니다.");
      return;
    }

    if (newNickname.length < USER_CONFIG.MIN_NICKNAME_LENGTH || newNickname.length > USER_CONFIG.MAX_NICKNAME_LENGTH) {
      toast.warning(`닉네임은 ${USER_CONFIG.MIN_NICKNAME_LENGTH}글자 이상 ${USER_CONFIG.MAX_NICKNAME_LENGTH}글자 이하로 입력해주세요.`);
      return;
    }

    setOptimisticNickname(newNickname);

    // [디버그] 업데이트 전, 현재 내 프로필 데이터가 DB에 실제로 존재하는지, 그리고 RLS 열람 권한이 있는지 확인
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();

    if (checkError || !existingProfile) {
      console.error("🔍 DB 프로필 존재 확인 실패:", checkError);
      toast.error("프로필 정보를 불러올 수 없습니다. 다시 로그인해 보시기 바랍니다.");
      return;
    }

    const { error, data: updatedProfiles } = await supabase
      .from("profiles")
      .update({
        nickname: newNickname,
        pubg_nickname: newPubgNickname || null,
        pubg_platform: newPubgPlatform,
        updated_at: new Date(),
      })
      .eq("id", currentUser.id)
      .select();

    if (!error && updatedProfiles && updatedProfiles.length > 0) {
      toast.success("프로필이 업데이트되었습니다.");
      setEditNickname(newNickname);
      setEditPubgNickname(newPubgNickname);
      setEditPubgPlatform(newPubgPlatform);
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
      if (error?.code === "23505") {
        toast.error("이미 사용 중인 닉네임입니다.");
      } else if (!updatedProfiles || updatedProfiles.length === 0) {
        toast.error("저장할 프로필 정보가 데이터베이스에 존재하지 않습니다.");
      } else {
        toast.error("프로필 정보를 수정하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
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

      toast.success("회원 탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.");
      setIsMyPage(false);
      window.location.reload();
    } catch (error: any) {
      toast.error("탈퇴 처리 중 오류가 발생했습니다: " + error.message);
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
            id="user-nickname"
            name="nickname"
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
              fontSize: "16px",
              boxSizing: "border-box",
            }}
          />
        </div>

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
            배틀그라운드 인게임 닉네임 연동
          </label>
          <input
            id="pubg-nickname"
            name="pubg_nickname"
            type="text"
            value={editPubgNickname}
            onChange={(e) => setEditPubgNickname(e.target.value)}
            placeholder="인게임 닉네임을 정확히 입력하세요"
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#252525",
              border: "1px solid #444",
              color: "white",
              borderRadius: "6px",
              fontSize: "16px",
              boxSizing: "border-box",
            }}
          />
          <p style={{ fontSize: "12px", color: "#666", marginTop: "6px" }}>
            * 연동 시 대시보드 위젯과 메인 전적 탭에서 내 기록을 즉시 조회할 수 있습니다.
          </p>

          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            {(["steam", "kakao"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setEditPubgPlatform(p)}
                style={{
                  flex: 1,
                  padding: "10px",
                  backgroundColor: editPubgPlatform === p ? "#F2A900" : "#252525",
                  color: editPubgPlatform === p ? "black" : "#888",
                  border: `1px solid ${editPubgPlatform === p ? "#F2A900" : "#444"}`,
                  borderRadius: "6px",
                  fontWeight: "bold",
                  fontSize: "13px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {userProfile?.pubg_nickname && (
          <div className="mt-2">
            <MiniStatWidget 
              pubgNickname={userProfile.pubg_nickname} 
              platform={userProfile.pubg_platform || "steam"}
            />
          </div>
        )}

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
