// 파일 위치: components/StatSearch.tsx
"use client";

import React, { useState, useEffect, useId, useCallback } from "react";
import { MatchCard } from "./stat/MatchCard";
import { StatSummaryCard } from "./stat/StatSummaryCard";
import { RecentAISummary } from "./stat/RecentAISummary";
import { Shield, ChevronDown } from "lucide-react";

const STORAGE_KEY_RECENT = "pubg_recent_searches_v2";
const STORAGE_KEY_FAVORITES = "pubg_favorites_v2";
const STORAGE_KEY_LAST_SEARCH = "pubg_last_search_v2";

import type { UserProfile } from "../types/map";
import { useAuth } from "./AuthProvider";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "../lib/supabase";

interface StatSearchProps {
  initialPlatform?: string;
  initialNickname?: string;
}

/** 전적 검색 메인 컴포넌트 */
export default function StatSearch({ initialPlatform, initialNickname }: StatSearchProps) {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  
  // React 표준 방식의 고유 ID 생성 (서버/클라이언트 일치 보장)
  const platformId = useId();
  const nicknameId = useId();
  const seasonId = useId();

  const [platform, setPlatform] = useState(initialPlatform || "steam");
  const [nickname, setNickname] = useState(initialNickname || "");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [selectedSeason, setSelectedSeason] = useState("");

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<"recent" | "favorites">("recent");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const savedRecent = localStorage.getItem(STORAGE_KEY_RECENT);
    if (savedRecent) setRecentSearches(JSON.parse(savedRecent));

    const savedFavorites = localStorage.getItem(STORAGE_KEY_FAVORITES);
    if (savedFavorites) setFavorites(JSON.parse(savedFavorites));

    const savedLast = localStorage.getItem(STORAGE_KEY_LAST_SEARCH);
    if (savedLast) {
      const { nickname: lastNick, platform: lastPlat } = JSON.parse(savedLast);
      if (lastNick) setNickname(lastNick);
      if (lastPlat) setPlatform(lastPlat);
    }
  }, []);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("*").eq("id", user.id).single().then(({ data }) => {
        if (data) setUserProfile(data as UserProfile);
      });
    } else {
      setUserProfile(null);
    }
  }, [user]);

  // 유저 프로필에 연동된 배그 닉네임이 있다면 초기 마운트 시 자동 검색
  const handleSearch = useCallback(async (
    targetSeason = selectedSeason,
    overrideNickname?: string,
    overridePlatform?: string
  ) => {
    const searchName = overrideNickname || nickname;
    const searchPlatform = overridePlatform || platform;
    if (!searchName.trim() || cooldown) return;

    setLoading(true);
    setResult(null); // 새로운 검색 시작 시 기존 결과 초기화 (버그 수정)
    setError("");
    setCooldown(true);
    setShowDropdown(false);

    try {
      const res = await fetch(
        `/api/pubg/player?nickname=${searchName}&platform=${searchPlatform}&season=${targetSeason}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResult(data);
      setSelectedSeason(data.seasonId);

      const actualName = data.nickname;
      setNickname(actualName);

      setRecentSearches((prev) => {
        const updated = [
          actualName,
          ...prev.filter((n) => n !== actualName),
        ].slice(0, 10);
        localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(updated));
        return updated;
      });

      // 마지막 검색어 저장
      localStorage.setItem(STORAGE_KEY_LAST_SEARCH, JSON.stringify({ nickname: actualName, platform: searchPlatform }));

      // URL 업데이트 (동적 라우팅)
      if (params.nickname !== actualName || params.platform !== searchPlatform) {
        router.push(`/stats/${searchPlatform}/${actualName}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setCooldown(false), 3000);
    }
  }, [selectedSeason, nickname, platform, cooldown]);

  useEffect(() => {
    // URL 파라미터가 변경되면 이전 에러와 결과를 초기화하여 새로운 검색을 허용
    setError("");
    setResult(null);
  }, [initialNickname, initialPlatform]);

  useEffect(() => {
    // 이미 결과가 있거나, 로딩 중이거나, 에러가 발생한 상태라면 자동 검색을 시도하지 않음
    if (result || loading || error) return;

    // 1. URL 파라미터가 있는 경우 우선순위 1위
    if (initialNickname) {
      handleSearch(selectedSeason, initialNickname, initialPlatform);
      return;
    }

    // 2. 로그인 유저 프로필 연동 (URL 파라미터가 없을 때만)
    if (userProfile?.pubg_nickname) {
      const userPlatform = userProfile.pubg_platform || "steam";
      setNickname(userProfile.pubg_nickname);
      setPlatform(userPlatform);
      handleSearch(selectedSeason, userProfile.pubg_nickname, userPlatform);
    }
  }, [userProfile, result, loading, error, selectedSeason, handleSearch, initialNickname, initialPlatform]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [name, ...prev]
    );
  };

  const removeRecentSearch = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches((prev) => {
      const updated = prev.filter((n) => n !== name);
      localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(updated));
      return updated;
    });
  };

  const renderDropdownList = (names: string[], type: "recent" | "favorites") => {
    if (names.length === 0) {
      return (
        <div
          style={{
            padding: "30px 20px",
            textAlign: "center",
            color: "#666",
            fontSize: "14px",
          }}
        >
          {type === "recent" ? (
            "최근 검색한 닉네임이 없습니다."
          ) : (
            <div style={{ textAlign: "left" }}>
              관심있는 유저에 <span style={{ color: "#f2b822" }}>☆</span>{" "}
              즐겨찾기를 하여 편리하게 정보를 받아보세요.
            </div>
          )}
        </div>
      );
    }
    return names.map((name) => {
      const isFav = favorites.includes(name);
      return (
        <div
          key={name}
          onClick={() => {
            setNickname(name);
            handleSearch(selectedSeason, name);
          }}
          style={{
            padding: "12px 15px",
            cursor: "pointer",
            color: "#212529",
            borderBottom: "1px solid #ced4da",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <span style={{ fontWeight: "bold", flex: 1 }}>{name}</span>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0 }}>
            <span
              onClick={(e) => toggleFavorite(name, e)}
              style={{
                fontSize: "18px",
                color: isFav ? "#f2b822" : "#adb5bd",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              {isFav ? "⭐" : "☆"}
            </span>
            {type === "recent" && (
              <span
                onClick={(e) => removeRecentSearch(name, e)}
                style={{
                  fontSize: "16px",
                  color: "#adb5bd",
                  cursor: "pointer",
                  fontWeight: "bold",
                  padding: "0 2px",
                }}
              >
                ✕
              </span>
            )}
          </div>
        </div>
      );
    });
  };

  const [showGuideline, setShowGuideline] = useState(false);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px", color: "white" }}>
      <h2 style={{ color: "#F2A900", fontSize: "24px", fontWeight: "bold", marginBottom: "20px", textAlign: "center" }}>
        📊 AI 전적 검색
      </h2>
      
      {/* 하이드레이션 오류 방지를 위해 마운트 후에만 인터랙티브 요소 렌더링 활성화 */}
      <div style={{ display: "flex", gap: "10px", maxWidth: "800px", position: "relative", flexWrap: "wrap", margin: "0 auto 30px auto", opacity: mounted ? 1 : 0.5 }}>
        <select
          id={platformId}
          name="platform"
          autoComplete="off"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          style={{ padding: "12px", backgroundColor: "#252525", color: "white", border: "1px solid #444", borderRadius: "6px", fontSize: "16px" }}
        >
          <option value="steam">스팀 (Steam)</option>
          <option value="kakao">카카오 (Kakao)</option>
        </select>
        
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <input
            id={nicknameId}
            name="nickname"
            type="text"
            autoComplete="username"
            placeholder="정확한 대소문자 닉네임을 입력하세요"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            style={{ width: "100%", padding: "12px", backgroundColor: "#252525", color: "white", border: "1px solid #444", borderRadius: "6px", boxSizing: "border-box", fontSize: "16px" }}
          />
          {showDropdown && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: "5px", backgroundColor: "#e9ecef", borderRadius: "6px", overflow: "hidden", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}
            >
              <div style={{ display: "flex", backgroundColor: "#dee2e6", borderBottom: "1px solid #ced4da" }}>
                <div
                  onClick={() => setActiveTab("recent")}
                  style={{ flex: 1, padding: "10px 15px", textAlign: "center", cursor: "pointer", fontSize: "14px", fontWeight: activeTab === "recent" ? "bold" : "normal", color: activeTab === "recent" ? "#212529" : "#666", backgroundColor: activeTab === "recent" ? "#e9ecef" : "transparent" }}
                >
                  최근 검색
                </div>
                <div
                  onClick={() => setActiveTab("favorites")}
                  style={{ flex: 1, padding: "10px 15px", textAlign: "center", cursor: "pointer", fontSize: "14px", fontWeight: activeTab === "favorites" ? "bold" : "normal", color: activeTab === "favorites" ? "#212529" : "#666", backgroundColor: activeTab === "favorites" ? "#e9ecef" : "transparent", borderLeft: "1px solid #ced4da" }}
                >
                  즐겨찾기
                </div>
              </div>
              <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                {activeTab === "recent"
                  ? renderDropdownList(recentSearches, "recent")
                  : renderDropdownList(favorites, "favorites")}
              </div>
            </div>
          )}
        </div>
        
        <button
          onClick={() => handleSearch()}
          disabled={loading || cooldown}
          style={{ padding: "0 20px", backgroundColor: loading || cooldown ? "#555" : "#F2A900", color: loading || cooldown ? "#aaa" : "black", fontWeight: "bold", border: "none", borderRadius: "6px", fontSize: "16px", whiteSpace: "nowrap", flexShrink: 0, cursor: loading || cooldown ? "not-allowed" : "pointer" }}
        >
          {loading ? "검색중..." : cooldown ? "쿨타임 ⏳" : "검색"}
        </button>
      </div>

      {error && (
        <div style={{ color: "#ff4d4d", marginBottom: "20px", padding: "15px", backgroundColor: "rgba(255, 77, 77, 0.1)", borderRadius: "6px", textAlign: "center" }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #333", paddingBottom: "15px" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold" }}>
              <span style={{ color: "#888", fontSize: "16px", marginRight: "10px", verticalAlign: "middle" }}>
                {result.platform === "steam" ? "Steam" : "Kakao"}
              </span>
              {result.nickname}
            </div>
            <select
              id={seasonId}
              name="season"
              autoComplete="off"
              value={selectedSeason}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ padding: "8px 12px", backgroundColor: "#252525", color: "white", border: "1px solid #444", borderRadius: "6px" }}
            >
              {result.seasons.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h3 style={{ fontSize: "18px", color: "#F2A900", marginBottom: "15px" }}>🏆 경쟁전 (Ranked)</h3>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <StatSummaryCard title="듀오" data={result.stats?.ranked?.duo} isRanked={true} />
              <StatSummaryCard title="스쿼드" data={result.stats?.ranked?.squad} isRanked={true} />
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: "18px", color: "#aaa", marginBottom: "15px" }}>🎮 일반전 (Normal)</h3>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <StatSummaryCard title="솔로" data={result.stats?.normal?.solo} isRanked={false} />
              <StatSummaryCard title="듀오" data={result.stats?.normal?.duo} isRanked={false} />
              <StatSummaryCard title="스쿼드" data={result.stats?.normal?.squad} isRanked={false} />
            </div>
          </div>

          {/* BGMS AI 전술 분석 시스템 설명 (토글형으로 최적화) */}
          <div className="mt-4 mb-6">
            <button 
              onClick={() => setShowGuideline(!showGuideline)}
              className="w-full flex items-center justify-between p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl hover:bg-amber-500/10 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500 rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                  <Shield size={18} className="text-black" />
                </div>
                <div className="flex flex-col items-start">
                  <h3 className="text-sm font-black text-amber-500 tracking-tight">BGMS AI 전술 분석 가이드 (V7.0)</h3>
                  <span className="text-[10px] text-amber-500/60 font-bold">지표 산출 공식 및 시스템 안내 확인하기</span>
                </div>
              </div>
              <ChevronDown 
                size={20} 
                className={`text-amber-500/50 group-hover:text-amber-500 transition-transform duration-300 ${showGuideline ? 'rotate-180' : ''}`} 
              />
            </button>

            {showGuideline && (
              <div className="mt-3 p-6 bg-black/40 border border-white/5 rounded-[2rem] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <div className="text-amber-500 text-[11px] font-black mb-1">01. 상황 입체 분석</div>
                    <div className="text-gray-400 text-xs leading-relaxed">단순 킬/딜을 넘어 교전 거리, 지형 고도차, 아군과의 거리 등 텔레메트리를 입체적으로 분석합니다.</div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <div className="text-amber-500 text-[11px] font-black mb-1">02. 공정한 평가</div>
                    <div className="text-gray-400 text-xs leading-relaxed">불가항력적인 자기장 피해나 교전 기회가 없던 상황(N/A)은 지표 계산에서 제외하여 억울한 비난을 방지합니다.</div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <div className="text-amber-500 text-[11px] font-black mb-1">03. 티어 판별 엔진</div>
                    <div className="text-gray-400 text-xs leading-relaxed">프로급(Elite) 유저들의 전술 데이터를 기준으로 당신의 현재 실력을 S~C 티어로 정밀 판별합니다.</div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-3 bg-amber-500 rounded-full" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">핵심 지표 사전 (Metric Dictionary)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <div className="flex gap-3">
                      <span className="text-amber-500/30 font-black italic">01</span>
                      <div>
                        <div className="text-gray-200 text-xs font-bold mb-1">반응 속도 (Reaction Latency)</div>
                        <div className="text-gray-500 text-[11px] leading-relaxed">피격 시점부터 적에게 반격을 가하기까지의 시간. 당신의 순수 피지컬과 위기 대처 능력을 측정합니다.</div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-amber-500/30 font-black italic">02</span>
                      <div>
                        <div className="text-gray-200 text-xs font-bold mb-1">백업 속도 (Trade Latency)</div>
                        <div className="text-gray-500 text-[11px] leading-relaxed">아군이 기절한 후 당신이 해당 적을 처치하기까지의 시간. 팀워크와 커버 능력을 측정합니다.</div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-amber-500/30 font-black italic">03</span>
                      <div>
                        <div className="text-gray-200 text-xs font-bold mb-1">전투 주도권 (Initiative)</div>
                        <div className="text-gray-500 text-[11px] leading-relaxed">교전 시작 시 먼저 선제 타격을 가한 비율. 능동적으로 교전을 리드하는 성향을 분석합니다.</div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-amber-500/30 font-black italic">04</span>
                      <div>
                        <div className="text-gray-200 text-xs font-bold mb-1">팀 기여 임팩트 (Team Impact)</div>
                        <div className="text-gray-500 text-[11px] leading-relaxed">팀 전체 데미지 중 당신의 지분. 단순 킬 수를 넘어 교전에서 실제로 얼마나 화력을 담당했는지 측정합니다.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 최근 10경기 AI 종합 분석 섹션 추가 - 닉네임이 바뀔 때마다 리셋되도록 key 부여 */}
          {result.recentMatches && result.recentMatches.length > 0 && (
            <RecentAISummary 
              key={result.nickname}
              matchIds={result.recentMatches} 
              nickname={result.nickname} 
              platform={result.platform} 
            />
          )}

          <div style={{ marginTop: "20px" }}>
            <h3 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "15px", borderBottom: "1px solid #333", paddingBottom: "10px" }}>
              ⚔️ 최근 매치 (최대 10게임)
            </h3>

            {result.recentMatches && result.recentMatches.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {result.recentMatches.slice(0, 10).map((matchId: string, index: number) => (
                  <MatchCard
                    key={matchId}
                    matchId={matchId}
                    nickname={result.nickname}
                    platform={result.platform}
                    isMobile={isMobile}
                    index={index}
                    onNicknameClick={(clickedName) => {
                      setNickname(clickedName);
                      // handleSearch는 platform을 필요로 하므로 현재 선택된 platform 전달
                      handleSearch(selectedSeason, clickedName, platform);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                ))}
              </div>
            ) : (
              <div style={{ padding: "40px", backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "12px", textAlign: "center", color: "#888" }}>
                최근 14일 이내에 플레이한 매치 기록이 없습니다.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
