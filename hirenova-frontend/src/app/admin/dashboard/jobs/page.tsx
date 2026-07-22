"use client";

import { useEffect, useState } from "react";
import { getJobs, deleteJob } from "@/lib/api";
import { Loader2, Plus, Edit, Trash2, Users, Briefcase, Search, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import Swal from 'sweetalert2';

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Pagination states
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const jobsPerPage = 10;

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const res = await getJobs();
      setJobs(res.data.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete it!'
    });
    
    if (!result.isConfirmed) return;

    try {
      await deleteJob(id);
      setJobs(jobs.filter(j => j._id !== id));
      Swal.fire('Deleted!', 'The job post has been deleted.', 'success');
    } catch (error) {
      console.error("Failed to delete", error);
      Swal.fire('Error!', 'Failed to delete job.', 'error');
    }
  };

  // Filter and paginate
  const filteredJobs = jobs.filter(job => {
    const titleMatch = job.title?.toLowerCase().includes(searchTerm.toLowerCase());
    const domainMatch = job.domain?.toLowerCase().includes(searchTerm.toLowerCase());
    const locationMatch = job.location?.toLowerCase().includes(searchTerm.toLowerCase());
    return titleMatch || domainMatch || locationMatch;
  });
  
  const indexOfLastJob = currentPage * jobsPerPage;
  const indexOfFirstJob = indexOfLastJob - jobsPerPage;
  const currentJobs = filteredJobs.slice(indexOfFirstJob, indexOfLastJob);
  const totalPages = Math.ceil(filteredJobs.length / jobsPerPage);

  if (loading) return <div className="flex justify-center mt-20"><Loader2 className="w-8 h-8 animate-spin text-[#008558]" /></div>;

  return (
    <div>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <h1 className="text-3xl font-outfit font-semibold text-slate-800">Job Posts</h1>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1); // Reset to first page on search
              }}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#008558] focus:ring-1 focus:ring-[#008558] transition-all"
            />
          </div>
          <Link 
            href="/admin/dashboard/jobs/create" 
            className="flex items-center gap-2 bg-[#008558] hover:bg-[#006b47] text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm text-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Create Job
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
                <th className="p-4 font-semibold">Job Title</th>
                <th className="p-4 font-semibold">Domain & Location</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentJobs.map((job) => (
                <tr key={job._id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald- text-[#008558] flex items-center justify-center">
                        <Briefcase className="w-5 h-5" />
                      </div>
                      <div>
                          <div className="font-semibold text-slate-800">{job.title}</div>
                          <div className="text-xs text-slate-500">{job.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-slate-600 text-sm">
                    <div>{job.domain}</div>
                    <div className="text-xs text-slate-500">{job.location || 'Colombo'}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-lg text-xs font-medium border ${job.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {job.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link 
                          href={`/admin/dashboard/jobs/${job._id}/applications`} 
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Applications"
                      >
                          <Users className="w-4 h-4" />
                      </Link>
                      <Link 
                          href={`/admin/dashboard/jobs/${job._id}/edit`} 
                          className="p-2 text-[#008558] hover:bg-emerald- rounded-lg transition-colors"
                          title="Edit Job"
                      >
                          <Edit className="w-4 h-4" />
                      </Link>
                      <button 
                          onClick={() => handleDelete(job._id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Job"
                      >
                          <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {currentJobs.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    {searchTerm ? "No jobs match your search." : "No jobs found. Create one to get started."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-900">{indexOfFirstJob + 1}</span> to <span className="font-medium text-slate-900">{Math.min(indexOfLastJob, filteredJobs.length)}</span> of <span className="font-medium text-slate-900">{filteredJobs.length}</span> results
            </span>
            <div className="flex gap-1">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center px-4 text-sm font-medium text-slate-700">
                Page {currentPage} of {totalPages}
              </div>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
