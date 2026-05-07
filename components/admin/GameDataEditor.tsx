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
    const { data, error } = await supabase
      .from(activeCategory)
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Fetch error:", error);
    } else {
      setItems((data as GameItem[]) || []);
      setSelectedItem(null);
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
                onClick={() => setSelectedItem(item)}
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
                    수행 후 '벤치마커 스크립트'를 다시 돌려야 최신 데이터로 채워집니다.
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
