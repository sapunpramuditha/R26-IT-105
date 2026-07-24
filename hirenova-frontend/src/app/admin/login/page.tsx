"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldAlert, Loader2 } from "lucide-react";
import { loginAdmin } from "@/lib/api";
import Cookies from "js-cookie";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await loginAdmin({ username, password });
      Cookies.set("token", res.data.token, { expires: 1 }); // 1 day for admin
      router.push("/admin/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "Login failed. Please check your admin credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 -translate-y-12 inset-x-0 h-[400px] bg-emerald-/50 blur-[120px] rounded-lg pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 md:p-10 rounded-lg bg-white border border-slate-200 shadow-xl"
        >
          <div className="text-center mb-8">
            <img src="/hirenovalogo.png" alt="HireNova Logo" className="h-12 w-auto object-contain mx-auto mb-6" />
            <h2 className="text-3xl font-outfit font-semibold mb-2 text-slate-800">Admin Portal</h2>
            <p className="text-slate-500">Authorized personnel only.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-[#008558] focus:ring-1 focus:ring-[#008558] transition-colors text-slate-800 placeholder:text-slate-400 font-medium"
                placeholder="admin"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-[#008558] focus:ring-1 focus:ring-[#008558] transition-colors text-slate-800 placeholder:text-slate-400 font-medium"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#008558] hover:bg-[#006b47] text-white rounded-lg py-3.5 font-medium transition-all flex justify-center items-center gap-2 mt-4 shadow-lg shadow-emerald-/20 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Secure Login"}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-slate-100 pt-6">
            <Link href="/" className="text-sm font-medium text-slate-500 hover:text-[#008558] transition-colors inline-flex items-center gap-1">
              &larr; Back to Home
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
