"use client";

import { useEffect, useState } from "react";
import { getUsers } from "@/lib/api";
import { Loader2, Mail, Calendar, User } from "lucide-react";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await getUsers();
        setUsers(res.data.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  if (loading) return <div className="flex justify-center mt-20"><Loader2 className="w-8 h-8 animate-spin text-[#008558]" /></div>;

  return (
    <div>
      <h1 className="text-3xl font-outfit font-semibold text-slate-800 mb-8">Registered Candidates</h1>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
              <th className="p-4 font-semibold">Candidate Name</th>
              <th className="p-4 font-semibold">Email</th>
              <th className="p-4 font-semibold">Joined At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user._id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald- text-[#008558] flex items-center justify-center font-semibold">
                    <User className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-slate-800">{user.name}</span>
                </td>
                <td className="p-4 text-slate-600">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" /> {user.email}
                  </div>
                </td>
                <td className="p-4 text-slate-500 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-slate-500">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
