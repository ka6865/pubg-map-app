import React, { useState } from "react";
import { Box, Sparkles } from "lucide-react";
import type { PrimeParcelItem } from "@/types/crates";
import { DrawnCard, HistoryItem } from "./types";

export const getKoreanRarityName = (rarity: string) => {
  switch (rarity) {
    case "ULTIMATE": return "얼티밋";
    case "LEGENDARY": return "레전더리";
    case "EPIC": return "에픽";
    case "RARE": return "레어";
    default: return rarity;
  }
};

// ----------------------------------------------------
// CrateCard Props & Component
// ----------------------------------------------------
interface CrateCardProps {
  card: DrawnCard;
  isRevealed: boolean;
  onClick: () => void;
  getRarityBadgeStyle: (rarity: string) => string;
  getCardBorderGlow: (rarity: string, isBonus: boolean) => string;
}

export function CrateCard({ card, isRevealed, onClick, getRarityBadgeStyle, getCardBorderGlow }: CrateCardProps) {
  const [imageError, setImageError] = useState(false);
  const [bonusImageError, setBonusImageError] = useState(false);
  // Prevent spoiler: only show rarity glowing border/shadow when revealed
  const borderGlow = isRevealed 
    ? getCardBorderGlow(card.rarity, card.isBonus ?? false) 
    : "border-slate-800 shadow-none";

  return (
    <div
      onClick={onClick}
      className="w-full aspect-[3/4] min-h-[140px] perspective-1000 cursor-pointer group"
    >
      <div className={`relative w-full h-full transition-transform duration-500 preserve-3d ${
        isRevealed ? "" : "rotate-y-180"
      }`}>
        {/* 카드 앞면 (공개됨) */}
        <div className={`absolute inset-0 rounded-xl bg-slate-900 border-2 p-2 sm:p-2.5 flex flex-col justify-between items-center backface-hidden ${borderGlow}`}>
          <div className="flex justify-between w-full items-center">
            <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded tracking-wide ${getRarityBadgeStyle(card.rarity)}`}>
              {getKoreanRarityName(card.rarity)}
            </span>
          </div>
          
          {!imageError && card.image_url ? (
            <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center bg-slate-950/50 rounded-lg p-1 border border-slate-800/80 relative group-hover:scale-105 transition-transform">
              <Box className="w-8 h-8 text-slate-700 absolute inset-0 m-auto -z-10" />
              <img 
                src={card.image_url} 
                alt={card.name}
                className="object-contain max-h-full max-w-full drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]"
                onError={() => setImageError(true)}
              />
            </div>
          ) : (
            <div className="w-full flex-1 flex items-center justify-center p-1 text-center overflow-hidden">
              <span 
                className="font-black text-slate-200 tracking-tight break-all whitespace-normal block w-full text-center"
                style={{
                  wordBreak: 'keep-all',
                  overflowWrap: 'anywhere',
                  lineHeight: '1.1',
                  fontSize: card.name.length > 20 
                    ? '10px' 
                    : card.name.length > 12 
                      ? '11px' 
                      : '12px',
                  transform: card.name.length > 20 
                    ? 'scale(0.85)' 
                    : card.name.length > 12 
                      ? 'scale(0.9)' 
                      : 'scale(1)',
                  transformOrigin: 'center',
                }}
              >
                {card.name}
              </span>
            </div>
          )}

          {!imageError && card.image_url && (
            <div className="text-center w-full mt-1 overflow-hidden">
              <h4 
                className="font-bold text-slate-200 whitespace-normal block w-full text-center"
                style={{
                  fontSize: '10px',
                  lineHeight: '1.15',
                  wordBreak: 'keep-all',
                  overflowWrap: 'anywhere',
                  transform: card.name.length > 20 
                    ? 'scale(0.8)' 
                    : card.name.length > 12 
                      ? 'scale(0.9)' 
                      : 'scale(1)',
                  transformOrigin: 'center top',
                }}
                title={card.name}
              >
                {card.name}
              </h4>
            </div>
          )}

          {/* 보너스 오버레이 박스 (카드 뒤집혔을 때만 팝업 - 스포 차단) */}
          {card.bonus && isRevealed && (
            <div className="absolute inset-0 rounded-xl bg-slate-950/95 border-2 border-amber-400 p-2 flex flex-col justify-between items-center z-20 animate-[fadeIn_0.3s_ease-out] shadow-[0_0_20px_rgba(245,158,11,0.5)]">
              {/* 보너스 헤더 뱃지 */}
              <div className="flex justify-between w-full items-center">
                <span className="text-[8px] font-extrabold bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-md">
                  <Sparkles className="w-2.5 h-2.5 fill-current" />
                  보너스
                </span>
                <span className={`text-[7px] font-extrabold px-1 py-0.5 rounded ${getRarityBadgeStyle(card.bonus.rarity)}`}>
                  {getKoreanRarityName(card.bonus.rarity)}
                </span>
              </div>

              {/* 보너스 입자 애니메이션 데코 */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-1.5 h-1.5 bg-amber-400 rounded-full"
                    style={{
                      left: `${20 + ((i * 17) % 60)}%`,
                      top: `${60 + ((i * 23) % 30)}%`,
                      animation: `particleUp ${1 + ((i * 13) % 10) / 10}s ease-out infinite`,
                      animationDelay: `${((i * 7) % 5) / 10}s`
                    }}
                  />
                ))}
              </div>

              {!bonusImageError && card.bonus.image_url ? (
                <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center bg-slate-900 rounded-lg p-1 border border-amber-500/20 relative">
                  <img 
                    src={card.bonus.image_url} 
                    alt={card.bonus.name}
                    className="object-contain max-h-full max-w-full drop-shadow-[0_2px_4px_rgba(245,158,11,0.3)]"
                    onError={() => setBonusImageError(true)}
                  />
                </div>
              ) : (
                <div className="w-full flex-1 flex items-center justify-center p-1 text-center overflow-hidden">
                  <span 
                    className="font-black text-amber-400 tracking-tight break-all whitespace-normal block w-full text-center"
                    style={{
                      wordBreak: 'keep-all',
                      overflowWrap: 'anywhere',
                      lineHeight: '1.1',
                      fontSize: card.bonus.name.length > 20 
                        ? '10px' 
                        : card.bonus.name.length > 12 
                          ? '11px' 
                          : '12px',
                      transform: card.bonus.name.length > 20 
                        ? 'scale(0.85)' 
                        : card.bonus.name.length > 12 
                          ? 'scale(0.9)' 
                          : 'scale(1)',
                      transformOrigin: 'center',
                    }}
                  >
                    {card.bonus.name}
                  </span>
                </div>
              )}

              <div className="text-center w-full z-10 overflow-hidden">
                {!bonusImageError && card.bonus.image_url && (
                  <h4 
                    className="font-black text-amber-400 whitespace-normal block w-full text-center"
                    style={{
                      fontSize: '10px',
                      lineHeight: '1.15',
                      wordBreak: 'keep-all',
                      overflowWrap: 'anywhere',
                      transform: card.bonus.name.length > 20 
                        ? 'scale(0.8)' 
                        : card.bonus.name.length > 12 
                          ? 'scale(0.9)' 
                          : 'scale(1)',
                      transformOrigin: 'center top',
                    }}
                    title={card.bonus.name}
                  >
                    {card.bonus.name}
                  </h4>
                )}
                {card.bonus.is_extra_crate && (
                  <div className="text-[7px] font-extrabold text-amber-300/90 mt-0.5 animate-pulse">
                    ★ 상자 1개 환급 완료!
                  </div>
                )}
                {card.bonus.token_count > 0 && (
                  <div className="text-[7px] font-extrabold text-amber-300/90 mt-0.5 animate-pulse">
                    ★ 토큰 +{card.bonus.token_count}개 자동지급!
                  </div>
                )}
                {card.bonus.is_prime_parcel && (
                  <div className="text-[7px] font-extrabold text-pink-400 mt-0.5 animate-pulse">
                    ★ 최고급 꾸러미 획득!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 카드 뒷면 (가려짐) */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800 flex flex-col items-center justify-center backface-hidden rotate-y-180 shadow-md">
          <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]">
            <Box className="w-5 h-5 text-amber-500" />
          </div>
          <span className="text-[9px] text-slate-500 font-bold uppercase mt-2 tracking-widest">
            뒤집기
          </span>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// VaultCard Props & Component
// ----------------------------------------------------
interface VaultCardProps {
  item: PrimeParcelItem;
  count: number;
  hasObtained: boolean;
  getRarityBadgeStyle: (rarity: string) => string;
}

export function VaultCard({ item, count, hasObtained, getRarityBadgeStyle }: VaultCardProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      className={`relative bg-slate-950/80 border rounded-2xl p-4 flex flex-col justify-between items-center transition-all ${
        hasObtained
          ? "border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)] animate-[fadeIn_0.5s_ease-out]"
          : "border-slate-800/80 opacity-55"
      }`}
    >
      {hasObtained && (
        <span className="absolute top-2 right-2 bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-black text-xs px-2 py-0.5 rounded-full shadow-md z-10">
          x{count}
        </span>
      )}

      {!imageError && item.image_url ? (
        <div className="w-full aspect-square bg-slate-900 rounded-xl p-2 border border-slate-800/60 flex items-center justify-center relative overflow-hidden group">
          <img
            src={item.image_url}
            alt={item.name}
            className={`object-contain max-h-full max-w-full drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] transition-all duration-350 ${
              hasObtained ? "grayscale-0 group-hover:scale-105" : "grayscale"
            }`}
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div className="w-full aspect-square bg-slate-900 rounded-xl p-4 border border-slate-800/60 flex items-center justify-center text-center overflow-hidden">
          <span 
            className={`font-black leading-[1.1] tracking-tight break-all whitespace-normal block w-full text-center ${
              hasObtained ? "text-slate-200" : "text-slate-500 grayscale"
            }`}
            style={{
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
              fontSize: item.name.length > 20 
                ? '10px' 
                : item.name.length > 12 
                  ? '11px' 
                  : '12px',
              transform: item.name.length > 20 
                ? 'scale(0.85)' 
                : item.name.length > 12 
                  ? 'scale(0.9)' 
                  : 'scale(1)',
              transformOrigin: 'center',
            }}
          >
            {item.name}
          </span>
        </div>
      )}

      <div className="text-center w-full mt-4">
        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded tracking-wide inline-block mb-1.5 ${getRarityBadgeStyle(item.rarity)}`}>
          {getKoreanRarityName(item.rarity)}
        </span>
        {!imageError && item.image_url && (
          <h4 
            className="font-black text-slate-200 whitespace-normal block w-full text-center"
            style={{
              fontSize: '10px',
              lineHeight: '1.15',
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
              transform: item.name.length > 20 
                ? 'scale(0.85)' 
                : item.name.length > 12 
                  ? 'scale(0.9)' 
                  : 'scale(1)',
              transformOrigin: 'center top',
            }}
            title={item.name}
          >
            {item.name}
          </h4>
        )}
        <p className="text-[10px] text-slate-500 mt-1">
          {hasObtained ? "소장 완료" : "미획득"}
        </p>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// HistoryCard Props & Component
// ----------------------------------------------------
interface HistoryCardProps {
  item: HistoryItem;
  getRarityBadgeStyle: (rarity: string) => string;
}

export function HistoryCard({ item, getRarityBadgeStyle }: HistoryCardProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      className="bg-slate-950/80 border border-slate-800/80 p-3 rounded-xl flex items-center gap-4 hover:border-slate-700 transition-all"
    >
      <div className="w-12 h-12 bg-slate-900 rounded border border-slate-800 p-1 flex items-center justify-center shrink-0">
        {!imageError && item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="max-h-full max-w-full object-contain"
            onError={() => setImageError(true)}
          />
        ) : (
          <Box className="w-6 h-6 text-slate-700" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded ${getRarityBadgeStyle(item.rarity)}`}>
            {getKoreanRarityName(item.rarity)}
          </span>
          {item.isFromPrimeParcel && (
            <span className="text-[8px] font-extrabold bg-pink-900/60 text-pink-400 px-1.5 py-0.5 rounded">
              꾸러미
            </span>
          )}
          {item.isBonus && (
            <span className="text-[8px] font-extrabold bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              ★ 보너스
            </span>
          )}
        </div>
        <h4 
          className="text-xs font-bold text-slate-200 whitespace-normal block w-full mt-1"
          style={{
            wordBreak: 'keep-all',
            overflowWrap: 'anywhere',
            lineHeight: '1.2',
          }}
          title={item.name}
        >
          {item.name}
        </h4>
        <span className="text-[10px] text-slate-500 mt-0.5 block">
          {item.timestamp.toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
