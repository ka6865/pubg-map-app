// 파일 위치: components/stat/RecentAISummary.tsx
"use client";

import React, { useState } from "react";

/**
 * AI 종합 분석 리포트를 시각적으로 예쁘게 렌더링하는 함수입니다.
 */
const renderMarkdownSummary = (text: string, color: string) => {
  if (!text) return null;
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
  const [analyses, setAnalyses] = useState<{ mild: string | null; spicy: string | null }>({ mild: null, spicy: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coachingStyle, setCoachingStyle] = useState<"mild" | "spicy">("spicy");

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

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setAnalyses(prev => ({ ...prev, [coachingStyle]: data.analysis }));
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
            <span style={{ fontSize: "24px" }}>{coachingStyle === "mild" ? "😊" : "⚡"}</span>
            {coachingStyle === "mild" ? "최근 10경기 멘토링 시작" : "최근 10경기 팩폭 분석 시작"}
          </button>
        </div>
      )}

      {(loading || analyses[coachingStyle] || error) && (
        <div
          style={{
            padding: "24px",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            borderRadius: "16px",
            border: `1px solid ${error ? "rgba(248, 113, 113, 0.3)" : coachingStyle === "mild" ? "rgba(52, 168, 83, 0.3)" : "rgba(248, 113, 113, 0.3)"}`,
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
            background: `radial-gradient(circle, ${coachingStyle === "mild" ? "rgba(52, 168, 83, 0.15)" : "rgba(248, 113, 113, 0.15)"} 0%, transparent 70%)`,
            pointerEvents: "none"
          }} />

          <h4 style={{
            margin: "0 0 16px 0",
            color: error ? "#f87171" : themeColor,
            fontSize: "15px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            borderBottom: `1px solid ${coachingStyle === "mild" ? "rgba(52, 168, 83, 0.2)" : "rgba(248, 113, 113, 0.2)"}`,
            paddingBottom: "12px"
          }}>
            <span style={{ fontSize: "24px" }}>{error ? "⚠️" : coachingStyle === "mild" ? "😊" : "⚡"}</span>
            {error ? "분석 오류" : coachingStyle === "mild" ? "최근 10경기 종합 분석 (Supportive)" : "최근 10경기 종합 분석 (Fact-punching)"}
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
                {coachingStyle === "mild" ? "데이터 멘토가 지난 10경기를 꼼꼼히 분석하고 있습니다..." : "분석가가 지난 10경기의 치명적인 실수들을 찾고 있습니다..."}
              </p>
            </div>
          ) : error ? (
            <div style={{ color: "#f87171", fontSize: "14px", textAlign: "center" }}>
              ⚠️ {error}
              <button 
                onClick={() => { setAnalyses({ mild: null, spicy: null }); setError(null); }}
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
              {renderMarkdownSummary(analyses[coachingStyle] || "", themeColor)}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
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
