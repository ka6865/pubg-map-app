import React from "react";
import { Compass, Search, Users, Crosshair, Loader2 } from "lucide-react";
import { PlayerTrajectory } from "@/types/replay3d";

interface ReplaySidebarProps {
  isOpen: boolean;
  players: PlayerTrajectory[];
  hiddenPlayers: Set<string>;
  trackingPlayer: string | null;
  currentTimeMs: number;
  altitudeScale: number;
  setAltitudeScale: (v: number) => void;
  togglePlayer: (name: string) => void;
  handlePlayerFocus: (name: string) => void;
  handlePlayerTrack: (name: string) => void;
  
  // 검색 & 로드 제어
  nickname: string;
  setNickname: (name: string) => void;
  matchId: string;
  setMatchId: (id: string) => void;
  platform: string;
  setPlatform: (plat: string) => void;
  isLoading: boolean;
  isMapLoading: boolean;
  handleFetchTelemetry: () => void;
}

export default function ReplaySidebar({
  isOpen,
  players,
  hiddenPlayers,
  trackingPlayer,
  currentTimeMs,
  altitudeScale,
  setAltitudeScale,
  togglePlayer,
  handlePlayerFocus,
  handlePlayerTrack,
  nickname,
  setNickname,
  matchId,
  setMatchId,
  platform,
  setPlatform,
  isLoading,
  isMapLoading,
  handleFetchTelemetry
}: ReplaySidebarProps) {
  
  // 아군 & 적군 분기
  const teamPlayers = players.filter(p => p.isTeam);
  const enemyPlayers = players.filter(p => !p.isTeam);

  // teamId별로 적군 스쿼드 그룹화
  const enemyTeams: Record<number, PlayerTrajectory[]> = {};
  enemyPlayers.forEach(p => {
    const tId = p.teamId ?? 999;
    if (!enemyTeams[tId]) enemyTeams[tId] = [];
    enemyTeams[tId].push(p);
  });

  const renderPlayerBtn = (p: PlayerTrajectory) => {
    const isHidden = hiddenPlayers.has(p.name);
    const isDead = p.deathTimeMs != null && currentTimeMs >= p.deathTimeMs;
    const isTracking = trackingPlayer === p.name;
    
    return (
      <div
        key={p.name}
        className="flex items-center justify-between text-[10px] font-mono px-2 py-1 rounded border transition-all"
        style={{
          backgroundColor: isHidden
            ? "rgba(30,30,30,0.8)"
            : isTracking
            ? `${p.color}28`
            : `${p.color}18`,
          borderColor: isHidden
            ? "#30363d"
            : isTracking
            ? "#ff9f0a"
            : p.color,
          color: isHidden ? "#484f58" : p.color,
        }}
      >
        {/* 닉네임 영역 (클릭: 초점 이동, 더블클릭: 트래킹 토글) */}
        <div
          onClick={() => handlePlayerFocus(p.name)}
          onDoubleClick={() => handlePlayerTrack(p.name)}
          className="flex-grow flex items-center gap-1.5 cursor-pointer select-none py-0.5"
          title="클릭: 초점 이동 | 더블클릭: 카메라 추적 고정"
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: isHidden ? "#484f58" : p.color }}
          />
          <span className="truncate max-w-[110px] font-bold">
            {p.name}
          </span>
          {isTracking && (
            <span className="text-[8px] bg-[#ff9f0a] text-[#0d1117] font-bold px-1 rounded animate-pulse shrink-0 scale-90">
              🎥 REC
            </span>
          )}
        </div>

        {/* 표시/숨김/사망 상태 토글 버튼 */}
        <button
          onClick={() => togglePlayer(p.name)}
          className="text-[9px] shrink-0 text-[#8b949e] hover:text-[#ff9f0a] ml-2 px-1 py-0.5 hover:bg-[#21262d] rounded transition-all cursor-pointer"
        >
          {isDead ? "💀" : isHidden ? "숨김" : "표시"}
        </button>
      </div>
    );
  };

  return (
    <div
      className={`fixed md:relative top-0 bottom-0 left-0 z-40 w-72 bg-[#161b22]/98 backdrop-blur border-r border-[#30363d] flex flex-col p-4 gap-4 overflow-y-auto no-scrollbar shrink-0 select-none transition-transform duration-300 md:transform-none ${
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}
      style={{ height: "100%" }}
    >
      {/* ── 헤더 타이틀 ── */}
      <div className="flex items-center gap-2 border-b border-[#30363d] pb-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#ff9f0a]/10 flex items-center justify-center text-[#ff9f0a]">
          <Compass className="w-5 h-5 animate-pulse" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-sm font-bold text-[#ff9f0a] leading-tight">3D 전술 리플레이</h1>
          <span className="text-[9px] text-[#8b949e]">PUBG 실시간 전술 분석기</span>
        </div>
      </div>

      {/* ── 텔레메트리 매치 데이터 검색 폼 ── */}
      <div className="flex flex-col gap-2.5 bg-[#0d1117]/60 p-3 rounded-xl border border-[#30363d] shrink-0">
        <label className="text-[10px] font-bold text-[#ff9f0a] uppercase tracking-wider flex items-center gap-1">
          <Search className="w-3.5 h-3.5" /> 분석 매치 탐색
        </label>
        
        {/* 플랫폼 */}
        <div className="flex flex-col gap-1">
          <span className="text-[9px] text-[#8b949e]">플랫폼</span>
          <div className="grid grid-cols-2 gap-1">
            {["steam", "kakao"].map(p => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`py-1 text-[10px] font-bold uppercase rounded border transition-all cursor-pointer ${
                  platform === p
                    ? "bg-[#ff9f0a] text-[#0d1117] border-[#ff9f0a]"
                    : "bg-[#21262d] text-[#c9d1d9] border-[#30363d] hover:bg-[#30363d]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 닉네임 */}
        <div className="flex flex-col gap-1">
          <span className="text-[9px] text-[#8b949e]">닉네임</span>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임 입력 (대소문자 구분)"
            className="bg-[#21262d] border border-[#30363d] text-xs px-2.5 py-1.5 rounded text-[#e6edf3] outline-none focus:border-[#ff9f0a] transition-all"
          />
        </div>

        {/* 매치 ID */}
        <div className="flex flex-col gap-1">
          <span className="text-[9px] text-[#8b949e]">매치 UUID</span>
          <input
            type="text"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            placeholder="Match UUID 입력"
            className="bg-[#21262d] border border-[#30363d] text-[10px] font-mono px-2.5 py-1.5 rounded text-[#e6edf3] outline-none focus:border-[#ff9f0a] transition-all"
          />
        </div>

        {/* 불러오기 버튼 */}
        <button
          onClick={handleFetchTelemetry}
          disabled={isLoading || isMapLoading || !nickname || !matchId}
          className="w-full py-2 bg-[#ff9f0a] hover:bg-[#e08b00] disabled:bg-[#30363d] disabled:text-[#8b949e] text-[#0d1117] font-black text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg active:scale-95 disabled:scale-100"
        >
          {(isLoading || isMapLoading) ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>로딩 중...</span>
            </>
          ) : (
            <span>전술 데이터 불러오기</span>
          )}
        </button>
      </div>

      {/* ── 프리미엄 전술 고도 렌더 제어 ── */}
      <div className="flex flex-col gap-2 bg-[#0d1117]/30 p-2.5 rounded-lg border border-[#30363d]">
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[10px] font-bold">
            <span className="text-[#8b949e]">고도 스케일</span>
            <span className="font-mono text-[#ff9f0a] font-bold">{(altitudeScale * 1000).toFixed(0)}%</span>
          </div>
          <input
            type="range" min="0" max="0.08" step="0.005"
            value={altitudeScale}
            onChange={(e) => setAltitudeScale(Number(e.target.value))}
            className="w-full accent-[#ff9f0a] h-1 bg-[#30363d] rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-[#8b949e]">
            <span>평면</span><span>입체감 최대</span>
          </div>
        </div>
      </div>

      <hr className="border-[#30363d]" />

      {/* 플레이어 목록 */}
      <div className="flex flex-col gap-3 mt-auto">
        {/* 아군 스쿼드 */}
        {teamPlayers.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-[#2ea043] uppercase tracking-wider flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> 아군 스쿼드 ({teamPlayers.length})
            </label>
            <div className="flex flex-col gap-1 bg-[#0d1117] p-2 rounded border border-[#238636]/40">
              {teamPlayers.map(renderPlayerBtn)}
            </div>
          </div>
        )}
        
        {/* 적군 */}
        {enemyPlayers.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-[#ff4a4a] uppercase tracking-wider flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5" /> 적군 ({enemyPlayers.length})
            </label>
            <div className="flex flex-col gap-2.5 bg-[#0d1117] p-2 rounded border border-[#ef4444]/30 max-h-48 overflow-y-auto">
              {Object.entries(enemyTeams)
                .sort(([aId], [bId]) => Number(aId) - Number(bId)) // 팀 ID 순서 정렬
                .map(([teamId, members]) => {
                  const firstMemberColor = members[0]?.color || "#ff4a4a";
                  return (
                    <div key={teamId} className="flex flex-col gap-1 border-l-2 pl-2 py-0.5" style={{ borderColor: `${firstMemberColor}50` }}>
                      <div className="text-[8px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: firstMemberColor }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: firstMemberColor }} />
                        <span>TEAM {teamId}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {members.map(renderPlayerBtn)}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
