"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Briefcase, FileText, LogOut, Menu, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Cookies from "js-cookie";
import { api } from "@/lib/api";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [adminName, setAdminName] = useState("Admin");
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Check if token exists
    const token = Cookies.get("token");
    if (!token) {
      window.location.href = "/admin/login";
      return;
    }

    // Verify admin role
    const fetchAdmin = async () => {
      try {
        const res = await api.get('/auth/me');
        if (res.data?.data?.role !== 'admin') {
          // If not an admin role, redirect to admin login
          Cookies.remove("token");
          window.location.href = "/admin/login";
          return;
        }

        if (res.data?.data?.name || res.data?.data?.username) {
          setAdminName(res.data.data.name || res.data.data.username);
        }
        setIsAuthorized(true);
      } catch (error) {
        console.error("Failed to verify admin credentials:", error);
        Cookies.remove("token");
        window.location.href = "/admin/login";
      } finally {
        setLoading(false);
      }
    };

    fetchAdmin();
  }, []);

  const handleLogout = () => {
    Cookies.remove("token");
    window.location.href = "/admin/login";
  };

  const navItems = [
    { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Users", href: "/admin/dashboard/users", icon: Users },
    { name: "Jobs", href: "/admin/dashboard/jobs", icon: Briefcase },
    { name: "Assessment Papers", href: "/admin/dashboard/assessments", icon: FileText },
  ];

  const sidebarWidth = isDesktopCollapsed ? "w-20" : "w-64";

  if (loading || !isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#008558]" />
          <p className="text-sm font-medium text-slate-500">Verifying administrative access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200 flex flex-col transition-all duration-300 transform 
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} 
          lg:translate-x-0 ${sidebarWidth}`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
          {!isDesktopCollapsed && (
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <img src="/hirenovalogo.png" alt="Logo" className="h-7 w-auto" />
            </Link>
          )}
          {isDesktopCollapsed && (
            <div className="w-full flex justify-center">
              <span className="font-bold text-[#008558] text-xl">HN</span>
            </div>
          )}
          
          <button 
            className="lg:hidden text-slate-500 hover:text-slate-700"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {!isDesktopCollapsed && (
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Admin Controls</p>
          )}
          
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/admin/dashboard' && pathname.startsWith(item.href + '/'));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors font-medium text-sm ${
                    isActive
                      ? "bg-emerald- text-[#008558]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  } ${isDesktopCollapsed ? "justify-center" : ""}`}
                  title={isDesktopCollapsed ? item.name : ""}
                >
                  <item.icon className={`w-5 h-5 shrink-0 ${isActive ? "text-[#008558]" : "text-slate-400"}`} />
                  {!isDesktopCollapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="p-4 border-t border-slate-100 space-y-2">
          {/* Desktop Collapse Toggle */}
          <button
            onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
            className="hidden lg:flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-slate-500 hover:bg-slate-100 transition-colors font-medium text-sm"
            title="Collapse Sidebar"
          >
            {isDesktopCollapsed ? (
              <ChevronRight className="w-5 h-5 mx-auto" />
            ) : (
              <>
                <ChevronLeft className="w-5 h-5 shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>

          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors font-medium text-sm ${isDesktopCollapsed ? "justify-center" : ""}`}
            title={isDesktopCollapsed ? "Logout" : ""}
          >
            <LogOut className="w-5 h-5 shrink-0" /> 
            {!isDesktopCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 lg:pl-0 ${isDesktopCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        {/* Admin Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden text-slate-600 hover:text-slate-900 focus:outline-none bg-slate-100 p-2 rounded-md"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-slate-800 font-outfit hidden sm:block">Admin Portal</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
              <div className="w-6 h-6 rounded-full bg-[#008558] text-white flex items-center justify-center text-xs font-bold uppercase">
                {adminName.charAt(0)}
              </div>
              <span className="text-sm font-medium text-slate-700 hidden sm:block">{adminName}</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
