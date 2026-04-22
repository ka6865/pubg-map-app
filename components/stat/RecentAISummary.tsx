// 파일 위치: components/stat/RecentAISummary.tsx
"use client";

import React, { useState, useEffect } from "react";

/**
 * AI 종합 분석 리포트를 시각적으로 예쁘게 렌더링하는 함수입니다.
 */
const renderMarkdownSummary = (text: string, color: string, style: "mild" | "spicy" | "debate", revealedCount?: number) => {
  if (!text) return null;

  if (style === "debate") {
    const allLines = text.split('\n');
    const sections: { speaker: string, content: string }[] = [];
    let currentSpeaker = "";
    let currentContent: string[] = [];

    const flushSection = () => {
      if (currentSpeaker && currentContent.length > 0) {
        sections.push({ speaker: currentSpeaker, content: currentContent.join('\n').trim() });
      }
    };

    allLines.forEach(line => {
      const trimmedLine = line.trim();
      const mildMatch = trimmedLine.match(/\[착한맛 코치\]:/);
      const spicyMatch = trimmedLine.match(/\[매운맛 폭격기\]:/);
      const conclusionMatch = trimmedLine.match(/\[최종 합의 결론\]:/);

      if (mildMatch || spicyMatch || conclusionMatch) {
        flushSection();
        if (mildMatch) {
          currentSpeaker = "mild";
          currentContent = [trimmedLine.split(/\[착한맛 코치\]:/)[1]];
        } else if (spicyMatch) {
          currentSpeaker = "spicy";
          currentContent = [trimmedLine.split(/\[매운맛 폭격기\]:/)[1]];
        } else if (conclusionMatch) {
          currentSpeaker = "conclusion";
          currentContent = [trimmedLine.split(/\[최종 합의 결론\]:/)[1]];
        }
      } else if (currentSpeaker && trimmedLine) {
        currentContent.push(line);
      }
    });
    flushSection();

    // revealedCount가 있으면 그 개수만큼만 보여줌
    const displaySections = revealedCount !== undefined ? sections.slice(0, revealedCount) : sections;

    return displaySections.map((section, idx) => {
      const isMild = section.speaker === "mild";
      const isSpicy = section.speaker === "spicy";
      const isConclusion = section.speaker === "conclusion";

      const title = isMild ? "착한맛 코치" : isSpicy ? "매운맛 폭격기" : "🏆 최종 생존 지침";
      
      if (isConclusion) {
        return (
          <div key={idx} style={{ 
            marginTop: "32px",
            padding: "24px",
            background: "linear-gradient(135deg, rgba(255, 193, 7, 0.15) 0%, rgba(255, 152, 0, 0.05) 100%)",
            borderRadius: "20px",
            border: "1px solid rgba(255, 193, 7, 0.3)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            animation: "slideUp 0.6s ease-out forwards"
          }}>
            <div style={{ 
              display: "flex", alignItems: "center", gap: "10px", 
              color: "#ffc107", fontWeight: "bold", fontSize: "18px", marginBottom: "16px" 
            }}>
              <span>🏆</span> {title}
            </div>
            <div style={{ color: "#fff", lineHeight: "1.8", fontSize: "15px", whiteSpace: "pre-wrap" }}>
              {section.content}
            </div>
          </div>
        );
      }

      return (
        <div key={idx} style={{ 
          display: "flex", 
          flexDirection: "column",
          alignItems: isMild ? "flex-start" : "flex-end",
          marginBottom: "20px",
          animation: isMild ? "fadeInLeft 0.5s ease-out" : "fadeInRight 0.5s ease-out"
        }}>
          <div style={{ 
            fontSize: "12px", 
            color: isMild ? "#81c784" : "#f87171", 
            marginBottom: "6px",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "4px"
          }}>
            {isMild ? "😊" : "⚡"} {title}
          </div>
          <div style={{ 
            maxWidth: "85%",
            padding: "12px 16px",
            backgroundColor: isMild ? "rgba(52, 168, 83, 0.15)" : "rgba(248, 113, 113, 0.15)",
            color: "#eee",
            borderRadius: isMild ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
            border: `1px solid ${isMild ? "rgba(52, 168, 83, 0.3)" : "rgba(248, 113, 113, 0.3)"}`,
            fontSize: "14.5px",
            lineHeight: "1.6",
            whiteSpace: "pre-wrap"
          }}>
            {section.content}
          </div>
        </div>
      );
    });
  }

  const lines = text.split('\n');
  return lines.map((line, idx) => {
    if (!line.trim()) return <div key={idx} style={{ height: "8px" }} />;
    
    let content = line;
    const isHeader = line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ');
    const isList = /^[*-]\s/.test(content.trim()) || /^\d+\.\s/.test(content.trim());

    if (isHeader) content = content.replace(/^#+\s/, '');
    const parts = content.split(/(\*\*.*?\*\*)/g);

    const renderedLine = parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color, fontWeight: 'bold' }}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });

    if (isHeader) {
      return (
        <div key={idx} style={{ 
          fontSize: "16px", fontWeight: "bold", color, marginTop: "24px", marginBottom: "12px",
          borderLeft: `3px solid ${color}`, paddingLeft: "12px", display: "flex", alignItems: "center"
        }}>
          {renderedLine}
        </div>
      );
    }
    
    return (
      <div key={idx} style={{ 
        marginLeft: isList ? "12px" : "0", marginBottom: "8px", lineHeight: "1.8",
        display: "flex", gap: "8px"
      }}>
        {isList && <span style={{ color, marginTop: "2px", fontSize: "12px" }}>▶</span>}
        <div style={{ flex: 1 }}>{renderedLine}</div>
      </div>
    );
  });
};

interface RecentAISummaryProps {
  matchIds: string[];
  nickname: string;
  platform: string;
}

export const RecentAISummary = ({ matchIds, nickname, platform }: RecentAISummaryProps) => {
  const [analyses, setAnalyses] = useState<{ mild: string | null; spicy: string | null; debate: string | null }>({ mild: null, spicy: null, debate: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coachingStyle, setCoachingStyle] = useState<"mild" | "spicy" | "debate">("debate");
  const [isGenerating, setIsGenerating] = useState(false);
  const [revealedLinesCount, setRevealedLinesCount] = useState(0);

  // 대화 모드일 때 순차적으로 대화가 나타나도록 하는 효과
  useEffect(() => {
    if (coachingStyle === "debate" && analyses.debate) {
      const allLines = analyses.debate.split('\n');
      const sectionCount = allLines.filter(line => {
        const trimmed = line.trim();
        return /\[착한맛 코치\]:/.test(trimmed) || 
               /\[매운맛 폭격기\]:/.test(trimmed) || 
               /\[최종 합의 결론\]:/.test(trimmed);
      }).length;
      
      if (revealedLinesCount < sectionCount) {
        const timer = setTimeout(() => {
          setRevealedLinesCount(prev => prev + 1);
        }, 1500); // 1.5초 간격으로 다음 대화 노출
        return () => clearTimeout(timer);
      }
    } else if (coachingStyle !== "debate") {
      setRevealedLinesCount(0);
    }
  }, [analyses.debate, revealedLinesCount, coachingStyle]);

  const handleFetchSummary = async () => {
    if (loading || analyses[coachingStyle]) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/pubg/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchIds, nickname, platform, coachingStyle }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "분석 중 오류가 발생했습니다.");
      }

      // 스트리밍 데이터 읽기
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let fullText = "";
        setIsGenerating(true);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          setAnalyses(prev => ({ ...prev, [coachingStyle]: fullText }));
        }
        setIsGenerating(false);
      }
    } catch (err: any) {
      console.error("AI 종합 분석 실패:", err);
      setError(err.message || "분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const themeColor = coachingStyle === "mild" ? "#34A853" : "#f87171";
  const secondaryColor = coachingStyle === "mild" ? "rgba(52, 168, 83, 0.1)" : "rgba(248, 113, 113, 0.1)";

  return (
    <div style={{ margin: "20px 0" }}>
      {/* 모드 선택 스위치 - 항상 노출 */}
      <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "16px" }}>
        <div style={{ 
          display: "flex", 
          gap: "4px", 
          backgroundColor: "rgba(255,255,255,0.05)", 
          padding: "4px", 
          borderRadius: "12px", 
          border: "1px solid #333",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
        }}>
          <button 
            onClick={() => setCoachingStyle("mild")}
            style={{ 
              padding: "10px 20px", borderRadius: "8px", fontSize: "14px", cursor: "pointer", border: "none",
              backgroundColor: coachingStyle === "mild" ? "#34A853" : "transparent",
              color: coachingStyle === "mild" ? "#fff" : "#888",
              transition: "all 0.2s", fontWeight: "bold"
            }}
          >다정한 코치 😊</button>
          <button 
            onClick={() => setCoachingStyle("spicy")}
            style={{ 
              padding: "10px 20px", borderRadius: "8px", fontSize: "14px", cursor: "pointer", border: "none",
              backgroundColor: coachingStyle === "spicy" ? "#f87171" : "transparent",
              color: coachingStyle === "spicy" ? "#fff" : "#888",
              transition: "all 0.2s", fontWeight: "bold"
            }}
          >팩폭 분석가 ⚡</button>
          <button 
            onClick={() => setCoachingStyle("debate")}
            style={{ 
              padding: "10px 20px", borderRadius: "8px", fontSize: "14px", cursor: "pointer", border: "none",
              backgroundColor: coachingStyle === "debate" ? "#6366f1" : "transparent",
              color: coachingStyle === "debate" ? "#fff" : "#888",
              transition: "all 0.2s", fontWeight: "bold"
            }}
          >AI 끝장 토론 🔥</button>
        </div>
      </div>

      {!analyses[coachingStyle] && !loading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            onClick={handleFetchSummary}
            style={{
              width: "100%",
              padding: "20px",
              backgroundColor: secondaryColor,
              border: `2px dashed ${themeColor}`,
              borderRadius: "16px",
              color: themeColor,
              fontSize: "16px",
              fontWeight: "bold",
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
            }}
            className="hover:scale-[1.01] active:scale-[0.99] transition-transform"
          >
            <span style={{ fontSize: "24px" }}>{coachingStyle === "mild" ? "😊" : coachingStyle === "spicy" ? "⚡" : "🔥"}</span>
            {coachingStyle === "mild" ? "최근 10경기 멘토링 시작" : coachingStyle === "spicy" ? "최근 10경기 팩폭 분석 시작" : "최근 10경기 AI 끝장 토론 시작"}
          </button>
        </div>
      )}

      {(loading || analyses[coachingStyle] || error) && (
        <div
          style={{
            padding: "24px",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            borderRadius: "16px",
            border: `1px solid ${error ? "rgba(248, 113, 113, 0.3)" : coachingStyle === "mild" ? "rgba(52, 168, 83, 0.3)" : coachingStyle === "spicy" ? "rgba(248, 113, 113, 0.3)" : "rgba(99, 102, 241, 0.3)"}`,
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {/* 장식용 배경 광원 */}
          <div style={{
            position: "absolute",
            top: "-50px",
            right: "-50px",
            width: "150px",
            height: "150px",
            background: `radial-gradient(circle, ${coachingStyle === "mild" ? "rgba(52, 168, 83, 0.15)" : coachingStyle === "spicy" ? "rgba(248, 113, 113, 0.15)" : "rgba(99, 102, 241, 0.15)"} 0%, transparent 70%)`,
            pointerEvents: "none"
          }} />

          <h4 style={{
            margin: "0 0 16px 0",
            color: error ? "#f87171" : themeColor,
            fontSize: "15px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            borderBottom: `1px solid ${coachingStyle === "mild" ? "rgba(52, 168, 83, 0.2)" : coachingStyle === "spicy" ? "rgba(248, 113, 113, 0.2)" : "rgba(99, 102, 241, 0.2)"}`,
            paddingBottom: "12px"
          }}>
            <span style={{ fontSize: "24px" }}>{error ? "⚠️" : coachingStyle === "mild" ? "😊" : coachingStyle === "spicy" ? "⚡" : "🔥"}</span>
            {error ? "분석 오류" : coachingStyle === "mild" ? "최근 10경기 종합 분석 (Supportive)" : coachingStyle === "spicy" ? "최근 10경기 종합 분석 (Fact-punching)" : "최근 10경기 AI 끝장 토론 (Debate)"}
          </h4>

          {loading ? (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <div style={{ 
                width: "40px", 
                height: "40px", 
                border: `3px solid ${coachingStyle === "mild" ? "rgba(52, 168, 83, 0.1)" : "rgba(248, 113, 113, 0.1)"}`, 
                borderTop: `3px solid ${coachingStyle === "mild" ? "#34A853" : "#f87171"}`, 
                borderRadius: "50%", 
                margin: "0 auto 15px auto",
                animation: "spin 1s linear infinite" 
              }} />
              <p style={{ color: "#888", fontSize: "14px" }}>
                {coachingStyle === "mild" ? "데이터 멘토가 지난 10경기를 꼼꼼히 분석하고 있습니다..." : coachingStyle === "spicy" ? "분석가가 지난 10경기의 치명적인 실수들을 찾고 있습니다..." : "두 코치가 지난 10경기 데이터를 두고 격렬하게 토론 중입니다..."}
              </p>
            </div>
          ) : error ? (
            <div style={{ color: "#f87171", fontSize: "14px", textAlign: "center" }}>
              ⚠️ {error}
              <button 
                onClick={() => { setAnalyses({ mild: null, spicy: null, debate: null }); setError(null); }}
                style={{ marginLeft: "10px", color: themeColor, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                재시도
              </button>
            </div>
          ) : (
            <div 
              style={{ 
                color: "#ddd", 
                fontSize: "14.5px", 
                lineHeight: "1.8" 
              }}
              className="ai-report-content"
            >
              {renderMarkdownSummary(
                analyses[coachingStyle] || "", 
                themeColor, 
                coachingStyle,
                coachingStyle === "debate" ? revealedLinesCount : undefined
              )}
              
              {/* 대화 중일 때 타이핑 인디케이터 표시 */}
              {coachingStyle === "debate" && (isGenerating || revealedLinesCount < (analyses.debate?.split('\n').filter(l => {
                const t = l.trim();
                return /\[착한맛 코치\]:/.test(t) || /\[매운맛 폭격기\]:/.test(t) || /\[최종 합의 결론\]:/.test(t);
              }).length || 0)) && (
                <div style={{ display: "flex", gap: "6px", padding: "12px", opacity: 0.6, justifyContent: revealedLinesCount % 2 === 0 ? "flex-start" : "flex-end" }}>
                  <div style={{ width: "8px", height: "8px", backgroundColor: themeColor, borderRadius: "50%", animation: "bounce 1s infinite 0.1s" }}></div>
                  <div style={{ width: "8px", height: "8px", backgroundColor: themeColor, borderRadius: "50%", animation: "bounce 1s infinite 0.2s" }}></div>
                  <div style={{ width: "8px", height: "8px", backgroundColor: themeColor, borderRadius: "50%", animation: "bounce 1s infinite 0.3s" }}></div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .ai-report-content h2, .ai-report-content h3 {
          color: #fff;
          margin: 20px 0 10px 0;
          font-size: 16px;
        }
        .ai-report-content ul {
          padding-left: 20px;
          margin: 10px 0;
        }
        .ai-report-content li {
          margin-bottom: 8px;
        }
        .ai-report-content strong {
          color: ${themeColor};
        }
      `}</style>
    </div>
  );
};
