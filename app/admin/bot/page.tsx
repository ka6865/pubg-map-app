"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminAgentChat from "@/components/admin/AdminAgentChat";
import { supabase } from "@/lib/supabase";

export default function AdminBotPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [prefillPrompt, setPrefillPrompt] = useState("");
  const [prefillVersion, setPrefillVersion] = useState(0);

  useEffect(() => {
    async function checkAdmin() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profile?.role === "admin") {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
        alert("관리자 권한이 없습니다.");
        router.push("/");
      }
    }

    checkAdmin();
  }, [router]);

  useEffect(() => {
    if (!isAdmin) return;

    const params = new URLSearchParams(window.location.search);
    const approvalId = params.get("approval");
    const section = params.get("section");
    const prompt = params.get("prompt");

    if (approvalId) {
      router.replace(`/admin/dashboard?section=approvals&approval=${encodeURIComponent(approvalId)}`);
      return;
    }

    if (section && ["approvals", "status", "memories", "guide", "today"].includes(section)) {
      router.replace(`/admin/dashboard?section=${encodeURIComponent(section)}`);
      return;
    }

    if (prompt) {
      setPrefillPrompt(prompt);
      setPrefillVersion((value) => value + 1);
    }
  }, [isAdmin, router]);

  if (isAdmin === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-amber-500" />
        <span className="text-sm font-medium">관리자 권한 조회 중...</span>
      </div>
    );
  }

  return (
    <AdminAgentChat
      mode="page"
      prefillPrompt={prefillPrompt}
      prefillVersion={prefillVersion}
      onBack={() => router.push("/admin/dashboard")}
      onOpenDashboard={() => router.push("/admin/dashboard")}
      onOpenApprovals={(approvalId) => {
        if (approvalId) {
          router.push(`/admin/dashboard?section=approvals&approval=${encodeURIComponent(approvalId)}`);
          return;
        }
        router.push("/admin/dashboard?section=approvals");
      }}
    />
  );
}
