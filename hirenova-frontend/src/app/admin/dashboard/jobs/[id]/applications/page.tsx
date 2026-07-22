"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getJobApplications, rankJobCandidates, inviteSelectedCandidates, sendEmail, inviteCandidate } from "@/lib/api";
import { Loader2, ArrowLeft, Mail, Star, CheckCircle, ExternalLink, Video, Trophy, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import Swal from 'sweetalert2';

export default function JobApplicationsPage() {
  const { id } = useParams();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState(false);
  const [invitingSelected, setInvitingSelected] = useState(false);

  // Email Modal State
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const res = await getJobApplications(id as string);
        setApplications(res.data.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchApps();
  }, [id]);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await sendEmail(selectedAppId, { subject: emailSubject, message: emailMessage });
      Swal.fire('Success!', 'Email sent successfully!', 'success');
      setShowEmailModal(false);
      setEmailSubject("");
      setEmailMessage("");
    } catch (error) {
      Swal.fire('Error!', 'Failed to send email', 'error');
    } finally {
      setSending(false);
    }
  };

  const openEmailModal = (appId: string, candName: string) => {
    setSelectedAppId(appId);
    setEmailSubject(`Update regarding your application for HireNova`);
    setEmailMessage(`Hi ${candName},\n\nWe are reaching out regarding your recent application.\n\nBest,\nThe HireNova Team`);
    setShowEmailModal(true);
  };

  const handleInvite = async (appId: string) => {
    try {
      await inviteCandidate(appId);
      Swal.fire('Success!', 'Candidate invited to interview successfully!', 'success');
      // Refresh applications list
      const res = await getJobApplications(id as string);
      setApplications(res.data.data);
    } catch (error: any) {
      Swal.fire('Error!', error?.response?.data?.error || 'Failed to invite candidate', 'error');
      console.error(error);
    }
  };

  const refreshApplications = async () => {
    const res = await getJobApplications(id as string);
    setApplications(res.data.data);
  };

  const handleRanking = async () => {
    setRanking(true);
    try {
      await rankJobCandidates(id as string);
      await refreshApplications();
      Swal.fire('Ranking updated', 'The highest-scoring candidates have been selected as the Top 10.', 'success');
    } catch (error: any) {
      Swal.fire('Error!', error?.response?.data?.error || 'Failed to update ranking', 'error');
    } finally {
      setRanking(false);
    }
  };

  const handleInviteSelected = async () => {
    const confirmation = await Swal.fire({
      title: 'Invite selected candidates?',
      text: 'Invitation emails will be sent only to selected Top-10 candidates who have not already been invited.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Send invitations',
      confirmButtonColor: '#008558',
    });
    if (!confirmation.isConfirmed) return;

    setInvitingSelected(true);
    try {
      const res = await inviteSelectedCandidates(id as string);
      await refreshApplications();
      const result = res.data.data;
      Swal.fire('Invitations processed', `${result.sent} sent, ${result.alreadySent} already sent, ${result.failed} failed.`, result.failed ? 'warning' : 'success');
    } catch (error: any) {
      Swal.fire('Error!', error?.response?.data?.error || 'Failed to send invitations', 'error');
    } finally {
      setInvitingSelected(false);
    }
  };
  const getMostFrequentLabel = (answers: any[]) => {
    if (!answers || answers.length === 0) return null;
    const counts: Record<string, number> = {};
    let maxCount = 0;
    let mostFrequent = null;
    for (const ans of answers) {
      if (ans.predicted_label) {
        counts[ans.predicted_label] = (counts[ans.predicted_label] || 0) + 1;
        if (counts[ans.predicted_label] > maxCount) {
          maxCount = counts[ans.predicted_label];
          mostFrequent = ans.predicted_label;
        }
      }
    }
    return mostFrequent;
  };

  if (loading) return <div className="flex justify-center mt-20"><Loader2 className="w-8 h-8 animate-spin text-[#008558]" /></div>;

  return (
    <div>
      <Link href="/admin/dashboard/jobs" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#008558] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-outfit font-semibold text-slate-800">Candidates</h1>
          <p className="text-sm text-slate-500 mt-1">
            {applications.length} applicants · {applications.filter((app) => app.selection_status === 'Selected').length} selected · {applications.filter((app) => app.invitation_status === 'Sent').length} invited
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleRanking} disabled={ranking} className="inline-flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold">
            <RefreshCw className={`w-4 h-4 ${ranking ? 'animate-spin' : ''}`} /> Recalculate Ranking
          </button>
          <button onClick={handleInviteSelected} disabled={invitingSelected || !applications.some((app) => app.selection_status === 'Selected' && app.invitation_status !== 'Sent')} className="inline-flex items-center gap-2 bg-[#008558] hover:bg-[#006b47] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            {invitingSelected ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Invite Selected
          </button>
        </div>
      </div>

      <div className="grid gap-6">
        {applications.map((app) => (
          <div key={app._id} className={`bg-white rounded-lg p-6 flex flex-col md:flex-row gap-8 shadow-sm border ${app.selection_status === 'Selected' ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200'}`}>
            
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-slate-800 text-white inline-flex items-center justify-center font-bold text-sm">#{app.rank ?? '—'}</span>
                  <div>
                    <h3 className="text-xl font-semibold text-slate-800 font-outfit">{app.candidate_name}</h3>
                    {app.selection_status === 'Selected' && <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700"><Trophy className="w-3.5 h-3.5" /> Top 10 Selected</span>}
                  </div>
                </div>
                <div className="text-right">
                  <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-lg text-xs font-semibold">{app.status}</span>
                  <p className={`mt-2 text-xs font-semibold ${app.invitation_status === 'Sent' ? 'text-emerald-600' : app.invitation_status === 'Failed' ? 'text-rose-600' : 'text-slate-500'}`}>
                    Invitation: {app.invitation_status || 'Not Sent'}
                  </p>
                </div>
              </div>
              
              <div className="grid sm:grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Email</p>
                  <p className="text-slate-700 font-medium truncate" title={app.user_id?.email}>{app.user_id?.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">GitHub Username</p>
                  <p className="text-slate-700 font-medium">{app.github_username || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Applied Date</p>
                  <p className="text-slate-700 font-medium">{new Date(app.appliedAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 flex flex-wrap gap-3">
                {app.selection_status === 'Selected' && ['Not Sent', 'Failed', undefined].includes(app.invitation_status) && (
                  <button 
                    onClick={() => handleInvite(app._id)}
                    className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-sm"
                  >
                    <Video className="w-4 h-4" /> Invite to Interview
                  </button>
                )}
                {app.invitation_status === 'Sent' && (
                  <span className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-sm font-semibold">
                    <CheckCircle className="w-4 h-4" /> Invited {app.invitation_sent_at ? new Date(app.invitation_sent_at).toLocaleDateString() : ''}
                  </span>
                )}
                
                {app.user_id?.email && (
                  <a 
                    href={`mailto:${app.user_id.email}`}
                    className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-[#008558] px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                  >
                    <Mail className="w-4 h-4" /> Contact
                  </a>
                )}

                <Link
                  href={`/admin/dashboard/jobs/${id}/applications/${app._id}`}
                  className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  View Full Details
                </Link>

                {app.original_cv_url ? (
                  <a 
                    href={`http://localhost:5001${app.original_cv_url}`} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> View Original CV
                  </a>
                ) : (
                  <button 
                    disabled
                    className="flex items-center gap-2 bg-slate-50 text-slate-400 border border-slate-200 px-4 py-2 rounded-lg font-medium text-sm cursor-not-allowed opacity-60"
                    title="CV file was not saved for this application"
                  >
                    <ExternalLink className="w-4 h-4" /> View Original CV
                  </button>
                )}
              </div>
            </div>

            <div className="w-full md:w-80 bg-slate-50 border border-slate-200 rounded-lg p-5 shrink-0 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 text-emerald-600">
                  <Star className="w-5 h-5 fill-current" />
                  <h4 className="font-semibold text-sm uppercase tracking-wide">AI Analysis</h4>
                </div>

                {app.ai_analysis?.final_score !== undefined && (
                  <div className="mb-4 flex items-center justify-between bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
                    <div>
                      <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Final Score</p>
                      <p className="text-2xl font-bold text-slate-800 font-outfit">{app.ai_analysis.final_score.toFixed(1)}<span className="text-sm text-slate-400 font-medium">/10</span></p>
                    </div>
                    {app.ai_analysis?.grade && (
                      <div className="text-right">
                        <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Grade</p>
                        <p className="text-xl font-bold text-[#008558] font-outfit">{app.ai_analysis.grade}</p>
                      </div>
                    )}
                  </div>
                )}

                {app.status === 'Completed' && getMostFrequentLabel(app.interview_answers) && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-500 font-semibold mb-2 uppercase">Interview Emotion</p>
                    <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md text-sm font-semibold capitalize flex items-center gap-2 w-fit">
                      {getMostFrequentLabel(app.interview_answers)}
                    </span>
                  </div>
                )}

                {app.ai_analysis?.evidence?.skills_matched && app.ai_analysis.evidence.skills_matched.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-500 font-semibold mb-2 uppercase">Skills Matched</p>
                    <div className="flex flex-wrap gap-2">
                      {app.ai_analysis.evidence.skills_matched.slice(0, 5).map((skill: string) => (
                        <span key={skill} className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> {skill}
                        </span>
                      ))}
                      {app.ai_analysis.evidence.skills_matched.length > 5 && (
                        <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md text-xs font-medium">
                          +{app.ai_analysis.evidence.skills_matched.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {app.ai_analysis?.evidence?.cross_platform_consistency && (
                  <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                    <p className="text-xs text-indigo-700 font-semibold uppercase">CV–GitHub Consistency</p>
                    {app.ai_analysis.evidence.cross_platform_consistency.available ? (
                      <>
                        <p className="text-xl font-bold text-indigo-900 mt-1">{app.ai_analysis.evidence.cross_platform_consistency.percentage}%</p>
                        <p className="text-xs text-indigo-700 mt-1">
                          {app.ai_analysis.evidence.cross_platform_consistency.matched_count} of {app.ai_analysis.evidence.cross_platform_consistency.total_cv_skills} CV skills verified
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-indigo-700 mt-1">{app.ai_analysis.evidence.cross_platform_consistency.reason}</p>
                    )}
                  </div>
                )}
              </div>

              {app.ai_analysis?.assessment && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                   <p className="text-xs text-slate-500 font-semibold mb-2 uppercase">Verdict</p>
                   <p className="text-sm text-slate-700 leading-relaxed italic line-clamp-3" title={app.ai_analysis.assessment}>"{app.ai_analysis.assessment}"</p>
                </div>
              )}
            </div>

          </div>
        ))}

        {applications.length === 0 && (
          <div className="text-center py-16 bg-white rounded-lg border border-slate-200 shadow-sm">
            <p className="text-slate-500">No applications received for this job yet.</p>
          </div>
        )}
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-xl font-semibold text-slate-800 mb-4 font-outfit">Send Email to Candidate</h2>
            <form onSubmit={handleSendEmail} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-[#008558] focus:ring-1 focus:ring-[#008558]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                <textarea
                  required
                  rows={6}
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:border-[#008558] focus:ring-1 focus:ring-[#008558]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex items-center gap-2 bg-[#008558] hover:bg-[#006b47] text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
