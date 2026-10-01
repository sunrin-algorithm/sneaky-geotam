"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveInspections } from "@/lib/hooks";

interface AdminNavProps {
  active?: "admin" | "reserve" | "log";
}

const LAST_SEEN_LOG_KEY = "admin_last_seen_log_time";

export default function AdminNav({ active }: AdminNavProps) {
  const pathname = usePathname();
  const currentTab =
    active ||
    (pathname.startsWith("/admin")
      ? "admin"
      : pathname.startsWith("/reserve/admin")
      ? "reserve"
      : pathname.startsWith("/log")
      ? "log"
      : undefined);

  const { data: inspections } = useLiveInspections();
  const [lastSeenTime, setLastSeenTime] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (currentTab === "log") {
      const now = new Date().toISOString();
      sessionStorage.setItem(LAST_SEEN_LOG_KEY, now);
      setLastSeenTime(now);
    } else {
      const saved = sessionStorage.getItem(LAST_SEEN_LOG_KEY);
      if (!saved) {
        const now = new Date().toISOString();
        sessionStorage.setItem(LAST_SEEN_LOG_KEY, now);
        setLastSeenTime(now);
      } else {
        setLastSeenTime(saved);
      }
    }
  }, [currentTab]);

  const newLogBadge = useMemo(() => {
    if (!lastSeenTime || currentTab === "log") return null;

    const lastSeenMs = new Date(lastSeenTime).getTime();
    const newSessions = inspections.filter((s) => {
      if (s.status === "retracted") return false;
      const createdMs = new Date(s.createdAt).getTime();
      return createdMs > lastSeenMs;
    });

    if (newSessions.length === 0) return null;

    const latestParticipant = newSessions[0].participantName;
    const count = newSessions.length;

    return {
      text: `${latestParticipant} +${count}`,
      count,
    };
  }, [inspections, lastSeenTime, currentTab]);

  const [notification, setNotification] = useState<{ text: string, id: number } | null>(null);

  useEffect(() => {
    if (newLogBadge) {
      setNotification({ text: newLogBadge.text, id: Date.now() });
    }
  }, [newLogBadge?.count]); // Trigger only when count changes

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [notification?.id]);

  return (
    <nav className="my-6 flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-4">
      <Link
        href="/admin"
        className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
          currentTab === "admin"
            ? "border border-black bg-black !text-white"
            : "border border-neutral-300 bg-white text-neutral-800 hover:border-black hover:text-black"
        }`}
      >
        기록 작업
      </Link>

      <Link
        href="/reserve/admin"
        className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
          currentTab === "reserve"
            ? "border border-black bg-black !text-white"
            : "border border-neutral-300 bg-white text-neutral-800 hover:border-black hover:text-black"
        }`}
      >
        예약 관리
      </Link>

      <div className="ml-auto relative flex items-center">
        <Link
          href="/log"
          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
            currentTab === "log"
              ? "border border-black bg-black !text-white"
              : "border border-neutral-300 bg-white text-neutral-800 hover:border-black hover:text-black"
          }`}
        >
          LOG
        </Link>

        {/* Slide/Fade absolute overlay for LOG notification */}
        <div
          className={`absolute right-[calc(100%+8px)] top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none transition-all duration-500 ${
            notification
              ? "opacity-100 translate-x-0"
              : "opacity-0 translate-x-4"
          }`}
        >
          {notification && (
            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
              {notification.text}
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}
