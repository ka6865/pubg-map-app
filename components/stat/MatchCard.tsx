import React, { useState, useEffect } from "react";
import { HelpCircle, BarChart2 } from "lucide-react";
import type { MatchData, MatchTeamMember } from "../../types/stat";

/**
 * 간단한 마크다운 파서를 통해 AI 응답을 시각적으로 예쁘게 렌더링합니다.
 */
const renderMarkdown = (text: string) => {
  if (!text) return null;
  const lines = text.split('\n');
  
  return lines.map((line, idx) => {
    // 빈 줄 처리
    if (!line.trim()) {
      return <div key={idx} style={{ height: "6px" }} />;
    }
    
    // 헤더 처리 (###, ##, #)
    let isHeader = false;
    let headerLevel = 0;
    if (line.startsWith('### ')) { isHeader = true; headerLevel = 3; }
    else if (line.startsWith('## ')) { isHeader = true; headerLevel = 2; }
    else if (line.startsWith('# ')) { isHeader = true; headerLevel = 1; }
    
    let content = line;
    if (isHeader) {
      content = line.replace(/^#+\s/, '');
    }

    // 리스트 처리 (-, *, 1.)
    const isList = /^[*\-]\s/.test(content);
    const isNumList = /^\d+\.\s/.test(content);
    if (isList) content = content.replace(/^[*\-]\s/, '');
    if (isNumList) content = content.replace(/^\d+\.\s/, '');

    // 볼드 처리 (**text**)
    const parts = content.split(/(\*\*.*?\*\*)/g);

    const renderedLine = parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: '#F2A900', fontWeight: 'bold' }}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });

    if (isHeader) {
      const fontSize = headerLevel === 1 ? '16px' : (headerLevel === 2 ? '15px' : '14px');
      return (
        <div key={idx} style={{ 
          fontSize: fontSize, 
          fontWeight: 'bold', 
          color: '#34A853', 
          marginTop: idx === 0 ? "0" : "16px", 
          marginBottom: "8px",
          borderBottom: headerLevel <= 2 ? "1px solid rgba(255,255,255,0.05)" : "none",
          paddingBottom: headerLevel <= 2 ? "6px" : "0",
          display: "flex",
          alignItems: "center",
          gap: "6px"
        }}>
          <span style={{ fontSize: "14px" }}>{headerLevel === 1 ? "🎯" : headerLevel === 2 ? "📊" : "💡"}</span>
          {renderedLine}
        </div>
      );
    }
    
    return (
      <div key={idx} style={{ 
        display: isList || isNumList ? 'flex' : 'block',
        marginLeft: isList || isNumList ? '12px' : '0',
        marginBottom: "6px",
        lineHeight: "1.6"
      }}>
        {(isList || isNumList) && (
          <span style={{ 
            color: '#34A853', 
            marginRight: '8px',
            fontSize: isList ? '10px' : '12px',
            marginTop: isList ? '3px' : '0',
            fontWeight: isNumList ? 'bold' : 'normal'
          }}>
            {isList ? '▶' : line.match(/^\d+\./)?.[0]}
          </span>
        )}
        <div style={{ flex: 1 }}>{renderedLine}</div>
      </div>
    );
  });
};

/**
 * 개별 매치의 결과 요약과 아코디언(상세 펼치기) 형태의 팀원 스탯을 렌더링하는 컨테이너입니다.
 */
export const MatchCard = ({
  matchId,
  nickname,
  platform,
  isMobile,
  onNicknameClick,
}: {
  matchId: string;
  nickname: string;
  platform: string;
  isMobile: boolean;
  onNicknameClick?: (nickname: string) => void;
}) => {
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isEventMode, setIsEventMode] = useState(false); // 이벤트 모드 맵 여부
  const [isExpanded, setIsExpanded] = useState(false);
  const [analyses, setAnalyses] = useState<{ mild: string | null; spicy: string | null }>({ mild: null, spicy: null });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showDBNOTooltip, setShowDBNOTooltip] = useState(false);
  const [showKillRankTooltip, setShowKillRankTooltip] = useState(false);
  const [showPercentileTooltip, setShowPercentileTooltip] = useState(false);
  const [showHitsTooltip, setShowHitsTooltip] = useState(false);
  const [coachingStyle, setCoachingStyle] = useState<"mild" | "spicy">("spicy");

  // 채팅 관련 상태 추가
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);

  const handleAnalyze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAnalyzing || analyses[coachingStyle]) return;

    setIsAnalyzing(true);
    setAiError(null);

    try {
      // killDetails, dbnoDetails는 match API에서 텔레메트리 기반으로 수집된 데이터
      const response = await fetch("/api/pubg/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchData: {
            ...matchData,
            killDetails: matchData?.killDetails ?? [],
            dbnoDetails: matchData?.dbnoDetails ?? [],
          },
          nickname,
          coachingStyle,
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setAnalyses(prev => ({ ...prev, [coachingStyle]: data.analysis }));
      // 초기 분석 결과를 대화 기록에 추가
      setChatMessages([{ role: "assistant", content: data.analysis }]);
    } catch (err: any) {
      console.error("AI 분석 실패:", err);
      setAiError(err.message || "AI 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || isChatting) return;

    const userMessage = { role: "user" as const, content: chatInput };
    const updatedMessages = [...chatMessages, userMessage];
    
    setChatMessages(updatedMessages);
    setChatInput("");
    setIsChatting(true);

    try {
      // 토큰 절약을 위해 최신 대화 6개만 슬라이딩 윈도우로 전송
      const slidingWindowMessages = updatedMessages.slice(-6);

      const response = await fetch("/api/pubg/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchData: {
            ...matchData,
            killDetails: matchData?.killDetails ?? [],
            dbnoDetails: matchData?.dbnoDetails ?? [],
          },
          nickname,
          coachingStyle,
          messages: slidingWindowMessages,
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setChatMessages([...updatedMessages, { role: "assistant", content: data.analysis }]);
    } catch (err: any) {
      console.error("채팅 응답 실패:", err);
      setChatMessages([...updatedMessages, { role: "assistant", content: "알 수 없는 오류가 발생했습니다. 다시 질문해 주세요." }]);
    } finally {
      setIsChatting(false);
    }
  };

  // 모드 변경 시 해당 모드의 기존 분석 결과가 있다면 채팅창 갱신
  useEffect(() => {
    const existingAnalysis = analyses[coachingStyle];
    if (existingAnalysis) {
      setChatMessages([{ role: "assistant", content: existingAnalysis }]);
    } else {
      setChatMessages([]);
    }
  }, [coachingStyle, analyses]);

  useEffect(() => {
    fetch(
      `/api/pubg/match?matchId=${matchId}&nickname=${nickname}&platform=${platform}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data?.isEventMode) {
          // 이벤트 모드 맵(Desert_Main_BinarySpot 등)은 조용히 숨김 처리
          setIsEventMode(true);
          setMatchData(null);
        } else if (data?.error) {
          setFetchError(data.error as string);
          setMatchData(null);
        } else {
          setMatchData(data as MatchData);
        }
      })
      .catch((err: unknown) => {
        console.error("매치 데이터 로드 실패:", err);
        setFetchError("매치 정보를 불러오는 중 오류가 발생했습니다.");
        setMatchData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [matchId, nickname, platform]);

  if (loading)
    return (
      <div
        style={{
          height: "100px",
          backgroundColor: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: "8px",
          marginBottom: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#555",
        }}
      >
        매치 정보 불러오는 중...
      </div>
    );

  // 이벤트 모드 맵(Desert_Main_BinarySpot 등)은 목록에서 완전히 제외
  if (isEventMode) return null;

  if (!matchData) {
    if (fetchError) {
      return (
        <div
          style={{
            height: "100px",
            backgroundColor: "#1a1a1a",
            border: "1px solid #333",
            borderRadius: "8px",
            marginBottom: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#f87171",
            fontSize: "12px",
            padding: "0 8px",
            textAlign: "center",
          }}
        >
          {fetchError}
        </div>
      );
    }
    return null;
  }

  const {
    stats,
    mapName,
    createdAt,
    gameMode,
    team,
    totalTeamKills,
    totalTeamDamage,
  } = matchData;
  
  const isChicken = stats.winPlace === 1;
  const isTop10 = stats.winPlace <= 10;

  const timeDiff = Math.floor(
    (new Date().getTime() - new Date(createdAt).getTime()) / 1000
  );
  
  const timeStr =
    timeDiff < 3600
      ? `${Math.floor(timeDiff / 60)}분 전`
      : timeDiff < 86400
      ? `${Math.floor(timeDiff / 3600)}시간 전`
      : `${Math.floor(timeDiff / 86400)}일 전`;

  const borderColor = isChicken ? "#F2A900" : isTop10 ? "#34A853" : "#444";
  const bgColor = isChicken ? "rgba(242, 169, 0, 0.05)" : "#1a1a1a";

  return (
    <div
      style={{
        marginBottom: "10px",
        borderRadius: "8px",
        overflow: "visible", // 툴팁 가려짐 방지
        border: "1px solid #333",
        borderLeft: `4px solid ${borderColor}`,
        backgroundColor: bgColor,
        position: "relative",
        zIndex: isExpanded ? 10 : 1
      }}
    >
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "15px 20px",
          cursor: "pointer",
        }}
        onMouseOver={(e) =>
          (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)")
        }
        onMouseOut={(e) =>
          (e.currentTarget.style.backgroundColor = "transparent")
        }
      >
        <div
          style={{
            minWidth: isMobile ? "20px" : "80px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            borderRight: "1px solid #333",
            paddingRight: isMobile ? "8px" : "12px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: isMobile ? "14px" : "20px",
              fontWeight: "900",
              color: borderColor,
            }}
          >
            #{stats.winPlace}
          </div>
          <div
            style={{
              fontSize: isMobile ? "9px" : "11px",
              color: "#888",
              marginTop: "4px",
              whiteSpace: "nowrap",
            }}
          >
            {gameMode}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            paddingLeft: isMobile ? "10px" : "15px",
            display: "flex",
            gap: isMobile ? "10px" : "15px",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: isMobile ? "15px" : "18px",
                fontWeight: "bold",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap"
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                {stats.kills}
                <span style={{ color: "#666", fontSize: isMobile ? "10px" : "12px", fontWeight: "normal", marginLeft: "2px" }}>킬</span>
                <span style={{ color: "#555", margin: isMobile ? "0 4px" : "0 6px" }}>/</span>
                {stats.deathType === "생존" ? 0 : 1}
                <span style={{ color: "#666", fontSize: isMobile ? "10px" : "12px", fontWeight: "normal", marginLeft: "2px" }}>데스</span>
                <span style={{ color: "#555", margin: isMobile ? "0 4px" : "0 6px" }}>/</span>
                {stats.assists}
                <span style={{ color: "#666", fontSize: isMobile ? "10px" : "12px", fontWeight: "normal", marginLeft: "2px" }}>어시</span>
              </div>

              {/* [V3] 전술 배지 영역 */}
              <div style={{ display: "flex", gap: "5px" }}>
                {matchData.myRank && (
                  <>
                    <div 
                      onMouseEnter={() => setShowKillRankTooltip(true)}
                      onMouseLeave={() => setShowKillRankTooltip(false)}
                      style={{ 
                        fontSize: "9px", fontWeight: "900", padding: "1px 5px", borderRadius: "3px",
                        background: matchData.myRank.killRank === 1 ? "linear-gradient(45deg, #F2A900, #FFD700)" : "rgba(255,255,255,0.06)",
                        color: matchData.myRank.killRank === 1 ? "#000" : "#F2A900",
                        border: "1px solid rgba(242, 169, 0, 0.2)",
                        display: "flex", alignItems: "center", position: "relative", cursor: "help"
                      }}
                    >
                      🎯 #{matchData.myRank.killRank}
                      {showKillRankTooltip && (
                        <div style={{
                          position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%) translateY(-10px)",
                          backgroundColor: "#222", color: "#fff", padding: "6px 12px", borderRadius: "6px",
                          fontSize: "11px", whiteSpace: "nowrap", zIndex: 1000, border: "1px solid #F2A900", pointerEvents: "none",
                          boxShadow: "0 4px 15px rgba(0,0,0,0.8)"
                        }}>
                          매치 전체 참가자 중 내 킬 순위입니다.
                        </div>
                      )}
                    </div>
                    <div 
                      onMouseEnter={() => setShowPercentileTooltip(true)}
                      onMouseLeave={() => setShowPercentileTooltip(false)}
                      style={{ 
                        fontSize: "9px", fontWeight: "900", padding: "1px 5px", borderRadius: "3px",
                        background: matchData.myRank.damagePercentile >= 95 ? "linear-gradient(45deg, #34A853, #2ecc71)" : "rgba(52, 168, 83, 0.08)",
                        color: "#fff",
                        border: "1px solid rgba(52, 168, 83, 0.2)",
                        display: "flex", alignItems: "center", position: "relative", cursor: "help"
                      }}
                    >
                      🏆 {Math.max(1, 100 - matchData.myRank.damagePercentile)}%
                      {showPercentileTooltip && (
                        <div style={{
                          position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%) translateY(-10px)",
                          backgroundColor: "#222", color: "#fff", padding: "6px 12px", borderRadius: "6px",
                          fontSize: "11px", whiteSpace: "nowrap", zIndex: 1000, border: "1px solid #34A853", pointerEvents: "none",
                          boxShadow: "0 4px 15px rgba(0,0,0,0.8)"
                        }}>
                          딜량 기준 정규 참가자 중 내 상위 백분위입니다.
                        </div>
                      )}
                    </div>
                  </>
                )}
                {matchData.combatPressure && matchData.combatPressure.totalHits > 0 && (
                  <div 
                    onMouseEnter={() => setShowHitsTooltip(true)}
                    onMouseLeave={() => setShowHitsTooltip(false)}
                    style={{ 
                      fontSize: "9px", fontWeight: "900", padding: "1px 5px", borderRadius: "3px",
                      background: "rgba(248, 113, 113, 0.08)",
                      color: "#f87171",
                      border: "1px solid rgba(248, 113, 113, 0.2)",
                      display: "flex", alignItems: "center", position: "relative", cursor: "help"
                    }}
                  >
                    🔥 {matchData.combatPressure.totalHits}
                    {showHitsTooltip && (
                      <div style={{
                        position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%) translateY(-10px)",
                        backgroundColor: "#222", color: "#fff", padding: "6px 12px", borderRadius: "6px",
                        fontSize: "11px", whiteSpace: "nowrap", zIndex: 1000, border: "1px solid #f87171", pointerEvents: "none",
                        boxShadow: "0 4px 15px rgba(0,0,0,0.8)"
                      }}>
                        적에게 직접 타격(Hit)을 가해 압박을 준 횟수입니다.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div
              style={{
                fontSize: isMobile ? "11px" : "13px",
                color: "#aaa",
                margin: "2px 0",
              }}
            >
              딜량{" "}
              <span style={{ fontWeight: "bold", color: "#ddd" }}>
                {Math.floor(stats.damageDealt)}
              </span>
            </div>
          </div>
          <div style={{ color: "#888", fontSize: isMobile ? "10px" : "12px" }}>
            <div
              style={{
                fontWeight: "bold",
                color: "#ccc",
                marginBottom: "4px",
                fontSize: isMobile ? "11px" : "13px",
              }}
            >
              {mapName}
            </div>
            <div>{timeStr}</div>
          </div>
        </div>

        <div
          style={{
            width: isMobile ? "80px" : "160px",
            paddingLeft: isMobile ? "6px" : "10px",
            borderLeft: "1px solid #333",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              overflow: "hidden",
            }}
          >
            {team.map((member) => (
              <div
                key={member.name}
                style={{
                  fontSize: isMobile ? "10px" : "12px",
                  color: member.name === nickname ? "#fff" : "#888",
                  fontWeight: member.name === nickname ? "bold" : "normal",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  cursor: member.name === nickname ? "default" : "pointer",
                }}
                onClick={(e) => {
                  if (member.name !== nickname && onNicknameClick) {
                    e.stopPropagation();
                    onNicknameClick(member.name);
                  }
                }}
                className={member.name !== nickname ? "hover:text-[#F2A900] transition-colors" : ""}
              >
                {member.name}
              </div>
            ))}
          </div>
          <div
            style={{
              color: "#888",
              fontSize: isMobile ? "14px" : "18px",
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            ▼
          </div>
        </div>
      </div>

      {isExpanded && (
        <div
          style={{
            backgroundColor: "#111",
            borderTop: "1px solid #333",
            padding: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: isMobile ? "15px" : "30px",
              marginBottom: "20px",
              paddingBottom: "15px",
              borderBottom: "1px dashed #333",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "2px" : "8px" }}>
              <span style={{ color: "#888", fontSize: "12px" }}>팀 총 킬:</span>
              <span style={{ fontWeight: "bold", color: "#F2A900" }}>
                {totalTeamKills}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "2px" : "8px" }}>
              <span style={{ color: "#888", fontSize: "12px" }}>
                팀 총 데미지:
              </span>
              <span style={{ fontWeight: "bold", color: "#34A853" }}>
                {Math.floor(totalTeamDamage)}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "2px" : "8px" }}>
              <span style={{ color: "#888", fontSize: "12px" }}>
                팀 생존 시간:
              </span>
              <span style={{ fontWeight: "bold", color: "#fff", whiteSpace: "nowrap" }}>
                {Math.floor(stats.timeSurvived / 60)}분{" "}
                {stats.timeSurvived % 60}초
              </span>
            </div>
          </div>

          <div style={{ marginBottom: "20px", display: "flex", justifyContent: "center", gap: "10px", flexDirection: isMobile ? "column" : "row", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "4px", backgroundColor: "rgba(255,255,255,0.05)", padding: "4px", borderRadius: "10px", border: "1px solid #333" }}>
              <button 
                onClick={(e) => { e.stopPropagation(); setCoachingStyle("mild"); }}
                style={{ 
                  padding: "8px 12px", borderRadius: "7px", fontSize: "12px", cursor: "pointer", border: "none",
                  backgroundColor: coachingStyle === "mild" ? "#34A853" : "transparent",
                  color: coachingStyle === "mild" ? "#fff" : "#888",
                  transition: "all 0.2s", fontWeight: "bold"
                }}
              >다정한 코치 😊</button>
              <button 
                onClick={(e) => { e.stopPropagation(); setCoachingStyle("spicy"); }}
                style={{ 
                  padding: "8px 12px", borderRadius: "7px", fontSize: "12px", cursor: "pointer", border: "none",
                  backgroundColor: coachingStyle === "spicy" ? "#f87171" : "transparent",
                  color: coachingStyle === "spicy" ? "#fff" : "#888",
                  transition: "all 0.2s", fontWeight: "bold"
                }}
              >독설 교관 ⚡</button>
            </div>

            <a
              href={`/maps/${(
                { 에란겔: "erangel", 미라마: "miramar", 태이고: "taego", 론도: "rondo", 비켄디: "vikendi", 데스턴: "deston" }[mapName] || mapName || "erangel"
              ).toLowerCase()}?playback=${matchId}&nickname=${encodeURIComponent(nickname)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "rgba(242, 169, 0, 0.1)",
                border: "1px solid rgba(242, 169, 0, 0.3)",
                color: "#F2A900",
                padding: "10px 18px",
                borderRadius: "10px",
                fontWeight: "bold",
                fontSize: "13px",
                textDecoration: "none",
                transition: "all 0.2s",
              }}
              className="hover:bg-[#F2A900]/20"
            >
              궤적 복기
            </a>

            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: analyses[coachingStyle] ? "rgba(52, 168, 83, 0.1)" : "rgba(255, 255, 255, 0.05)",
                border: analyses[coachingStyle] ? "1px solid rgba(52, 168, 83, 0.3)" : "1px solid #333",
                color: analyses[coachingStyle] ? "#34A853" : "#fff",
                padding: "10px 20px",
                borderRadius: "10px",
                fontWeight: "bold",
                fontSize: "13px",
                cursor: isAnalyzing || analyses[coachingStyle] ? "default" : "pointer",
                transition: "all 0.2s",
              }}
              className={!isAnalyzing && !analyses[coachingStyle] ? "hover:bg-white/10" : ""}
            >
              {isAnalyzing ? (
                <div style={{ width: "16px", height: "16px", border: "2px solid #fff", borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              ) : (
                <BarChart2 size={16} />
              )}
              {isAnalyzing ? (coachingStyle === "mild" ? "멘토링 분석 중..." : "실책 파헤치는 중...") : analyses[coachingStyle] ? "분석 완료" : (analyses["mild"] || analyses["spicy"]) ? "다른 모드로 분석" : "AI 코칭 시작"}
            </button>
          </div>

          {(chatMessages.length > 0 || aiError) && (
            <div
              style={{
                marginBottom: "20px",
                padding: "15px",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                borderRadius: "16px",
                border: `1px solid ${aiError ? "#f87171" : coachingStyle === "mild" ? "rgba(52, 168, 83, 0.3)" : "rgba(248, 113, 113, 0.3)"}`,
                maxHeight: "500px",
                display: "flex",
                flexDirection: "column",
                gap: "15px",
              }}
            >
              <h4 style={{ 
                margin: "0", 
                color: aiError ? "#f87171" : "#34A853", 
                fontSize: "13px", 
                display: "flex", 
                alignItems: "center", 
                gap: "8px",
                paddingBottom: "10px",
                borderBottom: "1px solid rgba(255,255,255,0.05)"
              }}>
                <span style={{ fontSize: "16px" }}>{aiError ? "⚠️" : coachingStyle === "mild" ? "😇" : "🔥"}</span>
                {aiError ? "분석 에러" : coachingStyle === "mild" ? "다정한 코칭" : "독설 교관의 팩트 폭격"}
              </h4>

              <div style={{ 
                flex: 1, 
                overflowY: "auto", 
                display: "flex", 
                flexDirection: "column", 
                gap: "12px",
                paddingRight: "5px"
              }}>
                {chatMessages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: msg.role === "user" ? "85%" : "100%",
                      width: msg.role === "user" ? "auto" : "100%",
                      padding: "12px 16px",
                      borderRadius: msg.role === "user" ? "16px 16px 2px 16px" : "8px",
                      backgroundColor: msg.role === "user" ? "rgba(255,255,255,0.1)" : "rgba(0, 0, 0, 0.2)",
                      border: `1px solid ${msg.role === "user" ? "rgba(255,255,255,0.1)" : "rgba(52, 168, 83, 0.2)"}`,
                      fontSize: "13px",
                      color: "#eee",
                      whiteSpace: msg.role === "user" ? "pre-wrap" : "normal"
                    }}
                  >
                    {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
                  </div>
                ))}
                {isChatting && (
                  <div style={{ alignSelf: "flex-start", color: "#888", fontSize: "12px", paddingLeft: "10px", fontStyle: "italic" }}>
                    AI 코치가 데이터를 분석하며 생각 중...
                  </div>
                )}
                {aiError && (
                  <div style={{ color: "#f87171", fontSize: "13px", textAlign: "center", padding: "10px" }}>
                    {aiError}
                  </div>
                )}
              </div>

              {/* 채팅 입력창 */}
              {!aiError && (
                <div style={{ 
                  marginTop: "5px", 
                  display: "flex", 
                  gap: "8px",
                  paddingTop: "10px",
                  borderTop: "1px solid rgba(255,255,255,0.05)"
                }}>
                  <input 
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                    placeholder="AI에게 이 매치에 대해 질문해 보세요..."
                    disabled={isChatting}
                    style={{
                      flex: 1,
                      backgroundColor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "20px",
                      padding: "8px 16px",
                      fontSize: "13px",
                      color: "#fff",
                      outline: "none"
                    }}
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={isChatting || !chatInput.trim()}
                    style={{
                      backgroundColor: isChatting || !chatInput.trim() ? "rgba(255,255,255,0.05)" : "#34A853",
                      color: "#fff",
                      border: "none",
                      borderRadius: "50%",
                      width: "34px",
                      height: "34px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: isChatting || !chatInput.trim() ? "default" : "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    {isChatting ? (
                      <div style={{ width: "14px", height: "14px", border: "2px solid #fff", borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                    ) : (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>

          <table
            style={{
              width: "100%",
              fontSize: isMobile ? "11px" : "13px",
              color: "#ccc",
              borderCollapse: "collapse",
              textAlign: "center",
            }}
          >
            <thead>
              <tr style={{ color: "#888", borderBottom: "1px solid #333" }}>
                <th style={{ padding: "10px", textAlign: "left" }}>닉네임</th>
                <th style={{ padding: "10px" }}>K / D / A</th>
                <th style={{ padding: "10px" }}>데미지</th>
                <th style={{ padding: "10px", position: "relative" }}>
                  <div 
                    onMouseEnter={() => setShowDBNOTooltip(true)}
                    onMouseLeave={() => setShowDBNOTooltip(false)}
                    style={{ cursor: "help", display: "flex", alignItems: "center", justifyContent: "center", gap: "2px" }}
                  >
                    DBNO
                    <HelpCircle size={10} style={{ color: "#F2A900" }} />
                  </div>
                  {showDBNOTooltip && (
                    <div style={{
                      position: "absolute",
                      bottom: "100%",
                      left: "50%",
                      transform: "translateX(-50%) translateY(-10px)",
                      backgroundColor: "#222",
                      color: "#fff",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      whiteSpace: "nowrap",
                      zIndex: 1000,
                      boxShadow: "0 4px 15px rgba(0,0,0,0.8)",
                      border: "1px solid #F2A900",
                      pointerEvents: "none",
                      fontWeight: "bold"
                    }}>
                      적을 기절시킨 횟수 (Down But Not Out)
                      <div style={{
                        position: "absolute",
                        top: "100%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        borderWidth: "5px",
                        borderStyle: "solid",
                        borderColor: "#F2A900 transparent transparent transparent"
                      }} />
                    </div>
                  )}
                </th>
                <th style={{ padding: "10px" }}>부활</th>
              </tr>
            </thead>
            <tbody>
              {team
                .slice()
                .sort((a, b) => b.kills - a.kills)
                .map((member: MatchTeamMember) => (
                  <tr
                    key={member.name}
                    style={{
                      backgroundColor:
                        member.name === nickname
                          ? "rgba(255,255,255,0.05)"
                          : "transparent",
                      borderBottom: "1px solid #222",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px",
                        fontWeight:
                          member.name === nickname ? "bold" : "normal",
                        color: member.name === nickname ? "#fff" : "#aaa",
                        textAlign: "left",
                        cursor: member.name === nickname ? "default" : "pointer",
                      }}
                      onClick={() => {
                        if (member.name !== nickname && onNicknameClick) {
                          onNicknameClick(member.name);
                        }
                      }}
                      className={member.name !== nickname ? "hover:text-[#F2A900] transition-colors" : ""}
                    >
                      {member.name}
                    </td>
                    <td style={{ padding: "10px" }}>
                      {member.kills} / {member.deathType === 'alive' || member.deathType === '생존' ? 0 : 1} / {member.assists}
                    </td>
                    <td style={{ padding: "10px" }}>
                      {Math.floor(member.damageDealt)}
                    </td>
                    <td style={{ padding: "10px" }}>{member.DBNOs}</td>
                    <td style={{ padding: "10px" }}>{member.revives}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
