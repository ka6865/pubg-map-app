import React, { useState, useEffect } from "react";
import type { MatchData, MatchTeamMember } from "../../types/stat";

/**
 * 개별 매치의 결과 요약과 아코디언(상세 펼치기) 형태의 팀원 스탯을 렌더링하는 컨테이너입니다.
 */
export const MatchCard = ({
  matchId,
  nickname,
  platform,
  isMobile,
}: {
  matchId: string;
  nickname: string;
  platform: string;
  isMobile: boolean;
}) => {
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    fetch(
      `/api/pubg/match?matchId=${matchId}&nickname=${nickname}&platform=${platform}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data?.error) {
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
        overflow: "hidden",
        border: "1px solid #333",
        borderLeft: `4px solid ${borderColor}`,
        backgroundColor: bgColor,
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
              }}
            >
              {stats.kills}{" "}
              <span
                style={{
                  color: "#666",
                  fontSize: isMobile ? "10px" : "12px",
                  fontWeight: "normal",
                }}
              >
                킬
              </span>
              <span
                style={{ color: "#555", margin: isMobile ? "0 4px" : "0 6px" }}
              >
                /
              </span>
              {stats.assists}{" "}
              <span
                style={{
                  color: "#666",
                  fontSize: isMobile ? "10px" : "12px",
                  fontWeight: "normal",
                }}
              >
                어시
              </span>
            </div>
            <div
              style={{
                fontSize: isMobile ? "11px" : "13px",
                color: "#aaa",
                margin: "4px 0",
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
                }}
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

          <div style={{ marginBottom: "20px", display: "flex", justifyContent: "center" }}>
            <a
              href={`/?tab=${encodeURIComponent(
                { 에란겔: "Erangel", 미라마: "Miramar", 태이고: "Taego", 론도: "Rondo", 비켄디: "Vikendi", 데스턴: "Deston" }[mapName] || "Erangel"
              )}&playback=${matchId}&nickname=${encodeURIComponent(nickname)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "rgba(242, 169, 0, 0.15)",
                border: "1px solid #F2A900",
                color: "#F2A900",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: "bold",
                fontSize: "14px",
                textDecoration: "none",
                transition: "all 0.2s",
              }}
              className="hover:bg-[#F2A900] hover:text-black"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              매치 궤적 복기 (BETA)
            </a>
          </div>

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
                <th style={{ padding: "10px" }}>KDA</th>
                <th style={{ padding: "10px" }}>데미지</th>
                <th style={{ padding: "10px" }}>기절</th>
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
                      }}
                    >
                      {member.name}
                    </td>
                    <td style={{ padding: "10px" }}>
                      {member.kills} / {member.assists} / {member.deaths || 1}
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
