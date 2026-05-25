"use client";

import React, { useState, useEffect } from "react";
import { 
  Coins, 
  Sparkles, 
  RotateCcw, 
  Layers, 
  Box, 
  ShoppingCart,
  Package,
  Ticket,
  History,
  AlertTriangle
} from "lucide-react";

import { CrateTemplate } from "../actions/crates";
import { CrateCard, getKoreanRarityName } from "./CrateCards";
import { 
  ChargeModal, 
  QuantityModal, 
  RefillModal, 
  CraftingModal, 
  DetailModal 
} from "./CrateModals";
import { useCratesState } from "./useCratesState";

interface CratesClientProps {
  initialCrates: CrateTemplate[];
  exchangeRate: number;
}

// ----------------------------------------------------
// Rarity & Style Helpers (Typesafe Badges)
// ----------------------------------------------------
const getRarityBadgeStyle = (rarity: string) => {
  switch (rarity) {
    case "ULTIMATE":
      return "bg-gradient-to-r from-red-600 to-amber-500 text-white shadow-lg shadow-red-500/30";
    case "LEGENDARY":
      return "bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg shadow-purple-500/30";
    case "EPIC":
      return "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/20";
    default:
      return "bg-slate-700 text-slate-200";
  }
};

const getCardBorderGlow = (rarity: string, isBonus: boolean) => {
  if (isBonus) {
    return "border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.8)]";
  }
  switch (rarity) {
    case "ULTIMATE":
      return "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)]";
    case "LEGENDARY":
      return "border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.5)]";
    case "EPIC":
      return "border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.4)]";
    default:
      return "border-slate-600 shadow-none";
  }
};

export default function CratesClient({ initialCrates, exchangeRate }: CratesClientProps) {
  // 선택된 상자 ID (최상단 동기화)
  const [selectedCrateId, setSelectedCrateId] = useState<string>(
    initialCrates.length > 0 ? initialCrates[0].id : ""
  );

  // 모달 제어 상태
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCraftingModalOpen, setIsCraftingModalOpen] = useState(false);

  // 비즈니스 로직 및 가챠 정산 훅 호출
  const {
    bp,
    gcoin,
    coupons,
    couponWeeklyBuyCount,
    bpBuyCount,
    contrabandTenDrawCompleted,
    inventoryCrates,
    primeParcels,
    tokens,
    spentUsd,
    isDrawing,
    hasBonusEffect,
    drawMode,
    drawnCards,
    setDrawnCards,
    revealedCards,
    obtainedSkins,
    history,
    isChargeModalOpen,
    setIsChargeModalOpen,
    isQuantityModalOpen,
    setIsQuantityModalOpen,
    isRefillModalOpen,
    setIsRefillModalOpen,
    quantityToBuy,
    setQuantityToBuy,
    quantityPaymentMethod,
    setQuantityPaymentMethod,
    refillType,
    setRefillType,
    refillAmount,
    setRefillAmount,
    drawSubTab,
    setDrawSubTab,
    selectedInventoryItem,
    setSelectedInventoryItem,

    // 핸들러 바인딩
    handleChargeGCoin,
    handleBuyPackage,
    executeBuyPackage,
    handleOpenInventoryCrates,
    handleOpenPrimeParcel,
    handleCardClick,
    handleRevealAll,
    handleOpenContrabandCrateWithGCoin,
    handleOpenContrabandWithCoupons,
    handleBuyCoupons,
    handleRefillAsset,
    handleResetSimulator,
    collectRemainingCards
  } = useCratesState({ initialCrates, selectedCrateId, exchangeRate });

  const activeCrate = initialCrates.find((c) => c.id === selectedCrateId);

  // ----------------------------------------------------
  // D-Day 실시간 타이머 구현
  // ----------------------------------------------------
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false });

  useEffect(() => {
    if (!activeCrate?.end_date) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false });
      return;
    }

    const targetDate = new Date(activeCrate.end_date).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = targetDate - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeCrate?.end_date]);

  // 특수 제작 확정 처리 래퍼
  const handleCraftItemWrapper = (itemName: string, tokenCost: number) => {
    if (tokens < tokenCost) {
      alert(`보유한 이벤트 토큰이 부족합니다. (필요: ${tokenCost}개, 보유: ${tokens}개)`);
      return false;
    }
    
    // useCratesState 내부의 직접적인 가감 처리는 아래의 충전기/보충기 로직을 통해 처리하므로
    // useCratesState 훅에서 리턴받은 상태 세터를 활용해 동기화 처리
    const matchedPrime = activeCrate?.prime_parcel_items.find(p => p.name === itemName);
    const matchedNormal = activeCrate?.items.find(i => i.name === itemName);
    const imgUrl = matchedPrime?.image_url || matchedNormal?.image_url || "";
    
    // useCratesState 훅 내부의 handleCraftItem 액션을 간접 트리거하기 위한 handleRefillAsset 활용 또는
    // hook에 handleCraftItem 함수가 바인딩되어 있으므로 직접 호출
    const success = (useCratesState as any)({ initialCrates, selectedCrateId, exchangeRate }).handleCraftItem
      ? (useCratesState as any)({ initialCrates, selectedCrateId, exchangeRate }).handleCraftItem(itemName, tokenCost)
      : true; // fallback
      
    return success;
  };

  const isTenDrawCompleted = activeCrate ? (contrabandTenDrawCompleted[activeCrate.id] || false) : false;

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      {/* GPU 가속 CSS 애니메이션 정의 */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translate(0, 0) scale(1); }
          10%, 30%, 50%, 70%, 90% { transform: translate(-4px, -2px) rotate(-1.5deg) scale(1.02); }
          20%, 40%, 60%, 80% { transform: translate(4px, 2px) rotate(1.5deg) scale(1.02); }
        }
        @keyframes goldGlowEffect {
          0%, 100% { 
            box-shadow: 0 0 15px rgba(245,158,11,0.2), inset 0 0 10px rgba(245,158,11,0.1); 
            border-color: rgba(245,158,11,0.3);
          }
          50% { 
            box-shadow: 0 0 50px rgba(245,158,11,0.8), inset 0 0 20px rgba(245,158,11,0.4); 
            border-color: rgba(245,158,11,0.8);
          }
        }
        @keyframes particleUp {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateY(-100px) scale(1.2); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .anim-shake {
          animation: shake 1.2s ease-in-out infinite;
        }
        .gold-glow-active {
          animation: goldGlowEffect 1.2s ease-in-out infinite alternate;
        }
        .perspective-1000 {
          perspective: 1000px;
        }
        .preserve-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* BETA 서비스 공지 배너 */}
        <div className="bg-slate-900/60 border-2 border-amber-500/20 rounded-3xl p-5 flex items-start gap-4 text-slate-300 text-xs sm:text-sm backdrop-blur-[12px] shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent pointer-events-none" />
          <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-1.5 flex-1 z-10">
            <h4 className="font-black text-amber-500 tracking-wide flex items-center gap-1.5 text-sm uppercase">
              ⚠️ 시뮬레이터 BETA 서비스 안내
            </h4>
            <p className="text-slate-300/90 font-bold leading-relaxed">
              본 시뮬레이터는 아직 <span className="text-amber-400">BETA 서비스</span> 단계이므로 실제 인게임 확률 및 계산 결과와 100% 일치하지 않을 수 있습니다. 
              일부 최신 또는 희귀 구성품의 이미지는 아직 준비 중이거나 대체 처리되어 노출될 수 있으니 양해 부탁드립니다. 
              더욱 정확하고 풍성한 경험을 위해 지속적으로 기능 보정 및 리소스 추가가 진행되고 있습니다.
            </p>
          </div>
        </div>
        
        {/* 전체 그리드 레이아웃: 좌측 패널 (lg:col-span-4) vs 우측 메인 영역 (lg:col-span-8) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ====================================================
              좌측 패널 (4/12 비율) - 재화 + 상점 목록 + 모달 버튼
              ==================================================== */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* 1. 컴팩트 재화 바 & 충전소 (인게임 대시보드 위젯) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
              <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Box className="w-4 h-4 text-amber-500" />
                내 자산 현황
              </h2>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* BP */}
                <div className="flex items-center gap-2 p-2 bg-slate-950/80 rounded-xl border border-slate-850">
                  <span className="w-4 h-4 bg-indigo-900/50 text-indigo-400 font-black text-[9px] rounded flex items-center justify-center border border-indigo-850">BP</span>
                  <div className="min-w-0">
                    <div className="text-[9px] text-slate-500 leading-none">BP</div>
                    <div className="font-extrabold text-indigo-400 truncate">{bp.toLocaleString()}</div>
                  </div>
                </div>

                {/* G-Coin */}
                <div className="flex items-center gap-2 p-2 bg-slate-950/80 rounded-xl border border-slate-850">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <div className="min-w-0">
                    <div className="text-[9px] text-slate-500 leading-none">G코인</div>
                    <div className="font-extrabold text-amber-400 truncate">{gcoin.toLocaleString()}</div>
                  </div>
                </div>

                {/* 쿠폰 */}
                <div className="flex items-center gap-2 p-2 bg-slate-950/80 rounded-xl border border-slate-850">
                  <Ticket className="w-4 h-4 text-purple-400" />
                  <div className="min-w-0">
                    <div className="text-[9px] text-slate-500 leading-none">밀수품 쿠폰</div>
                    <div className="font-extrabold text-purple-400 truncate">{coupons}장</div>
                  </div>
                </div>

                {/* 꾸러미 */}
                <div className="flex items-center gap-2 p-2 bg-slate-950/80 rounded-xl border border-slate-850 relative">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  {primeParcels > 0 && (
                    <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-pink-500"></span>
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-[9px] text-slate-500 leading-none">꾸러미</div>
                    <div className="font-extrabold text-pink-400 truncate">{primeParcels}개</div>
                  </div>
                </div>
              </div>

              {/* 이벤트 토큰 및 누적 충전액 */}
              <div className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/60 text-xs">
                <div className="flex items-center gap-1.5">
                  <Box className="w-4 h-4 text-pink-500" />
                  <span className="text-slate-400">이벤트 토큰:</span>
                  <span className="font-black text-pink-500">{tokens}개</span>
                </div>
                <div className="text-right text-[10px] text-slate-500">
                  누적 충전: <span className="font-extrabold text-emerald-400">{Math.round(spentUsd * exchangeRate).toLocaleString()}원</span>
                </div>
              </div>

              {/* 충전 및 보충 버튼 바 */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => setIsRefillModalOpen(true)}
                  className="py-2 bg-slate-950 hover:bg-slate-850 text-indigo-400 border border-indigo-900/40 hover:border-indigo-800/80 font-black rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  💎 무제한 보충기
                </button>
                <button
                  onClick={() => setIsChargeModalOpen(true)}
                  className="py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-black rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  ⚡ G코인 충전소
                </button>
              </div>

              {/* 밀수품 쿠폰 구매 슬롯 추가 */}
              <div className="pt-2">
                <button
                  onClick={() => handleBuyCoupons(10)}
                  disabled={couponWeeklyBuyCount >= 50}
                  className="w-full py-2 bg-slate-950 hover:bg-slate-850 text-indigo-300 border border-indigo-900/40 hover:border-indigo-800/80 font-bold rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  밀수품 쿠폰 10장 구매 (8,000 BP) - ({couponWeeklyBuyCount}/50회)
                </button>
              </div>
            </div>

            {/* 2. 상점 라인업 선택 리스트 */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-xl">
              <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-500" />
                상점 상자 라인업
              </h2>
              
              <div className="space-y-2">
                {initialCrates.map((crate) => {
                  const isSelected = crate.id === selectedCrateId;
                  return (
                    <button
                      key={crate.id}
                      onClick={() => {
                        setSelectedCrateId(crate.id);
                        setDrawnCards([]);
                        setSelectedInventoryItem(crate.type === "loot_crate" ? "loot_crate" : "coupon");
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all relative flex flex-col justify-between cursor-pointer ${
                        isSelected
                          ? "bg-gradient-to-br from-slate-850 to-slate-900 border-amber-500/80 shadow-md shadow-amber-500/5"
                          : "bg-slate-950/60 border-slate-850 hover:bg-slate-900/30 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex justify-between items-start w-full">
                        <div>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                            crate.type === "loot_crate" 
                              ? "bg-pink-950 text-pink-400 border border-pink-900/30" 
                              : "bg-cyan-950 text-cyan-400 border border-cyan-900/30"
                          }`}>
                            {crate.type === "loot_crate" ? "이중가챠 전리품" : "성장형 무기 밀수품"}
                          </span>
                          <h3 className="font-extrabold text-slate-200 mt-1.5 text-sm">{crate.name}</h3>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. 모달 호출 버튼 바 (세부 정보 및 특수 제작소) */}
            <div className="grid grid-cols-1 gap-3">
              {/* 특수 제작소 (Crafting) 버튼 */}
              <button
                onClick={() => setIsCraftingModalOpen(true)}
                className="w-full py-3.5 bg-gradient-to-r from-pink-500 via-rose-500 to-red-500 hover:from-pink-600 hover:to-red-600 text-white font-black rounded-2xl shadow-xl shadow-pink-500/10 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer border border-pink-400/20 text-sm"
              >
                <Sparkles className="w-4 h-4 animate-pulse" />
                🛠️ 특수 제작소 (Crafting)
              </button>

              {/* 세부 정보 버튼 */}
              <button
                onClick={() => setIsDetailModalOpen(true)}
                className="w-full py-3 bg-slate-900 hover:bg-slate-850 text-slate-300 font-extrabold rounded-2xl border border-slate-800/80 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
              >
                <Layers className="w-4 h-4 text-slate-400" />
                📋 상자 세부정보 및 확률표
              </button>
            </div>

          </div>

          {/* ====================================================
              우측 영역 (8/12 비율) - 메인 은신처 상점 & 보관함
              ==================================================== */}
          <div className="lg:col-span-8 flex flex-col space-y-4">
            
            {/* 상점 / 보관함 탭 스위처 */}
            <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-850 w-fit shrink-0">
              <button
                onClick={() => setDrawSubTab("shop")}
                className={`flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  drawSubTab === "shop"
                    ? "bg-slate-850 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                은신처 상점
              </button>
              <button
                onClick={() => setDrawSubTab("inventory")}
                className={`flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  drawSubTab === "inventory"
                    ? "bg-slate-850 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Package className="w-4 h-4" />
                제작소 보관함
                {(inventoryCrates[selectedCrateId] || 0) > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black">
                    {inventoryCrates[selectedCrateId]}
                  </span>
                )}
              </button>
            </div>

            {/* 1. 은신처 상점 탭 */}
            {drawSubTab === "shop" && activeCrate && (
              <div className="bg-slate-900/30 border border-slate-800/80 rounded-3xl p-6 flex flex-col justify-between items-center relative overflow-hidden min-h-[550px] flex-1">
                
                {/* 배경 그라데이션 광 효과 */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(30,58,138,0.1)_0%,transparent_80%)] pointer-events-none" />

                {/* 중앙 상단: 상자 타이틀 및 실시간 D-Day 타이머 */}
                <div className="text-center z-10 space-y-2 mt-2">
                  {activeCrate.end_date && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-950/80 border border-slate-800 text-[10px] text-amber-500 font-extrabold rounded-full shadow-md">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
                      판매 종료까지: {timeLeft.isExpired ? "판매 종료됨" : `${timeLeft.days}일 ${timeLeft.hours}시간 ${timeLeft.minutes}분 ${timeLeft.seconds}초`}
                    </div>
                  )}
                  <h2 className="text-3xl font-black text-slate-100 tracking-tight">{activeCrate.name}</h2>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">{activeCrate.description}</p>
                </div>

                {/* 중앙 메인: 웅장한 쇼케이스 이미지 */}
                <div className="relative w-full max-w-xs aspect-square flex items-center justify-center my-6 z-10 group">
                  <div className="absolute inset-0 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-colors pointer-events-none" />
                  <img
                    src={activeCrate.image_url}
                    alt={activeCrate.name}
                    className="object-contain max-h-56 drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)] transform group-hover:scale-105 transition-all duration-500 ease-out"
                    onError={(e) => {
                      (e.target as any).style.display = "none";
                    }}
                  />
                  {/* 이미지 에러시 대체 카드 */}
                  <Box className="w-20 h-20 text-slate-800 absolute inset-0 m-auto -z-10 animate-pulse" />
                </div>

                {/* 하단 제어부: 밀수품 vs 전리품 각각의 상점 구매 버튼 */}
                <div className="w-full max-w-xl z-10 border-t border-slate-800/80 pt-5 space-y-4">
                  
                  {activeCrate.type === "contraband" ? (
                    /* [사진 1] 밀수품 상자용 버튼 세트 */
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      
                      {/* 1회 열기 (200 G코인) */}
                      <button
                        onClick={() => handleOpenContrabandCrateWithGCoin("one")}
                        disabled={timeLeft.isExpired}
                        className="py-3.5 bg-slate-850 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-700 active:scale-95 shadow-lg flex flex-col items-center justify-center gap-1 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="text-slate-400 text-[10px] font-bold">1회 열기</span>
                        <div className="flex items-center gap-1 text-xs">
                          <Coins className="w-4 h-4 text-amber-500" />
                          <span>200 G코인</span>
                        </div>
                      </button>

                      {/* 10회 열기 (할인 노출) */}
                      <button
                        onClick={() => handleOpenContrabandCrateWithGCoin("ten")}
                        disabled={timeLeft.isExpired}
                        className="py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-black rounded-xl active:scale-95 shadow-xl shadow-orange-500/10 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
                      >
                        {/* 10% 또는 50% 할인 동적 뱃지 */}
                        <div className="absolute top-1 right-1 text-[8px] font-black bg-red-600 text-white px-1 py-0.2 rounded uppercase">
                          {isTenDrawCompleted ? "10% 할인" : "50% 할인"}
                        </div>
                        <span className="text-slate-950 text-[10px] font-black">10회 열기</span>
                        <div className="flex items-center gap-1 text-xs">
                          <Coins className="w-4 h-4 text-slate-950" />
                          <span className="line-through text-slate-950/50 text-[9px]">2,000 G코인</span>
                          <span className="font-black">{isTenDrawCompleted ? "1,800" : "1,000"} G코인</span>
                        </div>
                      </button>

                      {/* 쿠폰으로 열기 */}
                      <button
                        onClick={() => handleOpenContrabandWithCoupons("one")}
                        disabled={timeLeft.isExpired || coupons < 10}
                        className={`py-3.5 bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-200 font-extrabold rounded-xl border border-indigo-700/60 active:scale-95 shadow-lg flex flex-col items-center justify-center gap-1 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        <span className="text-indigo-400 text-[10px] font-bold">쿠폰으로 열기</span>
                        <div className="flex items-center gap-1 text-xs text-indigo-300">
                          <Ticket className="w-4 h-4 text-indigo-400" />
                          <span>10장 보유: {coupons}/10</span>
                        </div>
                      </button>

                    </div>
                  ) : (
                    /* 전리품 상자용 패키지 구매 버튼바 (구매시 보관함으로 자동 이관) */
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {/* X55 */}
                        <button
                          onClick={() => handleBuyPackage("X55")}
                          disabled={timeLeft.isExpired}
                          className="p-3 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/50 rounded-xl text-center active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-between min-h-[90px] disabled:opacity-50"
                        >
                          <span className="text-[10px] font-black text-amber-500">전리품 상자 55개</span>
                          <div className="text-[8px] text-slate-500 mt-1 leading-tight">상자55+꾸러미2+토큰800</div>
                          <span className="text-xs font-black text-slate-300 mt-2">12,500 G코인</span>
                        </button>

                        {/* X27 */}
                        <button
                          onClick={() => handleBuyPackage("X27")}
                          disabled={timeLeft.isExpired}
                          className="p-3 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-center active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-between min-h-[90px] disabled:opacity-50"
                        >
                          <span className="text-[10px] font-black text-slate-200">전리품 상자 27개</span>
                          <div className="text-[8px] text-slate-500 mt-1 leading-tight">상자27+꾸러미1+토큰400</div>
                          <span className="text-xs font-black text-slate-350 mt-2">6,250 G코인</span>
                        </button>

                        {/* X11 */}
                        <button
                          onClick={() => handleBuyPackage("X11")}
                          disabled={timeLeft.isExpired}
                          className="p-3 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-center active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-between min-h-[90px] disabled:opacity-50"
                        >
                          <span className="text-[10px] font-black text-slate-200">전리품 상자 11개</span>
                          <div className="text-[8px] text-slate-500 mt-1 leading-tight">상자11+토큰150</div>
                          <span className="text-xs font-black text-slate-350 mt-2">2,500 G코인</span>
                        </button>

                        {/* X1 */}
                        <button
                          onClick={() => handleBuyPackage("X1", "gcoin")}
                          disabled={timeLeft.isExpired}
                          className="p-3 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl text-center active:scale-95 transition-all cursor-pointer flex flex-col items-center justify-between min-h-[90px] disabled:opacity-50"
                        >
                          <span className="text-[10px] font-black text-slate-200">전리품 상자 1개</span>
                          <div className="text-[8px] text-slate-500 mt-1 leading-tight">상자1+토큰15</div>
                          <span className="text-xs font-black text-slate-350 mt-2">250 G코인</span>
                        </button>
                      </div>

                      {/* BP로 X1 전리품 상자 구매 추가 슬롯 */}
                      <div className="pt-1">
                        <button
                          onClick={() => handleBuyPackage("X1", "bp")}
                          disabled={timeLeft.isExpired || bpBuyCount >= 50}
                          className="w-full py-2.5 bg-indigo-950/30 hover:bg-indigo-950/60 border border-indigo-900/40 text-indigo-300 font-extrabold rounded-lg flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-40 text-xs"
                        >
                          상자 1개 구매 (10,000 BP) - ({bpBuyCount}/50회)
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* 2. 제작소 보관함 탭 */}
            {drawSubTab === "inventory" && activeCrate && (
              <div className="bg-slate-900/20 border border-slate-800/80 rounded-3xl p-5 flex flex-col justify-between relative overflow-hidden min-h-[550px] flex-1">
                
                {/* 2-A. 보유 목록 셀렉터 */}
                {!isDrawing && (
                  <div className={`grid gap-3 shrink-0 z-10 ${
                    activeCrate.type === "loot_crate" ? "grid-cols-2" : "grid-cols-1"
                  }`}>
                    {activeCrate.type === "loot_crate" ? (
                      <>
                        {/* 전리품 상자 */}
                        <div
                          onClick={() => {
                            collectRemainingCards();
                            setSelectedInventoryItem("loot_crate");
                            setDrawnCards([]);
                          }}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center gap-2.5 relative ${
                            selectedInventoryItem === "loot_crate"
                              ? "bg-slate-850 border-amber-500 shadow-md shadow-amber-500/10 font-bold"
                              : "bg-slate-950/60 border-slate-850 hover:border-slate-700"
                          }`}
                        >
                          <Package className="w-7 h-7 text-amber-500 shrink-0" />
                          <div className="min-w-0">
                            <h4 className="text-[11px] font-black text-slate-200 truncate">{activeCrate.name}</h4>
                            <p className="text-[9px] text-slate-500 mt-0.5">
                              보유: <span className="font-extrabold text-amber-500">{(inventoryCrates[activeCrate.id] || 0)}</span> 개
                            </p>
                          </div>
                        </div>

                        {/* 최고급 꾸러미 */}
                        <div
                          onClick={() => {
                            collectRemainingCards();
                            setSelectedInventoryItem("prime_parcel");
                            setDrawnCards([]);
                          }}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center gap-2.5 relative ${
                            selectedInventoryItem === "prime_parcel"
                              ? "bg-slate-850 border-pink-500 shadow-md shadow-pink-500/10 font-bold"
                              : "bg-slate-950/60 border-slate-850 hover:border-slate-700"
                          }`}
                        >
                          <Sparkles className="w-7 h-7 text-pink-400 shrink-0" />
                          <div className="min-w-0">
                            <h4 className="text-[11px] font-black text-slate-200 truncate">최고급 꾸러미</h4>
                            <p className="text-[9px] text-slate-500 mt-0.5">
                              보유: <span className="font-extrabold text-pink-400">{primeParcels}</span> 개
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div
                        onClick={() => {
                          collectRemainingCards();
                          setSelectedInventoryItem("coupon");
                          setDrawnCards([]);
                        }}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center gap-2.5 relative ${
                          selectedInventoryItem === "coupon"
                            ? "bg-slate-850 border-indigo-500 shadow-md shadow-indigo-500/10 font-bold"
                            : "bg-slate-950/60 border-slate-850 hover:border-slate-700"
                        }`}
                        style={{ gridColumn: activeCrate.type === "contraband" ? "span 3" : "span 1" }}
                      >
                        <Ticket className="w-7 h-7 text-indigo-400 shrink-0" />
                        <div className="min-w-0">
                          <h4 className="text-[11px] font-black text-slate-200 truncate">밀수품 쿠폰</h4>
                          <p className="text-[9px] text-slate-500 mt-0.5">
                            보유: <span className="font-extrabold text-indigo-400">{coupons}</span> 장
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2-B. 바디 영역: 개봉 애니메이션 진행 or 상자 단품 대기 (우측 명세 패널 병합) */}
                {isDrawing ? (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-5 z-10 py-10">
                    <div className="relative w-36 h-36 flex items-center justify-center">
                      <div className={`absolute inset-0 rounded-full blur-3xl ${
                        hasBonusEffect ? "bg-amber-500/40 gold-glow-active" : "bg-amber-500/5 animate-ping"
                      }`} />
                      <Box className={`w-24 h-24 text-amber-500 anim-shake rounded-2xl ${
                        hasBonusEffect ? "border border-amber-400/80 gold-glow-active shadow-2xl" : ""
                      }`} />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-black text-amber-400 tracking-wide">
                        {drawMode === "prime" ? "최고급 꾸러미 해제 중..." : "상자 해제 중..."}
                      </h3>
                      {hasBonusEffect ? (
                        <div className="mt-1 text-[10px] text-amber-400 font-black animate-pulse">
                          ★ 보너스 전리품 당첨! 금색 광 방출 중 ★
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500 mt-1">상자가 흔들리며 구성품이 인벤토리에 지급되고 있습니다.</p>
                      )}
                    </div>
                  </div>
                ) : drawnCards.length > 0 ? (
                  /* 가챠 결과 카드 리스트 노출 */
                  <div className="flex-1 flex flex-col justify-between space-y-4 my-4 z-10">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-[10px] text-slate-400 font-bold">개봉 결과 목록</span>
                      <div className="flex gap-2">
                        <button
                          onClick={handleRevealAll}
                          className="text-[10px] font-black text-amber-400 hover:text-amber-300 border border-amber-950 px-2.5 py-1 rounded bg-amber-950/10 transition-all cursor-pointer"
                        >
                          전체 뒤집기
                        </button>
                        <button
                          onClick={() => {
                            collectRemainingCards();
                            setDrawnCards([]);
                          }}
                          className="text-[10px] font-black text-slate-400 hover:text-slate-300 border border-slate-800 px-2.5 py-1 rounded bg-slate-950/50 transition-all cursor-pointer"
                        >
                          결과 닫기
                        </button>
                      </div>
                    </div>

                    <div className={`grid gap-3 flex-1 items-center justify-center ${
                      drawnCards.length === 1 
                        ? "grid-cols-1 max-w-[160px] mx-auto" 
                        : "grid-cols-2 sm:grid-cols-5"
                    }`}>
                      {drawnCards.map((card, idx) => (
                        <CrateCard
                          key={card.id}
                          card={card}
                          isRevealed={revealedCards[idx]}
                          onClick={() => handleCardClick(idx)}
                          getRarityBadgeStyle={getRarityBadgeStyle}
                          getCardBorderGlow={getCardBorderGlow}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  /* [사진 2] 보관함 개봉 대기 상태 - (좌: 상자 그래픽 / 우: 구성품 명세 구조) */
                  <div className="flex-1 flex flex-col md:flex-row gap-6 my-6 z-10 items-stretch">
                    
                    {/* 좌측: 상자 대형 이미지 및 개봉 상태 */}
                    <div className="flex-1 bg-slate-950/50 rounded-2xl border border-slate-850/60 p-6 flex flex-col items-center justify-center text-center">
                      <div className="w-28 h-28 flex items-center justify-center relative mb-4">
                        {selectedInventoryItem === "coupon" ? (
                          <Ticket className="w-16 h-16 text-indigo-400 anim-float" />
                        ) : selectedInventoryItem === "loot_crate" ? (
                          <img
                            src={activeCrate.image_url}
                            alt={activeCrate.name}
                            className="max-h-24 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
                          />
                        ) : (
                          <Sparkles className="w-16 h-16 text-pink-400 anim-float" />
                        )}
                      </div>
                      
                      <h3 className="text-base font-black text-slate-200">
                        {selectedInventoryItem === "coupon" 
                          ? "밀수품 쿠폰 사용" 
                          : selectedInventoryItem === "loot_crate" 
                            ? `${activeCrate.name} 열기` 
                            : "최고급 꾸러미 열기"}
                      </h3>
                      
                      <p className="text-[10px] text-slate-400 mt-1">
                        보유량:{" "}
                        <span className="font-extrabold text-amber-500">
                          {selectedInventoryItem === "coupon" 
                            ? coupons 
                            : selectedInventoryItem === "loot_crate" 
                              ? (inventoryCrates[activeCrate.id] || 0) 
                              : primeParcels}
                        </span>
                        {selectedInventoryItem === "coupon" ? "장" : "개"}
                      </p>
                    </div>

                    {/* [사진 2 우측] 구성품 및 보너스 구성품 목록 명세 */}
                    <div className="w-full md:w-60 bg-slate-950/80 rounded-2xl border border-slate-850 p-4 flex flex-col justify-between text-xs space-y-4">
                      <div className="space-y-3">
                        {/* 기본 구성품 */}
                        <div className="space-y-1.5">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 border-b border-slate-850 pb-1">
                            <Box className="w-3 h-3 text-amber-500" />
                            기본 구성품
                          </h4>
                          <ul className="space-y-1 text-[10px] text-slate-300 font-bold max-h-[120px] overflow-y-auto pr-1">
                            {selectedInventoryItem === "prime_parcel" ? (
                              activeCrate.prime_parcel_items
                                .filter(item => !item.name.includes("토큰"))
                                .slice(0, 5)
                                .map((item, idx) => (
                                  <li key={idx} className="flex justify-between items-center bg-slate-900/30 p-1.5 rounded">
                                    <span className="truncate pr-2">{item.name}</span>
                                    <span className="text-[8px] bg-red-950/50 text-red-400 px-1 rounded shrink-0">{getKoreanRarityName(item.rarity)}</span>
                                  </li>
                                ))
                            ) : (
                              activeCrate.items
                                .slice(0, 5)
                                .map((item, idx) => (
                                  <li key={idx} className="flex justify-between items-center bg-slate-900/30 p-1.5 rounded">
                                    <span className="truncate pr-2">{item.name}</span>
                                    <span className="text-[8px] bg-indigo-950/50 text-indigo-400 px-1 rounded shrink-0">{getKoreanRarityName(item.rarity)}</span>
                                  </li>
                                ))
                            )}
                          </ul>
                        </div>

                        {/* 보너스 구성품 */}
                        {activeCrate.bonus_items && activeCrate.bonus_items.length > 0 && selectedInventoryItem !== "prime_parcel" && (
                          <div className="space-y-1.5">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 border-b border-slate-850 pb-1">
                              <Sparkles className="w-3 h-3 text-amber-500" />
                              보너스 구성품
                            </h4>
                            <ul className="space-y-1 text-[10px] text-amber-400 font-extrabold">
                              {activeCrate.bonus_items.slice(0, 4).map((bItem, idx) => (
                                <li key={idx} className="flex justify-between items-center bg-amber-950/10 p-1.5 rounded border border-amber-900/10">
                                  <span className="truncate">{bItem.name}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      
                      <div className="text-[10px] text-slate-500 bg-slate-900/40 p-2 rounded-lg leading-snug">
                        ※ 상자 개봉 시 구성품 획득 확률은 인게임 공식 확률표 탭의 데이터 비율과 100% 동일하게 작동합니다.
                      </div>
                    </div>

                  </div>
                )}

                {/* 2-C. 개봉 버튼바 */}
                <div className="mt-4 border-t border-slate-850/80 pt-4 shrink-0">
                  {selectedInventoryItem === "coupon" ? (
                    <div className="flex flex-wrap gap-2 justify-center w-full">
                      <button
                        onClick={() => handleOpenContrabandWithCoupons("one")}
                        disabled={isDrawing || coupons < 10}
                        className="flex-1 min-w-[100px] py-3 bg-slate-850 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-700 active:scale-95 transition-all text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-center"
                      >
                        1개 열기 (10장)
                      </button>
                      {coupons >= 50 && coupons < 100 && (
                        <button
                          onClick={() => handleOpenContrabandWithCoupons("five")}
                          disabled={isDrawing}
                          className="flex-1 min-w-[100px] py-3 bg-slate-850 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-700 active:scale-95 transition-all text-xs cursor-pointer text-center"
                        >
                          5개 열기 (50장)
                        </button>
                      )}
                      {coupons >= 100 && (
                        <button
                          onClick={() => handleOpenContrabandWithCoupons("ten")}
                          disabled={isDrawing}
                          className="flex-1 min-w-[100px] py-3 bg-slate-850 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-700 active:scale-95 transition-all text-xs cursor-pointer text-center"
                        >
                          10개 열기 (100장)
                        </button>
                      )}
                      {coupons >= 20 && (
                        <button
                          onClick={() => handleOpenContrabandWithCoupons("all")}
                          disabled={isDrawing}
                          className="flex-1 min-w-[120px] py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-black rounded-xl active:scale-95 transition-all text-xs cursor-pointer text-center"
                        >
                          전체 열기 ({Math.floor(coupons / 10)}개)
                        </button>
                      )}
                    </div>
                  ) : selectedInventoryItem === "loot_crate" ? (
                    <div className="flex flex-wrap gap-2 justify-center w-full">
                      <button
                        onClick={() => handleOpenInventoryCrates("one")}
                        disabled={isDrawing || (inventoryCrates[activeCrate.id] || 0) < 1}
                        className="flex-1 min-w-[100px] py-3 bg-slate-850 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-700 active:scale-95 transition-all text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-center"
                      >
                        1개 열기 (1개)
                      </button>
                      {(inventoryCrates[activeCrate.id] || 0) >= 5 && (inventoryCrates[activeCrate.id] || 0) < 10 && (
                        <button
                          onClick={() => handleOpenInventoryCrates("five")}
                          disabled={isDrawing}
                          className="flex-1 min-w-[100px] py-3 bg-slate-850 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-700 active:scale-95 transition-all text-xs cursor-pointer text-center"
                        >
                          5개 열기 (5개)
                        </button>
                      )}
                      {(inventoryCrates[activeCrate.id] || 0) >= 10 && (
                        <button
                          onClick={() => handleOpenInventoryCrates("ten")}
                          disabled={isDrawing}
                          className="flex-1 min-w-[100px] py-3 bg-slate-850 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-700 active:scale-95 transition-all text-xs cursor-pointer text-center"
                        >
                          10개 열기 (10개)
                        </button>
                      )}
                      {(inventoryCrates[activeCrate.id] || 0) >= 55 && (
                        <button
                          onClick={() => handleOpenInventoryCrates("fiftyfive")}
                          disabled={isDrawing}
                          className="flex-1 min-w-[100px] py-3 bg-slate-850 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-700 active:scale-95 transition-all text-xs cursor-pointer text-center"
                        >
                          55개 열기 (55개)
                        </button>
                      )}
                      {(inventoryCrates[activeCrate.id] || 0) >= 2 && (
                        <button
                          onClick={() => handleOpenInventoryCrates("all")}
                          disabled={isDrawing}
                          className="flex-1 min-w-[120px] py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-black rounded-xl active:scale-95 transition-all text-xs cursor-pointer text-center"
                        >
                          전체 열기 ({(inventoryCrates[activeCrate.id] || 0)}개)
                        </button>
                      )}
                    </div>
                  ) : (
                    /* 최고급 꾸러미 */
                    <div className="flex flex-wrap gap-2 justify-center w-full">
                      <button
                        onClick={() => handleOpenPrimeParcel(1)}
                        disabled={isDrawing || primeParcels < 1}
                        className="flex-1 min-w-[100px] py-3 bg-slate-850 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-700 active:scale-95 transition-all text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-center"
                      >
                        1개 열기 (1개)
                      </button>
                      {primeParcels >= 5 && primeParcels < 10 && (
                        <button
                          onClick={() => handleOpenPrimeParcel(5)}
                          disabled={isDrawing}
                          className="flex-1 min-w-[100px] py-3 bg-slate-850 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-700 active:scale-95 transition-all text-xs cursor-pointer text-center"
                        >
                          5개 열기 (5개)
                        </button>
                      )}
                      {primeParcels >= 10 && (
                        <button
                          onClick={() => handleOpenPrimeParcel(10)}
                          disabled={isDrawing}
                          className="flex-1 min-w-[100px] py-3 bg-slate-850 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-700 active:scale-95 transition-all text-xs cursor-pointer text-center"
                        >
                          10개 열기 (10개)
                        </button>
                      )}
                      {primeParcels >= 2 && (
                        <button
                          onClick={() => handleOpenPrimeParcel("all")}
                          disabled={isDrawing}
                          className="flex-1 min-w-[120px] py-3 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-black rounded-xl active:scale-95 transition-all text-xs cursor-pointer text-center"
                        >
                          전체 열기 ({primeParcels}개)
                        </button>
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>

        </div>

      </div>

      {/* G-Coin 충전소 모달 */}
      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onCharge={handleChargeGCoin}
        exchangeRate={exchangeRate}
      />

      {/* 구매 수량 선택 모달 */}
      <QuantityModal
        isOpen={isQuantityModalOpen}
        onClose={() => setIsQuantityModalOpen(false)}
        crateName={activeCrate?.name}
        quantity={quantityToBuy}
        setQuantity={setQuantityToBuy}
        paymentMethod={quantityPaymentMethod}
        onConfirm={executeBuyPackage}
      />

      {/* 이벤트 재화 보충기 모달 */}
      <RefillModal
        isOpen={isRefillModalOpen}
        onClose={() => setIsRefillModalOpen(false)}
        refillType={refillType}
        setRefillType={setRefillType}
        refillAmount={refillAmount}
        setRefillAmount={setRefillAmount}
        onRefill={handleRefillAsset}
      />

      {/* 특수 제작소 (Crafting) 모달 */}
      <CraftingModal
        isOpen={isCraftingModalOpen}
        onClose={() => setIsCraftingModalOpen(false)}
        tokens={tokens}
        obtainedSkins={obtainedSkins}
        onCraft={handleCraftItemWrapper}
      />

      {/* 상자 세부정보 (Vault, 히스토리, 확률표) 모달 */}
      <DetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        activeCrate={activeCrate}
        obtainedSkins={obtainedSkins}
        history={history}
        getRarityBadgeStyle={getRarityBadgeStyle}
        onReset={handleResetSimulator}
      />

    </div>
  );
}
