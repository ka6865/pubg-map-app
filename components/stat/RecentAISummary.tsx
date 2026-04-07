// 파일 위치: components/stat/RecentAISummary.tsx
"use client";

import React, { useState } from "react";

interface RecentAISummaryProps {
  matchIds: string[];
  nickname: string;
  platform: string;
}

export const RecentAISummary = ({ matchIds, nickname, platform }: RecentAISummaryProps) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetchSummary = async () => {
    if (loading || analysis) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/pubg/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchIds, nickname, platform }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setAnalysis(data.analysis);
    } catch (err: any) {
      console.error("AI 종합 분석 실패:", err);
      setError(err.message || "분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ margin: "20px 0" }}>
      {!analysis && !loading && !error && (
        <button
          onClick={handleFetchSummary}
          style={{
            width: "100%",
            padding: "16px",
            backgroundColor: "rgba(242, 169, 0, 0.1)",
            border: "2px dashed #F2A900",
            borderRadius: "12px",
            color: "#F2A900",
            fontSize: "16px",
            fontWeight: "bold",
            cursor: "pointer",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
          }}
          className="hover:bg-[#F2A900] hover:text-black"
        >
          <span style={{ fontSize: "20px" }}>🤖</span>
          최근 10경기 AI 종합 트렌드 분석 시작하기
        </button>
      )}

      {(loading || analysis || error) && (
        <div
          style={{
            padding: "24px",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            borderRadius: "16px",
            border: "1px solid rgba(242, 169, 0, 0.3)",
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
            background: "radial-gradient(circle, rgba(242, 169, 0, 0.1) 0%, transparent 70%)",
            pointerEvents: "none"
          }} />

          <h4 style={{
            margin: "0 0 16px 0",
            color: "#F2A900",
            fontSize: "15px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            borderBottom: "1px solid rgba(242, 169, 0, 0.2)",
            paddingBottom: "12px"
          }}>
            <span style={{ fontSize: "20px" }}>📊</span>
            최근 10경기 AI 코칭 브리핑
          </h4>

          {loading ? (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <div style={{ 
                width: "40px", 
                height: "40px", 
                border: "3px solid rgba(242, 169, 0, 0.2)", 
                borderTop: "3px solid #F2A900", 
                borderRadius: "50%", 
                margin: "0 auto 15px auto",
                animation: "spin 1s linear infinite" 
              }} />
              <p style={{ color: "#888", fontSize: "14px" }}>
                10경기의 데이터를 분석하여 유저님의 플레이 스타일을 파악 중입니다...
              </p>
            </div>
          ) : error ? (
            <div style={{ color: "#f87171", fontSize: "14px", textAlign: "center" }}>
              ⚠️ {error}
              <button 
                onClick={() => { setAnalysis(null); setError(null); }}
                style={{ marginLeft: "10px", color: "#F2A900", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                재시도
              </button>
            </div>
          ) : (
            <div 
              style={{ 
                color: "#ddd", 
                fontSize: "14px", 
                lineHeight: "1.8", 
                whiteSpace: "pre-wrap" 
              }}
              className="ai-report-content"
            >
              {analysis}
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
          color: #F2A900;
        }
      `}</style>
    </div>
  );
};
