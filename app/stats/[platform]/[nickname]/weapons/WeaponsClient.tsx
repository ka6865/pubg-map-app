"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Crosshair, Trophy, Award, Calendar } from 'lucide-react';

interface WeaponsClientProps {
  nickname: string;
  platform: string;
  cacheData: any;
}

// 투척물 및 특수 무기, 근접 무기까지 모두 한글화하여 추가
const WEAPON_NAME_MAP: Record<string, string> = {
  Item_Weapon_HK416_C: "M416",
  Item_Weapon_ACE32_C: "ACE32",
  Item_Weapon_BerylM762_C: "베릴 M762",
  Item_Weapon_AKM_C: "AKM",
  Item_Weapon_AK47_C: "AKM",
  Item_Weapon_SCAR_C: "SCAR-L",
  Item_Weapon_SCAR_L_C: "SCAR-L",
  Item_Weapon_G36C_C: "G36C",
  Item_Weapon_Mk12_C: "Mk12",
  Item_Weapon_Mini14_C: "Mini-14",
  Item_Weapon_QBZ95_C: "QBZ95",
  Item_Weapon_AUG_C: "AUG",
  Item_Weapon_Groza_C: "Groza",
  Item_Weapon_M16A4_C: "M16A4",
  Item_Weapon_M249_C: "M249",
  Item_Weapon_DP28_C: "DP-28",
  Item_Weapon_MG3_C: "MG3",
  Item_Weapon_AWM_C: "AWM",
  Item_Weapon_Kar98k_C: "Kar98k",
  Item_Weapon_M24_C: "M24",
  Item_Weapon_SLR_C: "SLR",
  Item_Weapon_FNFal_C: "SLR",
  Item_Weapon_SKS_C: "SKS",
  Item_Weapon_VSS_C: "VSS",
  Item_Weapon_Vector_C: "Vector",
  Item_Weapon_UMP45_C: "UMP45",
  Item_Weapon_Bizon_C: "PP-19 Bizon",
  Item_Weapon_MP5K_C: "MP5K",
  Item_Weapon_P90_C: "P90",
  Item_Weapon_Thompson_C: "Tommy Gun",
  Item_Weapon_Shotgun_C: "S12K",
  Item_Weapon_Winchester_C: "Win94",
  Item_Weapon_Lynx_C: "Lynx AMR",
  Item_Weapon_DBS_C: "DBS",
  Item_Weapon_O12_C: "O12",
  
  // 투척 무기 및 유틸리티
  Item_Weapon_Grenade_C: "수류탄",
  Item_Weapon_Molotov_C: "화염병",
  Item_Weapon_SmokeBomb_C: "연막탄",
  Item_Weapon_FlashBang_C: "섬광탄",
  Item_Weapon_C4_C: "C4",
  Item_Weapon_BluezoneGrenade_C: "블루존 수류탄",
  Item_Weapon_SpikeStrip_C: "접이식 스파이크",
  Item_Weapon_DecoyGrenade_C: "디코이 수류탄",
  
  // 기타 특수 무기
  Item_Weapon_Mortar_C: "박격포",
  Item_Weapon_PanzerFaust_C: "판저파우스트",
  Item_Weapon_M79_C: "M79",
  
  // 근접 무기
  Item_Weapon_Pan_C: "프라이팬",
  Item_Weapon_Sickle_C: "낫",
  Item_Weapon_Machete_C: "마체테",
  Item_Weapon_Crowbar_C: "빠루",
};

function getWeaponLabel(id: string): string {
  return WEAPON_NAME_MAP[id] ?? id.replace(/Item_Weapon_|_C$/g, "");
}

function getWeaponImageUrl(weaponId: string): string {
  return `https://raw.githubusercontent.com/pubg/api-assets/master/Assets/Item/Weapon/Main/${weaponId}.png`;
}

type MasteryMode = 'all' | 'normal' | 'ranked';

export default function WeaponsClient({ nickname, platform, cacheData }: WeaponsClientProps) {
  const [masteryMode, setMasteryMode] = useState<MasteryMode>('all');
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  
  const weaponMastery = cacheData?.weapon_mastery_data as any[] | null;
  const hasWeapons = weaponMastery && weaponMastery.length > 0;

  // 선택한 모드 기준으로 킬수가 높은 순서로 정렬하여 무기 분석 수행
  const sortedWeapons = useMemo(() => {
    if (!weaponMastery) return [];
    
    return [...weaponMastery]
      .sort((a, b) => {
        let valA = 0;
        let valB = 0;
        
        if (masteryMode === 'normal') {
          valA = a.kills ?? 0;
          valB = b.kills ?? 0;
        } else if (masteryMode === 'ranked') {
          valA = a.rankKills ?? 0;
          valB = b.rankKills ?? 0;
        } else {
          valA = (a.kills ?? 0) + (a.rankKills ?? 0);
          valB = (b.kills ?? 0) + (b.rankKills ?? 0);
        }
        
        if (valB !== valA) return valB - valA;
        return b.level - a.level; // 킬수가 같다면 레벨순
      })
      .slice(0, 10); // 최대 10개까지 슬라이스
  }, [weaponMastery, masteryMode]);

  const handleImgError = (weaponId: string) => {
    setImgErrors(prev => ({ ...prev, [weaponId]: true }));
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* 백그라운드 그라데이션 및 비주얼 이펙트 */}
      <div className="absolute inset-0 bg-gradient-to-b from-rose-900/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 py-8 relative z-10">
        {/* 상단 네비게이션 헤더 */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href={`/stats/${platform}/${encodeURIComponent(nickname)}`}
            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all active:scale-95 text-gray-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs text-rose-400 font-bold uppercase tracking-wider">
              <Crosshair size={12} />
              <span>Weapons Analysis</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white mt-0.5">
              {nickname} 무기 마스터리 분석
            </h1>
          </div>
        </div>

        {/* 무기 통계 메인 바디 */}
        {!hasWeapons ? (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-3xl p-12 text-center my-12">
            <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/20 text-rose-400">
              <Crosshair size={32} />
            </div>
            <h3 className="text-lg font-black text-white">무기 마스터리 캐시 없음</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto leading-relaxed">
              해당 플레이어의 캐시된 무기 분석 정보가 존재하지 않습니다. 전적 상세 페이지에서 먼저 조회를 진행하여 주십시오.
            </p>
            <Link
              href={`/stats/${platform}/${encodeURIComponent(nickname)}`}
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl transition-all active:scale-95"
            >
              <span>전적 검색 페이지로 가기</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 상단 분석 요약 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 flex items-center gap-4">
                <div className="p-3.5 bg-rose-500/10 rounded-2xl text-rose-400 border border-rose-500/20">
                  <Award size={24} />
                </div>
                <div>
                  <div className="text-[11px] font-black text-gray-500 uppercase tracking-widest">선호 무기</div>
                  <div className="text-lg font-black text-white mt-0.5">
                    {getWeaponLabel(weaponMastery[0]?.weaponId)} (Lv.{weaponMastery[0]?.level})
                  </div>
                </div>
              </div>
              
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 flex items-center gap-4">
                <div className="p-3.5 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20">
                  <Calendar size={24} />
                </div>
                <div>
                  <div className="text-[11px] font-black text-gray-500 uppercase tracking-widest">마지막 갱신</div>
                  <div className="text-lg font-black text-white mt-0.5">
                    {cacheData?.mastery_updated_at 
                      ? new Date(cacheData.mastery_updated_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : "기록 없음"
                    }
                  </div>
                </div>
              </div>
            </div>

            {/* 타이틀 및 일반/경쟁전 모드 전환 필터 */}
            <div className="flex items-center justify-between mt-8 mb-4 flex-wrap gap-3">
              <h2 className="text-sm font-black text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <Trophy size={14} />
                <span>주력 무기 누적 숙련도 순위 (TOP 10)</span>
              </h2>
              <div className="flex gap-1.5">
                {(['all', 'normal', 'ranked'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMasteryMode(m)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all duration-200 active:scale-95 cursor-pointer ${
                      masteryMode === m
                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                        : 'bg-white/5 border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/8'
                    }`}
                  >
                    {m === 'all' ? '통합' : m === 'normal' ? '일반전' : '경쟁전'}
                  </button>
                ))}
              </div>
            </div>

            {/* 개별 무기 랭킹 그리드 */}
            <div className="grid grid-cols-1 gap-4">
              {sortedWeapons.map((item: any, index: number) => {
                let displayKills = 0;
                let displayDamage = 0;
                let displayHeadshots = 0;
                let displayLongest = 0;

                if (masteryMode === 'normal') {
                  displayKills = item.kills ?? 0;
                  displayDamage = Math.round(item.damagePlayer ?? 0);
                  displayHeadshots = item.headShots ?? 0;
                  displayLongest = item.longestDefeat ?? 0;
                } else if (masteryMode === 'ranked') {
                  displayKills = item.rankKills ?? 0;
                  displayDamage = Math.round(item.rankDamagePlayer ?? 0);
                  displayHeadshots = item.rankHeadShots ?? 0;
                  displayLongest = item.rankLongestDefeat ?? 0;
                } else {
                  displayKills = (item.kills ?? 0) + (item.rankKills ?? 0);
                  displayDamage = Math.round((item.damagePlayer ?? 0) + (item.rankDamagePlayer ?? 0));
                  displayHeadshots = (item.headShots ?? 0) + (item.rankHeadShots ?? 0);
                  displayLongest = Math.max(item.longestDefeat ?? 0, item.rankLongestDefeat ?? 0);
                }

                // 랭킹 넘버를 자릿수 맞춰 표기 (RANK 01 ~ RANK 10)
                const rankNumber = String(index + 1).padStart(2, '0');

                return (
                  <div
                    key={item.weaponId}
                    className="relative overflow-hidden rounded-3xl border transition-all duration-300 hover:bg-white/[0.04]"
                    style={{
                      background: "linear-gradient(135deg, rgba(255,255,255,0.01) 0%, rgba(255,255,255,0.02) 100%)",
                      borderColor: "rgba(255,255,255,0.05)",
                    }}
                  >
                    {/* 카드 순위 뱃지 오버레이 */}
                    <div className="absolute top-0 left-0 px-4 py-2 bg-rose-500/10 border-r border-b border-rose-500/15 rounded-br-2xl text-xs font-black text-rose-400">
                      RANK {rankNumber}
                    </div>

                    <div className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                      {/* 무기 이미지 및 명칭 */}
                      <div className="flex items-center gap-6 self-start md:self-center mt-4 md:mt-0">
                        <div className="w-24 h-14 bg-white/[0.02] border border-white/5 rounded-2xl p-1 flex items-center justify-center shrink-0">
                          {imgErrors[item.weaponId] ? (
                            <Crosshair size={22} className="text-gray-600 animate-pulse" />
                          ) : (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={getWeaponImageUrl(item.weaponId)}
                              alt={getWeaponLabel(item.weaponId)}
                              className="max-h-full max-w-full object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                              onError={() => handleImgError(item.weaponId)}
                            />
                          )}
                        </div>
                        <div>
                          <div className="text-xl font-black text-white">{getWeaponLabel(item.weaponId)}</div>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded-md text-[10px] font-black text-rose-400 uppercase tracking-wide mt-1.5">
                            LEVEL {item.level}
                          </span>
                        </div>
                      </div>

                      {/* 주요 스탯 리스트 (md에서 고정너비 지정으로 자릿수가 제각각이어도 수직 열이 완벽히 맞춰지게 수정) */}
                      <div className="grid grid-cols-2 md:flex md:items-center md:gap-0 w-full md:w-auto border-t md:border-t-0 border-white/5 pt-4 md:pt-0">
                        <div className="md:w-28 text-left md:text-center">
                          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">누적 킬</div>
                          <div className="text-base md:text-lg font-black text-white tracking-tight mt-0.5 tabular-nums">
                            {displayKills.toLocaleString()}
                          </div>
                        </div>

                        <div className="md:w-32 text-left md:text-center">
                          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">누적 대미지</div>
                          <div className="text-base md:text-lg font-black text-white tracking-tight mt-0.5 tabular-nums">
                            {displayDamage.toLocaleString()}
                          </div>
                        </div>

                        <div className="md:w-28 text-left md:text-center">
                          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">최대 헤드샷</div>
                          <div className="text-base md:text-lg font-black text-gray-400 tracking-tight mt-0.5 tabular-nums">
                            {displayHeadshots.toLocaleString()}
                          </div>
                        </div>

                        <div className="md:w-28 text-left md:text-center">
                          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">최장 킬</div>
                          <div className="text-base md:text-lg font-black text-gray-400 tracking-tight mt-0.5 tabular-nums">
                            {displayLongest ? `${Math.round(displayLongest)}m` : "-"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* 안내 문구 */}
            <p className="text-center text-[10px] text-gray-700 pt-6">
              ※ 이 무기 숙련도 정보는 PUBG 공식 API로부터 동기화되어 DB 캐시에 보관 중인 스펙입니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
