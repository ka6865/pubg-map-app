import React from "react";

const getKDA = (k: number, a: number, d: number) => ((k + a) / (d || 1)).toFixed(2);
const getWinRate = (w: number, p: number) => (p > 0 ? ((w / p) * 100).toFixed(1) : "0.0");
const getAvgDmg = (dmg: number, p: number) => (p > 0 ? (dmg / p).toFixed(0) : "0");
const getAvgKnockouts = (dbno: number, p: number) => (p > 0 ? (dbno / p).toFixed(1) : "0.0");
const getHeadshot = (h: number, k: number) => (k > 0 ? ((h / k) * 100).toFixed(1) : "0.0");
const getSurvivalTime = (time: number, p: number) => {
  if (p === 0) return "0분 0초";
  const avgSec = Math.floor(time / p);
  return `${Math.floor(avgSec / 60)}분 ${avgSec % 60}초`;
};

/**
 * 특정 게임 모드(솔로, 듀오, 스쿼드)의 통계 수치를 요약하여 보여주는 카드 컴포넌트입니다.
 */
export const StatSummaryCard = ({
  title,
  data,
  isRanked,
}: {
  title: string;
  data: any;
  isRanked: boolean;
}) => {
  if (!data || data.roundsPlayed === 0) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: "300px",
          backgroundColor: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: "12px",
          padding: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#666",
        }}
      >
        {title} 기록 없음
      </div>
    );
  }

  const top10 = isRanked
    ? (data.top10Ratio * 100).toFixed(1)
    : getWinRate(data.top10s, data.roundsPlayed);

  return (
    <div
      style={{
        flex: 1,
        minWidth: "300px",
        backgroundColor: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "15px 20px",
          backgroundColor: isRanked ? "#3b2f15" : "#252525",
          borderBottom: "1px solid #333",
          fontWeight: "bold",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{title}</span>
        {isRanked && (
          <span style={{ color: "#F2A900" }}>
            {data.currentTier?.tier || "Unranked"} {data.currentTier?.subTier || ""} ({data.currentRankPoint || 0} RP)
          </span>
        )}
      </div>
      <div
        style={{
          padding: "20px",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "20px",
        }}
      >
        <div>
          <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>K/D</div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#F2A900" }}>
            {getKDA(data.kills, data.assists, data.deaths || data.losses)}
          </div>
        </div>
        <div>
          <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>승률</div>
          <div style={{ fontSize: "18px", fontWeight: "bold" }}>
            {getWinRate(data.wins, data.roundsPlayed)}%
          </div>
        </div>
        <div>
          <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>Top10</div>
          <div style={{ fontSize: "18px", fontWeight: "bold" }}>{top10}%</div>
        </div>
        <div>
          <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>우승 횟수</div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#F2A900" }}>{data.wins}회</div>
        </div>
        <div>
          <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>평균 기절</div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#34A853" }}>
            {getAvgKnockouts(data.dBNOs, data.roundsPlayed)}
          </div>
        </div>
        <div>
          <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>평균 딜량</div>
          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#34A853" }}>
            {getAvgDmg(data.damageDealt, data.roundsPlayed)}
          </div>
        </div>
        <div>
          <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>게임 수</div>
          <div style={{ fontSize: "18px", fontWeight: "bold" }}>{data.roundsPlayed}</div>
        </div>
        {isRanked ? (
          <div>
            <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>총 어시스트</div>
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>{data.assists}</div>
          </div>
        ) : (
          <div>
            <div style={{ color: "#888", fontSize: "12px", margin: "0 0 5px 0" }}>여포 (최다킬)</div>
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>{data.roundMostKills}</div>
          </div>
        )}
        {!isRanked && (
          <>
            <div>
              <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>헤드샷</div>
              <div style={{ fontSize: "18px", fontWeight: "bold" }}>
                {getHeadshot(data.headshotKills, data.kills)}%
              </div>
            </div>
            <div>
              <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>저격 (최장거리)</div>
              <div style={{ fontSize: "18px", fontWeight: "bold" }}>{data.longestKill.toFixed(1)}m</div>
            </div>
            <div>
              <div style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}>평균 생존</div>
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>
                {getSurvivalTime(data.timeSurvived, data.roundsPlayed)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
