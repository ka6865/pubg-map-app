// 파일 위치: components/StatSearch.tsx
"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY_RECENT = "pubg_recent_searches_v2";
const STORAGE_KEY_FAVORITES = "pubg_favorites_v2";

const MatchCard = ({
  matchId,
  nickname,
  platform,
}: {
  matchId: string;
  nickname: string;
  platform: string;
}) => {
  const [matchData, setMatchData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    fetch(
      `/api/pubg/match?matchId=${matchId}&nickname=${nickname}&platform=${platform}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setMatchData(data);
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

  //  에러가 나서 matchData가 비어있을 때 터지지 않게 막는 안전장치
  if (!matchData) return null;

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
      {/*닫혀있을 때 보이는 메인 카드 영역 (클릭 시 아코디언 토글) */}
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
        {/* 1️⃣ 등수 & 모드 (좌측) */}
        <div
          style={{
            width: "90px",
            textAlign: "center",
            borderRight: "1px solid #333",
            paddingRight: "15px",
          }}
        >
          <div
            style={{ fontSize: "22px", fontWeight: "900", color: borderColor }}
          >
            #{stats.winPlace}
          </div>
          <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>
            {gameMode}
          </div>
        </div>

        {/* 2️⃣ 내 KDA & 딜량 (중앙) */}
        <div
          style={{
            flex: 1,
            paddingLeft: "20px",
            display: "flex",
            gap: "30px",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{ fontSize: "18px", fontWeight: "bold", color: "#fff" }}
            >
              {stats.kills}{" "}
              <span
                style={{
                  color: "#666",
                  fontSize: "12px",
                  fontWeight: "normal",
                }}
              >
                킬
              </span>
              <span style={{ color: "#555", margin: "0 6px" }}>/</span>
              {stats.assists}{" "}
              <span
                style={{
                  color: "#666",
                  fontSize: "12px",
                  fontWeight: "normal",
                }}
              >
                어시
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "#aaa", margin: "4px 0" }}>
              딜량{" "}
              <span style={{ fontWeight: "bold", color: "#ddd" }}>
                {Math.floor(stats.damageDealt)}
              </span>
            </div>
          </div>
          <div style={{ color: "#888", fontSize: "12px" }}>
            <div
              style={{
                fontWeight: "bold",
                color: "#ccc",
                marginBottom: "4px",
                fontSize: "13px",
              }}
            >
              {mapName}
            </div>
            <div>{timeStr}</div>
          </div>
        </div>

        {/* 3️⃣ 팀원 닉네임 리스트 & 펼치기 화살표 (우측) */}
        <div
          style={{
            width: "160px",
            paddingLeft: "20px",
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
            {team.map((member: any) => (
              <div
                key={member.name}
                style={{
                  fontSize: "12px",
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
              fontSize: "18px",
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            ▼
          </div>
        </div>
      </div>

      {/* 클릭 시 열리는 아코디언(상세 정보) 영역 */}
      {isExpanded && (
        <div
          style={{
            backgroundColor: "#111",
            borderTop: "1px solid #333",
            padding: "20px",
          }}
        >
          {/* 팀 요약 스탯 */}
          <div
            style={{
              display: "flex",
              gap: "30px",
              marginBottom: "20px",
              paddingBottom: "15px",
              borderBottom: "1px dashed #333",
            }}
          >
            <div>
              <span style={{ color: "#888", fontSize: "12px" }}>팀 총 킬:</span>{" "}
              <span style={{ fontWeight: "bold", color: "#F2A900" }}>
                {totalTeamKills}
              </span>
            </div>
            <div>
              <span style={{ color: "#888", fontSize: "12px" }}>
                팀 총 데미지:
              </span>{" "}
              <span style={{ fontWeight: "bold", color: "#34A853" }}>
                {Math.floor(totalTeamDamage)}
              </span>
            </div>
            <div>
              <span style={{ color: "#888", fontSize: "12px" }}>
                팀 생존 시간:
              </span>{" "}
              <span style={{ fontWeight: "bold", color: "#fff" }}>
                {Math.floor(stats.timeSurvived / 60)}분{" "}
                {stats.timeSurvived % 60}초
              </span>
            </div>
          </div>

          {/* 팀원 상세 스탯 테이블 */}
          <table
            style={{
              width: "100%",
              fontSize: "13px",
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
                .sort((a: any, b: any) => b.kills - a.kills)
                .map((member: any) => (
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

export default function StatSearch() {
  const [platform, setPlatform] = useState("steam");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [selectedSeason, setSelectedSeason] = useState("");

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<"recent" | "favorites">("recent");

  useEffect(() => {
    const savedRecent = localStorage.getItem(STORAGE_KEY_RECENT);
    if (savedRecent) setRecentSearches(JSON.parse(savedRecent));

    const savedFavorites = localStorage.getItem(STORAGE_KEY_FAVORITES);
    if (savedFavorites) setFavorites(JSON.parse(savedFavorites));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
  }, [favorites]);

  const handleSearch = async (
    targetSeason = selectedSeason,
    overrideNickname?: string
  ) => {
    const searchName = overrideNickname || nickname;
    if (!searchName.trim() || cooldown) return;

    setLoading(true);
    setError("");
    setCooldown(true);
    setShowDropdown(false);

    try {
      const res = await fetch(
        `/api/pubg/player?nickname=${searchName}&platform=${platform}&season=${targetSeason}`
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setCooldown(false), 3000);
    }
  };

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

  const getKDA = (k: number, a: number, d: number) =>
    ((k + a) / (d || 1)).toFixed(2);
  const getWinRate = (w: number, p: number) =>
    p > 0 ? ((w / p) * 100).toFixed(1) : "0.0";
  const getAvgDmg = (dmg: number, p: number) =>
    p > 0 ? (dmg / p).toFixed(0) : "0";
  const getHeadshot = (h: number, k: number) =>
    k > 0 ? ((h / k) * 100).toFixed(1) : "0.0";
  const getSurvivalTime = (time: number, p: number) => {
    if (p === 0) return "0분 0초";
    const avgSec = Math.floor(time / p);
    return `${Math.floor(avgSec / 60)}분 ${avgSec % 60}초`;
  };

  const renderStatCard = (title: string, data: any, isRanked: boolean) => {
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
              {data.currentTier?.tier || "Unranked"}{" "}
              {data.currentTier?.subTier || ""} ({data.currentRankPoint || 0}{" "}
              RP)
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
            <div
              style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}
            >
              K/D
            </div>
            <div
              style={{ fontSize: "18px", fontWeight: "bold", color: "#F2A900" }}
            >
              {getKDA(data.kills, data.assists, data.deaths || data.losses)}
            </div>
          </div>
          <div>
            <div
              style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}
            >
              승률
            </div>
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>
              {getWinRate(data.wins, data.roundsPlayed)}%
            </div>
          </div>
          <div>
            <div
              style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}
            >
              Top10
            </div>
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>{top10}%</div>
          </div>
          <div>
            <div
              style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}
            >
              평균 딜량
            </div>
            <div
              style={{ fontSize: "18px", fontWeight: "bold", color: "#34A853" }}
            >
              {getAvgDmg(data.damageDealt, data.roundsPlayed)}
            </div>
          </div>
          <div>
            <div
              style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}
            >
              게임 수
            </div>
            <div style={{ fontSize: "18px", fontWeight: "bold" }}>
              {data.roundsPlayed}
            </div>
          </div>
          {isRanked ? (
            <div>
              <div
                style={{ color: "#888", fontSize: "12px", marginBottom: "5px" }}
              >
                총 어시스트
              </div>
              <div style={{ fontSize: "18px", fontWeight: "bold" }}>
                {data.assists}
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{ color: "#888", fontSize: "12px", margin: "0 0 5px 0" }}
              >
                여포 (최다킬)
              </div>
              <div style={{ fontSize: "18px", fontWeight: "bold" }}>
                {data.roundMostKills}
              </div>
            </div>
          )}
          {!isRanked && (
            <>
              <div>
                <div
                  style={{
                    color: "#888",
                    fontSize: "12px",
                    marginBottom: "5px",
                  }}
                >
                  헤드샷
                </div>
                <div style={{ fontSize: "18px", fontWeight: "bold" }}>
                  {getHeadshot(data.headshotKills, data.kills)}%
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: "#888",
                    fontSize: "12px",
                    marginBottom: "5px",
                  }}
                >
                  저격 (최장거리)
                </div>
                <div style={{ fontSize: "18px", fontWeight: "bold" }}>
                  {data.longestKill.toFixed(1)}m
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: "#888",
                    fontSize: "12px",
                    marginBottom: "5px",
                  }}
                >
                  평균 생존
                </div>
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

  const renderDropdownList = (
    names: string[],
    type: "recent" | "favorites"
  ) => {
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
          onMouseOut={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <span style={{ fontWeight: "bold", flex: 1 }}>{name}</span>
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
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

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "20px",
        color: "white",
      }}
    >
      <h2
        style={{
          color: "#F2A900",
          fontSize: "24px",
          fontWeight: "bold",
          marginBottom: "20px",
          textAlign: "center",
        }}
      >
        📊 전적 검색
      </h2>
      <div
        style={{
          display: "flex",
          gap: "10px",
          maxWidth: "800px",
          position: "relative",
          margin: "0 auto 30px auto",
        }}
      >
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          style={{
            padding: "12px",
            backgroundColor: "#252525",
            color: "white",
            border: "1px solid #444",
            borderRadius: "6px",
          }}
        >
          <option value="steam">스팀 (Steam)</option>
          <option value="kakao">카카오 (Kakao)</option>
        </select>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="text"
            placeholder="정확한 대소문자 닉네임을 입력하세요"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#252525",
              color: "white",
              border: "1px solid #444",
              borderRadius: "6px",
              boxSizing: "border-box",
            }}
          />
          {showDropdown && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: "5px",
                backgroundColor: "#e9ecef",
                borderRadius: "6px",
                overflow: "hidden",
                zIndex: 10,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  backgroundColor: "#dee2e6",
                  borderBottom: "1px solid #ced4da",
                }}
              >
                <div
                  onClick={() => setActiveTab("recent")}
                  style={{
                    flex: 1,
                    padding: "10px 15px",
                    textAlign: "center",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: activeTab === "recent" ? "bold" : "normal",
                    color: activeTab === "recent" ? "#212529" : "#666",
                    backgroundColor:
                      activeTab === "recent" ? "#e9ecef" : "transparent",
                  }}
                >
                  최근 검색
                </div>
                <div
                  onClick={() => setActiveTab("favorites")}
                  style={{
                    flex: 1,
                    padding: "10px 15px",
                    textAlign: "center",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: activeTab === "favorites" ? "bold" : "normal",
                    color: activeTab === "favorites" ? "#212529" : "#666",
                    backgroundColor:
                      activeTab === "favorites" ? "#e9ecef" : "transparent",
                    borderLeft: "1px solid #ced4da",
                  }}
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
          style={{
            padding: "0 20px",
            backgroundColor: loading || cooldown ? "#555" : "#F2A900",
            color: loading || cooldown ? "#aaa" : "black",
            fontWeight: "bold",
            border: "none",
            borderRadius: "6px",
            cursor: loading || cooldown ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "검색중..." : cooldown ? "쿨타임 ⏳" : "검색"}
        </button>
      </div>
      {error && (
        <div
          style={{
            color: "#ff4d4d",
            marginBottom: "20px",
            padding: "15px",
            backgroundColor: "rgba(255, 77, 77, 0.1)",
            borderRadius: "6px",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              borderBottom: "2px solid #333",
              paddingBottom: "15px",
            }}
          >
            <div style={{ fontSize: "28px", fontWeight: "bold" }}>
              <span
                style={{
                  color: "#888",
                  fontSize: "16px",
                  marginRight: "10px",
                  verticalAlign: "middle",
                }}
              >
                {result.platform === "steam" ? "Steam" : "Kakao"}
              </span>
              {result.nickname}
            </div>
            <select
              value={selectedSeason}
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                padding: "8px 12px",
                backgroundColor: "#252525",
                color: "white",
                border: "1px solid #444",
                borderRadius: "6px",
              }}
            >
              {result.seasons.map((s: any) => (
                <option key={s.id} value={s.id}>
                  시즌 {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h3
              style={{
                fontSize: "18px",
                color: "#F2A900",
                marginBottom: "15px",
              }}
            >
              🏆 경쟁전 (Ranked)
            </h3>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              {renderStatCard("듀오", result.stats?.ranked?.duo, true)}
              {renderStatCard("스쿼드", result.stats?.ranked?.squad, true)}
            </div>
          </div>
          <div>
            <h3
              style={{ fontSize: "18px", color: "#aaa", marginBottom: "15px" }}
            >
              🎮 일반전 (Normal)
            </h3>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              {renderStatCard("솔로", result.stats?.normal?.solo, false)}
              {renderStatCard("듀오", result.stats?.normal?.duo, false)}
              {renderStatCard("스쿼드", result.stats?.normal?.squad, false)}
            </div>
          </div>

          {/*  최근 매치 리스트 출력부 */}
          <div style={{ marginTop: "20px" }}>
            <h3
              style={{
                fontSize: "20px",
                fontWeight: "bold",
                marginBottom: "15px",
                borderBottom: "1px solid #333",
                paddingBottom: "10px",
              }}
            >
              ⚔️ 최근 매치 (최대 10게임)
            </h3>

            {result.recentMatches && result.recentMatches.length > 0 ? (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "5px" }}
              >
                {/* 무리한 API 호출을 막기 위해 10게임만 잘라서 */}
                {result.recentMatches.slice(0, 10).map((matchId: string) => (
                  <MatchCard
                    key={matchId}
                    matchId={matchId}
                    nickname={result.nickname}
                    platform={result.platform}
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: "40px",
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "12px",
                  textAlign: "center",
                  color: "#888",
                }}
              >
                최근 14일 이내에 플레이한 매치 기록이 없습니다.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
