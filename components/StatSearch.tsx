// 파일 위치: components/StatSearch.tsx
"use client";

import React, { useState, useEffect, useId, useCallback, useRef } from "react";
import { MatchCard } from "./stat/MatchCard";
import { StatSummaryPanel } from "./stat/StatSummaryPanel";
import { RecentAISummary } from "./stat/RecentAISummary";
import { Shield, ChevronDown, Swords, Star, Clock, User, X, Zap, MapPin, LogIn } from "lucide-react";

import { STORAGE_KEY_RECENT, STORAGE_KEY_FAVORITES } from "../lib/pubg-analysis/constants";

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
  const [hasPrefilled, setHasPrefilled] = useState(false);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem(STORAGE_KEY_RECENT);
    return saved ? JSON.parse(saved) : [];
  });
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem(STORAGE_KEY_FAVORITES);
    return saved ? JSON.parse(saved) : [];
  });
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // [V54.6] 자동완성 상태 추가
  const [suggestions, setSuggestions] = useState<{ nickname: string; platform: string }[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("mousedown", handleClickOutside);
    };
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
    setResult(null); // 새로운 검색 시작 시 기존 결과 초기화 (버그 수정 및 cascading render 방지)
    setError("");
    setCooldown(true);
    setShowDropdown(false);

    try {
      const res = await fetch(
        `/api/pubg/player?nickname=${searchName}&platform=${searchPlatform}&season=${targetSeason}`
      );
      
      let data: any;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        throw new Error(`서버 응답 지연이 발생했습니다. 잠시 후 다시 시도해 주세요. (HTTP ${res.status})`);
      }

      if (!res.ok) throw new Error(data?.error || `서버 에러가 발생했습니다. (HTTP ${res.status})`);

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
  }, [selectedSeason, nickname, platform, cooldown, params.nickname, params.platform, router]);

  useEffect(() => {
    // URL 파라미터가 변경되면 이전 에러와 결과를 초기화하여 새로운 검색을 허용
    setError("");
    setResult(null);
  }, [initialNickname, initialPlatform]);

  useEffect(() => {
    if (result || loading || error) return;

    // 1. URL 파라미터가 있는 경우 자동 검색 유지 (공유 링크 진입 등)
    if (initialNickname) {
      handleSearch(selectedSeason, initialNickname, initialPlatform);
      return;
    }

    // 2. [Option B] 로그인 유저 — 자동 검색 제거, 닉네임 프리필만 1회 수행
    if (userProfile?.pubg_nickname && !hasPrefilled) {
      const userPlatform = userProfile.pubg_platform || "steam";
      setNickname(userProfile.pubg_nickname);
      setPlatform(userPlatform);
      setHasPrefilled(true);
    }
  }, [userProfile, result, loading, error, selectedSeason, handleSearch, initialNickname, initialPlatform, hasPrefilled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
  }, [favorites]);

  // [V54.6] 자동완성 Fetch 로직 (Debounced)
  useEffect(() => {
    if (!nickname || nickname.length < 2) {
      setSuggestions([]);
      return;
    }

    // 이미 결과가 있거나 로딩 중이면 추천을 띄우지 않음 (선택 사항)
    // if (result || loading) return;

    const timer = setTimeout(async () => {
      setIsSuggesting(true);
      try {
        const res = await fetch(`/api/pubg/suggest?q=${encodeURIComponent(nickname)}`);
        const data = await res.json();
        // 현재 입력값과 결과가 일치하는지 확인 (Race Condition 방지)
        setSuggestions(data.suggestions || []);
      } catch (err) {
        console.error("[SUGGEST FETCH ERROR]", err);
      } finally {
        setIsSuggesting(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [nickname]);

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

  const getDropdownItems = () => {
    const items: { name: string; type: "favorite" | "recent" }[] = [];
    favorites.forEach(name => items.push({ name, type: "favorite" }));
    recentSearches
      .filter(name => !favorites.includes(name))
      .forEach(name => items.push({ name, type: "recent" }));
    return items;
  };

  const [showGuideline, setShowGuideline] = useState(false);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px", color: "white" }}>
      <h1 style={{ color: "#F2A900", fontSize: "24px", fontWeight: "bold", marginBottom: "20px", textAlign: "center" }}>
        📊 AI 전적 검색
      </h1>
      
      {/* 하이드레이션 오류 방지를 위해 마운트 후에만 인터랙티브 요소 렌더링 활성화 */}
      <div 
        className={`flex flex-col md:flex-row gap-3 max-w-3xl mx-auto mb-8 relative ${showDropdown ? 'z-[1000]' : 'z-30'}`}
        style={{ opacity: mounted ? 1 : 0.5 }}
      >
        <select
          id={platformId}
          name="platform"
          autoComplete="off"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="w-full md:w-48 p-3 bg-[#252525] color-white border border-[#444] rounded-md text-base focus:outline-none focus:border-[#F2A900] transition-colors"
        >
          <option value="steam">스팀 (Steam)</option>
          <option value="kakao">카카오 (Kakao)</option>
        </select>
        
        <div className="relative flex-1" ref={dropdownRef}>
          <input
            id={nicknameId}
            name="nickname"
            type="text"
            autoComplete="off"
            placeholder="정확한 대소문자 닉네임을 입력하세요"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            onFocus={() => setShowDropdown(true)}
            className="w-full p-3 bg-[#252525] text-white border border-[#444] rounded-md text-base focus:outline-none focus:border-[#F2A900] transition-colors"
          />
          {showDropdown && (recentSearches.length > 0 || favorites.length > 0 || suggestions.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a1a]/95 border border-white/10 rounded-xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                {/* [V54.6] 자동완성 추천 결과 우선 표시 */}
                {nickname.length >= 2 && suggestions.length > 0 && (
                  <div className="pb-2">
                    <div className="px-4 py-2 text-[10px] font-black text-amber-500/50 uppercase tracking-widest border-b border-white/5 bg-white/2">추천 플레이어</div>
                    {suggestions.map((s, i) => {
                      const isRecent = recentSearches.includes(s.nickname);
                      return (
                        <div
                          key={`suggest-${s.nickname}-${i}`}
                          onClick={() => {
                            setNickname(s.nickname);
                            setPlatform(s.platform);
                            handleSearch(selectedSeason, s.nickname, s.platform);
                            setShowDropdown(false);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-amber-500/10 transition-colors cursor-pointer border-b border-white/5 last:border-0 group"
                        >
                          <div className="relative">
                            <User size={14} className={`${isRecent ? 'text-blue-400' : 'text-amber-500'} shrink-0`} />
                            {isRecent && <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full border border-[#0a0a1a]" title="최근 검색함" />}
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-200 group-hover:text-white truncate">{s.nickname}</span>
                              {isRecent && (
                                <span className="px-1 py-0.5 bg-blue-500/20 text-blue-400 text-[8px] font-black rounded uppercase tracking-tighter border border-blue-500/30">최근</span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-500 uppercase">{s.platform}</span>
                          </div>
                          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            <Star size={12} className="text-amber-500/30" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 최근 검색 및 즐겨찾기 (검색어가 짧거나 결과가 없을 때 보완) */}
                {(nickname.length < 2 || suggestions.length === 0) && (
                  <>
                    {nickname.length >= 2 && suggestions.length === 0 && !isSuggesting && (
                      <div className="px-4 py-4 text-center text-xs text-gray-500 italic">검색 결과가 없습니다.</div>
                    )}
                    {getDropdownItems().map((item, i) => {
                      const isFav = favorites.includes(item.name);
                      return (
                        <div
                          key={`${item.name}-${i}`}
                          onClick={() => {
                            setNickname(item.name);
                            handleSearch(selectedSeason, item.name);
                            setShowDropdown(false);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5 last:border-0 group"
                        >
                          {item.type === "favorite" ? (
                            <Star size={14} className="text-yellow-400 fill-yellow-400 shrink-0" />
                          ) : (
                            <Clock size={14} className="text-gray-500 shrink-0" />
                          )}
                          <span className="text-sm font-bold text-gray-300 group-hover:text-white truncate">{item.name}</span>
                          
                          <div className="ml-auto flex items-center gap-2">
                            <button
                              onClick={(e) => toggleFavorite(item.name, e)}
                              className={`p-1.5 rounded-lg transition-all ${isFav ? "text-yellow-400 bg-yellow-400/10" : "text-gray-600 hover:text-yellow-400 hover:bg-yellow-400/10"}`}
                            >
                              <Star size={14} fill={isFav ? "currentColor" : "none"} />
                            </button>
                            {item.type === "recent" && (
                              <button
                                onClick={(e) => removeRecentSearch(item.name, e)}
                                className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => handleSearch()}
            disabled={loading || cooldown}
            className={`flex-1 md:flex-none px-6 py-3 rounded-md font-bold text-base whitespace-nowrap transition-all active:scale-95 ${loading || cooldown ? "bg-[#555] text-[#aaa] cursor-not-allowed" : "bg-[#F2A900] text-black cursor-pointer hover:bg-[#ffb700]"}`}
          >
            {loading ? "검색중..." : cooldown ? "쿨타임 ⏳" : "검색"}
          </button>

          <button
            onClick={() => router.push('/stats/battle')}
            className="px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold border-none rounded-md flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <Swords size={20} />
            <span className="hidden md:inline">비교 모드</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: "#ff4d4d", marginBottom: "20px", padding: "15px", backgroundColor: "rgba(255, 77, 77, 0.1)", borderRadius: "6px", textAlign: "center" }}>
          {error}
        </div>
      )}

      {/* [Empty State V1.0] 결과 없음 + 로딩/에러 아님 → 유저 상태별 분기 화면 */}
      {!result && !loading && !error && (
        <>
          {/* 로그인 + 닉네임 미등록 → 마이페이지 등록 유도 카드 */}
          {user && !userProfile?.pubg_nickname && (
            <RegisterNicknamePrompt />
          )}
          {/* 결과가 없는 모든 상태 → Hero 화면 (비로그인 / 닉네임 미등록 / 닉네임 등록 후 검색 전 모두 포함) */}
          <HeroEmptyState
            recentSearches={recentSearches}
            favorites={favorites}
            isLoggedIn={!!user}
            onQuickSearch={(name: string) => {
              setNickname(name);
              handleSearch(selectedSeason, name, platform);
            }}
          />
        </>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #333", paddingBottom: "15px", flexWrap: "wrap", gap: "15px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "28px", fontWeight: "bold" }}>
                <span style={{ color: "#888", fontSize: "16px", marginRight: "10px", verticalAlign: "middle" }}>
                  {result.platform === "steam" ? "Steam" : "Kakao"}
                </span>
                {result.nickname}
              </div>
              <button
                onClick={() => router.push(`/stats/battle?nick1=${encodeURIComponent(result.nickname)}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 rounded-full text-[11px] font-black transition-all group"
              >
                <Swords size={12} className="group-hover:rotate-12 transition-transform" />
                <span>이 플레이어와 비교하기</span>
              </button>
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

          {/* 경쟁전 / 일반전 통합 탭 패널 */}
          <StatSummaryPanel stats={result.stats} isMobile={isMobile} />

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
                    <span className="text-xs font-black text-white uppercase tracking-wider">전술 지표 사전</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <div className="flex gap-3">
                      <span className="text-amber-500/30 font-black italic">01</span>
                      <div>
                        <div className="text-gray-200 text-xs font-bold mb-1">평균 반응 속도</div>
                        <div className="text-gray-500 text-[11px] leading-relaxed">피격 시점부터 적에게 반격을 가하기까지의 시간. 당신의 순수 피지컬과 위기 대처 능력을 측정합니다.</div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-amber-500/30 font-black italic">02</span>
                      <div>
                        <div className="text-gray-200 text-xs font-bold mb-1">백업 소요 속도 (트레이드)</div>
                        <div className="text-gray-500 text-[11px] leading-relaxed">아군이 기절한 후 당신이 해당 적을 처치하기까지의 시간. 팀워크와 커버 능력을 측정합니다.</div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-amber-500/30 font-black italic">03</span>
                      <div>
                        <div className="text-gray-200 text-xs font-bold mb-1">전투 주도권</div>
                        <div className="text-gray-500 text-[11px] leading-relaxed">교전 시작 시 먼저 선제 타격을 가한 비율. 능동적으로 교전을 리드하는 성향을 분석합니다.</div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-amber-500/30 font-black italic">04</span>
                      <div>
                        <div className="text-gray-200 text-xs font-bold mb-1">팀 내 화력 지분</div>
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
              isMobile={isMobile}
            />
          )}

          <div style={{ marginTop: "20px" }}>
            <h3 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "15px", borderBottom: "1px solid #333", paddingBottom: "10px" }}>
              ⚔️ 최근 매치 (최대 20게임)
            </h3>

            {result.recentMatches && result.recentMatches.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {result.recentMatches.slice(0, 20).map((matchId: string, index: number) => (
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

// ─────────────────────────────────────────────────────────────
// [Empty State V1.0] 보조 컴포넌트
// ─────────────────────────────────────────────────────────────

/** 닉네임 미등록 로그인 유저 — 마이페이지 등록 유도 카드 */
function RegisterNicknamePrompt() {
  return (
    <div className="flex items-center gap-4 p-5 bg-amber-500/5 border border-amber-500/20 rounded-2xl mb-4 animate-in fade-in duration-300">
      <div className="p-3 bg-amber-500/10 rounded-xl shrink-0">
        <User size={22} className="text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-white">PUBG 닉네임을 등록하면 전적을 바로 볼 수 있어요!</p>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">마이페이지에서 닉네임을 등록하면, 다음 방문 시 검색창에 자동으로 입력됩니다.</p>
      </div>
      <a
        href="/mypage"
        className="shrink-0 px-4 py-2 bg-amber-500 text-black text-xs font-black rounded-xl hover:bg-amber-400 transition-colors whitespace-nowrap active:scale-95"
      >
        닉네임 등록 →
      </a>
    </div>
  );
}

/** 비로그인 / 닉네임 미등록 유저 — Hero Empty State */
function HeroEmptyState({
  recentSearches,
  favorites,
  isLoggedIn,
  onQuickSearch,
}: {
  recentSearches: string[];
  favorites: string[];
  isLoggedIn: boolean;
  onQuickSearch: (name: string) => void;
}) {
  // [Hydration 수정] localStorage 의존 데이터는 마운트 후에만 사용
  // 서버/클라이언트 초기 렌더링 결과를 동일하게 유지하여 Hydration 불일치 방지
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const quickList = mounted ? [
    ...favorites.slice(0, 3),
    ...recentSearches.filter((n) => !favorites.includes(n)).slice(0, Math.max(0, 5 - Math.min(favorites.length, 3))),
  ].slice(0, 5) : [];

  const featureCards = [
    {
      icon: <Zap size={20} className="text-amber-500" />,
      title: "AI 전술 분석",
      desc: "반응속도, 팀 임팩트, 교전 주도권을 텔레메트리 데이터로 정밀 분석합니다.",
      badge: "CORE",
      badgeClass: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    },
    {
      icon: <MapPin size={20} className="text-blue-400" />,
      title: "2D 리플레이",
      desc: "실제 동선 재생과 피격 위치를 지도 위에 시각화하여 전황을 재현합니다.",
      badge: "VISUAL",
      badgeClass: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    },
    {
      icon: <Swords size={20} className="text-purple-400" />,
      title: "비교 모드",
      desc: "두 플레이어의 전술 지표를 1:1로 직관적으로 비교 분석합니다.",
      badge: "PVP",
      badgeClass: "text-purple-400 bg-purple-400/10 border-purple-400/20",
    },
  ];

  return (
    <div className="flex flex-col gap-8 pt-4 animate-in fade-in duration-500">
      {/* 브랜드 슬로건 */}
      <div className="text-center py-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full mb-4">
          <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
          <span className="text-[11px] font-black text-amber-500 uppercase tracking-widest">BGMS Tactical AI</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-black text-white mb-3 leading-tight">
          30초 만에 확인하는<br />
          <span className="text-amber-500">나의 전술 등급</span>
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          실시간 텔레메트리 기반 &middot; AI 교전 분석 &middot; 2D 리플레이
        </p>
      </div>

      {/* 기능 소개 카드 3종 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {featureCards.map((card) => (
          <div
            key={card.title}
            className="p-5 bg-white/[0.03] border border-white/[0.08] rounded-2xl hover:border-white/15 hover:bg-white/5 transition-all duration-300"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-black/40 rounded-xl">{card.icon}</div>
              <span className={`px-2 py-0.5 text-[9px] font-black rounded-md border uppercase tracking-widest ${card.badgeClass}`}>
                {card.badge}
              </span>
            </div>
            <h3 className="text-sm font-black text-white mb-1.5">{card.title}</h3>
            <p className="text-[11px] text-gray-500 leading-relaxed">{card.desc}</p>
          </div>
        ))}
      </div>

      {/* 최근/즐겨찾기 빠른 검색 (localStorage 기반, DB 비용 0) */}
      {quickList.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={13} className="text-gray-600" />
            <span className="text-[11px] font-black text-gray-600 uppercase tracking-widest">최근 검색한 플레이어</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickList.map((name) => {
              const isFav = favorites.includes(name);
              return (
                <button
                  key={name}
                  onClick={() => onQuickSearch(name)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/30 rounded-full text-xs font-bold text-gray-300 hover:text-white transition-all"
                >
                  {isFav
                    ? <Star size={11} className="text-yellow-400 fill-yellow-400" />
                    : <Clock size={11} className="text-gray-600" />
                  }
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 로그인 유도 링크 (비로그인 시) */}
      {!isLoggedIn && (
        <div className="flex items-center justify-center gap-3 py-4 border-t border-white/5">
          <span className="text-xs text-gray-600">닉네임을 저장하고 빠르게 내 전적 보기</span>
          <a
            href="/login"
            className="flex items-center gap-1.5 text-xs font-black text-amber-500 hover:text-amber-400 transition-colors"
          >
            <LogIn size={13} />
            로그인하기
          </a>
        </div>
      )}
    </div>
  );
}
