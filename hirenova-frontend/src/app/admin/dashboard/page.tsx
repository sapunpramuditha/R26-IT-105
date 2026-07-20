"use client";

import { useEffect, useState } from "react";
import { getJobs, getUsers } from "@/lib/api";
import { Briefcase, Users, FileText, Loader2 } from "lucide-react";
import Link from "next/link";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ jobs: 0, users: 0, apps: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [jobsResult, usersResult] = await Promise.allSettled([
          getJobs(),
          getUsers()
        ]);

        let jobsCount = 0;
        let usersCount = 0;

        if (jobsResult.status === 'fulfilled') {
          jobsCount = jobsResult.value.data.count || jobsResult.value.data.data.length;
        }
        
        if (usersResult.status === 'fulfilled') {
          usersCount = usersResult.value.data.count || usersResult.value.data.data.length;
        }

        setStats({
          jobs: jobsCount,
          users: usersCount,
          apps: 0
        });
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <div className="flex justify-center mt-20"><Loader2 className="w-8 h-8 animate-spin text-[#008558]" /></div>;

  return (
    <div>
      <h1 className="text-3xl font-outfit font-semibold text-slate-800 mb-8">Dashboard Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 bg-emerald- text-[#008558] rounded-lg flex items-center justify-center">
            <Briefcase className="w-7 h-7" />
          </div>
          <div>
            <p className="text-slate-500 font-medium">Total Jobs</p>
            <h3 className="text-3xl font-semibold text-slate-800">{stats.jobs}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <p className="text-slate-500 font-medium">Registered Users</p>
            <h3 className="text-3xl font-semibold text-slate-800">{stats.users}</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
            <FileText className="w-7 h-7" />
          </div>
          <div>
            <p className="text-slate-500 font-medium">Total Applications</p>
            <h3 className="text-3xl font-semibold text-slate-800">--</h3>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-800 mb-4 font-outfit">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Link href="/admin/dashboard/jobs/create" className="bg-[#008558] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#006b47] transition-colors shadow-sm text-sm">
            + Create New Job
          </Link>
          <Link href="/admin/dashboard/users" className="bg-white border border-slate-300 text-slate-700 px-6 py-3 rounded-lg font-medium hover:bg-slate-50 transition-colors text-sm">
            View All Candidates
          </Link>
        </div>
      </div>
    </div>
  );
}
