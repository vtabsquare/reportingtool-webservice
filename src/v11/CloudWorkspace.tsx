import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase";
import { api, apiForm } from "../api";
import PublishedViewer from "./PublishedViewer";
import ShareDialog from "./ShareDialog";
import ScheduleRefreshDialog from "./ScheduleRefreshDialog";

type Report = { id: string; name: string; published_at: string; updated_at?: string; pages: number; role: string; project?: any };
type Workspace = { id: string; name: string; created_at: string; role: string; member_count: number; report_count: number };
type WorkspaceDetail = Workspace & { members: any[]; reports: any[] };

const workspaceTarget=()=>{const p=new URLSearchParams(location.search);return{reportId:p.get('report')||p.get('viewer')||'',share:p.get('share')==='1'}};

const relativeTime = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const roleBadgeStyle = (role: string): React.CSSProperties => {
  const map: Record<string, { bg: string; color: string }> = {
    Owner:    { bg: '#ede9fe', color: '#6d28d9' },
    'Co-Owner': { bg: '#ede9fe', color: '#6d28d9' },
    Admin:    { bg: '#dbeafe', color: '#1d4ed8' },
    Member:   { bg: '#dcfce7', color: '#15803d' },
    Contributor: { bg: '#fef3c7', color: '#b45309' },
    Viewer:   { bg: '#f1f5f9', color: '#475569' },
  };
  const s = map[role] || map.Viewer;
  return { fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: s.bg, color: s.color, whiteSpace: 'nowrap' as const };
};

const Avatar = ({ name, email }: { name?: string; email?: string }) => {
  const label = (name || email || '?')[0].toUpperCase();
  const colors = ['#6366f1','#8b5cf6','#ec4899','#10b981','#f59e0b'];
  const bg = colors[(label.charCodeAt(0)) % colors.length];
  return <div style={{ width: 32, height: 32, borderRadius: '50%', background: bg, color: '#fff', fontWeight: 700, fontSize: 13, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{label}</div>;
};

export default function CloudWorkspace({ session }: { session: any }) {
  const [activeTab, setActiveTab] = useState<'reports'|'workspaces'>('reports');
  const [reports, setReports] = useState<Report[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [targetDenied, setTargetDenied] = useState("");
  const [viewing, setViewing] = useState<Report | null>(null);
  const [sharing, setSharing] = useState<Report | null>(null);
  const [scheduling, setScheduling] = useState<Report | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");

  // Add Member modal state
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"Admin" | "Member" | "Contributor" | "Viewer">("Member");
  const [memberSuggestions, setMemberSuggestions] = useState<any[]>([]);
  const [memberSuggestLoading, setMemberSuggestLoading] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberErr, setMemberErr] = useState("");
  const suggestTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReports = async () => {
    return await api<any[]>('/cloud/reports');
  };

  const loadData = async () => {
    try {
      setLoading(true); setErr(""); setTargetDenied("");
      const r = await fetchReports();
      setReports(r);
      const res = await api<any[]>('/cloud/workspaces');
      if (res) setWorkspaces(res);
      const target = workspaceTarget();
      if (target.reportId && !r.some((x:any) => x.id === target.reportId)) setTargetDenied("This report is not shared with the signed-in account.");
    } catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [session]);

  useEffect(() => {
    if (loading || viewing) return;
    const target = workspaceTarget();
    if (!target.reportId) return;
    const report = reports.find(r => r.id === target.reportId);
    if (report) {
      setTargetDenied(""); setViewing(report);
      const canShare = ['Owner','Co-Owner','Admin'].includes(report.role);
      if (target.share && canShare) setSharing(report);
      return;
    }
    if (!supabase) return;
    supabase.from('published_reports').select('id, name, published_at, project_json')
      .eq('id', target.reportId).eq('owner_id', session?.user?.id).maybeSingle()
      .then(({ data }) => {
        if (!data) { if (!loading) setTargetDenied('This report is not shared with the signed-in account.'); return; }
        const r: Report = {
          id: data.id, name: data.name, published_at: data.published_at, role: 'Owner',
          pages: (() => { try { return JSON.parse(data.project_json)?.report?.pages?.length || 1; } catch { return 1; } })(),
          project: (() => { try { return JSON.parse(data.project_json || '{}'); } catch { return {}; } })()
        };
        setTargetDenied(''); setViewing(r);
        if (target.share) setSharing(r);
      });
  }, [loading, reports, viewing]);

  const signOut = async () => { await supabase?.auth.signOut(); location.reload(); };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData(); form.append('file', file);
    try {
      await apiForm('/cloud/upload-package', form);
      alert('Package uploaded successfully!');
      loadData();
    } catch (err: any) { alert(err.message); } finally { setUploading(false); if (fileInput.current) fileInput.current.value = ''; }
  };

  const createWorkspace = async () => {
    const name = prompt("Enter workspace name:");
    if (!name) return;
    try {
      const data = await api<any>('/cloud/workspaces', { method: 'POST', body: JSON.stringify({ name }) });
      await loadData();
      if (data.id) loadWorkspace(data.id);
    } catch (err: any) { alert(err.message || String(err)); }
  };

  const loadWorkspace = async (id: string) => {
    try {
      const data = await api<WorkspaceDetail>(`/cloud/workspaces/${id}`);
      setActiveWorkspace(data);
    } catch (err: any) { alert(err.message || 'Failed to load workspace details'); }
  };

  const deleteWorkspace = async () => {
    if (!activeWorkspace) return;
    if (!confirm(`Are you sure you want to delete workspace "${activeWorkspace.name}"? This action cannot be undone.`)) return;
    try {
      await api(`/cloud/workspaces/${activeWorkspace.id}`, { method: 'DELETE' });
      alert('Workspace deleted successfully!');
      setActiveWorkspace(null); loadData();
    } catch (err: any) { alert(err.message || String(err)); }
  };

  const handleMemberEmailChange = (val: string) => {
    setMemberEmail(val);
    if (suggestTimeout.current) clearTimeout(suggestTimeout.current);
    if (val.trim().length < 2) { setMemberSuggestions([]); return; }
    suggestTimeout.current = setTimeout(async () => {
      setMemberSuggestLoading(true);
      try {
        const res = await fetch(`/api/v1/cloud/users/search?q=${encodeURIComponent(val.trim())}`,
          { headers: { Authorization: `Bearer ${session?.access_token}` } });
        if (res.ok) setMemberSuggestions(await res.json());
      } catch {} finally { setMemberSuggestLoading(false); }
    }, 300);
  };

  const submitAddMember = async () => {
    if (!memberEmail.trim() || !activeWorkspace) return;
    setMemberBusy(true); setMemberErr("");
    try {
      await api(`/cloud/workspaces/${activeWorkspace.id}/members`, {
        method: 'POST', body: JSON.stringify({ email: memberEmail.trim(), role: memberRole })
      });
      setAddMemberOpen(false);
      setMemberEmail(""); setMemberRole("Member"); setMemberSuggestions([]);
      loadWorkspace(activeWorkspace.id); loadData();
    } catch (e: any) { setMemberErr(e.message || String(e)); } finally { setMemberBusy(false); }
  };

  const addMember = () => { setMemberEmail(""); setMemberRole("Member"); setMemberSuggestions([]); setMemberErr(""); setAddMemberOpen(true); };

  const shareToWorkspace = async () => {
    if (!reports.length) return alert("You don't have any reports to share yet.");
    const names = reports.map((r, i) => `${i+1}. ${r.name}`).join('\n');
    const idx = parseInt(prompt(`Enter the number of the report to share:\n${names}`) || "0") - 1;
    const report = reports[idx];
    if (!report || !activeWorkspace) return;
    try {
      await api(`/cloud/workspaces/${activeWorkspace.id}/reports`, { method: 'POST', body: JSON.stringify({ report_id: report.id }) });
      alert(`Report "${report.name}" shared to workspace!`);
      loadWorkspace(activeWorkspace.id); loadData();
    } catch (err: any) { alert(err.message || String(err)); }
  };

  const userEmail = session?.user?.email || '';
  const userDisplay = session?.user?.user_metadata?.display_name || userEmail.split('@')[0];

  // ─── Viewer mode ───────────────────────────────────────────────────
  if (viewing) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "Inter, -apple-system, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", background: "#0f172a", color: "#fff", fontSize: 13, borderBottom: "1px solid #1e293b" }}>
          <button onClick={() => { setViewing(null); setSharing(null); history.replaceState(null, '', location.pathname + '?workspace=1'); }}
            style={{ background: "none", border: "1px solid #334155", borderRadius: 8, color: "#94a3b8", padding: "5px 12px", cursor: "pointer", fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Back
          </button>
          <b style={{ flex: 1, color: '#f1f5f9' }}>{viewing.name}</b>
          <span style={roleBadgeStyle(viewing.role)}>{viewing.role}</span>
          {(viewing.role === "Co-Owner" || viewing.role === "Owner") && (
            <button onClick={() => setSharing(viewing)}
              style={{ background: "#6366f1", border: "none", borderRadius: 8, color: "#fff", padding: "7px 16px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
              Share
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <PublishedViewer reportId={viewing.id} initialItem={{ id: viewing.id, name: viewing.name, published_at: viewing.published_at, updated_at: viewing.updated_at || viewing.published_at, project: viewing.project }} embedded cloudMode />
        </div>
        {sharing && <ShareDialog reportId={sharing.id} reportName={sharing.name} onClose={() => setSharing(null)} supabaseSession={session} />}
      </div>
    );
  }

  const filteredReports = reports.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  // ─── Main layout ────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Inter, -apple-system, sans-serif", background: "#f8fafc" }}>

      {/* SIDEBAR */}
      <aside style={{
        width: 220, background: "#0f172a", display: "flex", flexDirection: "column",
        padding: "24px 0", flexShrink: 0, borderRight: "1px solid #1e293b"
      }}>
        {/* Logo */}
        <div style={{ padding: "0 20px 28px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "grid", placeItems: "center", fontWeight: 900, color: "#fff", fontSize: 15, flexShrink: 0 }}>V</div>
          <span style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15 }}>VTAB</span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "0 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            { key: 'reports', label: 'My Reports', icon: '📊' },
            { key: 'workspaces', label: 'Workspaces', icon: '🏢' },
          ].map(item => (
            <button key={item.key} onClick={() => { setActiveTab(item.key as any); setActiveWorkspace(null); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left",
                background: activeTab === item.key ? "rgba(99,102,241,0.18)" : "transparent",
                color: activeTab === item.key ? "#a5b4fc" : "#94a3b8",
                fontWeight: activeTab === item.key ? 600 : 500, fontSize: 14,
                transition: "background .15s, color .15s"
              }}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>

        {/* User + Sign Out */}
        <div style={{ padding: "16px 12px 0", borderTop: "1px solid #1e293b", marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8 }}>
            <Avatar email={userEmail} name={userDisplay} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userDisplay}</div>
              <div style={{ color: "#64748b", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</div>
            </div>
          </div>
          <button onClick={signOut}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: "none", background: "transparent", color: "#64748b", cursor: "pointer", borderRadius: 8, fontSize: 13, marginTop: 4, transition: "color .15s" }}
            onMouseOver={e => e.currentTarget.style.color = '#f87171'}
            onMouseOut={e => e.currentTarget.style.color = '#64748b'}>
            <span>↩</span> Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>

        {/* Top bar */}
        <div style={{ padding: "20px 32px", borderBottom: "1px solid #e2e8f0", background: "#fff", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
              {activeTab === 'reports' ? 'My Reports' : activeWorkspace ? activeWorkspace.name : 'Team Workspaces'}
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748b" }}>
              {activeTab === 'reports' ? `${reports.length} report${reports.length !== 1 ? 's' : ''} shared with you` :
               activeWorkspace ? `${activeWorkspace.members.length} members · ${activeWorkspace.reports.length} reports` :
               `${workspaces.length} workspace${workspaces.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div style={{ flex: 1 }} />
          {activeTab === 'reports' && (
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 14 }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reports…"
                style={{ padding: "8px 12px 8px 32px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", width: 220 }}
                onFocus={e => e.target.style.border = "1.5px solid #6366f1"}
                onBlur={e => e.target.style.border = "1.5px solid #e2e8f0"} />
            </div>
          )}
          {activeTab === 'reports' && (
            <button onClick={() => fileInput.current?.click()} disabled={uploading}
              style={{ background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
              📦 {uploading ? 'Uploading…' : 'Upload Package'}
            </button>
          )}
          {activeTab === 'workspaces' && !activeWorkspace && (
            <button onClick={createWorkspace}
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#fff" }}>
              + New Workspace
            </button>
          )}
          {activeWorkspace && (
            <button onClick={() => setActiveWorkspace(null)}
              style={{ background: "none", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#374151" }}>
              ← All Workspaces
            </button>
          )}
          <input type="file" ref={fileInput} hidden accept=".vtabapp,.vtabpkg,.vtabdata" onChange={handleUpload} />
        </div>

        {/* Content */}
        <div style={{ padding: 32, flex: 1 }}>
          {loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, gap: 12 }}>
              <div style={{ width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              <span style={{ color: "#64748b", fontSize: 14 }}>Loading your workspace…</span>
            </div>
          )}
          {err && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 20, color: "#dc2626", fontSize: 14 }}>⚠️ {err}</div>
          )}
          {targetDenied && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 20, color: "#b45309", fontSize: 14 }}>⚠️ {targetDenied}</div>
          )}

          {/* REPORTS TAB */}
          {!loading && activeTab === 'reports' && (
            filteredReports.length === 0 ? (
              <div style={{ textAlign: "center", padding: 80 }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
                <h3 style={{ margin: "0 0 8px", fontSize: 18, color: "#0f172a" }}>{search ? 'No matching reports' : 'No reports yet'}</h3>
                <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>{search ? 'Try a different search term.' : 'Upload a package or ask someone to share a report with you.'}</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
                {filteredReports.map(r => {
                  const canManage = ['Owner','Co-Owner','Admin'].includes(r.role);
                  const sourceType = r.sourceType || null;
                  const isCloudSource = sourceType && ['google_sheets','postgres','sqlserver'].includes(sourceType);
                  return (
                    <div key={r.id}
                      style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "box-shadow .2s, border-color .2s", boxShadow: "0 1px 4px rgba(15,23,42,.04)" }}
                      onMouseOver={e => { e.currentTarget.style.boxShadow = "0 8px 32px rgba(99,102,241,.15)"; e.currentTarget.style.borderColor = "#a5b4fc"; }}
                      onMouseOut={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(15,23,42,.04)"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
                      onClick={() => { history.replaceState(null, '', `${location.pathname}?workspace=1&report=${encodeURIComponent(r.id)}`); setViewing(r); }}>

                      {/* Thumbnail */}
                      <div style={{ height: 90, background: "linear-gradient(135deg, #ede9fe, #dbeafe)", display: "grid", placeItems: "center", fontSize: 36 }}>📊</div>

                      <div style={{ padding: "16px 18px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <b style={{ fontSize: 15, color: "#0f172a", fontWeight: 700, flex: 1, marginRight: 8 }}>{r.name}</b>
                          <span style={roleBadgeStyle(r.role)}>{r.role}</span>
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 14 }}>
                          {r.pages} page{r.pages !== 1 ? 's' : ''} · Updated {relativeTime(r.published_at)}
                        </div>
                        <div style={{ display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => { history.replaceState(null, '', `${location.pathname}?workspace=1&report=${encodeURIComponent(r.id)}`); setViewing(r); }}
                            style={{ flex: 1, padding: "7px 0", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                            View
                          </button>
                          {canManage && (
                            <button onClick={() => setSharing(r)}
                              style={{ padding: "7px 12px", background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#374151" }}>
                              Share
                            </button>
                          )}
                          {isCloudSource && canManage && (
                            <button title="Schedule data refresh" onClick={() => setScheduling(r)}
                              style={{ padding: "7px 10px", background: "#f0fdfa", border: "1.5px solid #99f6e4", borderRadius: 8, cursor: "pointer", fontSize: 16 }}>
                              ⏳
                            </button>
                          )}
                          {canManage && (
                            <button title="Delete Report" onClick={async () => {
                              if(!confirm(`Are you sure you want to delete report "${r.name}"? This action cannot be undone.`)) return;
                              try {
                                await api(`/cloud/reports/${r.id}`, { method: 'DELETE' });
                                loadData();
                              } catch(e:any) { alert(e.message || String(e)); }
                            }} style={{ padding: "7px 10px", background: "#fef2f2", color: "#ef4444", border: "1.5px solid #fee2e2", borderRadius: 8, cursor: "pointer", fontSize: 16 }}>
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* WORKSPACES TAB — list */}
          {!loading && activeTab === 'workspaces' && !activeWorkspace && (
            workspaces.length === 0 ? (
              <div style={{ textAlign: "center", padding: 80 }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🏢</div>
                <h3 style={{ margin: "0 0 8px", fontSize: 18, color: "#0f172a" }}>No workspaces yet</h3>
                <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>Create a workspace to share reports with your team.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
                {workspaces.map(w => (
                  <div key={w.id} onClick={() => loadWorkspace(w.id)}
                    style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: 24, cursor: "pointer", transition: "box-shadow .2s, border-color .2s", boxShadow: "0 1px 4px rgba(15,23,42,.04)", position: "relative" }}
                    onMouseOver={e => { e.currentTarget.style.boxShadow = "0 8px 32px rgba(99,102,241,.15)"; e.currentTarget.style.borderColor = "#a5b4fc"; }}
                    onMouseOut={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(15,23,42,.04)"; e.currentTarget.style.borderColor = "#e2e8f0"; }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#ede9fe,#dbeafe)", display: "grid", placeItems: "center", fontSize: 22 }}>🏢</div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: w.role === 'Admin' ? '#fce7f3' : '#f1f5f9', color: w.role === 'Admin' ? '#be185d' : '#475569' }}>{w.role}</span>
                    </div>
                    <b style={{ display: "block", fontSize: 16, color: "#0f172a", marginBottom: 4 }}>{w.name}</b>
                    <small style={{ color: "#94a3b8", fontSize: 12 }}>{w.member_count} member{w.member_count !== 1 ? 's' : ''} · {w.report_count} report{w.report_count !== 1 ? 's' : ''}</small>
                    {w.role === 'Admin' && (
                      <button onClick={e => { e.stopPropagation(); if (!confirm(`Delete workspace "${w.name}"?`)) return; fetch(`/api/v1/cloud/workspaces/${w.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${session?.access_token}` } }).then(async res => { if (res.ok) loadData(); else { const d = await res.json(); alert(d.detail || 'Delete failed'); } }); }}
                        style={{ position: "absolute", bottom: 20, right: 20, background: "#fef2f2", color: "#ef4444", border: "1px solid #fee2e2", padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {/* WORKSPACE DETAIL */}
          {!loading && activeTab === 'workspaces' && activeWorkspace && (
            <div>
              {activeWorkspace.role === 'Admin' && (
                <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
                  <button onClick={addMember} style={{ background: "#fff", border: "1.5px solid #e2e8f0", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>+ Add Member</button>
                  <button onClick={shareToWorkspace} style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Share Report</button>
                  <button onClick={deleteWorkspace} style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fee2e2", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Delete Workspace</button>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: 24 }}>
                  <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 15, color: "#374151", fontWeight: 700 }}>Members ({activeWorkspace.members.length})</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {activeWorkspace.members.map(m => (
                      <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                        <Avatar email={m.email} />
                        <span style={{ flex: 1, fontSize: 14, color: "#374151" }}>{m.email}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, background: "#f1f5f9", padding: "2px 8px", borderRadius: 999, color: "#475569" }}>{m.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: 24 }}>
                  <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 15, color: "#374151", fontWeight: 700 }}>Shared Reports ({activeWorkspace.reports.length})</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {activeWorkspace.reports.length === 0 && <span style={{ color: "#94a3b8", fontSize: 13 }}>No reports shared yet.</span>}
                    {activeWorkspace.reports.map(r => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: "#374151" }}>📊 {r.name}</span>
                        <button onClick={() => { const rpt = reports.find(x => x.id === r.id) || { ...r, role: 'Viewer' }; history.replaceState(null, '', `${location.pathname}?workspace=1&report=${encodeURIComponent(r.id)}`); setViewing(rpt as any); }}
                          style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>View →</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Dialogs */}
      {scheduling && <ScheduleRefreshDialog reportId={scheduling.id} reportName={scheduling.name} sourceType={(scheduling.project?.sourceType || scheduling.project?.dataSourceType) as any} onClose={() => setScheduling(null)} supabaseSession={session} />}
      {sharing && !viewing && <ShareDialog reportId={sharing.id} reportName={sharing.name} onClose={() => setSharing(null)} supabaseSession={session} />}

      {/* Add Member Modal */}
      {addMemberOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 999, display: "grid", placeItems: "center" }} onMouseDown={() => setAddMemberOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: 420, maxWidth: "90vw", boxShadow: "0 24px 64px rgba(15,23,42,.2)" }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "#6366f1", marginBottom: 4 }}>ADD MEMBER</div>
                <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>{activeWorkspace?.name}</h3>
              </div>
              <button onClick={() => setAddMemberOpen(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, display: "grid", placeItems: "center" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ position: "relative" }}>
                <input style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", fontSize: 13, boxSizing: "border-box", outline: "none" }}
                  placeholder="Search user by email…" value={memberEmail}
                  onChange={e => handleMemberEmailChange(e.target.value)}
                  onBlur={() => setTimeout(() => setMemberSuggestions([]), 150)}
                  onFocus={e => e.target.style.border = "1.5px solid #6366f1"}
                  autoComplete="off" />
                {memberSuggestLoading && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 12 }}>…</span>}
                {memberSuggestions.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 32px rgba(15,23,42,.12)", overflow: "hidden", marginTop: 4 }}>
                    {memberSuggestions.map((u: any) => (
                      <div key={u.id} onMouseDown={() => { setMemberEmail(u.email); setMemberSuggestions([]); }}
                        style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                        onMouseOver={e => e.currentTarget.style.background = "#f8fafc"}
                        onMouseOut={e => e.currentTarget.style.background = "#fff"}>
                        <Avatar email={u.email} />
                        <div><b style={{ fontSize: 13 }}>{u.email}</b>{u.display_name && <span style={{ fontSize: 11, color: "#64748b", marginLeft: 6 }}>{u.display_name}</span>}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Role</label>
                <select style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", fontSize: 13, outline: "none" }}
                  value={memberRole} onChange={e => setMemberRole(e.target.value as any)}>
                  <option value="Viewer">Viewer — view reports only</option>
                  <option value="Contributor">Contributor — create, edit and publish</option>
                  <option value="Member">Member — publish and manage workspace content</option>
                  <option value="Admin">Admin — full workspace and member management</option>
                </select>
              </div>
              {memberErr && <div style={{ color: "#dc2626", fontSize: 12, background: "#fef2f2", padding: "8px 12px", borderRadius: 8 }}>⚠️ {memberErr}</div>}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setAddMemberOpen(false)} style={{ padding: "9px 18px", border: "1.5px solid #e2e8f0", borderRadius: 10, cursor: "pointer", background: "#fff", fontWeight: 600, fontSize: 13 }}>Cancel</button>
                <button onClick={submitAddMember} disabled={memberBusy || !memberEmail.trim()}
                  style={{ padding: "9px 20px", border: "none", borderRadius: 10, cursor: memberBusy || !memberEmail.trim() ? "not-allowed" : "pointer", background: memberBusy || !memberEmail.trim() ? "#c7d2fe" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 700, fontSize: 13 }}>
                  {memberBusy ? "Adding…" : "Add Member"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
    </div>
  );
}
