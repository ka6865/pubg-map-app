import React, { useState } from "react";
import L from "leaflet";
import { supabase } from "../../lib/supabase";
import { MAP_CATEGORIES, CATEGORY_INFO } from "../../lib/map_config";

interface ReportFormProps {
  location: L.LatLng;
  activeMapId: string;
  icons: Record<string, L.DivIcon>;
  currentUser: any;
  onClose: () => void;
}

const calculateDistanceInMeters = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
) => {
  const pxDistance = Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
  return pxDistance * (8000 / 8192);
};

const ReportForm = ({
  location,
  activeMapId,
  icons,
  currentUser,
  onClose,
}: ReportFormProps) => {
  const [selectedType, setSelectedType] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableCategories =
    MAP_CATEGORIES[activeMapId] || MAP_CATEGORIES["Erangel"];

  const handleSubmit = async () => {
    // 유효성 검사
    if (!currentUser?.id) return alert("로그인 정보가 유효하지 않습니다.");
    if (!selectedType) return alert("제보할 종류를 선택해 주세요!");
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      console.log("🚀 1. 제보 프로세스 시작", {
        activeMapId,
        selectedType,
        location,
      });
      const clickX = location.lng;
      const clickY = location.lat;

      console.log("🔍 2. 기존 대기 중인 제보 데이터 조회 요청");
      const { data: existingReports, error: fetchError } = await supabase
        .from("pending_markers")
        .select("*")
        .eq("map_name", activeMapId)
        .eq("marker_type", selectedType);

      if (fetchError) {
        console.error("❌ 조회 에러 원본:", fetchError);
        throw new Error(
          fetchError.message || "기존 데이터를 불러오는 데 실패했습니다."
        );
      }

      console.log(
        "✅ 3. 조회 완료! 기존 데이터 수:",
        existingReports?.length || 0
      );

      const nearbyReport = existingReports?.find((report) => {
        const distance = calculateDistanceInMeters(
          clickX,
          clickY,
          report.x,
          report.y
        );
        return distance <= 20;
      });

      if (nearbyReport) {
        console.log("🛠️ 4-A. 반경 20m 이내 데이터 발견! 신규 제보 차단 안내", nearbyReport);
        alert("근처 반경 20m 내에 똑같은 차량의 제보가 이미 진행 중입니다!\n지도 위에 표시된 동그란 '제보 진행 중' 마커를 클릭하신 뒤, [👍 여기에 있어요] 버튼을 눌러 교차 검증에 참여해 주세요!");
        setIsSubmitting(false);
        return;
      } else {
        console.log("🆕 4-B. 주변 데이터 없음! 신규 제보(Insert) 진행");

        // 🌟 단일 객체 삽입 방식으로 변경하고 .select()를 붙입니다.
        const { error: insertError } = await supabase
          .from("pending_markers")
          .insert({
            map_name: activeMapId,
            marker_type: selectedType,
            x: clickX,
            y: clickY,
            weight: 1,
            contributor_ids: [currentUser.id],
            is_notified: false,
          })
          .select();

        if (insertError) {
          console.error("❌ 인서트 에러 원본:", insertError);
          throw new Error(
            insertError.message ||
              "새로운 제보를 DB에 저장하는 데 실패했습니다."
          );
        }

        alert("🎉 새로운 제보가 접수되었습니다!");
      }

      console.log("🏁 5. 프로세스 완료 및 폼 닫기");
      onClose();
    } catch (error: any) {
      // 🌟 아무리 치명적인 에러가 나도 이 안에서 잡아서 무한 로딩을 풀어줍니다.
      console.error("💥 최종 에러 포착:", error);
      const errorMsg =
        error?.message ||
        "알 수 없는 오류가 발생했습니다. 개발자 도구(F12) 콘솔을 확인해주세요.";
      alert(`⚠️ 제보 전송 중 오류가 발생했습니다:\n${errorMsg}`);
    } finally {
      // 🌟 정상 처리되든, 에러가 나든 반드시 전송 중 상태를 해제합니다.
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        width: "300px",
        backgroundColor: "#1f2937",
        color: "#ffffff",
        borderRadius: "12px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "sans-serif",
        border: "1px solid #374151",
      }}
    >
      <div
        style={{
          backgroundColor: "#111827",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #374151",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "16px",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "18px" }}>📣</span> 차량 위치 제보
        </h3>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            background: "none",
            border: "none",
            color: "#9ca3af",
            fontSize: "16px",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ✖
        </button>
      </div>

      <div
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div
          style={{
            backgroundColor: "#111827",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "12px",
            color: "#d1d5db",
            border: "1px solid #374151",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>
            🗺️ <b>{activeMapId}</b>
          </span>
          <span>
            📍 {location.lng.toFixed(1)}, {location.lat.toFixed(1)}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "8px",
            maxHeight: "180px",
            overflowY: "auto",
            paddingRight: "4px",
          }}
        >
          {availableCategories.map((categoryId) => {
            const categoryData = CATEGORY_INFO[categoryId];
            if (!categoryData) return null;

            const isSelected = selectedType === categoryId;

            return (
              <button
                key={categoryId}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedType(categoryId);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "12px 4px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  backgroundColor: isSelected ? "#064e3b" : "#374151",
                  border: isSelected
                    ? "2px solid #10b981"
                    : "2px solid transparent",
                  boxShadow: isSelected
                    ? "0 0 10px rgba(16, 185, 129, 0.3)"
                    : "none",
                  transform: isSelected ? "scale(1.05)" : "scale(1)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "40px",
                    marginBottom: "4px",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: (icons[categoryId]?.options.html as string) || "",
                  }}
                />
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: isSelected ? "bold" : "normal",
                    color: isSelected ? "#ffffff" : "#9ca3af",
                    textAlign: "center",
                    lineHeight: "1.2",
                    wordBreak: "keep-all",
                  }}
                >
                  {categoryData.label}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSubmit();
          }}
          disabled={!selectedType || isSubmitting}
          style={{
            width: "100%",
            padding: "12px",
            backgroundColor:
              !selectedType || isSubmitting ? "#4b5563" : "#10b981",
            color: !selectedType || isSubmitting ? "#9ca3af" : "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontWeight: "bold",
            fontSize: "14px",
            cursor: !selectedType || isSubmitting ? "not-allowed" : "pointer",
            boxShadow:
              !selectedType || isSubmitting
                ? "none"
                : "0 4px 6px -1px rgba(16, 185, 129, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            marginTop: "4px",
          }}
        >
          {isSubmitting ? "⏳ 전송 중..." : "🚩 이 차량으로 제보하기"}
        </button>
      </div>
    </div>
  );
};

export default ReportForm;
