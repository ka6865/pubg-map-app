"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { MAP_CATEGORIES } from "../../lib/map_config";
import { updateMapSettings, getMapSettings } from "../../app/actions/map-settings";
import { useMapSettings } from "@/hooks/useMapSettings";

const MAP_LIST = [
  { id: "Erangel", label: "에란겔" },
  { id: "Miramar", label: "미라마" },
  { id: "Taego", label: "태이고" },
  { id: "Rondo", label: "론도" },
  { id: "Vikendi", label: "비켄디" },
  { id: "Deston", label: "데스턴" },
];

export default function MapSettingsEditor() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedMap, setSelectedMap] = useState(MAP_LIST[0].id);
  const [dbSettings, setDbSettings] = useState<Record<string, string[]>>({});
  const [currentCategories, setCurrentCategories] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // 관리자 권한 확인
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

  // DB에서 데이터 로드
  useEffect(() => {
    if (!isAuthorized) return;

    const loadSettings = async () => {
      const data = await getMapSettings();
      const settingsMap: Record<string, string[]> = {};
      data.forEach((item: any) => {
        settingsMap[item.map_id] = item.categories;
      });
      setDbSettings(settingsMap);
    };
    loadSettings();
  }, [isAuthorized]);

  // 맵 변경 시 현재 카테고리 업데이트
  useEffect(() => {
    const categories = dbSettings[selectedMap] || MAP_CATEGORIES[selectedMap] || [];
    setCurrentCategories(categories);
  }, [selectedMap, dbSettings]);

  const handleCategoryToggle = (categoryKey: string) => {
    setCurrentCategories(prev => 
      prev.includes(categoryKey)
        ? prev.filter(k => k !== categoryKey)
        : [...prev, categoryKey]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateMapSettings(selectedMap, currentCategories);
      
      // 로컬 상태 업데이트
      setDbSettings(prev => ({
        ...prev,
        [selectedMap]: currentCategories
      }));
      
      toast.success(`${selectedMap} 맵 설정이 저장되었습니다.`);
    } catch (err: any) {
      toast.error("저장 중 오류 발생: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // DB 기반 카테고리 마스터 정보 로드 (선택된 맵 없이 전역으로 사용)
  const { categoryInfoMap } = useMapSettings(selectedMap);

  if (!isAuthorized) return null;

  const allCategoryKeys = Object.keys(categoryInfoMap);

  return (
    <div className="flex flex-col h-screen text-gray-200">
      <header className="flex items-center justify-between h-[60px] px-6 bg-[#1a1a1a] border-b border-[#333]">
        <div className="flex items-center gap-6">
          <div className="text-xl font-black text-[#F2A900] italic">배그<span className="text-white"> 맵 설정 관리자</span></div>
        </div>
        <button onClick={() => router.push("/admin/game-data")} className="text-sm font-bold text-gray-400 hover:text-white transition-colors">
          아이템 관리로 이동
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바: 맵 리스트 */}
        <aside className="w-[280px] bg-[#141414] border-r border-[#333] flex flex-col">
          <div className="p-4 border-b border-[#222] bg-[#1a1a1a]">
            <h3 className="text-sm font-bold text-gray-400">대상 맵 선택</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {MAP_LIST.map(map => (
              <div
                key={map.id}
                onClick={() => setSelectedMap(map.id)}
                className={`p-5 border-b border-[#222] cursor-pointer transition-colors hover:bg-[#1a1a1a] ${
                  selectedMap === map.id ? "bg-[#1a1a1a] border-l-4 border-l-[#F2A900]" : ""
                }`}
              >
                <div className="font-bold text-lg">{map.label}</div>
                <div className="text-xs text-gray-500 font-mono mt-1">{map.id}</div>
              </div>
            ))}
          </div>
        </aside>

        {/* 메인: 카테고리 체크박스 목록 */}
        <main className="flex-1 bg-[#0d0d0d] p-10 overflow-y-auto">
          <div className="max-w-[800px] mx-auto">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h2 className="text-3xl font-black text-white">{MAP_LIST.find(m => m.id === selectedMap)?.label} 맵 노출 설정</h2>
                <p className="text-gray-500 mt-2">해당 맵의 사이드바 필터 및 제보 폼에 표시될 카테고리를 선택하세요.</p>
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`px-8 py-3 rounded-xl font-black text-lg shadow-lg transition-all ${
                  isSaving ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-[#F2A900] text-black hover:bg-[#cc8b00] active:scale-[0.98]"
                }`}
              >
                {isSaving ? "저장 중..." : "설정 저장하기"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allCategoryKeys.map(key => {
                const info = categoryInfoMap[key];
                if (!info) return null;
                const isActive = currentCategories.includes(key);
                
                return (
                  <div 
                    key={key}
                    onClick={() => handleCategoryToggle(key)}
                    className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-4 ${
                      isActive 
                        ? "bg-[#F2A900]/10 border-[#F2A900] shadow-[0_0_15px_rgba(242,169,0,0.1)]" 
                        : "bg-[#1a1a1a] border-[#333] hover:border-gray-500"
                    }`}
                  >
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-md"
                      style={{ backgroundColor: info.color + '22', color: info.color }}
                    >
                      {info.iconType}
                    </div>
                    <div>
                      <div className={`font-bold ${isActive ? "text-white" : "text-gray-400"}`}>{info.label}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{key}</div>
                    </div>
                    
                    {/* 체크 표시 */}
                    {isActive && (
                      <div className="absolute top-2 right-2 text-[#F2A900]">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-12 p-6 rounded-xl bg-blue-500/5 border border-blue-500/20 text-blue-400/80 text-sm">
              <h4 className="font-bold flex items-center gap-2 mb-2">
                <span className="text-lg">ℹ️</span> 안내 사항
              </h4>
              <ul className="list-disc list-inside space-y-1">
                <li>항목을 체크하면 즉시 해당 맵의 유저 화면에 반영됩니다.</li>
                <li>카테고리 정보(라벨, 색상 등)는 <code className="bg-blue-500/10 px-1 rounded text-blue-300">lib/map_config.ts</code>에서 관리됩니다.</li>
                <li>새로운 종류의 아이템 아이콘을 추가하고 싶다면 코드 수정을 진행한 후 여기서 활성화하세요.</li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
