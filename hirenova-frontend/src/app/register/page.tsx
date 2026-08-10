"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { UserPlus, Loader2, ArrowRight } from "lucide-react";
import { registerUser } from "@/lib/api";
import Cookies from "js-cookie";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await registerUser({ name, email, password });
      Cookies.set("token", res.data.token, { expires: 30 }); // 30 days
      router.push("/"); // Redirect to home after register
    } catch (err: any) {
      setError(err.response?.data?.error || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4.5rem)] bg-slate-50 flex flex-col justify-center py-20 relative overflow-hidden sm:px-6 lg:px-8">
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
            <h2 className="text-3xl font-outfit font-semibold mb-2 text-slate-800">Create an Account</h2>
            <p className="text-slate-500">Join HireNova and find your dream job.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-6">
             <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-[#008558] focus:ring-1 focus:ring-[#008558] transition-colors text-slate-800 placeholder:text-slate-400 font-medium"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-[#008558] focus:ring-1 focus:ring-[#008558] transition-colors text-slate-800 placeholder:text-slate-400 font-medium"
                placeholder="you@example.com"
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
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#008558] hover:bg-[#006b47] text-white rounded-lg py-3.5 font-medium transition-all flex justify-center items-center gap-2 shadow-lg shadow-emerald-/20 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><UserPlus className="w-5 h-5" /> Sign Up</>}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-slate-500 text-sm">
              Already have an account?{" "}
              <Link href="/login" className="text-[#008558] hover:text-[#006b47] font-medium inline-flex items-center gap-1 transition-colors">
                Sign in <ArrowRight className="w-3 h-3" />
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
