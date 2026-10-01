"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ADMIN_PASSWORD = "qwertyno1";
const ADMIN_AUTH_SESSION_KEY = "admin_auth_session";

export default function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const authSession = sessionStorage.getItem(ADMIN_AUTH_SESSION_KEY);
      if (authSession === "authenticated") {
        setIsAuthenticated(true);
      }
      setIsChecking(false);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (password === ADMIN_PASSWORD) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, "authenticated");
      }
      setIsAuthenticated(true);
    } else {
      setErrorMsg("비밀번호가 올바르지 않습니다.");
    }
  };

  const handleCancel = () => {
    router.replace("/");
  };

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm text-neutral-400">관리자 인증 확인 중...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <form
          onSubmit={handleLogin}
          className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold text-white">관리자 인증</h2>
            <p className="text-xs text-neutral-400">
              관리자 페이지에 접근하려면 비밀번호를 입력하세요.
            </p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-300">비밀번호</span>
            <input
              type="password"
              autoFocus
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-white focus:outline-none"
              placeholder="비밀번호 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {errorMsg && (
            <div className="rounded-md bg-red-950/50 border border-red-800/60 p-2 text-xs text-red-400">
              {errorMsg}
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg border border-white bg-white py-2 text-xs font-bold text-black transition-colors hover:bg-neutral-200"
            >
              확인
            </button>
          </div>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
