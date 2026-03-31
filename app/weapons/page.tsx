"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function WeaponsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [weapons, setWeapons] = useState<any[]>([]);

  // Filters & State
  const [activeType, setActiveType] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"Default" | "DamageDesc" | "SpeedDesc">("Default");
  const [viewMode, setViewMode] = useState<"CARD" | "TABLE">("CARD");

  useEffect(() => {
    async function fetchWeapons() {
      try {
        const { data, error } = await supabase
          .from("weapons")
          .select("*")
          .order("name", { ascending: true });
        
        if (error) throw error;
        setWeapons(data || []);
      } catch (err) {
        console.error("데이터 로드 실패:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchWeapons();
  }, []);

  const filteredWeapons = useMemo(() => {
    let result = weapons;
    if (activeType !== "ALL") {
      result = result.filter(w => w.type === activeType);
    }
    
    // 복사 후 정렬 (원본 변형 방지)
    result = [...result];
    if (sortBy === "DamageDesc") {
      result.sort((a, b) => b.damage - a.damage);
    } else if (sortBy === "SpeedDesc") {
      result.sort((a, b) => b.bullet_speed - a.bullet_speed);
    }
    return result;
  }, [weapons, activeType, sortBy]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0b0f19] text-[#F2A900] gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F2A900]"></div>
        <p className="font-bold">무기고 개방 중...</p>
      </div>
    );
  }

  const weaponTypes = ["ALL", "AR", "DMR", "SR", "SMG", "SG", "LMG"];

  // 테이블 뷰 렌더러
  const renderTableView = () => (
    <div className="w-full overflow-x-auto rounded-lg border border-[#333]">
      <table className="w-full text-left text-sm text-gray-300">
        <thead className="bg-[#1a1a1a] text-[#F2A900] font-bold">
          <tr>
            <th className="px-4 py-3 border-b border-[#333]">이름</th>
            <th className="px-4 py-3 border-b border-[#333]">타입</th>
            <th className="px-4 py-3 border-b border-[#333]">탄약</th>
            <th className="px-4 py-3 border-b border-[#333]">데미지</th>
            <th className="px-4 py-3 border-b border-[#333]">탄속(m/s)</th>
            <th className="px-4 py-3 border-b border-[#333]">패치 노트</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#333]">
          {filteredWeapons.map((w) => (
            <tr key={w.id} className="hover:bg-[#222]">
              <td className="px-4 py-3 font-bold text-white">{w.name}</td>
              <td className="px-4 py-3 text-[#F2A900]">{w.type}</td>
              <td className="px-4 py-3">{w.ammo}</td>
              <td className="px-4 py-3 text-red-400 font-bold">{w.damage}</td>
              <td className="px-4 py-3 text-blue-300">{w.bullet_speed}</td>
              <td className="px-4 py-3 text-xs opacity-70 italic max-w-[200px] truncate" title={w.patch_notes || ""}>
                {w.patch_notes || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // 카드 뷰 렌더러
  const renderCardView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
      {filteredWeapons.map((w) => {
        // 데미지 게이지 (AWM 105 기준 백분율)
        const dmgPercent = Math.min((w.damage / 105) * 100, 100);
        return (
          <div key={w.id} className="bg-[#1a1a1a] border border-[#333] rounded-xl overflow-hidden shadow-lg transition-transform transform hover:-translate-y-1 hover:border-[#F2A900]">
            <div className="bg-[#252525] p-3 flex justify-between items-center border-b border-[#333]">
              <span className="font-black text-white text-lg">{w.name}</span>
              <span className="bg-[#F2A900] text-black text-xs font-bold px-2 py-1 rounded">{w.type}</span>
            </div>
            
            <div className="p-4 flex flex-col gap-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">데미지</span>
                  <span className="text-red-400 font-bold">{w.damage}</span>
                </div>
                <div className="w-full bg-[#333] rounded-full h-1.5 overflow-hidden">
                  <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${dmgPercent}%` }}></div>
                </div>
              </div>

              <div className="flex justify-between items-center text-sm border-t border-[#333] pt-3 mt-1">
                <span className="text-gray-400">탄약</span>
                <span className="text-white font-mono bg-[#333] px-2 py-0.5 rounded">{w.ammo}</span>
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">탄속</span>
                <span className="text-blue-300 font-mono">{w.bullet_speed} <span className="text-[10px] text-gray-500">m/s</span></span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">습득</span>
                <span className="text-green-400">{w.availability}</span>
              </div>
              
              {w.patch_notes && (
                <div className="mt-2 text-[10px] text-yellow-500/70 bg-[#111] p-2 rounded italic border border-yellow-900/30">
                  📝 {w.patch_notes}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b0f19] text-white p-6 pb-20 overflow-y-auto w-full">
      <div className="max-w-[1200px] mx-auto w-full flex flex-col gap-6">
        
        {/* 헤더 부분 */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[#333] pb-4">
          <div>
            <h1 className="text-3xl font-black text-[#F2A900]">🔫 배그 무기 정보 도감</h1>
            <p className="text-sm text-gray-400 mt-2">최신 패치 정보가 반영된 실시간 무기 스탯 데이터베이스입니다.</p>
          </div>
          <button 
            onClick={() => router.push("/")}
            className="px-4 py-2 border border-[#444] rounded bg-[#1a1a1a] hover:bg-[#333] transition-colors font-bold text-sm"
          >
            홈으로 돌아가기
          </button>
        </div>

        {/* 필터 & 정렬 컨트롤 */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 bg-[#111] p-3 rounded-lg border border-[#222]">
          
          <div className="flex flex-wrap gap-2">
            {weaponTypes.map(type => (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className={`px-3 py-1.5 rounded-md text-sm font-bold transition-colors ${
                  activeType === type 
                    ? "bg-[#F2A900] text-black" 
                    : "bg-[#252525] text-gray-400 hover:bg-[#333] hover:text-white"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <select 
              className="bg-[#252525] border border-[#444] text-white text-sm rounded-md px-3 py-1.5 outline-none focus:border-[#F2A900]"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="Default">기본 정렬</option>
              <option value="DamageDesc">데미지 높은 순</option>
              <option value="SpeedDesc">탄속 빠른 순</option>
            </select>

            <div className="flex bg-[#252525] rounded-md overflow-hidden border border-[#444]">
              <button 
                onClick={() => setViewMode("CARD")}
                className={`px-3 py-1.5 text-sm font-bold ${viewMode === "CARD" ? "bg-[#F2A900] text-black" : "text-gray-400 hover:bg-[#333]"}`}
              >
                카드형
              </button>
              <button 
                onClick={() => setViewMode("TABLE")}
                className={`px-3 py-1.5 text-sm font-bold ${viewMode === "TABLE" ? "bg-[#F2A900] text-black" : "text-gray-400 hover:bg-[#333]"}`}
              >
                리스트(표)
              </button>
            </div>
          </div>
          
        </div>

        {/* 결과 데이터 */}
        {viewMode === "CARD" ? renderCardView() : renderTableView()}

        {filteredWeapons.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            조건에 맞는 무기가 없습니다.
          </div>
        )}

      </div>
    </div>
  );
}
