"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, User } from "firebase/auth";

export default function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const auth = getFirebaseAuth();
    if (!auth) return;

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      setErrorMsg("로그인에 실패했습니다: " + e.message);
    }
  };

  if (loading) {
    return <div className="p-4 text-white">Loading admin session...</div>;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white px-4">
        <form onSubmit={handleLogin} className="flex flex-col gap-4 p-8 border border-white/20 rounded-md w-full max-w-sm">
          <h2 className="text-xl font-bold mb-4">관리자 로그인</h2>
          
          <label className="flex flex-col gap-1">
            <span className="text-sm">이메일</span>
            <input 
              type="email" 
              className="px-3 py-2 bg-neutral-900 border border-white/30 rounded focus:border-white focus:outline-none"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm">비밀번호</span>
            <input 
              type="password" 
              className="px-3 py-2 bg-neutral-900 border border-white/30 rounded focus:border-white focus:outline-none"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>

          {errorMsg && <div className="text-red-500 text-sm mt-2">{errorMsg}</div>}

          <div className="flex gap-2 mt-4">
            <button 
              type="button" 
              onClick={() => router.replace("/")}
              className="flex-1 py-2 border border-white/30 rounded hover:bg-neutral-800 transition-colors"
            >
              취소
            </button>
            <button 
              type="submit" 
              className="flex-1 py-2 bg-white text-black font-bold rounded hover:bg-neutral-200 transition-colors"
            >
              로그인
            </button>
          </div>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
