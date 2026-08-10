"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getMyApplications, api } from "@/lib/api";
import { Loader2, Briefcase, Calendar, CheckCircle, Clock, XCircle, Mail, UserCircle } from "lucide-react";
import Link from "next/link";

export default function ProfilePage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userRes, appsRes] = await Promise.all([
          api.get('/auth/me'),
          getMyApplications()
        ]);
        setUser(userRes.data.data);
        setApplications(appsRes.data.data);
      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Accepted': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'Rejected': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'Interviewing': return <Briefcase className="w-5 h-5 text-[#008558]" />;
      case 'Completed': return <CheckCircle className="w-5 h-5 text-blue-500" />;
      default: return <Clock className="w-5 h-5 text-amber-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col py-20 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 -translate-y-12 inset-x-0 h-[400px] bg-emerald-/50 blur-[120px] rounded-lg pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl font-outfit font-semibold text-slate-800">My Profile</h1>
        <p className="text-slate-500 mt-2">Manage your account and track the status of your job applications.</p>
      </div>

      {user && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 sm:p-8 mb-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 relative overflow-hidden">
          {/* Subtle background glow for the profile card */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#008558]/5 rounded-full blur-[60px] pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="w-24 h-24 bg-emerald- text-[#008558] rounded-full flex items-center justify-center text-4xl font-bold uppercase border-4 border-emerald- shadow-sm shrink-0 z-10">
            {user.name ? user.name.charAt(0) : "U"}
          </div>
          <div className="text-center sm:text-left z-10">
            <h2 className="text-2xl font-outfit font-bold text-slate-800">{user.name}</h2>
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-slate-500 mt-3">
              <span className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 text-sm font-medium">
                <Mail className="w-4 h-4 text-[#008558]" /> {user.email}
              </span>
              <span className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 text-sm font-medium">
                <UserCircle className="w-4 h-4 text-[#008558]" /> Candidate
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden z-10 relative">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
            <h2 className="font-semibold text-slate-800 text-lg">Applied Jobs</h2>
        </div>
        
        {loading ? (
           <div className="flex justify-center py-12">
             <Loader2 className="w-8 h-8 animate-spin text-[#008558]" />
           </div>
        ) : applications.length === 0 ? (
            <div className="text-center py-12">
                <p className="text-slate-500 mb-4">You haven't applied to any jobs yet.</p>
                <Link href="/jobs" className="text-[#008558] font-medium hover:underline">Browse open positions</Link>
            </div>
        ) : (
            <div className="divide-y divide-slate-100">
                {applications.map((app) => (
                    <motion.div initial={{opacity:0}} animate={{opacity:1}} key={app._id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                        <div>
                            <Link href={`/jobs/${app.job_id.slug}`} className="text-lg font-semibold text-slate-800 hover:text-[#008558] transition-colors font-outfit">
                                {app.job_id.title}
                            </Link>
                            <div className="flex items-center gap-3 text-sm text-slate-500 mt-2">
                                <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {app.job_id.domain}</span>
                                <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {new Date(app.appliedAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
                            {app.status === 'Interviewing' ? (
                                <Link 
                                    href={`/interview/${app._id}`}
                                    className="flex items-center gap-2 bg-[#008558] hover:bg-[#006b47] text-white px-6 py-2 rounded-lg font-semibold shadow-lg shadow-emerald-/20 transition-all hover:scale-105 active:scale-[0.98]"
                                >
                                    Start AI Interview
                                </Link>
                            ) : ['Written Assessment Pending', 'Written Assessment In Progress'].includes(app.status) ? (
                                <Link
                                    href={`/assessment/${app._id}`}
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                                >
                                    {app.status === 'Written Assessment In Progress' ? 'Continue Written Assessment' : 'Start Written Assessment'}
                                </Link>
                            ) : app.status === 'Completed' ? (
                                <button 
                                    disabled
                                    className="flex items-center gap-2 bg-slate-200 text-slate-400 px-6 py-2 rounded-lg font-semibold cursor-not-allowed"
                                >
                                    Interview Completed
                                </button>
                            ) : null}
                            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                                {getStatusIcon(app.status)}
                                <span className="font-medium text-slate-700">{app.status}</span>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        )}
      </div>
      </div>
    </div>
  );
}
