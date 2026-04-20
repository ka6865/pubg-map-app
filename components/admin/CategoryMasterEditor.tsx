"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { ICON_LIBRARY } from "@/lib/map_config";
import {
  getAllCategories,
  upsertCategory,
  deactivateCategory,
  activateCategory,
  type CategoryRow,
} from "@/app/actions/map-settings";

const COLORS_PRESET = [
  "#ef4444", "#f97316", "#eab308", "#84cc16", "#10b981",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#a855f7", "#ec4899",
  "#d8b4fe", "#0ea5e9", "#64748b", "#F2A900", "#ffffff",
];

interface CategoryMasterEditorProps {
  onRefresh?: () => void;
}

export default function CategoryMasterEditor({ onRefresh }: CategoryMasterEditorProps) {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddMode, setIsAddMode] = useState(false);

  // 편집 폼 상태
  const [formLabel, setFormLabel] = useState("");
  const [formColor, setFormColor] = useState("#F2A900");
  const [formIconId, setFormIconId] = useState("car");
  const [formSortOrder, setFormSortOrder] = useState(0);

  const loadCategories = useCallback(async () => {
    const data = await getAllCategories();
    setCategories(data);
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const startEdit = (cat: CategoryRow) => {
    setIsAddMode(false);
    setEditingId(cat.id);
    setFormLabel(cat.label);
    setFormColor(cat.color);
    setFormIconId(cat.icon_id);
    setFormSortOrder(cat.sort_order);
  };

  const startAdd = () => {
    setEditingId(null);
    setIsAddMode(true);
    setFormLabel("");
    setFormColor("#F2A900");
    setFormIconId("car");
    setFormSortOrder((categories.length + 1) * 10);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAddMode(false);
  };

  const handleSave = async () => {
    if (!formLabel.trim()) {
      toast.error("카테고리 이름을 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    try {
      let id: string;
      if (isAddMode) {
        // 새 ID 자동 생성 (타임스탬프 기반)
        const base = formLabel.replace(/\s+/g, "").replace(/[^a-zA-Z0-9가-힣]/g, "");
        id = `Cat_${base}_${Date.now()}`;
      } else {
        id = editingId!;
      }

      await upsertCategory({
        id,
        label: formLabel.trim(),
        color: formColor,
        icon_id: formIconId,
        is_active: true,
        sort_order: formSortOrder,
      });

      toast.success(isAddMode ? "카테고리가 추가되었습니다." : "카테고리가 수정되었습니다.");
      await loadCategories();
      cancelEdit();
      onRefresh?.();
    } catch (err: any) {
      toast.error("저장 실패: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async (cat: CategoryRow) => {
    if (!confirm(`'${cat.label}' 카테고리를 숨김 처리하시겠습니까?\n기존 마커는 DB에 유지됩니다.`)) return;
    try {
      await deactivateCategory(cat.id);
      toast.success(`'${cat.label}' 카테고리가 숨겨졌습니다.`);
      await loadCategories();
      onRefresh?.();
    } catch (err: any) {
      toast.error("처리 실패: " + err.message);
    }
  };

  const handleActivate = async (cat: CategoryRow) => {
    try {
      await activateCategory(cat.id);
      toast.success(`'${cat.label}' 카테고리가 활성화되었습니다.`);
      await loadCategories();
      onRefresh?.();
    } catch (err: any) {
      toast.error("처리 실패: " + err.message);
    }
  };

  const activeList = categories.filter((c) => c.is_active);
  const inactiveList = categories.filter((c) => !c.is_active);

  return (
    <div className="max-w-[900px] mx-auto">
      {/* 헤더 */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-black text-white">카테고리 마스터 관리</h2>
          <p className="text-gray-500 mt-1 text-sm">아이콘, 색상, 이름을 수정하거나 새 카테고리를 추가하세요.</p>
        </div>
        <button
          onClick={startAdd}
          className="px-6 py-2.5 bg-[#F2A900] text-black rounded-xl font-black text-sm hover:bg-[#cc8b00] active:scale-95 transition-all"
        >
          + 새 카테고리 추가
        </button>
      </div>

      {/* 새 카테고리 추가 / 편집 폼 */}
      {(isAddMode || editingId) && (
        <div className="mb-8 p-6 rounded-2xl bg-[#1a1a1a] border-2 border-[#F2A900]/50">
          <h3 className="text-lg font-black text-[#F2A900] mb-5">
            {isAddMode ? "새 카테고리 추가" : `'${categories.find(c => c.id === editingId)?.label}' 수정`}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 이름 */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-bold text-gray-500 mb-2">카테고리 이름 *</label>
              <input
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="예) 에어보트, 트럭 등"
                className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#F2A900]"
              />
            </div>

            {/* 정렬 순서 */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-bold text-gray-500 mb-2">표시 순서 (숫자가 작을수록 앞)</label>
              <input
                type="number"
                value={formSortOrder}
                onChange={(e) => setFormSortOrder(Number(e.target.value))}
                className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#F2A900]"
              />
            </div>

            {/* 아이콘 선택 라이브러리 */}
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 mb-2">아이콘 선택</label>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(ICON_LIBRARY).map(([id, icon]) => (
                  <button
                    key={id}
                    onClick={() => setFormIconId(id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all w-[80px] ${
                      formIconId === id
                        ? "border-[#F2A900] bg-[#F2A900]/10"
                        : "border-[#333] bg-[#111] hover:border-gray-500"
                    }`}
                  >
                    {/* 아이콘 미리보기 */}
                    <svg
                      viewBox="0 0 24 24"
                      width="28"
                      height="28"
                      fill={formIconId === id ? formColor : "#666"}
                    >
                      <path d={icon.path} />
                    </svg>
                    <span className="text-[10px] text-gray-400 font-bold">{icon.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 색상 선택 */}
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 mb-2">마커 색상</label>
              <div className="flex items-center gap-3 flex-wrap">
                {/* 프리셋 색상들 */}
                {COLORS_PRESET.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formColor === c ? "border-white scale-110" : "border-transparent hover:border-gray-500"
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                {/* 직접 입력 컬러피커 */}
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                    title="직접 선택"
                  />
                  <span className="text-xs text-gray-500 font-mono">{formColor}</span>
                </div>
              </div>
              {/* 미리보기 */}
              <div className="mt-4 flex items-center gap-3">
                <span className="text-xs text-gray-500">미리보기:</span>
                <div
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border"
                  style={{ borderColor: formColor, backgroundColor: formColor + '15' }}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill={formColor}>
                    <path d={ICON_LIBRARY[formIconId]?.path} />
                  </svg>
                  <span className="text-sm font-bold" style={{ color: formColor }}>
                    {formLabel || "카테고리 이름"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all ${
                isSaving
                  ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                  : "bg-[#F2A900] text-black hover:bg-[#cc8b00] active:scale-95"
              }`}
            >
              {isSaving ? "저장 중..." : "저장하기"}
            </button>
            <button
              onClick={cancelEdit}
              className="px-6 py-2.5 rounded-xl font-bold text-sm text-gray-400 hover:text-white bg-[#222] hover:bg-[#333] transition-all"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 활성 카테고리 목록 */}
      <div className="mb-6">
        <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-3">활성화된 카테고리 ({activeList.length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {activeList.map((cat) => {
            const icon = ICON_LIBRARY[cat.icon_id];
            return (
              <div
                key={cat.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                  editingId === cat.id
                    ? "border-[#F2A900] bg-[#F2A900]/5"
                    : "border-[#333] bg-[#141414] hover:border-gray-600"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: cat.color + '22' }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill={cat.color}>
                      <path d={icon?.path || ICON_LIBRARY.car.path} />
                    </svg>
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">{cat.label}</div>
                    <div className="text-[10px] text-gray-500 font-mono">{cat.id}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(cat)}
                    className="px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white bg-[#222] hover:bg-[#333] rounded-lg transition-all"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDeactivate(cat)}
                    className="px-3 py-1.5 text-xs font-bold text-red-500/70 hover:text-red-400 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    숨김
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 비활성 카테고리 목록 */}
      {inactiveList.length > 0 && (
        <div className="mt-8 pt-8 border-t border-[#222]">
          <h3 className="text-sm font-black text-gray-600 uppercase tracking-widest mb-3">
            숨김 처리된 카테고리 ({inactiveList.length}) — 기존 마커는 DB에 유지 중
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {inactiveList.map((cat) => {
              const icon = ICON_LIBRARY[cat.icon_id];
              return (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-4 rounded-xl border border-[#222] bg-[#0f0f0f] opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#222] flex items-center justify-center">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="#555">
                        <path d={icon?.path || ICON_LIBRARY.car.path} />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-gray-500 text-sm line-through">{cat.label}</div>
                      <div className="text-[10px] text-gray-700 font-mono">{cat.id}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleActivate(cat)}
                    className="px-3 py-1.5 text-xs font-bold text-green-500/80 hover:text-green-400 bg-green-500/5 hover:bg-green-500/10 rounded-lg transition-all"
                  >
                    복구
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
