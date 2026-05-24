"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import getApiUrl from "../../lib/api-config";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { ItemCategory, GameItem, Vehicle, Weapon } from "@/types/game-data";

export default function GameDataEditor() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ItemCategory>("weapons");
  const [items, setItems] = useState<GameItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<GameItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [flushNickname, setFlushNickname] = useState("");
  const [flushMatchId, setFlushMatchId] = useState("");

  // 은신처 상점 전용 상태 선언
  const [selectedCrateDetail, setSelectedCrateDetail] = useState<{
    template: any;
    items: any[];
    prime_parcel_items: any[];
    bonus_items: any[];
  } | null>(null);
  const [crateEditorTab, setCrateEditorTab] = useState<"items" | "prime" | "bonus">("items");

  // R2 이미지 업로드 공통 핸들러
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: "template" | "items" | "prime" | "bonus",
    index?: number
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading("R2 이미지 전송 중...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/crates/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: formData
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "R2 업로드 실패");

      toast.success("R2 업로드 성공!", { id: toastId });

      if (target === "template") {
        if (selectedCrateDetail) {
          setSelectedCrateDetail({
            ...selectedCrateDetail,
            template: {
              ...selectedCrateDetail.template,
              image_url: result.url
            }
          });
        }
      } else if (target === "items" && index !== undefined) {
        if (selectedCrateDetail) {
          const updatedItems = [...selectedCrateDetail.items];
          updatedItems[index] = { ...updatedItems[index], image_url: result.url };
          setSelectedCrateDetail({ ...selectedCrateDetail, items: updatedItems });
        }
      } else if (target === "prime" && index !== undefined) {
        if (selectedCrateDetail) {
          const updatedPrime = [...selectedCrateDetail.prime_parcel_items];
          updatedPrime[index] = { ...updatedPrime[index], image_url: result.url };
          setSelectedCrateDetail({ ...selectedCrateDetail, prime_parcel_items: updatedPrime });
        }
      } else if (target === "bonus" && index !== undefined) {
        if (selectedCrateDetail) {
          const updatedBonus = [...selectedCrateDetail.bonus_items];
          updatedBonus[index] = { ...updatedBonus[index], image_url: result.url };
          setSelectedCrateDetail({ ...selectedCrateDetail, bonus_items: updatedBonus });
        }
      }
    } catch (err: any) {
      toast.error("R2 업로드 오류: " + err.message, { id: toastId });
    }
  };

  // 은신처 상자 세부 정보 로드 핸들러
  const fetchCrateDetail = useCallback(async (crateId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/crates/data?id=${crateId}`, {
        headers: {
          "Authorization": `Bearer ${session?.access_token}`
        }
      });
      if (!response.ok) throw new Error("상자 데이터를 가져올 수 없습니다.");
      const data = await response.json();
      setSelectedCrateDetail(data);
    } catch (err: any) {
      toast.error("상자 로딩 오류: " + err.message);
    }
  }, []);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("관리자 로그인이 필요합니다.");
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (profile?.role !== "admin") {
        toast.warning("관리자 권한이 없습니다.");
        router.push("/");
        return;
      }
      setIsAuthorized(true);
    };
    checkAdmin();
  }, [router]);

  const fetchItems = useCallback(async () => {
    if (activeCategory === "system") {
      setItems([]);
      return;
    }

    if (activeCategory === "crates") {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch("/api/admin/crates/data", {
          headers: {
            "Authorization": `Bearer ${session?.access_token}`
          }
        });
        if (!response.ok) throw new Error("은신처 상점 목록 로드 실패");
        const data = await response.json();
        setItems(data || []);
        setSelectedCrateDetail(null);
        setSelectedItem(null);
      } catch (err: any) {
        toast.error(err.message);
      }
      return;
    }

    const { data, error } = await supabase
      .from(activeCategory)
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Fetch error:", error);
    } else {
      setItems((data as GameItem[]) || []);
      setSelectedItem(null);
      setSelectedCrateDetail(null);
    }
  }, [activeCategory]);

  useEffect(() => {
    if (isAuthorized) {
      fetchItems();
    }
  }, [isAuthorized, activeCategory, fetchItems]);

  const filteredItems = useMemo(() => {
    return items.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.id && item.id.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [items, searchTerm]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (activeCategory === "crates") {
        if (!selectedCrateDetail) return;
        const response = await fetch("/api/admin/crates/data", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`
          },
          body: JSON.stringify(selectedCrateDetail)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "저장 실패");

        toast.success("은신처 상자 정보가 저장되었습니다!");
        fetchItems();
        return;
      }

      const apiUrl = getApiUrl("/api/admin/game-data");
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ category: activeCategory, item: selectedItem })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "저장 실패");

      toast.success("변경 사항이 저장되었습니다!");
      fetchItems();
    } catch (err: any) {
      toast.error("저장 중 오류 발생: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까? 관련 시뮬레이션에 영향이 있을 수 있습니다.")) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (activeCategory === "crates") {
        const response = await fetch(`/api/admin/crates/data?id=${id}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${session?.access_token}`
          }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "삭제 실패");

        toast.success("은신처 상자가 성공적으로 삭제되었습니다.");
        fetchItems();
        return;
      }

      const apiUrl = getApiUrl(`/api/admin/game-data?category=${activeCategory}&id=${id}`);
      const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`
        }
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "삭제 실패");

      toast.success("항목이 성공적으로 삭제되었습니다.");
      fetchItems();
    } catch (err: any) {
      toast.error("삭제 중 오류 발생: " + err.message);
    }
  };

  const createNewItem = () => {
    const newId = `new_${Date.now()}`;
    
    if (activeCategory === "crates") {
      const newId = crypto.randomUUID();
      setSelectedCrateDetail({
        template: {
          id: newId,
          name: "새 은신처 상자",
          type: "contraband",
          price_gcoin: 200,
          bundle_price_gcoin: 1800,
          image_url: "",
          description: "",
          active: true,
          end_date: ""
        },
        items: [],
        prime_parcel_items: [],
        bonus_items: []
      });
      setSelectedItem({ id: newId, name: "새 은신처 상자" } as any);
      return;
    }

    if (activeCategory === "vehicles") {
      setSelectedItem({ 
        id: newId, 
        name: "새 항목", 
        patch_notes: "", 
        trunk_capacity: 200 
      } as Vehicle);
    } else if (activeCategory === "weapons") {
      setSelectedItem({ 
        id: newId, 
        name: "새 항목", 
        patch_notes: "", 
        weight: 0, 
        can_be_in_backpack: true,
        type: "AR",
        damage: 0,
        ammo: "5.56mm",
        bullet_speed: 0,
        availability: "월드 스폰"
      } as Weapon);
    } else if (activeCategory === "ammo") {
      setSelectedItem({ 
        id: newId, 
        name: "새 항목", 
        patch_notes: "", 
        weight: 0, 
        can_be_in_backpack: true,
        type: "탄약"
      } as GameItem);
    } else {
      setSelectedItem({ 
        id: newId, 
        name: "새 항목", 
        patch_notes: "", 
        weight: 0, 
        can_be_in_backpack: true 
      } as GameItem);
    }
  };

  if (!isAuthorized) return null;

  return (
    <div className="flex flex-col h-screen text-gray-200">
      <header className="flex items-center justify-between h-[60px] px-6 bg-[#1a1a1a] border-b border-[#333]">
        <div className="flex items-center gap-6">
          <div className="text-xl font-black text-[#F2A900] italic">배그<span className="text-white"> 데이터 관리자</span></div>
          <nav className="flex gap-2">
            {[
              { id: "weapons", label: "무기" },
              { id: "consumables", label: "회복템" },
              { id: "throwables", label: "투척무기" },
              { id: "attachments", label: "파츠" },
              { id: "ammo", label: "탄약" },
              { id: "vehicles", label: "차량" },
              { id: "crates", label: "📦 은신처 상점" },
              { id: "system", label: "⚙️ 시스템/캐시" }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id as ItemCategory)}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                  activeCategory === cat.id ? "bg-[#F2A900] text-black" : "bg-[#252525] text-gray-400 hover:bg-[#333]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <input
            id="manual-sync-url"
            name="manual_url"
            type="text"
            placeholder="수동 동기화 뉴스 URL (선택사항)"
            className="w-[240px] bg-[#222] border border-[#333] rounded px-3 py-1.5 text-[11px] focus:outline-none focus:border-blue-500"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const btn = document.getElementById("sync-btn");
                if (btn) btn.click();
              }
            }}
          />
          <button 
            id="sync-btn"
            onClick={async () => {
              const urlInput = document.getElementById("manual-sync-url") as HTMLInputElement;
              const manualUrl = urlInput?.value.trim();
              
              const confirmMsg = manualUrl 
                ? `입력하신 URL(${manualUrl})로 강제 동기화를 진행할까요?`
                : "모든 공식 뉴스를 훑어보고 최신 패치노트 전 내용을 동기화할까요?";
                
              if (!confirm(confirmMsg)) return;
              
              setIsSaving(true);
              try {
                const apiUrl = `/api/admin/patch-notes/sync`;
                const res = await fetch(apiUrl, { 
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ url: manualUrl })
                });
                const result = await res.json();
                
                if (result.success) {
                  toast.success("✅ 동기화 완료! (" + (result.details?.join(", ") || "내역 없음") + ")");
                  if (urlInput) urlInput.value = ""; // 성공 시 비우기
                  router.push("/board");
                } else {
                  toast.error("❌ 동기화 실패: " + (result.error || result.message || "알 수 없는 오류"));
                }
              } catch (err) {
                console.error("Sync error:", err);
                toast.error("연동 통신 중 오류가 발생했습니다.");
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
            className={`px-3 py-1.5 rounded text-[11px] font-bold border transition-all ${
              isSaving 
                ? "bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed" 
                : "bg-blue-600/10 border-blue-600/30 text-blue-400 hover:bg-blue-600/20"
            }`}
          >
            {isSaving ? "⏳ 동기화 중..." : "🔄 패치노트 데이터 동기화"}
          </button>
          </div>
          <button onClick={() => router.push("/")} className="text-sm font-bold text-gray-400 hover:text-white transition-colors">
            나가기
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[300px] bg-[#141414] border-r border-[#333] flex flex-col">
          <div className="p-4 border-b border-[#222]">
            <input
              id="admin-search"
              name="admin_q"
              type="text"
              placeholder="검색..."
              className="w-full bg-[#222] border border-[#333] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#F2A900]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button
              onClick={createNewItem}
              className="w-full mt-3 bg-[#34A853] hover:bg-[#2a8a43] text-white text-xs font-bold py-2 rounded transition-colors"
            >
              + 새 항목 추가
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredItems.map(item => (
              <div
                key={item.id}
                onClick={async () => {
                  setSelectedItem(item);
                  if (activeCategory === "crates") {
                    await fetchCrateDetail(item.id);
                  }
                }}
                className={`p-4 border-b border-[#222] cursor-pointer transition-colors hover:bg-[#1a1a1a] ${
                  selectedItem?.id === item.id ? "bg-[#1a1a1a] border-l-4 border-l-[#F2A900]" : ""
                }`}
              >
                <div className="font-bold text-sm">{item.name}</div>
                <div className="text-[10px] text-gray-500 font-mono mt-1">{item.id}</div>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex-1 bg-[#0d0d0d] p-8 overflow-y-auto">
          {activeCategory === "system" ? (
            <div className="max-w-[700px] mx-auto">
              <h2 className="text-2xl font-black text-white mb-8">⚙️ 시스템 및 데이터 캐시 관리</h2>
              
              <div className="grid grid-cols-1 gap-6">
                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-[#333]">
                  <h3 className="text-lg font-bold text-[#F2A900] mb-2">전체 분석 캐시 초기화</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    데이터베이스에 저장된 모든 분석 결과값(processed_match_telemetry)을 삭제합니다.<br/>
                    원본 데이터는 보존되며, 사용자가 전적을 조회할 때 최신 엔진으로 다시 계산됩니다.
                  </p>
                  <button
                    onClick={async () => {
                      if (!confirm("정말 모든 분석 캐시를 삭제하시겠습니까? (복구 불가능)")) return;
                      setIsSaving(true);
                      try {
                        const res = await fetch("/api/admin/system", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "flush_old_cache" })
                        });
                        const data = await res.json();
                        if (data.success) toast.success(data.message);
                        else throw new Error(data.error);
                      } catch (err: any) {
                        toast.error("처리 중 오류: " + err.message);
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    disabled={isSaving}
                    className="px-6 py-3 bg-red-600/20 text-red-500 border border-red-600/30 rounded-lg font-bold hover:bg-red-600/30 transition-all"
                  >
                    🗑️ 전체 분석 데이터 삭제 (초기화)
                  </button>
                </div>

                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-[#333]">
                  <h3 className="text-lg font-bold text-[#F2A900] mb-2">글로벌 벤치마크 초기화</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    엘리트 선수들의 통계 데이터(global_benchmarks)를 모두 비웁니다.<br/>
                    수행 후 &apos;벤치마커 스크립트&apos;를 다시 돌려야 최신 데이터로 채워집니다.
                  </p>
                  <button
                    onClick={async () => {
                      if (!confirm("벤치마크 데이터를 초기화하시겠습니까? (복구 불가능)")) return;
                      setIsSaving(true);
                      try {
                        const res = await fetch("/api/admin/system", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "reset_benchmarks" })
                        });
                        const data = await res.json();
                        if (data.success) toast.success(data.message);
                        else throw new Error(data.error);
                      } catch (err: any) {
                        toast.error("처리 중 오류: " + err.message);
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    disabled={isSaving}
                    className="px-6 py-3 bg-orange-600/20 text-orange-500 border border-orange-600/30 rounded-lg font-bold hover:bg-orange-600/30 transition-all"
                  >
                    🔄 벤치마크 데이터 전체 초기화
                  </button>
                </div>

                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-[#333]">
                  <h3 className="text-lg font-bold text-[#F2A900] mb-2">플레이어/매치 정밀 초기화</h3>
                  <p className="text-sm text-gray-400 mb-6">
                    특정 플레이어나 매치의 데이터만 골라서 삭제합니다. 버그 수정 후 테스트 시 유용합니다.
                  </p>
                  
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="플레이어 닉네임 (예: KangHeeSung_)"
                        className="flex-1 bg-[#222] border border-[#333] rounded px-3 py-2 text-sm focus:border-[#F2A900] focus:outline-none"
                        value={flushNickname}
                        onChange={(e) => setFlushNickname(e.target.value)}
                      />
                      <button
                        onClick={async () => {
                          if (!flushNickname) return toast.error("닉네임을 입력하세요.");
                          if (!confirm(`${flushNickname}님의 모든 분석 데이터를 삭제하시겠습니까?`)) return;
                          setIsSaving(true);
                          try {
                            const res = await fetch("/api/admin/system", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "flush_player_cache", nickname: flushNickname })
                            });
                            const data = await res.json();
                            if (data.success) {
                              toast.success(data.message);
                              setFlushNickname("");
                            } else throw new Error(data.error);
                          } catch (err: any) {
                            toast.error(err.message);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded font-bold hover:bg-blue-600/30 transition-all text-sm"
                      >
                        유저 데이터 삭제
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="매치 ID (Match ID)"
                        className="flex-1 bg-[#222] border border-[#333] rounded px-3 py-2 text-sm focus:border-[#F2A900] focus:outline-none"
                        value={flushMatchId}
                        onChange={(e) => setFlushMatchId(e.target.value)}
                      />
                      <button
                        onClick={async () => {
                          if (!flushMatchId) return toast.error("매치 ID를 입력하세요.");
                          if (!confirm(`해당 매치(${flushMatchId})의 모든 분석 데이터를 삭제하시겠습니까?`)) return;
                          setIsSaving(true);
                          try {
                            const res = await fetch("/api/admin/system", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "flush_match_cache", matchId: flushMatchId })
                            });
                            const data = await res.json();
                            if (data.success) {
                              toast.success(data.message);
                              setFlushMatchId("");
                            } else throw new Error(data.error);
                          } catch (err: any) {
                            toast.error(err.message);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        disabled={isSaving}
                        className="px-4 py-2 bg-purple-600/20 text-purple-400 border border-purple-600/30 rounded font-bold hover:bg-purple-600/30 transition-all text-sm"
                      >
                        매치 데이터 삭제
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeCategory === "crates" ? (
            selectedCrateDetail ? (
              <div className="max-w-[850px] mx-auto pb-10">
                <div className="flex justify-between items-center mb-8 border-b border-[#333] pb-4">
                  <div>
                    <span className="text-[10px] bg-indigo-950 text-indigo-400 border border-indigo-900 px-2 py-0.5 rounded-full font-bold mr-2">Crate Editor</span>
                    <h2 className="text-2xl font-black text-white inline-block">{selectedCrateDetail.template.name || "새 은신처 상자"}</h2>
                  </div>
                  <button
                    onClick={() => handleDelete(selectedCrateDetail.template.id)}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold px-4 py-2 rounded border border-red-500/30 transition-all"
                  >
                    상자 삭제
                  </button>
                </div>

                <form onSubmit={handleSave} className="space-y-8">
                  <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#333] space-y-4">
                    <h3 className="text-sm font-black text-[#F2A900] uppercase tracking-wider">상자 기본 정보</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2">상자 이름</label>
                        <input
                          type="text"
                          required
                          value={selectedCrateDetail.template.name}
                          onChange={(e) => setSelectedCrateDetail({
                            ...selectedCrateDetail,
                            template: { ...selectedCrateDetail.template, name: e.target.value }
                          })}
                          className="w-full bg-[#111] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2">상자 종류</label>
                        <select
                          value={selectedCrateDetail.template.type}
                          onChange={(e) => setSelectedCrateDetail({
                            ...selectedCrateDetail,
                            template: { ...selectedCrateDetail.template, type: e.target.value }
                          })}
                          className="w-full bg-[#111] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                        >
                          <option value="contraband">밀수품 상자 (contraband)</option>
                          <option value="loot_crate">콜라보 전리품 상자 (loot_crate)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2">1회 가격 (G-Coin)</label>
                        <input
                          type="number"
                          required
                          value={selectedCrateDetail.template.price_gcoin}
                          onChange={(e) => setSelectedCrateDetail({
                            ...selectedCrateDetail,
                            template: { ...selectedCrateDetail.template, price_gcoin: Number(e.target.value) }
                          })}
                          className="w-full bg-[#111] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2">10회 가격 (G-Coin)</label>
                        <input
                          type="number"
                          required
                          value={selectedCrateDetail.template.bundle_price_gcoin}
                          onChange={(e) => setSelectedCrateDetail({
                            ...selectedCrateDetail,
                            template: { ...selectedCrateDetail.template, bundle_price_gcoin: Number(e.target.value) }
                          })}
                          className="w-full bg-[#111] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-500 mb-2">판매 종료일 (타임스탬프: YYYY-MM-DD HH:MM:SS+09)</label>
                        <input
                          type="text"
                          placeholder="예: 2026-06-17 09:00:00+09"
                          value={selectedCrateDetail.template.end_date || ""}
                          onChange={(e) => setSelectedCrateDetail({
                            ...selectedCrateDetail,
                            template: { ...selectedCrateDetail.template, end_date: e.target.value }
                          })}
                          className="w-full bg-[#111] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-500 mb-2">상자 설명</label>
                        <textarea
                          rows={2}
                          value={selectedCrateDetail.template.description || ""}
                          onChange={(e) => setSelectedCrateDetail({
                            ...selectedCrateDetail,
                            template: { ...selectedCrateDetail.template, description: e.target.value }
                          })}
                          className="w-full bg-[#111] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900] resize-none"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-500 mb-2">상자 이미지 및 R2 업로드</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={selectedCrateDetail.template.image_url || ""}
                            onChange={(e) => setSelectedCrateDetail({
                              ...selectedCrateDetail,
                              template: { ...selectedCrateDetail.template, image_url: e.target.value }
                            })}
                            className="flex-1 bg-[#111] border border-[#333] rounded px-4 py-2 text-sm focus:outline-none focus:border-[#F2A900]"
                          />
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageUpload(e, "template")}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                            <button
                              type="button"
                              className="px-4 py-2 bg-[#252525] border border-[#333] hover:bg-[#333] rounded text-xs font-bold h-full whitespace-nowrap"
                            >
                              📁 이미지 업로드
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCrateDetail.template.active}
                            onChange={(e) => setSelectedCrateDetail({
                              ...selectedCrateDetail,
                              template: { ...selectedCrateDetail.template, active: e.target.checked }
                            })}
                            className="w-4 h-4 rounded border-[#333] bg-[#1a1a1a] text-[#F2A900] focus:ring-[#F2A900]"
                          />
                          <span className="text-xs font-bold text-gray-400">상점 노출 활성화</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-[#333] space-y-4">
                    <div className="flex justify-between items-center border-b border-[#222] pb-2">
                      <nav className="flex gap-2">
                        {[
                          { id: "items", label: "1차 구성품" },
                          ...(selectedCrateDetail.template.type === "loot_crate" ? [{ id: "prime", label: "최고급 꾸러미" }] : []),
                          { id: "bonus", label: "보너스 드롭" }
                        ].map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setCrateEditorTab(tab.id as any)}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                              crateEditorTab === tab.id ? "bg-[#F2A900] text-black" : "bg-[#222] text-gray-400 hover:bg-[#2a2a2a]"
                            }`}
                          >
                            {tab.label} ({
                              tab.id === "items" 
                                ? selectedCrateDetail.items.length 
                                : tab.id === "prime" 
                                  ? selectedCrateDetail.prime_parcel_items.length 
                                  : selectedCrateDetail.bonus_items.length
                            })
                          </button>
                        ))}
                      </nav>

                      <button
                        type="button"
                        onClick={() => {
                          if (crateEditorTab === "items") {
                            setSelectedCrateDetail({
                              ...selectedCrateDetail,
                              items: [...selectedCrateDetail.items, { name: "새 구성품", rarity: "LEGENDARY", probability: 0.1, image_url: "", is_prime_parcel: false, token_count: 0 }]
                            });
                          } else if (crateEditorTab === "prime") {
                            setSelectedCrateDetail({
                              ...selectedCrateDetail,
                              prime_parcel_items: [...selectedCrateDetail.prime_parcel_items, { name: "새 꾸러미 아이템", rarity: "ULTIMATE", probability: 0.1, image_url: "" }]
                            });
                          } else {
                            setSelectedCrateDetail({
                              ...selectedCrateDetail,
                              bonus_items: [...selectedCrateDetail.bonus_items, { name: "새 보너스 아이템", probability: 0.1, token_count: 0, is_prime_parcel: false, is_extra_crate: false, image_url: "" }]
                            });
                          }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded"
                      >
                        + 아이템 추가
                      </button>
                    </div>

                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                      {crateEditorTab === "items" && (
                        <div className="space-y-3">
                          {selectedCrateDetail.items.map((item, idx) => (
                            <div key={idx} className="bg-[#111] p-4 rounded-xl border border-[#222] space-y-3 relative">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = selectedCrateDetail.items.filter((_, i) => i !== idx);
                                  setSelectedCrateDetail({ ...selectedCrateDetail, items: updated });
                                }}
                                className="absolute top-2 right-2 text-gray-500 hover:text-red-450 font-bold text-xs"
                              >
                                삭제
                              </button>
                              <div className="grid grid-cols-12 gap-3 items-end">
                                <div className="col-span-4">
                                  <label className="block text-[10px] text-gray-500 mb-1 font-bold">아이템 명칭</label>
                                  <input
                                    type="text"
                                    value={item.name}
                                    onChange={(e) => {
                                      const updated = [...selectedCrateDetail.items];
                                      updated[idx] = { ...updated[idx], name: e.target.value };
                                      setSelectedCrateDetail({ ...selectedCrateDetail, items: updated });
                                    }}
                                    className="w-full bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-[10px] text-gray-500 mb-1 font-bold">등급</label>
                                  <select
                                    value={item.rarity}
                                    onChange={(e) => {
                                      const updated = [...selectedCrateDetail.items];
                                      updated[idx] = { ...updated[idx], rarity: e.target.value };
                                      setSelectedCrateDetail({ ...selectedCrateDetail, items: updated });
                                    }}
                                    className="w-full bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                  >
                                    {["ULTIMATE", "LEGENDARY", "EPIC", "RARE"].map(r => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-[10px] text-gray-500 mb-1 font-bold">확률</label>
                                  <input
                                    type="number"
                                    step="0.000001"
                                    value={item.probability}
                                    onChange={(e) => {
                                      const updated = [...selectedCrateDetail.items];
                                      updated[idx] = { ...updated[idx], probability: Number(e.target.value) };
                                      setSelectedCrateDetail({ ...selectedCrateDetail, items: updated });
                                    }}
                                    className="w-full bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-[10px] text-gray-500 mb-1 font-bold">토큰 보상</label>
                                  <input
                                    type="number"
                                    value={item.token_count || 0}
                                    onChange={(e) => {
                                      const updated = [...selectedCrateDetail.items];
                                      updated[idx] = { ...updated[idx], token_count: Number(e.target.value) };
                                      setSelectedCrateDetail({ ...selectedCrateDetail, items: updated });
                                    }}
                                    className="w-full bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                  />
                                </div>
                                <div className="col-span-2 flex items-center h-full pb-2">
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={item.is_prime_parcel || false}
                                      onChange={(e) => {
                                        const updated = [...selectedCrateDetail.items];
                                        updated[idx] = { ...updated[idx], is_prime_parcel: e.target.checked };
                                        setSelectedCrateDetail({ ...selectedCrateDetail, items: updated });
                                      }}
                                      className="w-3.5 h-3.5 rounded border-[#333] bg-[#1c1c1c] text-[#F2A900] focus:ring-0"
                                    />
                                    <span className="text-[10px] text-gray-400 font-bold">꾸러미</span>
                                  </label>
                                </div>
                                <div className="col-span-12">
                                  <label className="block text-[9px] text-gray-500 mb-1 font-bold">이미지 URL / R2 업로드</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      placeholder="/images/crates/파일명.png"
                                      value={item.image_url || ""}
                                      onChange={(e) => {
                                        const updated = [...selectedCrateDetail.items];
                                        updated[idx] = { ...updated[idx], image_url: e.target.value };
                                        setSelectedCrateDetail({ ...selectedCrateDetail, items: updated });
                                      }}
                                      className="flex-1 bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                    />
                                    <div className="relative">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleImageUpload(e, "items", idx)}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                      />
                                      <button
                                        type="button"
                                        className="px-3 py-1.5 bg-[#252525] border border-[#333] hover:bg-[#333] rounded text-[10px] font-bold"
                                      >
                                        📁 업로드
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {crateEditorTab === "prime" && (
                        <div className="space-y-3">
                          {selectedCrateDetail.prime_parcel_items.map((pItem, idx) => (
                            <div key={idx} className="bg-[#111] p-4 rounded-xl border border-[#222] space-y-3 relative">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = selectedCrateDetail.prime_parcel_items.filter((_, i) => i !== idx);
                                  setSelectedCrateDetail({ ...selectedCrateDetail, prime_parcel_items: updated });
                                }}
                                className="absolute top-2 right-2 text-gray-500 hover:text-red-450 font-bold text-xs"
                              >
                                삭제
                              </button>
                              <div className="grid grid-cols-12 gap-3 items-end">
                                <div className="col-span-5">
                                  <label className="block text-[10px] text-gray-500 mb-1 font-bold">꾸러미 획득품 명칭</label>
                                  <input
                                    type="text"
                                    value={pItem.name}
                                    onChange={(e) => {
                                      const updated = [...selectedCrateDetail.prime_parcel_items];
                                      updated[idx] = { ...updated[idx], name: e.target.value };
                                      setSelectedCrateDetail({ ...selectedCrateDetail, prime_parcel_items: updated });
                                    }}
                                    className="w-full bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                  />
                                </div>
                                <div className="col-span-3">
                                  <label className="block text-[10px] text-gray-500 mb-1 font-bold">등급</label>
                                  <select
                                    value={pItem.rarity}
                                    onChange={(e) => {
                                      const updated = [...selectedCrateDetail.prime_parcel_items];
                                      updated[idx] = { ...updated[idx], rarity: e.target.value };
                                      setSelectedCrateDetail({ ...selectedCrateDetail, prime_parcel_items: updated });
                                    }}
                                    className="w-full bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                  >
                                    {["ULTIMATE", "LEGENDARY", "EPIC", "RARE"].map(r => (
                                      <option key={r} value={r}>{r}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-span-4">
                                  <label className="block text-[10px] text-gray-500 mb-1 font-bold">확률</label>
                                  <input
                                    type="number"
                                    step="0.000001"
                                    value={pItem.probability}
                                    onChange={(e) => {
                                      const updated = [...selectedCrateDetail.prime_parcel_items];
                                      updated[idx] = { ...updated[idx], probability: Number(e.target.value) };
                                      setSelectedCrateDetail({ ...selectedCrateDetail, prime_parcel_items: updated });
                                    }}
                                    className="w-full bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                  />
                                </div>
                                <div className="col-span-12">
                                  <label className="block text-[9px] text-gray-500 mb-1 font-bold">이미지 URL / R2 업로드</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      placeholder="/images/crates/파일명.png"
                                      value={pItem.image_url || ""}
                                      onChange={(e) => {
                                        const updated = [...selectedCrateDetail.prime_parcel_items];
                                        updated[idx] = { ...updated[idx], image_url: e.target.value };
                                        setSelectedCrateDetail({ ...selectedCrateDetail, prime_parcel_items: updated });
                                      }}
                                      className="flex-1 bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                    />
                                    <div className="relative">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleImageUpload(e, "prime", idx)}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                      />
                                      <button
                                        type="button"
                                        className="px-3 py-1.5 bg-[#252525] border border-[#333] hover:bg-[#333] rounded text-[10px] font-bold"
                                      >
                                        📁 업로드
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {crateEditorTab === "bonus" && (
                        <div className="space-y-3">
                          {selectedCrateDetail.bonus_items.map((bItem, idx) => (
                            <div key={idx} className="bg-[#111] p-4 rounded-xl border border-[#222] space-y-3 relative">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = selectedCrateDetail.bonus_items.filter((_, i) => i !== idx);
                                  setSelectedCrateDetail({ ...selectedCrateDetail, bonus_items: updated });
                                }}
                                className="absolute top-2 right-2 text-gray-500 hover:text-red-450 font-bold text-xs"
                              >
                                삭제
                              </button>
                              <div className="grid grid-cols-12 gap-3 items-end">
                                <div className="col-span-5">
                                  <label className="block text-[10px] text-gray-500 mb-1 font-bold">보너스 아이템 명칭</label>
                                  <input
                                    type="text"
                                    value={bItem.name}
                                    onChange={(e) => {
                                      const updated = [...selectedCrateDetail.bonus_items];
                                      updated[idx] = { ...updated[idx], name: e.target.value };
                                      setSelectedCrateDetail({ ...selectedCrateDetail, bonus_items: updated });
                                    }}
                                    className="w-full bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                  />
                                </div>
                                <div className="col-span-3">
                                  <label className="block text-[10px] text-gray-500 mb-1 font-bold">확률</label>
                                  <input
                                    type="number"
                                    step="0.000001"
                                    value={bItem.probability}
                                    onChange={(e) => {
                                      const updated = [...selectedCrateDetail.bonus_items];
                                      updated[idx] = { ...updated[idx], probability: Number(e.target.value) };
                                      setSelectedCrateDetail({ ...selectedCrateDetail, bonus_items: updated });
                                    }}
                                    className="w-full bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-[10px] text-gray-500 mb-1 font-bold">토큰 보상</label>
                                  <input
                                    type="number"
                                    value={bItem.token_count || 0}
                                    onChange={(e) => {
                                      const updated = [...selectedCrateDetail.bonus_items];
                                      updated[idx] = { ...updated[idx], token_count: Number(e.target.value) };
                                      setSelectedCrateDetail({ ...selectedCrateDetail, bonus_items: updated });
                                    }}
                                    className="w-full bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                  />
                                </div>
                                <div className="col-span-2 flex flex-col gap-1 items-start justify-center h-full pb-1">
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={bItem.is_prime_parcel || false}
                                      onChange={(e) => {
                                        const updated = [...selectedCrateDetail.bonus_items];
                                        updated[idx] = { ...updated[idx], is_prime_parcel: e.target.checked };
                                        setSelectedCrateDetail({ ...selectedCrateDetail, bonus_items: updated });
                                      }}
                                      className="w-3 h-3 rounded border-[#333] bg-[#1c1c1c] text-[#F2A900] focus:ring-0"
                                    />
                                    <span className="text-[9px] text-gray-400 font-bold">꾸러미</span>
                                  </label>
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={bItem.is_extra_crate || false}
                                      onChange={(e) => {
                                        const updated = [...selectedCrateDetail.bonus_items];
                                        updated[idx] = { ...updated[idx], is_extra_crate: e.target.checked };
                                        setSelectedCrateDetail({ ...selectedCrateDetail, bonus_items: updated });
                                      }}
                                      className="w-3 h-3 rounded border-[#333] bg-[#1c1c1c] text-[#F2A900] focus:ring-0"
                                    />
                                    <span className="text-[9px] text-gray-400 font-bold">상자</span>
                                  </label>
                                </div>
                                <div className="col-span-12">
                                  <label className="block text-[9px] text-gray-500 mb-1 font-bold">이미지 URL / R2 업로드</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      placeholder="/images/crates/파일명.png"
                                      value={bItem.image_url || ""}
                                      onChange={(e) => {
                                        const updated = [...selectedCrateDetail.bonus_items];
                                        updated[idx] = { ...updated[idx], image_url: e.target.value };
                                        setSelectedCrateDetail({ ...selectedCrateDetail, bonus_items: updated });
                                      }}
                                      className="flex-1 bg-[#1c1c1c] border border-[#333] rounded px-3 py-1.5 text-xs text-slate-200"
                                    />
                                    <div className="relative">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleImageUpload(e, "bonus", idx)}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                      />
                                      <button
                                        type="button"
                                        className="px-3 py-1.5 bg-[#252525] border border-[#333] hover:bg-[#333] rounded text-[10px] font-bold"
                                      >
                                        📁 업로드
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className={`w-full py-4 rounded-2xl font-black text-xl shadow-lg transition-all ${
                        isSaving
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                          : "bg-[#F2A900] text-slate-950 hover:bg-[#cc8b00] active:scale-95 cursor-pointer shadow-[#F2A900]/10"
                      }`}
                    >
                      {isSaving ? "⏳ 저장 중..." : "💾 은신처 상점 모든 변경사항 저장하기"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-4">
                <div className="text-6xl text-gray-800">📦</div>
                <div className="font-bold">편집할 은신처 상자를 왼쪽 목록에서 선택해 주세요.</div>
              </div>
            )
          ) : selectedItem ? (
            <div className="max-w-[700px] mx-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-white">{selectedItem.name || "항목 편집"}</h2>
                <button
                  onClick={() => handleDelete(selectedItem.id)}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold px-4 py-2 rounded border border-red-500/30 transition-all"
                >
                  아이템 삭제
                </button>
              </div>

              <form onSubmit={handleSave} className="grid grid-cols-2 gap-6">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-gray-500 mb-2">항목 ID</label>
                  <input
                    id="item-id"
                    name="id"
                    type="text"
                    required
                    value={selectedItem.id}
                    onChange={(e) => setSelectedItem({...selectedItem, id: e.target.value})}
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-gray-500 mb-2">이름</label>
                  <input
                    id="item-name"
                    name="name"
                    type="text"
                    required
                    value={selectedItem.name}
                    onChange={(e) => setSelectedItem({...selectedItem, name: e.target.value})}
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                  />
                </div>

                {activeCategory === "vehicles" ? (
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-500 mb-2">트렁크 용량</label>
                    <input
                      id="vehicle-trunk"
                      name="trunk_capacity"
                      type="number"
                      required
                      value={(selectedItem as Vehicle).trunk_capacity || 0}
                      onChange={(e) => setSelectedItem({...selectedItem, trunk_capacity: Number(e.target.value)} as Vehicle)}
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                    />
                  </div>
                ) : (
                  <>
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-gray-500 mb-2">무게</label>
                      <input
                        id="item-weight"
                        name="weight"
                        type="number"
                        step="0.1"
                        required
                        value={selectedItem.weight || 0}
                        onChange={(e) => setSelectedItem({...selectedItem, weight: Number(e.target.value)})}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                      />
                    </div>
                    <div className="col-span-1 pt-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          id="item-backpack-check"
                          name="can_be_in_backpack"
                          type="checkbox"
                          checked={selectedItem.can_be_in_backpack || false}
                          onChange={(e) => setSelectedItem({...selectedItem, can_be_in_backpack: e.target.checked})}
                          className="w-4 h-4 rounded border-[#333] bg-[#1a1a1a] text-[#F2A900] focus:ring-[#F2A900]"
                        />
                        <span className="text-xs font-bold text-gray-500">배낭 수납 가능</span>
                      </label>
                    </div>
                  </>
                )}

                {activeCategory === "weapons" && (
                  <>
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-gray-500 mb-2">공격력 (Damage)</label>
                      <input
                        id="weapon-damage"
                        name="damage"
                        type="number"
                        value={(selectedItem as Weapon).damage || 0}
                        onChange={(e) => setSelectedItem({...selectedItem, damage: Number(e.target.value)} as Weapon)}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-gray-500 mb-2">탄약 종류</label>
                      <input
                        id="weapon-ammo"
                        name="ammo"
                        type="text"
                        value={(selectedItem as Weapon).ammo || ""}
                        onChange={(e) => setSelectedItem({...selectedItem, ammo: e.target.value} as Weapon)}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-gray-500 mb-2">무기 분류</label>
                      <select
                        id="weapon-type-select"
                        name="type"
                        value={(selectedItem as Weapon).type || "AR"}
                        onChange={(e) => setSelectedItem({...selectedItem, type: e.target.value} as Weapon)}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                      >
                        {["AR", "DMR", "SR", "SMG", "SG", "HG", "LMG", "Melee", "Other"].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-gray-500 mb-2">탄속 (Bullet Speed)</label>
                      <input
                        id="weapon-bullet-speed"
                        name="bullet_speed"
                        type="number"
                        value={(selectedItem as Weapon).bullet_speed || 0}
                        onChange={(e) => setSelectedItem({...selectedItem, bullet_speed: Number(e.target.value)} as Weapon)}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-gray-500 mb-2">획득처 (Availability)</label>
                      <input
                        id="weapon-availability"
                        name="availability"
                        type="text"
                        value={(selectedItem as Weapon).availability || ""}
                        onChange={(e) => setSelectedItem({...selectedItem, availability: e.target.value} as Weapon)}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                      />
                    </div>
                  </>
                )}

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-2">항목 분류 (Type)</label>
                  <input
                    id="item-subtype"
                    name="type"
                    type="text"
                    value={(selectedItem as any).type || ""}
                    onChange={(e) => setSelectedItem({...selectedItem, type: e.target.value} as any)}
                    placeholder="아이템의 세부 분류를 입력하세요 (예: 탄약, 탄창, 손잡이 등)"
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900]"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-2">패치 노 트 / 설명</label>
                  <textarea
                    id="item-patch-notes"
                    name="patch_notes"
                    rows={4}
                    value={selectedItem.patch_notes || ""}
                    onChange={(e) => setSelectedItem({...selectedItem, patch_notes: e.target.value})}
                    placeholder="최근 업데이트 내용이나 아이템 특징을 적어주세요."
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded px-4 py-2.5 text-sm focus:outline-none focus:border-[#F2A900] resize-none"
                  ></textarea>
                </div>

                <div className="col-span-2 pt-6">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className={`w-full py-4 rounded-xl font-black text-lg transition-all ${
                      isSaving ? "bg-gray-700 text-gray-500" : "bg-[#F2A900] text-black hover:bg-[#cc8b00] active:scale-[0.98]"
                    }`}
                  >
                    {isSaving ? "서버에 전송 중..." : "변경 사항 저장하기"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-4">
              <div className="text-6xl text-gray-800">📋</div>
              <div className="font-bold">편집할 아이템을 왼쪽 목록에서 선택해 주세요.</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
