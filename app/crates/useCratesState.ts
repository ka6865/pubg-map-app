import { useState, useEffect, useRef } from "react";
import type { CrateTemplate } from "@/types/crates";
import { drawSingleItem, drawSinglePrimeItem, tryDrawBonusItem } from "../../lib/crateUtils";
import { DrawnCard, HistoryItem } from "./types";
import { trackEvent } from "../../lib/analytics";
import { toast } from "sonner";

interface UseCratesStateProps {
  initialCrates: CrateTemplate[];
  selectedCrateId: string;
}

export function useCratesState({ initialCrates, selectedCrateId }: UseCratesStateProps) {
  // activeCrate 템플릿 탐색
  const activeCrate = initialCrates.find((c) => c.id === selectedCrateId);

  // 지연 정산 타이머 레퍼런스
  const activeTimersRef = useRef<{ id: number; timer: NodeJS.Timeout; action: () => void }[]>([]);
  const timerCounterRef = useRef<number>(0);

  // 진행 중인 모든 지연 자산 정산 타이머 즉시 실행 및 클리어
  const flushActiveTimers = () => {
    if (activeTimersRef.current.length > 0) {
      activeTimersRef.current.forEach((t) => {
        clearTimeout(t.timer);
        t.action();
      });
      activeTimersRef.current = [];
    }
  };

  // 아직 안 뒤집힌 카드나 타이머 대기 중인 카드가 남아있는지 체크
  const hasPendingOrUnrevealedCards = (): boolean => {
    if (activeTimersRef.current.length > 0) return true;
    const hasUnrevealed = revealedCards.some((rev) => !rev);
    return hasUnrevealed && drawnCards.length > 0;
  };

  // 단일 카드 보상 자산 상태 반영 헬퍼 함수
  const applyCardReward = (card: DrawnCard) => {
    if (!activeCrate) return;

    let extraCrates = 0;
    let extraTokens = 0;
    let extraPrimes = 0;
    const skinsToObtain: Record<string, number> = {};
    const newHistory: HistoryItem[] = [];
    let ultimate = 0;
    let legendary = 0;
    let epic = 0;
    let rare = 0;
    let special = 0;
    let common = 0;

    // 1. 기본 카드 정산
    if (card.isFromPrimeParcel) {
      if (card.name.includes("토큰")) {
        const tokenMatch = card.name.match(/x(\d+)/);
        const tokenAmount = tokenMatch ? parseInt(tokenMatch[1], 10) : 0;
        extraTokens += tokenAmount;
      } else {
        skinsToObtain[card.name] = 1;
      }
    } else {
      if (card.is_prime_parcel) {
        extraPrimes += 1;
      } else if (card.token_count && card.token_count > 0) {
        extraTokens += card.token_count;
      } else {
        skinsToObtain[card.name] = 1;
      }
    }

    if (card.rarity === "ULTIMATE") ultimate += 1;
    else if (card.rarity === "LEGENDARY") legendary += 1;
    else if (card.rarity === "EPIC") epic += 1;
    else if (card.rarity === "RARE") rare += 1;
    else if (card.rarity === "SPECIAL") special += 1;
    else if (card.rarity === "COMMON") common += 1;

    newHistory.push({
      id: card.id,
      name: card.name,
      rarity: card.rarity,
      image_url: card.image_url,
      isFromPrimeParcel: card.isFromPrimeParcel,
      isBonus: false,
      timestamp: new Date(),
    });

    // 2. 보너스 카드 정산
    if (card.bonus) {
      const bonus = card.bonus;
      if (bonus.is_extra_crate) extraCrates += 1;
      if (bonus.token_count > 0) extraTokens += bonus.token_count;
      if (bonus.is_prime_parcel) extraPrimes += 1;

      if (bonus.rarity === "ULTIMATE") ultimate += 1;
      else if (bonus.rarity === "LEGENDARY") legendary += 1;
      else if (bonus.rarity === "EPIC") epic += 1;
      else if (bonus.rarity === "RARE") rare += 1;
      else if (bonus.rarity === "SPECIAL") special += 1;
      else if (bonus.rarity === "COMMON") common += 1;

      newHistory.push({
        id: bonus.id,
        name: bonus.name,
        rarity: bonus.rarity,
        image_url: bonus.image_url,
        isFromPrimeParcel: false,
        isBonus: true,
        timestamp: new Date(),
      });
    }

    // 상태 업데이트 적용
    if (Object.keys(skinsToObtain).length > 0) {
      setObtainedSkins((prev) => {
        const next = { ...prev };
        Object.entries(skinsToObtain).forEach(([name, count]) => {
          next[name] = (next[name] || 0) + count;
        });
        return next;
      });
    }

    if (extraCrates > 0) {
      setInventoryCrates((prev) => ({
        ...prev,
        [activeCrate.id]: (prev[activeCrate.id] || 0) + extraCrates
      }));
    }
    if (extraTokens > 0) setTokens((prev) => prev + extraTokens);
    if (extraPrimes > 0) setPrimeParcels((prev) => prev + extraPrimes);
    
    setHistory((prev) => [...newHistory, ...prev]);

    setStats((prev) => ({
      ...prev,
      ultimateCount: prev.ultimateCount + ultimate,
      legendaryCount: prev.legendaryCount + legendary,
      epicCount: prev.epicCount + epic,
      rareCount: prev.rareCount + rare,
      specialCount: prev.specialCount + special,
      commonCount: prev.commonCount + common,
    }));
  };

  // 가상 재화 상태 (기본 제공: 100만 BP, 0 G-Coin)
  const [bp, setBp] = useState<number>(1000000);
  const [gcoin, setGcoin] = useState<number>(0);
  
  // 밀수품 쿠폰 보유 및 주간 구매 제한 상태
  const [coupons, setCoupons] = useState<number>(0);
  const [couponWeeklyBuyCount, setCouponWeeklyBuyCount] = useState<number>(0);
  const [contrabandTenDrawCompleted, setContrabandTenDrawCompleted] = useState<Record<string, boolean>>({});

  // 인벤토리 보유 상태 (각 상자 템플릿별 보유 수량)
  const [inventoryCrates, setInventoryCrates] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    initialCrates.forEach((c) => {
      initial[c.id] = 0;
    });
    return initial;
  });
  
  // 공용 획득 재화 상태
  const [primeParcels, setPrimeParcels] = useState<number>(0);
  const [tokens, setTokens] = useState<number>(0);
  
  // 소모 및 결제 지표 트래킹
  const [spentUsd, setSpentUsd] = useState<number>(0);
  const [spentGcoin, setSpentGcoin] = useState<number>(0);
  const [spentBp, setSpentBp] = useState<number>(0);
  const [chargeCount, setChargeCount] = useState<number>(0);

  // 충전 모달 제어 상태
  const [isChargeModalOpen, setIsChargeModalOpen] = useState<boolean>(false);

  // 단품 구매 수량 선택 모달 상태
  const [isQuantityModalOpen, setIsQuantityModalOpen] = useState<boolean>(false);
  const [quantityToBuy, setQuantityToBuy] = useState<number>(1);
  const [quantityPaymentMethod, setQuantityPaymentMethod] = useState<"gcoin" | "bp">("gcoin");

  // BP 구매 평생 한도 (50회 제한)
  const [bpBuyCount, setBpBuyCount] = useState<number>(0);

  // 이벤트 재화 보충기 모달 상태
  const [isRefillModalOpen, setIsRefillModalOpen] = useState<boolean>(false);
  const [refillType, setRefillType] = useState<"gcoin" | "bp" | "coupon" | "crate">("gcoin");
  const [refillAmount, setRefillAmount] = useState<number>(10000);

  // 시뮬레이터 초기화 모달 상태
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);

  // 가챠 연출 상태
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [hasBonusEffect, setHasBonusEffect] = useState<boolean>(false);
  const [drawMode, setDrawMode] = useState<"standard" | "prime">("standard");
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [revealedCards, setRevealedCards] = useState<boolean[]>([]);

  // 최종 획득 스킨 컬렉션 상태
  const [obtainedSkins, setObtainedSkins] = useState<Record<string, number>>({
    '"CVO™ Road Glide® ST (리미티드)" 모터사이클 도안': 0,
    '"CVO™ Road Glide® ST" 모터사이클 도안': 0,
    "CVO™ ROAD GLIDE® ST (리미티드) 풀 세트 (골든 네이비 & 샴페인 골드) 도안": 0,
    "CVO™ ROAD GLIDE® ST (리미티드) 세트 (미드나잇 블레이즈 & 폴리시드 크롬) 도안": 0,
    "CVO™ ROAD GLIDE® ST (리미티드) 세트 (브론즈 플레임 & 액센티드 브론즈) 도안": 0,
    "CVO™ ROAD GLIDE® ST (리미티드) SET (볼드 아이보리 & 액센티드 글로스 BLACK) 도안": 0,
    "CVO™ ROAD GLIDE® ST 세트 (매트 나이트셰이드 & 알루미늄) 도안": 0,
    "CVO™ Road Glide® ST (리미티드) 페인트 (샴페인 골드) 도안": 0,
    "CVO™ Road Glide® ST 페인트 (팬텀 포레스트) 도안": 0,
    "CVO™ Road Glide® ST 페인트 (터콰이즈 타이드) 도안": 0,
    "CVO™ Road Glide® ST 페인트 (골든 화이트 펄) 도안": 0,
    "CVO™ Road Glide® ST 페인트 (일렉트릭 코스트) 도안": 0,
    "할리데이비슨® 블랙탑 바이커 세트 도안": 0,
    "할리데이비슨® 스트리트 스마트 세트 도안": 0,
    "할리데이비슨® 낙하산 도안": 0,
    "할리데이비슨® - 클로즈 업 도안": 0,
    "할리데이비슨™ - 달리기 위해 살고, 살기 위해 달린다 도안": 0,
    "할리데이비슨® 엔진 배지 도안": 0,
    "라이드 오어 다이 - M249": 0,
    "라이드 오어 다이 - M249 (블랙 틸)": 0,
    "도면 (Schematic)": 0,
    "폴리머 (Polymer) x100": 0,
    "러프 라이드 - S12K": 0,
    "다이너스티 - Kar98k": 0,
    "러프 라이드 - 베릴 M762 & 토미 건": 0,
    "일반 클래식 스킨군": 0,
    "코스믹 칼리버 - Kar98k": 0,
    "코스믹 칼리버 - Kar98k (화이트 옐로우)": 0,
    "행성 경비대 - SCAR-L": 0,
    "스팀 게이지 - Kar98k": 0,
    "행성 경비대 - M249 & 뮤턴트": 0,
    "노란색 연막탄": 0,
    "분홍색 연막탄": 0,
    "골드 리프 - M416": 0,
    "골든 서킷 - 미니14": 0,
    "골든 서킷 - 마이크로 UZI": 0,
  });

  // 가상 뽑기 히스토리
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState({
    totalOpens: 0,
    primeParcelOpens: 0,
    ultimateCount: 0,
    legendaryCount: 0,
    epicCount: 0,
    rareCount: 0,
    specialCount: 0,
    commonCount: 0,
  });

  // 아직 뒤집히지 않은 이전 카드의 자산, 컬렉션, 히스토리, 통계를 일괄 정산하는 헬퍼 함수 (지연 정산 지원)
  const collectRemainingCards = (delayMs?: number) => {
    // 1. 지연 대기 중인 모든 타이머 자산 강제 즉시 실행
    flushActiveTimers();

    // 2. 뒤집히지 않은 카드 정산
    if (drawnCards.length === 0) return;

    let extraCrates = 0;
    let extraTokens = 0;
    let extraPrimes = 0;
    const newHistory: HistoryItem[] = [];
    const skinsToObtain: Record<string, number> = {};
    let ultimate = 0;
    let legendary = 0;
    let epic = 0;
    let rare = 0;
    let special = 0;
    let common = 0;

    drawnCards.forEach((card, idx) => {
      if (!revealedCards[idx]) {
        // 1. 기본 카드 정산
        if (card.isFromPrimeParcel) {
          if (card.name.includes("토큰")) {
            const tokenMatch = card.name.match(/x(\d+)/);
            const tokenAmount = tokenMatch ? parseInt(tokenMatch[1], 10) : 0;
            extraTokens += tokenAmount;
          } else {
            skinsToObtain[card.name] = (skinsToObtain[card.name] || 0) + 1;
          }
        } else {
          if (card.is_prime_parcel) {
            extraPrimes += 1;
          } else if (card.token_count && card.token_count > 0) {
            extraTokens += card.token_count;
          } else {
            skinsToObtain[card.name] = (skinsToObtain[card.name] || 0) + 1;
          }
        }

        if (card.rarity === "ULTIMATE") ultimate += 1;
        else if (card.rarity === "LEGENDARY") legendary += 1;
        else if (card.rarity === "EPIC") epic += 1;
        else if (card.rarity === "RARE") rare += 1;
        else if (card.rarity === "SPECIAL") special += 1;
        else if (card.rarity === "COMMON") common += 1;

        newHistory.push({
          id: card.id,
          name: card.name,
          rarity: card.rarity,
          image_url: card.image_url,
          isFromPrimeParcel: card.isFromPrimeParcel,
          isBonus: false,
          timestamp: new Date(),
        });

        // 2. 보너스 카드 정산
        if (card.bonus) {
          if (card.bonus.is_extra_crate) extraCrates += 1;
          if (card.bonus.token_count > 0) extraTokens += card.bonus.token_count;
          if (card.bonus.is_prime_parcel) extraPrimes += 1;

          if (card.bonus.rarity === "ULTIMATE") ultimate += 1;
          else if (card.bonus.rarity === "LEGENDARY") legendary += 1;
          else if (card.bonus.rarity === "EPIC") epic += 1;
          else if (card.bonus.rarity === "RARE") rare += 1;
          else if (card.bonus.rarity === "SPECIAL") special += 1;
          else if (card.bonus.rarity === "COMMON") common += 1;

          newHistory.push({
            id: card.bonus.id,
            name: card.bonus.name,
            rarity: card.bonus.rarity,
            image_url: card.bonus.image_url,
            isFromPrimeParcel: false,
            isBonus: true,
            timestamp: new Date(),
          });
        }
      }
    });

    const runAssetUpdate = () => {
      if (Object.keys(skinsToObtain).length > 0) {
        setObtainedSkins((prev) => {
          const next = { ...prev };
          Object.entries(skinsToObtain).forEach(([name, count]) => {
            next[name] = (next[name] || 0) + count;
          });
          return next;
        });
      }

      if (activeCrate && extraCrates > 0) {
        setInventoryCrates((prev) => ({
          ...prev,
          [activeCrate.id]: (prev[activeCrate.id] || 0) + extraCrates
        }));
      }
      if (extraTokens > 0) setTokens((prev) => prev + extraTokens);
      if (extraPrimes > 0) setPrimeParcels((prev) => prev + extraPrimes);

      if (newHistory.length > 0) {
        setHistory((prev) => [...newHistory, ...prev]);
      }

      if (ultimate > 0 || legendary > 0 || epic > 0 || rare > 0 || special > 0 || common > 0) {
        setStats((prev) => ({
          ...prev,
          ultimateCount: prev.ultimateCount + ultimate,
          legendaryCount: prev.legendaryCount + legendary,
          epicCount: prev.epicCount + epic,
          rareCount: prev.rareCount + rare,
          specialCount: prev.specialCount + special,
          commonCount: prev.commonCount + common,
        }));
      }
    };

    // 일괄 정산했으므로 카드 상태는 즉시 revealed 상태로 전환
    setRevealedCards(new Array(drawnCards.length).fill(true));

    if (delayMs && delayMs > 0) {
      timerCounterRef.current += 1;
      const timerId = timerCounterRef.current;
      const timer = setTimeout(() => {
        runAssetUpdate();
        activeTimersRef.current = activeTimersRef.current.filter((t) => t.id !== timerId);
      }, delayMs);

      activeTimersRef.current.push({
        id: timerId,
        timer,
        action: runAssetUpdate,
      });
    } else {
      runAssetUpdate();
    }
  };

  // G-Coin 패키지 가상 결제 (다중 금액대 충전 지원)
  const handleChargeGCoin = (amount: number, price: number) => {
    setGcoin((prev) => prev + amount);
    setSpentUsd((prev) => prev + price);
    setChargeCount((prev) => prev + 1);
    setIsChargeModalOpen(false); // 충전 완료 후 자동으로 모달을 닫음
  };

  // 상점에서 상자 팩 패키지 구매 (1개짜리 팩은 수량 선택 팝업 노출)
  const handleBuyPackage = (packType: "X55" | "X27" | "X11" | "X1", paymentMethod: "gcoin" | "bp" = "gcoin") => {
    if (!activeCrate) return;

    if (packType === "X1") {
      setQuantityToBuy(1);
      setQuantityPaymentMethod(paymentMethod);
      setIsQuantityModalOpen(true);
      return;
    }

    // 대형 팩은 기존처럼 즉시 구매 처리
    executeBuyPackage(packType, 1, paymentMethod);
  };

  // UI 탭 제어 관련 콜백을 위한 상태 주입 레퍼런스
  const [drawSubTab, setDrawSubTab] = useState<"shop" | "inventory">("shop");
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<"loot_crate" | "prime_parcel" | "coupon">("loot_crate");

  // selectedCrateId가 변경될 때 보관함 선택 상태 동기화 및 개봉 상태 초기화
  useEffect(() => {
    setDrawnCards([]);
    setIsDrawing(false);
    if (activeCrate) {
      if (activeCrate.type === "loot_crate") {
        setSelectedInventoryItem("loot_crate");
      } else {
        setSelectedInventoryItem("coupon");
      }
    }
  }, [selectedCrateId]);

  // 실제 결제 및 상품 지급 처리 엔진
  const executeBuyPackage = (packType: "X55" | "X27" | "X11" | "X1", quantity: number, paymentMethod: "gcoin" | "bp") => {
    if (!activeCrate) return;

    let price = 0;
    let crateReward = 0;
    let parcelReward = 0;
    let tokenReward = 0;

    if (packType === "X55") {
      price = 12500;
      crateReward = 55;
      parcelReward = 0;
      tokenReward = 800;
    } else if (packType === "X27") {
      price = 6250;
      crateReward = 27;
      parcelReward = 0;
      tokenReward = 400;
    } else if (packType === "X11") {
      price = 2500;
      crateReward = 11;
      parcelReward = 0;
      tokenReward = 150;
    } else if (packType === "X1") {
      if (paymentMethod === "bp") {
        price = 10000 * quantity;
      } else {
        price = 250 * quantity;
      }
      crateReward = 1 * quantity;
      parcelReward = 0;
      tokenReward = 15 * quantity;
    }

    // 결제 유효성 검사
    if (paymentMethod === "bp") {
      if (bp < price) {
        toast.error("보유 가상 BP가 부족합니다. 미션 수행 등으로 추가 BP를 확보하세요.");
        return;
      }
      if (bpBuyCount + quantity > 50) {
        toast.warning(`BP를 통한 X1 팩 구매 평생 한도(50회)를 초과할 수 없습니다. (현재 구매 횟수: ${bpBuyCount}/50회)`);
        return;
      }
      setBp((prev) => prev - price);
      setSpentBp((prev) => prev + price);
      setBpBuyCount((prev) => prev + quantity);
    } else {
      if (gcoin < price) {
        toast.error("보유 가상 G-Coin이 부족합니다. 상단의 충전 버튼을 이용해주세요.");
        return;
      }
      setGcoin((prev) => prev - price);
      setSpentGcoin((prev) => prev + price);
    }

    // 수량 선택 모달 닫기
    setIsQuantityModalOpen(false);

    // 인벤토리에 보상 추가 및 개봉 로직 분기
    if (activeCrate.type === "loot_crate") {
      // 전리품 상자: 바로 개봉하지 않고 보관함으로 상자/꾸러미/토큰을 적립
      setInventoryCrates((prev) => ({
        ...prev,
        [activeCrate.id]: (prev[activeCrate.id] || 0) + crateReward,
      }));
      setPrimeParcels((prev) => prev + parcelReward);
      setTokens((prev) => prev + tokenReward);

      toast.success(
        `구매가 완료되었습니다! ${activeCrate.name} ${crateReward}개, 토큰 ${tokenReward}개가 내 보관함에 추가되었습니다.`
      );

      // 개봉 화면(Inventory)으로 즉시 강제 전환하여 직관적 피드백 제공 (가챠는 미실행)
      setDrawSubTab("inventory");
      setSelectedInventoryItem("loot_crate");
    } else {
      // 밀수품 상자(contraband)
      if (paymentMethod === "bp") {
        // BP로 쿠폰만 구매 시: 재화로 누적
        const couponReward = crateReward * 10;
        setCoupons((prev) => prev + couponReward);
        setTokens((prev) => prev + tokenReward);

        toast.success(
          `구매가 완료되었습니다! 밀수품 쿠폰 ${couponReward}장, 토큰 ${tokenReward}개가 내 보관함에 추가되었습니다.`
        );

        setDrawSubTab("inventory");
        setSelectedInventoryItem("coupon");
      } else {
        // G코인으로 구매 시: 즉시 개봉 실행 및 토큰 지급
        setTokens((prev) => prev + tokenReward);
        drawContrabandCratesDirect(crateReward);

        toast.success(
          `구매가 완료되었습니다! 즉시 ${crateReward}회 개봉 연출이 진행됩니다. (토큰 ${tokenReward}개 획득)`
        );
      }
    }
  };

  const handleOpenInventoryCrates = (mode: "one" | "five" | "ten" | "fiftyfive" | "all") => {
    if (!activeCrate) return;
    const currentCrateCount = inventoryCrates[activeCrate.id] || 0;
    
    let countToOpen = 0;
    if (mode === "one") {
      countToOpen = 1;
    } else if (mode === "five") {
      countToOpen = 5;
    } else if (mode === "ten") {
      countToOpen = 10;
    } else if (mode === "fiftyfive") {
      countToOpen = 55;
    } else if (mode === "all") {
      countToOpen = currentCrateCount;
    }

    if (countToOpen <= 0) {
      toast.warning("개봉할 상자가 없습니다. 상점에서 패키지를 먼저 구매해주세요.");
      return;
    }

    if (currentCrateCount < countToOpen) {
      toast.error(`보유한 상자가 부족합니다. (현재 보유: ${currentCrateCount}개)`);
      return;
    }

    // 이전 뽑기 결과 중 뒤집히지 않은 카드 또는 타이머가 남아있는지 판별
    const needsCollect = hasPendingOrUnrevealedCards();

    if (needsCollect) {
      // 1.5초 지연 정산 실행 (새로운 흔들림 연출이 끝나는 1500ms 뒤로 예약)
      collectRemainingCards(1500);
    }
    
    const startDraw = () => {
      // GA4 트래킹: 상자 개봉 기록
      trackEvent({
        name: "crate_opened",
        params: {
          crate_id: activeCrate.id,
          open_count: countToOpen
        }
      });
      setIsDrawing(true);
      setDrawMode("standard");
      
      // 차감
      setInventoryCrates((prev) => ({
        ...prev,
        [activeCrate.id]: prev[activeCrate.id] - countToOpen
      }));

      const results: DrawnCard[] = [];
      let hasBonusWon = false;

      for (let i = 0; i < countToOpen; i++) {
        // 1. 기본 아이템 드롭 (100%)
        const baseItem = drawSingleItem(activeCrate.items);
        const card: DrawnCard = {
          id: crypto.randomUUID(),
          name: baseItem.name,
          rarity: baseItem.rarity,
          image_url: baseItem.image_url,
          isFromPrimeParcel: false,
          isBonus: false,
          is_prime_parcel: baseItem.is_prime_parcel,
          token_count: baseItem.token_count,
        };

        // 2. 보너스 아이템 드롭 검사 (27.00%)
        if (activeCrate.bonus_items && activeCrate.bonus_items.length > 0) {
          const bonusItem = tryDrawBonusItem(activeCrate.bonus_items);
          if (bonusItem) {
            hasBonusWon = true;
            
            card.bonus = {
              id: crypto.randomUUID(),
              name: bonusItem.name,
              rarity: bonusItem.is_prime_parcel 
                ? "ULTIMATE" 
                : bonusItem.name.includes("획득권") 
                  ? "EPIC" 
                  : bonusItem.is_extra_crate 
                    ? "RARE" 
                    : "LEGENDARY",
              image_url: bonusItem.image_url,
              is_prime_parcel: bonusItem.is_prime_parcel,
              is_extra_crate: bonusItem.is_extra_crate,
              token_count: bonusItem.token_count,
            };
          }
        }

        results.push(card);
      }

      setHasBonusEffect(hasBonusWon);
      setDrawnCards(results);
      setRevealedCards(new Array(results.length).fill(false));

      setTimeout(() => {
        setIsDrawing(false);

        // 오픈전 스포방지: 등급 통계 및 히스토리/컬렉션은 뒤집는 시점에 가산하고, 총 개봉횟수만 즉시 반영
        setStats((prev) => ({
          ...prev,
          totalOpens: prev.totalOpens + countToOpen,
        }));
      }, 1500); // 연출 몰입을 위해 1.5초 흔들림 유지
    };

    // 지연 정산 여부와 무관하게 흔들림 연출은 즉시 시작하여 조작감 유지
    startDraw();
  };

  // 최고급 꾸러미 개봉 (이중 가챠 2단계 - 다량 개봉 지원)
  const handleOpenPrimeParcel = (count: number | "all") => {
    const countToOpen = count === "all" ? primeParcels : count;
    if (countToOpen <= 0) return;
    if (primeParcels < countToOpen || !activeCrate || activeCrate.prime_parcel_items.length === 0) return;

    // 이전 뽑기 결과 중 뒤집히지 않은 카드 또는 타이머가 남아있는지 판별
    const needsCollect = hasPendingOrUnrevealedCards();

    if (needsCollect) {
      // 1.5초 지연 정산 실행 (새로운 흔들림 연출이 끝나는 1500ms 뒤로 예약)
      collectRemainingCards(1500);
    }

    const startDraw = () => {
      // GA4 트래킹: 꾸러미 개봉 기록
      trackEvent({
        name: "crate_opened",
        params: {
          crate_id: `${activeCrate.id}_prime_parcel`,
          open_count: countToOpen
        }
      });
      setIsDrawing(true);
      setDrawMode("prime");
      setHasBonusEffect(false); // 꾸러미 개봉은 일반 금색 연출 제외
      setPrimeParcels((prev) => prev - countToOpen);

      const results: DrawnCard[] = [];
      for (let i = 0; i < countToOpen; i++) {
        const result = drawSinglePrimeItem(activeCrate.prime_parcel_items);
        results.push({
          id: crypto.randomUUID(),
          name: result.name,
          rarity: result.rarity,
          image_url: result.image_url,
          isBonus: false,
          isFromPrimeParcel: true,
        });
      }

      setDrawnCards(results);
      setRevealedCards(new Array(results.length).fill(false));

      setTimeout(() => {
        setIsDrawing(false);
        
        // 오픈전 스포방지: 등급 통계 및 히스토리/컬렉션은 뒤집는 시점에 가산하고, 총 꾸러미 개봉횟수만 즉시 반영
        setStats((prev) => ({
          ...prev,
          primeParcelOpens: prev.primeParcelOpens + countToOpen,
        }));
      }, 1500);
    };

    // 지연 정산 여부와 무관하게 흔들림 연출은 즉시 시작하여 조작감 유지
    startDraw();
  };

  // 카드 즉시 공개 (스포 방지 자산 획득)
  const handleCardClick = (index: number) => {
    if (revealedCards[index]) return;

    setRevealedCards((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });

    const card = drawnCards[index];
    if (card && activeCrate) {
      timerCounterRef.current += 1;
      const timerId = timerCounterRef.current;
      const timer = setTimeout(() => {
        applyCardReward(card);
        activeTimersRef.current = activeTimersRef.current.filter((t) => t.id !== timerId);
      }, 800); // 카드가 시각적으로 뒤집어진 후(800ms)에 자산이 반영되도록 지연 시간 보정

      activeTimersRef.current.push({
        id: timerId,
        timer,
        action: () => applyCardReward(card),
      });
    }
  };

  // 모든 카드 한 번에 공개 (스포 방지 자산 일괄 획득)
  const handleRevealAll = () => {
    if (!activeCrate) return;

    // 현재 타이머 돌고 있는 카드들이 있다면 먼저 다 정산 처리
    flushActiveTimers();

    const cardsToReveal: DrawnCard[] = [];
    const nextRevealed = [...revealedCards];

    drawnCards.forEach((card, idx) => {
      if (!revealedCards[idx]) {
        nextRevealed[idx] = true;
        cardsToReveal.push(card);
      }
    });

    if (cardsToReveal.length === 0) return;

    setRevealedCards(nextRevealed);

    timerCounterRef.current += 1;
    const timerId = timerCounterRef.current;
    const timer = setTimeout(() => {
      cardsToReveal.forEach((card) => {
        applyCardReward(card);
      });
      activeTimersRef.current = activeTimersRef.current.filter((t) => t.id !== timerId);
    }, 800); // 카드가 시각적으로 뒤집어진 후(800ms)에 자산이 반영되도록 지연 시간 보정

    activeTimersRef.current.push({
      id: timerId,
      timer,
      action: () => {
        cardsToReveal.forEach((card) => {
          applyCardReward(card);
        });
      },
    });
  };

  // 밀수품 상자 G-Coin 직접 즉시 개봉용 공통 드롭 연출 헬퍼
  const drawContrabandCratesDirect = (countToOpen: number) => {
    if (!activeCrate) return;

    const needsCollect = hasPendingOrUnrevealedCards();
    if (needsCollect) {
      collectRemainingCards(1500);
    }
    
    const startDraw = () => {
      // GA4 트래킹: 상자 개봉 기록
      trackEvent({
        name: "crate_opened",
        params: {
          crate_id: activeCrate.id,
          open_count: countToOpen
        }
      });
      setIsDrawing(true);
      setDrawMode("standard");

      const results: DrawnCard[] = [];
      let hasBonusWon = false;

      for (let i = 0; i < countToOpen; i++) {
        const baseItem = drawSingleItem(activeCrate.items);
        const card: DrawnCard = {
          id: crypto.randomUUID(),
          name: baseItem.name,
          rarity: baseItem.rarity,
          image_url: baseItem.image_url,
          isFromPrimeParcel: false,
          isBonus: false,
          is_prime_parcel: baseItem.is_prime_parcel,
          token_count: baseItem.token_count,
        };

        if (activeCrate.bonus_items && activeCrate.bonus_items.length > 0) {
          const bonusItem = tryDrawBonusItem(activeCrate.bonus_items);
          if (bonusItem) {
            hasBonusWon = true;
            
            card.bonus = {
              id: crypto.randomUUID(),
              name: bonusItem.name,
              rarity: bonusItem.is_prime_parcel 
                ? "ULTIMATE" 
                : bonusItem.name.includes("획득권") 
                  ? "EPIC" 
                  : bonusItem.is_extra_crate 
                    ? "RARE" 
                    : "LEGENDARY",
              image_url: bonusItem.image_url,
              is_prime_parcel: bonusItem.is_prime_parcel,
              is_extra_crate: bonusItem.is_extra_crate,
              token_count: bonusItem.token_count,
            };
          }
        }

        results.push(card);
      }

      setHasBonusEffect(hasBonusWon);
      setDrawnCards(results);
      setRevealedCards(new Array(results.length).fill(false));

      setTimeout(() => {
        setIsDrawing(false);
        setStats((prev) => ({
          ...prev,
          totalOpens: prev.totalOpens + countToOpen,
        }));
      }, 1500);
    };

    startDraw();
  };

  // 밀수품 상자 G-Coin 직접 즉시 개봉 핸들러
  const handleOpenContrabandCrateWithGCoin = (mode: "one" | "ten") => {
    if (!activeCrate) return;
    
    let price = 0;
    let countToOpen = 0;
    
    if (mode === "one") {
      price = 200;
      countToOpen = 1;
    } else if (mode === "ten") {
      const isCompleted = contrabandTenDrawCompleted[activeCrate.id] || false;
      price = isCompleted ? 1800 : 1000;
      countToOpen = 10;
    }

    if (gcoin < price) {
      toast.error("보유 가상 G-Coin이 부족합니다. 상단의 충전 버튼을 이용해주세요.");
      return;
    }

    // G-Coin 및 소모액 차감
    setGcoin((prev) => prev - price);
    setSpentGcoin((prev) => prev + price);
    if (mode === "ten") {
      setContrabandTenDrawCompleted((prev) => ({
        ...prev,
        [activeCrate.id]: true
      }));
    }

    drawContrabandCratesDirect(countToOpen);
  };

  // 밀수품 쿠폰 개봉 핸들러 (1회, 5회, 10회, 전체 지원)
  const handleOpenContrabandWithCoupons = (mode: "one" | "five" | "ten" | "all") => {
    if (!activeCrate) return;
    
    if (activeCrate.type !== "contraband") {
      toast.warning("밀수품 쿠폰은 밀수품 상자(Contraband Crate) 개봉에만 사용할 수 있습니다. 상점 라인업에서 밀수품 상자를 선택해 주세요.");
      return;
    }
    
    let couponsNeeded = 10;
    let countToOpen = 1;
    
    if (mode === "five") {
      couponsNeeded = 50;
      countToOpen = 5;
    } else if (mode === "ten") {
      couponsNeeded = 100;
      countToOpen = 10;
    } else if (mode === "all") {
      countToOpen = Math.floor(coupons / 10);
      couponsNeeded = countToOpen * 10;
    }

    if (countToOpen <= 0) {
      toast.warning("개봉할 수 있는 밀수품 쿠폰이 부족합니다. (최소 10장 필요)");
      return;
    }

    if (coupons < couponsNeeded) {
      toast.error(`밀수품 쿠폰이 부족합니다. (최소 ${couponsNeeded}장 필요, 현재 보유: ${coupons}장)`);
      return;
    }

    const needsCollect = hasPendingOrUnrevealedCards();
    if (needsCollect) {
      collectRemainingCards(1500);
    }
    
    const startDraw = () => {
      // GA4 트래킹: 상자 개봉 기록
      trackEvent({
        name: "crate_opened",
        params: {
          crate_id: activeCrate.id,
          open_count: countToOpen
        }
      });
      setIsDrawing(true);
      setDrawMode("standard");
      
      // 쿠폰 차감
      setCoupons((prev) => prev - couponsNeeded);

      const results: DrawnCard[] = [];
      let hasBonusWon = false;

      for (let i = 0; i < countToOpen; i++) {
        const baseItem = drawSingleItem(activeCrate.items);
        const card: DrawnCard = {
          id: crypto.randomUUID(),
          name: baseItem.name,
          rarity: baseItem.rarity,
          image_url: baseItem.image_url,
          isFromPrimeParcel: false,
          isBonus: false,
          is_prime_parcel: baseItem.is_prime_parcel,
          token_count: baseItem.token_count,
        };

        if (activeCrate.bonus_items && activeCrate.bonus_items.length > 0) {
          const bonusItem = tryDrawBonusItem(activeCrate.bonus_items);
          if (bonusItem) {
            hasBonusWon = true;
            card.bonus = {
              id: crypto.randomUUID(),
              name: bonusItem.name,
              rarity: bonusItem.is_prime_parcel 
                ? "ULTIMATE" 
                : bonusItem.name.includes("획득권") 
                  ? "EPIC" 
                  : bonusItem.is_extra_crate 
                    ? "RARE" 
                    : "LEGENDARY",
              image_url: bonusItem.image_url,
              is_prime_parcel: bonusItem.is_prime_parcel,
              is_extra_crate: bonusItem.is_extra_crate,
              token_count: bonusItem.token_count,
            };
          }
        }

        results.push(card);
      }

      setHasBonusEffect(hasBonusWon);
      setDrawnCards(results);
      setRevealedCards(new Array(results.length).fill(false));

      setTimeout(() => {
        setIsDrawing(false);
        setStats((prev) => ({
          ...prev,
          totalOpens: prev.totalOpens + countToOpen,
        }));
      }, 1500);
    };

    startDraw();
  };

  // 밀수품 쿠폰 구매 핸들러
  const handleBuyCoupons = (count: number) => {
    const price = 800 * count;
    if (bp < price) {
      toast.error("보유 가상 BP가 부족합니다. 미션 수행 등으로 추가 BP를 확보하세요.");
      return;
    }
    if (couponWeeklyBuyCount + count > 50) {
      toast.warning(`주간 밀수품 쿠폰 구매 한도(50장)를 초과할 수 없습니다. (현재 이번 주 구매 수량: ${couponWeeklyBuyCount}/50장)`);
      return;
    }
    setBp((prev) => prev - price);
    setSpentBp((prev) => prev + price);
    setCoupons((prev) => prev + count);
    setCouponWeeklyBuyCount((prev) => prev + count);

    // 구매 완료 알림 제공
    toast.success(`밀수품 쿠폰 ${count}장 구매가 완료되었습니다. (보유: ${coupons + count}장)`);
  };

  // 재화 무한 충전 실행기 핸들러
  const handleRefillAsset = () => {
    if (refillAmount <= 0) {
      toast.warning("보충할 요율 수량은 1 이상이어야 합니다.");
      return;
    }
    if (refillType === "gcoin") {
      setGcoin((prev) => prev + refillAmount);
    } else if (refillType === "bp") {
      setBp((prev) => prev + refillAmount);
    } else if (refillType === "coupon") {
      setCoupons((prev) => prev + refillAmount);
    } else if (refillType === "crate") {
      if (!activeCrate) return;
      setInventoryCrates((prev) => ({
        ...prev,
        [activeCrate.id]: (prev[activeCrate.id] || 0) + refillAmount,
      }));
    }
    setIsRefillModalOpen(false);
  };

  // 모든 재화 무제한 충전 핸들러
  const handleRefillInfinite = () => {
    setBp(999999999);
    setGcoin(999999999);
    setCoupons(999999999);
    setTokens(999999999);
    setPrimeParcels(999999999);
    if (activeCrate) {
      setInventoryCrates((prev) => ({
        ...prev,
        [activeCrate.id]: 999999999,
      }));
    }
    setIsRefillModalOpen(false);
    toast.success("모든 가상 재화가 무제한(999,999,999)으로 보충되었습니다!");
  };

  // 시뮬레이터 완전 초기화 모달 트리거
  const handleResetSimulator = () => {
    setIsResetModalOpen(true);
  };

  // 실제 시뮬레이터 초기화 동작
  const executeResetSimulator = () => {
    // 대기 중인 모든 타이머 취소
    activeTimersRef.current.forEach((t) => clearTimeout(t.timer));
    activeTimersRef.current = [];

    setBp(1000000);
    setGcoin(0);
    setCoupons(0);
    setCouponWeeklyBuyCount(0);
    setContrabandTenDrawCompleted({});
    setInventoryCrates(() => {
      const initial: Record<string, number> = {};
      initialCrates.forEach((c) => {
        initial[c.id] = 0;
      });
      return initial;
    });
    setPrimeParcels(0);
    setTokens(0);
    setSpentUsd(0);
    setSpentGcoin(0);
    setSpentBp(0);
    setChargeCount(0);
    setBpBuyCount(0);
    setDrawnCards([]);
    setRevealedCards([]);
    setHistory([]);
    setObtainedSkins({
      '"CVO™ Road Glide® ST (리미티드)" 모터사이클 도안': 0,
      '"CVO™ Road Glide® ST" 모터사이클 도안': 0,
      "CVO™ ROAD GLIDE® ST (리미티드) 풀 세트 (골든 네이비 & 샴페인 골드) 도안": 0,
      "CVO™ ROAD GLIDE® ST (리미티드) 세트 (미드나잇 블레이즈 & 폴리시드 크롬) 도안": 0,
      "CVO™ ROAD GLIDE® ST (리미티드) 세트 (브론즈 플레임 & 액센티드 브론즈) 도안": 0,
      "CVO™ ROAD GLIDE® ST (리미티드) SET (볼드 아이보리 & 액센티드 글로스 BLACK) 도안": 0,
      "CVO™ ROAD GLIDE® ST 세트 (매트 나이트셰이드 & 알루미늄) 도안": 0,
      "CVO™ Road Glide® ST (리미티드) 페인트 (샴페인 골드) 도안": 0,
      "CVO™ Road Glide® ST 페인트 (팬텀 포레스트) 도안": 0,
      "CVO™ Road Glide® ST 페인트 (터콰이즈 타이드) 도안": 0,
      "CVO™ Road Glide® ST 페인트 (골든 화이트 펄) 도안": 0,
      "CVO™ Road Glide® ST 페인트 (일렉트릭 코스트) 도안": 0,
      "할리데이비슨® 블랙탑 바이커 세트 도안": 0,
      "할리데이비슨® 스트리트 스마트 세트 도안": 0,
      "할리데이비슨® 낙하산 도안": 0,
      "할리데이비슨® - 클로즈 업 도안": 0,
      "할리데이비슨™ - 달리기 위해 살고, 살기 위해 달린다 도안": 0,
      "할리데이비슨® 엔진 배지 도안": 0,
      "라이드 오어 다이 - M249": 0,
      "라이드 오어 다이 - M249 (블랙 틸)": 0,
      "도면 (Schematic)": 0,
      "폴리머 (Polymer) x100": 0,
      "러프 라이드 - S12K": 0,
      "다이너스티 - Kar98k": 0,
      "러프 라이드 - 베릴 M762 & 토미 건": 0,
      "일반 클래식 스킨군": 0,
      "코스믹 칼리버 - Kar98k": 0,
      "코스믹 칼리버 - Kar98k (화이트 옐로우)": 0,
      "행성 경비대 - SCAR-L": 0,
      "스팀 게이지 - Kar98k": 0,
      "행성 경비대 - M249 & 뮤턴트": 0,
      "노란색 연막탄": 0,
      "분홍색 연막탄": 0,
      "골드 리프 - M416": 0,
      "골든 서킷 - 미니14": 0,
      "골든 서킷 - 마이크로 UZI": 0,
    });
    setStats({
      totalOpens: 0,
      primeParcelOpens: 0,
      ultimateCount: 0,
      legendaryCount: 0,
      epicCount: 0,
      rareCount: 0,
      specialCount: 0,
      commonCount: 0,
    });
    setIsResetModalOpen(false);
    toast.success("시뮬레이터가 초기화되었습니다.");
  };

  // 특수 제작 처리 핸들러
  const handleCraftItem = (itemName: string, tokenCost: number) => {
    if (tokens < tokenCost) {
      toast.error(`보유한 이벤트 토큰이 부족합니다. (필요: ${tokenCost}개, 보유: ${tokens}개)`);
      return false;
    }
    setTokens((prev) => prev - tokenCost);
    setObtainedSkins((prev) => ({
      ...prev,
      [itemName]: (prev[itemName] || 0) + 1,
    }));
    
    // 이미지 매핑
    const matchedPrime = activeCrate?.prime_parcel_items.find(p => p.name === itemName);
    const matchedNormal = activeCrate?.items.find(i => i.name === itemName);
    const imgUrl = matchedPrime?.image_url || matchedNormal?.image_url || "";
    
    const craftHistory: HistoryItem = {
      id: crypto.randomUUID(),
      name: `${itemName} (특수 제작)`,
      rarity: itemName.includes("리미티드") ? "ULTIMATE" : "LEGENDARY",
      image_url: imgUrl,
      isFromPrimeParcel: false,
      isBonus: false,
      timestamp: new Date(),
    };

    setHistory((prev) => [craftHistory, ...prev]);
    toast.success(`[${itemName}] 제작에 성공하였습니다!`);
    return true;
  };

  return {
    bp,
    setBp,
    gcoin,
    setGcoin,
    coupons,
    setCoupons,
    couponWeeklyBuyCount,
    contrabandTenDrawCompleted,
    inventoryCrates,
    setInventoryCrates,
    primeParcels,
    setPrimeParcels,
    tokens,
    setTokens,
    spentUsd,
    spentGcoin,
    spentBp,
    chargeCount,
    bpBuyCount,
    isDrawing,
    hasBonusEffect,
    drawMode,
    drawnCards,
    setDrawnCards,
    revealedCards,
    setRevealedCards,
    obtainedSkins,
    setObtainedSkins,
    history,
    stats,
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
    
    // 핸들러 함수 모음
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
    handleRefillInfinite,
    handleResetSimulator,
    collectRemainingCards,
    handleCraftItem,
    isResetModalOpen,
    setIsResetModalOpen,
    executeResetSimulator
  };
}
