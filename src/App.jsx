import { useState, useMemo, useEffect } from "react";
import {
  LayoutDashboard, Building2, Users, Briefcase, ListChecks, Receipt, Wallet,
  BarChart3, FolderOpen, Bell, Search, ChevronRight, X, Plus, Check, XCircle,
  Clock, AlertTriangle, RefreshCw, ArrowUpRight, ArrowDownRight, UserCircle2,
  ChevronDown, ExternalLink, FileText, CircleDollarSign, CalendarClock, Filter,
  Lock, LogOut, Eye, EyeOff, AlertCircle
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { supabase } from "./supabaseClient";

/* ============================== FONTS / TOKENS ============================== */
const FontStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
    .f-display { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.01em; }
    .f-body { font-family: 'Plus Jakarta Sans', sans-serif; }
    .f-ledger { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
    .accent-bar { position: relative; }
    .accent-bar::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; border-radius:3px 0 0 3px; }
    h1, h2, h3, .f-display { font-weight: 700; }
    body, input, select, textarea, button { -webkit-font-smoothing: antialiased; }
  `}</style>
);

const inr = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const neg = n < 0;
  const v = Math.abs(Math.round(n));
  const s = "₹" + v.toLocaleString("en-IN");
  return neg ? "-" + s : s;
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const isWithinWeek = (d) => { if (!d) return false; const t = new Date(); const target = new Date(d); const diff = (target - t) / 86400000; return diff >= -0.5 && diff <= 7; };
const isPast = (d) => { if (!d) return false; return new Date(d) < new Date(new Date().toDateString()); };

const timeAgo = (iso) => {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const mapBrand = (r) => ({
  id: r.id, name: r.name, poc: r.poc, email: r.email, phone: r.phone,
  paymentTerms: r.payment_terms, notes: r.notes, industry: r.industry,
});
const mapCreator = (r) => ({
  id: r.id, name: r.name, handle: r.handle, platform: r.platform, phone: r.phone,
  email: r.email, gst: r.gst, pan: r.pan,
  bank: { name: r.bank_name, acc: r.bank_acc, ifsc: r.bank_ifsc },
  standard: r.standard,
});
const mapCampaign = (r) => ({
  id: r.id, name: r.name, brandId: r.brand_id, poc: r.poc,
  start: r.start_date, end: r.end_date, budget: Number(r.budget) || 0,
  status: r.status, paymentTerms: r.payment_terms, team: r.team || [],
});
const mapDeal = (r) => ({
  id: r.id, campaignId: r.campaign_id, creatorId: r.creator_id,
  amount: Number(r.amount) || 0, scope: r.scope, status: r.status,
  approval: r.approval, notes: r.notes,
});
const mapDeliverable = (r) => ({
  id: r.id, dealId: r.deal_id, type: r.type, brief: r.brief, due: r.due,
  status: r.status, scheduled: r.scheduled, live: r.live, completed: r.completed,
  revisionNotes: r.revision_notes,
});
const mapCreatorInvoice = (r) => ({
  id: r.id, dealId: r.deal_id, invoiceNumber: r.invoice_number, date: r.date,
  amount: Number(r.amount) || 0, gst: Number(r.gst) || 0, tds: Number(r.tds) || 0,
  total: Number(r.total) || 0, status: r.status, zoho: r.zoho, zohoBillId: r.zoho_bill_id,
  paid: Number(r.paid) || 0, dueDate: r.due_date, rejectReason: r.reject_reason,
});
const mapBrandInvoice = (r) => ({
  id: r.id, campaignId: r.campaign_id, invoiceNumber: r.invoice_number, date: r.date,
  amount: Number(r.amount) || 0, gst: Number(r.gst) || 0, total: Number(r.total) || 0,
  status: r.status, zoho: r.zoho, received: Number(r.received) || 0, dueDate: r.due_date,
});
const mapPayment = (r) => ({
  id: r.id, direction: r.direction, refType: r.ref_type, refId: r.ref_id,
  amount: Number(r.amount) || 0, date: r.date, method: r.method, utr: r.utr,
  zohoPaymentId: r.zoho_payment_id,
});
const mapDocument = (r) => ({
  id: r.id, entityType: r.entity_type, entityId: r.entity_id, fileName: r.file_name,
  fileType: r.file_type, uploadDate: r.upload_date, uploadedBy: r.uploaded_by,
  storagePath: r.storage_path,
});
const mapNotification = (r) => ({
  id: r.id, type: r.type, text: r.text, severity: r.severity, time: timeAgo(r.created_at),
});

const DELIVERABLE_FLOW = ["Brief", "Script Pending", "Script Submitted", "Script Approved", "Video Submitted", "Revision", "Approved", "Scheduled", "Live", "Completed"];
const CAMPAIGN_STATUSES = ["Draft", "Upcoming", "Active", "Paused", "Completed", "Cancelled"];

/* ============================== WORDMARK ============================== */
const RepCreatorsLogo = ({ size = "md" }) => {
  const scale = size === "sm" ? "text-lg" : "text-2xl";
  return (
    <div className={`f-display ${scale} font-bold leading-[0.85] select-none`} style={{ letterSpacing: "-0.02em" }}>
      <div className="text-white">rep</div>
      <div className="flex items-baseline">
        <span className="text-red-500 mr-0.5">/</span>
        <span className="text-white">creators</span>
      </div>
    </div>
  );
};

/* ============================== SMALL UI PRIMITIVES ============================== */
const Badge = ({ children, tone = "slate" }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-700 border-red-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    indigo: "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${tones[tone]}`}>{children}</span>;
};

const statusTone = (status) => {
  const map = {
    Active: "emerald", Completed: "slate", Upcoming: "indigo", Draft: "amber", Paused: "amber", Cancelled: "red",
    Approved: "emerald", "Pending Review": "amber", Rejected: "red", Sent: "indigo", Paid: "emerald",
    Synced: "emerald", "Pending Sync": "amber", Syncing: "indigo", "Sync Failed": "red", "—": "slate",
    Live: "emerald", Scheduled: "indigo", "Video Submitted": "amber", "Script Pending": "amber",
    "Script Submitted": "amber", "Script Approved": "indigo", Revision: "red", Brief: "slate",
  };
  return map[status] || "slate";
};

const KPICard = ({ label, value, tone = "slate", icon: Icon, sub, onClick }) => {
  const toneBar = { emerald: "#059669", amber: "#b45309", red: "#dc2626", indigo: "#e11d2e", slate: "#475569" }[tone];
  return (
    <div
      onClick={onClick}
      className={`accent-bar bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 pl-4 pr-4 py-3.5 transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:shadow-emerald-900/10 hover:-translate-y-0.5 active:translate-y-0" : ""}`}
      style={{ "--tw-content": "" }}
    >
      <style>{`.accent-bar::before{background:${toneBar}}`}</style>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide f-body">{label}</div>
          <div className="f-ledger text-xl font-semibold text-slate-900 mt-1">{value}</div>
          {sub && <div className="text-xs text-slate-400 mt-0.5 f-body">{sub}</div>}
        </div>
        {Icon && <Icon size={16} className="text-slate-300 mt-0.5" />}
      </div>
    </div>
  );
};

const SectionHeader = ({ title, action, crumbs }) => (
  <div className="flex items-center justify-between mb-4">
    <div>
      {crumbs && (
        <div className="flex items-center gap-1 text-xs text-slate-400 f-body mb-1">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={11} />}
              <button onClick={c.onClick} className={c.onClick ? "hover:text-red-600" : ""}>{c.label}</button>
            </span>
          ))}
        </div>
      )}
      <h2 className="f-display text-lg font-semibold text-slate-900">{title}</h2>
    </div>
    {action}
  </div>
);

const Btn = ({ children, onClick, variant = "primary", size = "md", icon: Icon, type = "button" }) => {
  const variants = {
    primary: "bg-red-600 text-white hover:bg-red-700 border-transparent",
    secondary: "bg-white text-slate-700 hover:bg-slate-50 border-red-100",
    danger: "bg-white text-red-600 hover:bg-red-50 border-red-200",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 border-transparent",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-100 border-transparent",
  };
  const sizes = { sm: "text-xs px-2.5 py-1.5", md: "text-sm px-3.5 py-2" };
  return (
    <button type={type} onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg border font-medium f-body transition-colors ${variants[variant]} ${sizes[size]}`}>
      {Icon && <Icon size={14} />} {children}
    </button>
  );
};

const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
    <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-red-50 sticky top-0 bg-white">
        <h3 className="f-display font-semibold text-slate-900">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <label className="block mb-3">
    <span className="block text-xs font-medium text-slate-500 mb-1 f-body">{label}</span>
    {children}
  </label>
);
const inputCls = "w-full border border-red-100 rounded-lg px-3 py-2 text-sm f-body focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400";

const Table = ({ head, children }) => (
  <div className="bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 overflow-hidden">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 border-b border-red-100">
          {head.map((h, i) => <th key={i} className="text-left font-medium text-slate-500 text-xs uppercase tracking-wide px-4 py-2.5 f-body">{h}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">{children}</tbody>
    </table>
  </div>
);
const Tr = ({ children, onClick }) => (
  <tr onClick={onClick} className={onClick ? "hover:bg-slate-50 cursor-pointer" : ""}>{children}</tr>
);
const Td = ({ children, mono, muted }) => (
  <td className={`px-4 py-3 align-middle ${mono ? "f-ledger" : "f-body"} ${muted ? "text-slate-400" : "text-slate-700"}`}>{children}</td>
);

const EmptyState = ({ text }) => (
  <div className="text-center py-10 text-slate-400 text-sm f-body">{text}</div>
);

/* ============================== LOGIN SCREEN ============================== */
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message || "Incorrect email or password.");
      return;
    }
    // On success, Supabase's onAuthStateChange listener (set up in App())
    // picks up the new session automatically — nothing else to do here.
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-rose-200 via-amber-100 to-emerald-200 f-body p-4">
      <FontStyles />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-slate-950 rounded-2xl px-6 py-5 shadow-lg shadow-rose-900/20 mb-4">
            <RepCreatorsLogo />
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Operations Platform</div>
        </div>

        <div className="bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 p-6">
          <h1 className="f-display text-lg font-semibold text-slate-900 mb-1">Sign in</h1>
          <p className="text-sm text-slate-400 f-body mb-5">Access the rep/creators portal</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
              <AlertCircle size={15} className="shrink-0" /> {error}
            </div>
          )}

          <Field label="Email">
            <input
              autoFocus
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="you@company.com"
            />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                className={inputCls + " pr-9"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>

          <button
            type="button"
            disabled={loading}
            onClick={handleSubmit}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 font-medium f-body text-sm px-3.5 py-2.5 mt-2 transition-colors"
          >
            <Lock size={14} /> {loading ? "Signing in…" : "Sign In"}
          </button>
        </div>

        <div className="bg-white/70 border border-red-100 rounded-xl p-4 mt-4 text-xs text-slate-500 f-body">
          Accounts are created in your Supabase project (Authentication → Users), with a matching
          row in the <span className="f-ledger">profiles</span> table setting each person's role
          (admin / poc / creator).
        </div>
      </div>
    </div>
  );
}

/* ============================== APP ============================== */
export default function App() {
  const emptyDb = { brands: [], creators: [], campaigns: [], deals: [], deliverables: [], creatorInvoices: [], brandInvoices: [], payments: [], documents: [], notifications: [] };
  const [db, setDb] = useState(emptyDb);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  const [auth, setAuth] = useState(null); // { id, email, displayName, role, creatorId } | null
  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState("admin"); // admin | poc | creator — mirrors auth.role once signed in
  const demoCreatorId = auth?.creatorId || null; // the signed-in creator's own record id (role === 'creator' only)

  const [activeModule, setActiveModule] = useState("dashboard");
  const [sel, setSel] = useState({}); // { brand, creator, campaign }
  const [query, setQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [modal, setModal] = useState(null); // {type, payload}
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  /* ---------- auth: real Supabase session + profile (role/creatorId) ---------- */
  useEffect(() => {
    let mounted = true;

    const loadProfile = async (sessionUser) => {
      if (!sessionUser) {
        if (mounted) { setAuth(null); setAuthLoading(false); }
        return;
      }
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("display_name, role, creator_id")
        .eq("id", sessionUser.id)
        .single();
      if (!mounted) return;
      if (error || !profile) {
        console.error("No profile row found for this user — create one in the profiles table.", error);
        setAuth(null);
        setAuthLoading(false);
        return;
      }
      const session = {
        id: sessionUser.id,
        email: sessionUser.email,
        displayName: profile.display_name,
        role: profile.role,
        creatorId: profile.creator_id,
      };
      setAuth(session);
      setRole(session.role);
      setAuthLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => loadProfile(data?.session?.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session?.user || null);
    });

    return () => { mounted = false; listener?.subscription?.unsubscribe(); };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuth(null);
    setDb(emptyDb);
    setActiveModule("dashboard");
    setSel({});
    setRoleOpen(false);
  };

  /* ---------- data: fetch every table from Supabase once signed in ---------- */
  const fetchAllData = async () => {
    setDbLoading(true);
    setDbError(null);
    try {
      const [
        brandsRes, creatorsRes, campaignsRes, dealsRes, deliverablesRes,
        creatorInvoicesRes, brandInvoicesRes, paymentsRes, documentsRes, notificationsRes,
      ] = await Promise.all([
        supabase.from("brands").select("*").order("created_at"),
        supabase.from("creators").select("*").order("created_at"),
        supabase.from("campaigns").select("*").order("created_at"),
        supabase.from("deals").select("*").order("created_at"),
        supabase.from("deliverables").select("*").order("created_at"),
        supabase.from("creator_invoices").select("*").order("created_at"),
        supabase.from("brand_invoices").select("*").order("created_at"),
        supabase.from("payments").select("*").order("created_at"),
        supabase.from("documents").select("*").order("created_at"),
        supabase.from("notifications").select("*").order("created_at", { ascending: false }),
      ]);
      const results = [brandsRes, creatorsRes, campaignsRes, dealsRes, deliverablesRes, creatorInvoicesRes, brandInvoicesRes, paymentsRes, documentsRes, notificationsRes];
      const firstError = results.find((r) => r.error);
      if (firstError) throw firstError.error;

      setDb({
        brands: (brandsRes.data || []).map(mapBrand),
        creators: (creatorsRes.data || []).map(mapCreator),
        campaigns: (campaignsRes.data || []).map(mapCampaign),
        deals: (dealsRes.data || []).map(mapDeal),
        deliverables: (deliverablesRes.data || []).map(mapDeliverable),
        creatorInvoices: (creatorInvoicesRes.data || []).map(mapCreatorInvoice),
        brandInvoices: (brandInvoicesRes.data || []).map(mapBrandInvoice),
        payments: (paymentsRes.data || []).map(mapPayment),
        documents: (documentsRes.data || []).map(mapDocument),
        notifications: (notificationsRes.data || []).map(mapNotification),
      });
    } catch (err) {
      console.error(err);
      setDbError(err?.message || "Failed to load data from Supabase.");
    } finally {
      setDbLoading(false);
    }
  };

  useEffect(() => {
    if (auth) fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.id]);

  const goTo = (m, id) => {
    setQuery("");
    setActiveModule(m);
    if (id) setSel((s) => ({ ...s, [m.slice(0, -1)]: id }));
  };

  /* ---------- lookups ---------- */
  const brandById = (id) => db.brands.find((b) => b.id === id);
  const creatorById = (id) => db.creators.find((c) => c.id === id);
  const campaignById = (id) => db.campaigns.find((c) => c.id === id);
  const dealById = (id) => db.deals.find((d) => d.id === id);

  /* ---------- computed rollups ---------- */
  const dealsWithJoins = useMemo(() => db.deals.map((d) => ({
    ...d, campaign: campaignById(d.campaignId), creator: creatorById(d.creatorId),
  })), [db]);

  const deliverablesWithJoins = useMemo(() => db.deliverables.map((dl) => {
    const deal = dealById(dl.dealId);
    return { ...dl, deal, campaign: deal && campaignById(deal.campaignId), creator: deal && creatorById(deal.creatorId), brand: deal && campaignById(deal.campaignId) && brandById(campaignById(deal.campaignId).brandId) };
  }), [db]);

  const creatorInvoicesWithJoins = useMemo(() => db.creatorInvoices.map((ci) => {
    const deal = dealById(ci.dealId);
    const campaign = deal && campaignById(deal.campaignId);
    return { ...ci, deal, creator: deal && creatorById(deal.creatorId), campaign, brand: campaign && brandById(campaign.brandId), pending: ci.total - ci.paid };
  }), [db]);

  const brandInvoicesWithJoins = useMemo(() => db.brandInvoices.map((bi) => {
    const campaign = campaignById(bi.campaignId);
    return { ...bi, campaign, brand: campaign && brandById(campaign.brandId), pending: bi.total - bi.received };
  }), [db]);

  const campaignFinancials = (campaignId) => {
    const cDeals = dealsWithJoins.filter((d) => d.campaignId === campaignId);
    const creatorCost = cDeals.reduce((s, d) => s + d.amount, 0);
    const bInv = brandInvoicesWithJoins.filter((b) => b.campaignId === campaignId);
    const revenue = bInv.reduce((s, b) => s + b.amount, 0);
    const otherCosts = 0;
    const profit = revenue - creatorCost - otherCosts;
    const margin = revenue ? (profit / revenue) * 100 : 0;
    return { revenue, creatorCost, otherCosts, profit, margin };
  };

  const brandTotals = (brandId) => {
    const camps = db.campaigns.filter((c) => c.brandId === brandId);
    const inv = brandInvoicesWithJoins.filter((b) => camps.some((c) => c.id === b.campaignId));
    const invoiced = inv.reduce((s, i) => s + i.total, 0);
    const received = inv.reduce((s, i) => s + i.received, 0);
    return { campaigns: camps, invoiced, received, outstanding: invoiced - received };
  };

  const creatorTotals = (creatorId) => {
    const myDeals = dealsWithJoins.filter((d) => d.creatorId === creatorId);
    const inv = creatorInvoicesWithJoins.filter((i) => myDeals.some((d) => d.id === i.dealId));
    const earnings = inv.filter((i) => i.status !== "Rejected").reduce((s, i) => s + i.total, 0);
    const paid = inv.filter((i) => i.status !== "Rejected").reduce((s, i) => s + i.paid, 0);
    return { deals: myDeals, earnings, paid, outstanding: earnings - paid };
  };

  /* ---------- dashboard aggregates ---------- */
  const dash = useMemo(() => {
    const brandReceivables = brandInvoicesWithJoins.reduce((s, b) => s + b.pending, 0);
    const creatorPayables = creatorInvoicesWithJoins.filter(i => i.status !== "Rejected").reduce((s, c) => s + c.pending, 0);
    const revenue = brandInvoicesWithJoins.reduce((s, b) => s + b.total, 0);
    const creatorCost = dealsWithJoins.reduce((s, d) => s + d.amount, 0);
    const grossProfit = revenue - creatorCost;
    const paymentsReceived = db.payments.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
    const paymentsOverdue = brandInvoicesWithJoins.filter((b) => b.pending > 0 && isPast(b.dueDate)).length;
    const activeCampaigns = db.campaigns.filter((c) => c.status === "Active").length;
    const upcomingCampaigns = db.campaigns.filter((c) => c.status === "Upcoming").length;
    const completedCampaigns = db.campaigns.filter((c) => c.status === "Completed").length;
    const pendingDeliverables = deliverablesWithJoins.filter((d) => !["Live", "Completed"].includes(d.status)).length;
    const awaitingApproval = deliverablesWithJoins.filter((d) => d.status === "Video Submitted").length;
    const scheduledVideos = deliverablesWithJoins.filter((d) => d.status === "Scheduled").length;
    const liveThisWeek = deliverablesWithJoins.filter((d) => (d.status === "Live" || d.status === "Scheduled") && isWithinWeek(d.live || d.scheduled)).length;
    const overdueDeliverables = deliverablesWithJoins.filter((d) => !["Live", "Completed"].includes(d.status) && isPast(d.due)).length;
    const completedDeliverables = deliverablesWithJoins.filter((d) => d.status === "Completed").length;
    const pendingInvoices = creatorInvoicesWithJoins.filter((c) => c.status === "Pending Review").length;
    const zohoFailures = creatorInvoicesWithJoins.filter((c) => c.zoho === "Sync Failed").length + brandInvoicesWithJoins.filter((b) => b.zoho === "Sync Failed").length;
    const brandPaymentsPending = brandInvoicesWithJoins.filter((b) => b.pending > 0).length;
    const creatorPaymentsPending = creatorInvoicesWithJoins.filter((c) => c.pending > 0 && c.status !== "Rejected").length;
    return { brandReceivables, creatorPayables, revenue, creatorCost, grossProfit, paymentsReceived, paymentsOverdue, activeCampaigns, upcomingCampaigns, completedCampaigns, pendingDeliverables, awaitingApproval, scheduledVideos, liveThisWeek, overdueDeliverables, completedDeliverables, pendingInvoices, zohoFailures, brandPaymentsPending, creatorPaymentsPending };
  }, [db]);

  /* ---------- mutations: each one writes to Supabase, then refreshes local state ---------- */
  const updateDeliverableStatus = async (id, status) => {
    const patch = { status };
    if (status === "Scheduled") patch.scheduled = daysFromNow(2);
    if (status === "Live") patch.live = todayISO();
    if (status === "Completed") patch.completed = todayISO();
    const { error } = await supabase.from("deliverables").update(patch).eq("id", id);
    if (error) { showToast("Failed to update deliverable: " + error.message); return; }
    showToast("Deliverable status updated");
    fetchAllData();
  };

  const approveCreatorInvoice = async (id) => {
    const { error } = await supabase.from("creator_invoices").update({ status: "Approved", zoho: "Syncing" }).eq("id", id);
    if (error) { showToast("Failed to approve invoice: " + error.message); return; }
    showToast("Invoice approved — syncing to Zoho Books…");
    fetchAllData();
    // NOTE: this still only simulates the Zoho sync status. Wire up a real Zoho
    // Books API call here (ideally from a server-side function, not the browser,
    // since it needs a secret API token) before relying on this for real accounting.
    setTimeout(async () => {
      await supabase.from("creator_invoices").update({ zoho: "Synced", zoho_bill_id: "ZB-" + Math.floor(3400 + Math.random() * 500) }).eq("id", id);
      showToast("Zoho purchase bill created");
      fetchAllData();
    }, 1200);
  };
  const rejectCreatorInvoice = async (id, reason) => {
    const { error } = await supabase.from("creator_invoices").update({ status: "Rejected", zoho: "—", reject_reason: reason || "Rejected by accounts." }).eq("id", id);
    if (error) { showToast("Failed to reject invoice: " + error.message); return; }
    showToast("Invoice rejected");
    fetchAllData();
  };
  const retryZohoSync = async (id) => {
    await supabase.from("creator_invoices").update({ zoho: "Syncing" }).eq("id", id);
    fetchAllData();
    setTimeout(async () => {
      const current = db.creatorInvoices.find((i) => i.id === id);
      await supabase.from("creator_invoices").update({ zoho: "Synced", zoho_bill_id: current?.zohoBillId || "ZB-" + Math.floor(3400 + Math.random() * 500) }).eq("id", id);
      fetchAllData();
    }, 1000);
  };
  const recordCreatorPayment = async (id, amount) => {
    const invoice = db.creatorInvoices.find((i) => i.id === id);
    if (!invoice) return;
    const newPaid = Math.min(invoice.total, invoice.paid + amount);
    const { error: updErr } = await supabase.from("creator_invoices").update({ paid: newPaid }).eq("id", id);
    if (updErr) { showToast("Failed to record payment: " + updErr.message); return; }
    const { error: payErr } = await supabase.from("payments").insert({
      direction: "out", ref_type: "creatorInvoice", ref_id: id, amount, date: todayISO(),
      method: "NEFT", utr: "UTR" + Math.floor(Math.random() * 9000000000), zoho_payment_id: "ZP-" + Math.floor(9900 + Math.random() * 99),
    });
    if (payErr) { showToast("Payment ledger entry failed: " + payErr.message); return; }
    showToast("Creator payment recorded");
    fetchAllData();
  };
  const recordBrandPayment = async (id, amount) => {
    const invoice = db.brandInvoices.find((b) => b.id === id);
    if (!invoice) return;
    const newReceived = Math.min(invoice.total, invoice.received + amount);
    const { error: updErr } = await supabase.from("brand_invoices").update({
      received: newReceived, status: newReceived >= invoice.total ? "Paid" : "Sent",
    }).eq("id", id);
    if (updErr) { showToast("Failed to record payment: " + updErr.message); return; }
    const { error: payErr } = await supabase.from("payments").insert({
      direction: "in", ref_type: "brandInvoice", ref_id: id, amount, date: todayISO(),
      method: "NEFT", utr: "UTR" + Math.floor(Math.random() * 9000000000), zoho_payment_id: "ZP-" + Math.floor(9900 + Math.random() * 99),
    });
    if (payErr) { showToast("Payment ledger entry failed: " + payErr.message); return; }
    showToast("Brand payment recorded");
    fetchAllData();
  };
  const submitCreatorInvoice = async (payload) => {
    const { error } = await supabase.from("creator_invoices").insert({
      deal_id: payload.dealId, invoice_number: payload.invoiceNumber, date: payload.date,
      amount: payload.amount, gst: payload.gst, tds: payload.tds, total: payload.total,
      due_date: payload.dueDate, status: "Pending Review", zoho: "Pending Sync", paid: 0,
    });
    if (error) { showToast("Failed to submit invoice: " + error.message); return; }
    showToast("Invoice submitted for review");
    fetchAllData();
  };
  const addBrand = async (payload) => {
    const { error } = await supabase.from("brands").insert({
      name: payload.name, poc: payload.poc, email: payload.email, phone: payload.phone,
      payment_terms: payload.paymentTerms, notes: payload.notes, industry: payload.industry,
    });
    if (error) { showToast("Failed to create brand: " + error.message); return; }
    showToast("Brand created");
    fetchAllData();
  };
  const addCreator = async (payload) => {
    const { error } = await supabase.from("creators").insert({
      name: payload.name, handle: payload.handle, platform: payload.platform, phone: payload.phone,
      email: payload.email, gst: payload.gst, pan: payload.pan, standard: payload.standard,
      bank_name: payload.bank?.name, bank_acc: payload.bank?.acc, bank_ifsc: payload.bank?.ifsc,
    });
    if (error) { showToast("Failed to add creator: " + error.message); return; }
    showToast("Creator added");
    fetchAllData();
  };
  const addCampaign = async (payload) => {
    const { error } = await supabase.from("campaigns").insert({
      name: payload.name, brand_id: payload.brandId, poc: payload.poc,
      start_date: payload.start, end_date: payload.end, budget: payload.budget,
      payment_terms: payload.paymentTerms, status: "Draft", team: [],
    });
    if (error) { showToast("Failed to create campaign: " + error.message); return; }
    showToast("Campaign created");
    fetchAllData();
  };
  const addDeal = async (payload) => {
    const { error } = await supabase.from("deals").insert({
      campaign_id: payload.campaignId, creator_id: payload.creatorId, amount: payload.amount,
      scope: payload.scope, status: "Draft", approval: "Pending", notes: "",
    });
    if (error) { showToast("Failed to add deal: " + error.message); return; }
    showToast("Deal added");
    fetchAllData();
  };
  const createBrandInvoice = async (payload) => {
    const { error } = await supabase.from("brand_invoices").insert({
      campaign_id: payload.campaignId, invoice_number: payload.invoiceNumber, date: payload.date,
      amount: payload.amount, gst: payload.gst, total: payload.total, due_date: payload.dueDate,
      status: "Draft", zoho: "Pending Sync", received: 0,
    });
    if (error) { showToast("Failed to create invoice: " + error.message); return; }
    showToast("Brand invoice created");
    fetchAllData();
  };

  /* ---------- global search ---------- */
  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return {
      brands: db.brands.filter((b) => b.name.toLowerCase().includes(q)),
      creators: db.creators.filter((c) => c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q)),
      campaigns: db.campaigns.filter((c) => c.name.toLowerCase().includes(q)),
      creatorInvoices: creatorInvoicesWithJoins.filter((i) => i.invoiceNumber.toLowerCase().includes(q)),
      brandInvoices: brandInvoicesWithJoins.filter((i) => i.invoiceNumber.toLowerCase().includes(q)),
    };
  }, [query, db]);

  /* ---------- role-scoped nav ---------- */
  const NAV_FULL = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "brands", label: "Brands", icon: Building2 },
    { id: "creators", label: "Creators", icon: Users },
    { id: "campaigns", label: "Campaigns", icon: Briefcase },
    { id: "deliverables", label: "Deliverables", icon: ListChecks },
    { id: "creatorInvoices", label: "Creator Invoices", icon: Receipt },
    { id: "brandInvoices", label: "Brand Invoices", icon: FileText },
    { id: "payments", label: "Payments", icon: Wallet },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "documents", label: "Documents", icon: FolderOpen },
  ];
  const NAV_CREATOR = [
    { id: "dashboard", label: "My Overview", icon: LayoutDashboard },
    { id: "campaigns", label: "My Campaigns", icon: Briefcase },
    { id: "deliverables", label: "My Deliverables", icon: ListChecks },
    { id: "creatorInvoices", label: "My Invoices", icon: Receipt },
    { id: "payments", label: "My Payments", icon: Wallet },
  ];
  const nav = role === "creator" ? NAV_CREATOR : NAV_FULL;

  /* ============================== RENDER ============================== */
  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-rose-200 via-amber-100 to-emerald-200">
        <div className="text-slate-500 text-sm f-body">Loading…</div>
      </div>
    );
  }

  if (!auth) {
    return <LoginScreen />;
  }

  return (
    <div className="h-screen w-full flex bg-gradient-to-br from-rose-200 via-amber-100 to-emerald-200 f-body text-slate-800" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <FontStyles />
      {/* SIDEBAR */}
      <aside className="w-56 shrink-0 bg-slate-950 text-slate-300 flex flex-col">
        <div className="px-5 py-5 border-b border-red-900">
          <RepCreatorsLogo />
          <div className="text-[11px] text-slate-500 mt-1.5 tracking-wide uppercase">Operations Platform</div>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = activeModule === n.id;
            return (
              <button key={n.id} onClick={() => goTo(n.id)} className={`w-full flex items-center gap-2.5 px-5 py-2.5 text-sm f-body transition-colors ${active ? "bg-slate-900 text-white border-r-2 border-red-500" : "text-slate-400 hover:text-white hover:bg-slate-900/60"}`}>
                <Icon size={15} /> {n.label}
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-red-900 text-[11px] text-slate-500 f-body">
          Zoho Books: <span className="text-emerald-400">Connected</span>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOPBAR */}
        <header className="h-14 shrink-0 bg-white border-b border-red-100 flex items-center gap-3 px-5">
          <div className="flex-1 max-w-md relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search brands, creators, campaigns, invoices…" className="w-full bg-slate-50 border border-red-100 rounded-lg pl-9 pr-3 py-1.5 text-sm f-body focus:outline-none focus:ring-2 focus:ring-red-200" />
          </div>
          <div className="flex-1" />
          <div className="relative">
            <button onClick={() => setNotifOpen((o) => !o)} className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-500">
              <Bell size={17} />
              {db.notifications.length > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 shadow-lg z-40 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-red-50 font-medium text-sm f-display">Notifications</div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {db.notifications.map((n) => (
                    <div key={n.id} className="px-4 py-2.5 flex gap-2 text-sm">
                      <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${n.severity === "high" ? "bg-red-500" : n.severity === "medium" ? "bg-amber-500" : "bg-slate-300"}`} />
                      <div>
                        <div className="text-slate-700 f-body">{n.text}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{n.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setRoleOpen((o) => !o)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-100 hover:bg-slate-50 text-sm">
              <UserCircle2 size={16} className="text-slate-500" />
              <span className="f-body">{auth?.displayName || (role === "admin" ? "Admin / Founder" : role === "poc" ? "POC / Campaign Manager" : "Creator")}</span>
              <ChevronDown size={13} className="text-slate-400" />
            </button>
            {roleOpen && (
              <div className="absolute right-0 top-11 w-64 bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 shadow-lg z-40 overflow-hidden">
                <div className="px-3 py-2 text-xs text-slate-400 border-b border-red-50 flex items-center justify-between">
                  <span>Signed in as <span className="text-slate-600 font-medium">{auth?.email}</span></span>
                </div>
                <div className="px-3 py-2 text-xs text-slate-400 border-b border-red-50">Preview as role</div>
                {[["admin", "Admin / Founder — full access"], ["poc", "POC / Campaign Manager"], ["creator", "Creator"]].map(([r, label]) => (
                  <button key={r} onClick={() => { setRole(r); setActiveModule("dashboard"); setRoleOpen(false); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 f-body ${role === r ? "text-red-600 font-medium" : "text-slate-600"}`}>{label}</button>
                ))}
                <div className="border-t border-red-50">
                  <button onClick={handleLogout} className="w-full flex items-center gap-2 text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 f-body font-medium">
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* BODY */}
        <main className="flex-1 overflow-y-auto p-6">
          {toast && <div className="fixed bottom-6 right-6 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg z-50 f-body">{toast}</div>}
          {dbError && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 f-body">{dbError}</div>}

          {searchResults ? (
            <SearchResults results={searchResults} goTo={goTo} />
          ) : (
            <>
              {activeModule === "dashboard" && role !== "creator" && <Dashboard dash={dash} deliverablesWithJoins={deliverablesWithJoins} creatorInvoicesWithJoins={creatorInvoicesWithJoins} brandInvoicesWithJoins={brandInvoicesWithJoins} db={db} goTo={goTo} />}
              {activeModule === "dashboard" && role === "creator" && <CreatorHome creatorId={demoCreatorId} creator={creatorById(demoCreatorId)} totals={creatorTotals(demoCreatorId)} deliverablesWithJoins={deliverablesWithJoins.filter((d) => d.creator?.id === demoCreatorId)} invoices={creatorInvoicesWithJoins.filter((i) => i.creator?.id === demoCreatorId)} goTo={goTo} />}

              {activeModule === "brands" && !sel.brand && <BrandsList brands={db.brands} brandTotals={brandTotals} goTo={goTo} onAdd={() => setModal({ type: "addBrand" })} />}
              {activeModule === "brands" && sel.brand && <BrandDetail brand={brandById(sel.brand)} totals={brandTotals(sel.brand)} dealsWithJoins={dealsWithJoins} brandInvoicesWithJoins={brandInvoicesWithJoins.filter((b) => b.brand?.id === sel.brand)} documents={db.documents.filter((d) => d.entityType === "brand" && d.entityId === sel.brand)} goTo={goTo} back={() => setSel((s) => ({ ...s, brand: null }))} />}

              {activeModule === "creators" && !sel.creator && <CreatorsList creators={db.creators} creatorTotals={creatorTotals} goTo={goTo} onAdd={() => setModal({ type: "addCreator" })} role={role} />}
              {activeModule === "creators" && sel.creator && <CreatorDetail creator={creatorById(sel.creator)} totals={creatorTotals(sel.creator)} invoices={creatorInvoicesWithJoins.filter((i) => i.creator?.id === sel.creator)} deliverablesWithJoins={deliverablesWithJoins.filter((d) => d.creator?.id === sel.creator)} documents={db.documents.filter((d) => d.entityType === "creator" && d.entityId === sel.creator)} goTo={goTo} back={() => setSel((s) => ({ ...s, creator: null }))} />}

              {activeModule === "campaigns" && !sel.campaign && role !== "creator" && <CampaignsList campaigns={db.campaigns} brandById={brandById} campaignFinancials={campaignFinancials} goTo={goTo} onAdd={() => setModal({ type: "addCampaign" })} />}
              {activeModule === "campaigns" && role === "creator" && (() => {
                const myCampIds = [...new Set(dealsWithJoins.filter(d => d.creatorId === demoCreatorId).map(d => d.campaignId))];
                return <CampaignsList campaigns={db.campaigns.filter(c => myCampIds.includes(c.id))} brandById={brandById} campaignFinancials={campaignFinancials} goTo={goTo} restricted />;
              })()}
              {activeModule === "campaigns" && sel.campaign && <CampaignDetail campaign={campaignById(sel.campaign)} brand={brandById(campaignById(sel.campaign)?.brandId)} deals={dealsWithJoins.filter((d) => d.campaignId === sel.campaign)} deliverablesWithJoins={deliverablesWithJoins.filter((d) => d.campaign?.id === sel.campaign)} brandInvoices={brandInvoicesWithJoins.filter((b) => b.campaignId === sel.campaign)} financials={campaignFinancials(sel.campaign)} goTo={goTo} back={() => setSel((s) => ({ ...s, campaign: null }))} onAddDeal={() => setModal({ type: "addDeal", campaignId: sel.campaign })} onStatusChange={updateDeliverableStatus} role={role} />}

              {activeModule === "deliverables" && <DeliverablesModule rows={role === "creator" ? deliverablesWithJoins.filter(d => d.creator?.id === demoCreatorId) : deliverablesWithJoins} onStatusChange={updateDeliverableStatus} goTo={goTo} role={role} />}

              {activeModule === "creatorInvoices" && <CreatorInvoicesModule rows={role === "creator" ? creatorInvoicesWithJoins.filter(i => i.creator?.id === demoCreatorId) : creatorInvoicesWithJoins} onApprove={approveCreatorInvoice} onReject={rejectCreatorInvoice} onRetrySync={retryZohoSync} onRecordPayment={(id, amt) => recordCreatorPayment(id, amt)} onSubmit={() => setModal({ type: "submitInvoice" })} goTo={goTo} role={role} />}

              {activeModule === "brandInvoices" && role !== "creator" && <BrandInvoicesModule rows={brandInvoicesWithJoins} onRecordPayment={recordBrandPayment} onCreate={() => setModal({ type: "createBrandInvoice" })} goTo={goTo} />}

              {activeModule === "payments" && <PaymentsModule payments={db.payments} creatorInvoicesWithJoins={creatorInvoicesWithJoins} brandInvoicesWithJoins={brandInvoicesWithJoins} role={role} demoCreatorId={demoCreatorId} />}

              {activeModule === "reports" && role !== "creator" && <ReportsModule db={db} campaigns={db.campaigns} campaignFinancials={campaignFinancials} deliverablesWithJoins={deliverablesWithJoins} brandInvoicesWithJoins={brandInvoicesWithJoins} creatorInvoicesWithJoins={creatorInvoicesWithJoins} />}

              {activeModule === "documents" && role !== "creator" && <DocumentsModule documents={db.documents} brandById={brandById} creatorById={creatorById} />}
            </>
          )}
        </main>
      </div>

      {/* MODALS */}
      {modal?.type === "addBrand" && <AddBrandModal onClose={() => setModal(null)} onSave={(p) => { addBrand(p); setModal(null); }} />}
      {modal?.type === "addCreator" && <AddCreatorModal onClose={() => setModal(null)} onSave={(p) => { addCreator(p); setModal(null); }} />}
      {modal?.type === "addCampaign" && <AddCampaignModal brands={db.brands} onClose={() => setModal(null)} onSave={(p) => { addCampaign(p); setModal(null); }} />}
      {modal?.type === "addDeal" && <AddDealModal creators={db.creators} campaignId={modal.campaignId} onClose={() => setModal(null)} onSave={(p) => { addDeal(p); setModal(null); }} />}
      {modal?.type === "submitInvoice" && <SubmitInvoiceModal deals={dealsWithJoins} onClose={() => setModal(null)} onSave={(p) => { submitCreatorInvoice(p); setModal(null); }} />}
      {modal?.type === "createBrandInvoice" && <CreateBrandInvoiceModal campaigns={db.campaigns} brandById={brandById} onClose={() => setModal(null)} onSave={(p) => { createBrandInvoice(p); setModal(null); }} />}
    </div>
  );
}

/* ============================== DASHBOARD ============================== */
function Dashboard({ dash, deliverablesWithJoins, creatorInvoicesWithJoins, brandInvoicesWithJoins, db, goTo }) {
  const liveThisWeekList = deliverablesWithJoins.filter((d) => (d.status === "Live" || d.status === "Scheduled") && isWithinWeek(d.live || d.scheduled)).slice(0, 5);
  const overdueList = deliverablesWithJoins.filter((d) => !["Live", "Completed"].includes(d.status) && isPast(d.due)).slice(0, 5);
  const approvalList = deliverablesWithJoins.filter((d) => d.status === "Video Submitted").slice(0, 5);

  return (
    <div>
      <SectionHeader title="Dashboard" />
      <div className="grid grid-cols-4 gap-3 mb-3">
        <KPICard label="Brand Receivables" value={inr(dash.brandReceivables)} tone="amber" icon={ArrowDownRight} sub={`${dash.brandPaymentsPending} invoices pending`} onClick={() => goTo("brandInvoices")} />
        <KPICard label="Creator Payables" value={inr(dash.creatorPayables)} tone="amber" icon={ArrowUpRight} sub={`${dash.creatorPaymentsPending} invoices pending`} onClick={() => goTo("creatorInvoices")} />
        <KPICard label="Revenue (Billed)" value={inr(dash.revenue)} tone="indigo" icon={CircleDollarSign} onClick={() => goTo("brandInvoices")} />
        <KPICard label="Creator Cost" value={inr(dash.creatorCost)} tone="slate" icon={Wallet} onClick={() => goTo("creatorInvoices")} />
      </div>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <KPICard label="Expected Gross Profit" value={inr(dash.grossProfit)} tone="emerald" icon={BarChart3} sub={`${dash.revenue ? ((dash.grossProfit / dash.revenue) * 100).toFixed(0) : 0}% margin`} onClick={() => goTo("reports")} />
        <KPICard label="Payments Received" value={inr(dash.paymentsReceived)} tone="emerald" icon={ArrowDownRight} onClick={() => goTo("payments")} />
        <KPICard label="Payments Overdue" value={dash.paymentsOverdue} tone="red" icon={AlertTriangle} sub="brand invoices" onClick={() => goTo("brandInvoices")} />
        <KPICard label="Zoho Sync Failures" value={dash.zohoFailures} tone={dash.zohoFailures ? "red" : "slate"} icon={RefreshCw} onClick={() => goTo("creatorInvoices")} />
      </div>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <KPICard label="Active Campaigns" value={dash.activeCampaigns} tone="emerald" icon={Briefcase} onClick={() => goTo("campaigns")} />
        <KPICard label="Upcoming Campaigns" value={dash.upcomingCampaigns} tone="indigo" icon={CalendarClock} onClick={() => goTo("campaigns")} />
        <KPICard label="Completed Campaigns" value={dash.completedCampaigns} tone="slate" icon={Check} onClick={() => goTo("campaigns")} />
        <KPICard label="Pending Deliverables" value={dash.pendingDeliverables} tone="amber" icon={ListChecks} onClick={() => goTo("deliverables")} />
      </div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KPICard label="Awaiting Approval" value={dash.awaitingApproval} tone="amber" icon={Clock} onClick={() => goTo("deliverables")} />
        <KPICard label="Scheduled Videos" value={dash.scheduledVideos} tone="indigo" icon={CalendarClock} onClick={() => goTo("deliverables")} />
        <KPICard label="Going Live This Week" value={dash.liveThisWeek} tone="emerald" icon={ArrowUpRight} onClick={() => goTo("deliverables")} />
        <KPICard label="Overdue Deliverables" value={dash.overdueDeliverables} tone="red" icon={AlertTriangle} onClick={() => goTo("deliverables")} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <DashList title="Overdue Deliverables" icon={AlertTriangle} tone="red" items={overdueList} empty="Nothing overdue — good shape." render={(d) => (
          <div onClick={() => goTo("campaigns", d.campaign?.id)} className="cursor-pointer">
            <div className="text-sm text-slate-700 f-body">{d.creator?.name} · {d.type}</div>
            <div className="text-xs text-slate-400 f-body">{d.brief} — due {fmtDate(d.due)}</div>
          </div>
        )} />
        <DashList title="Awaiting Approval" icon={Clock} tone="amber" items={approvalList} empty="No videos waiting on review." render={(d) => (
          <div onClick={() => goTo("campaigns", d.campaign?.id)} className="cursor-pointer">
            <div className="text-sm text-slate-700 f-body">{d.creator?.name} · {d.type}</div>
            <div className="text-xs text-slate-400 f-body">{d.brief}</div>
          </div>
        )} />
        <DashList title="Going Live This Week" icon={ArrowUpRight} tone="emerald" items={liveThisWeekList} empty="Nothing scheduled this week." render={(d) => (
          <div onClick={() => goTo("campaigns", d.campaign?.id)} className="cursor-pointer">
            <div className="text-sm text-slate-700 f-body">{d.creator?.name} · {d.type}</div>
            <div className="text-xs text-slate-400 f-body">{d.status} — {fmtDate(d.live || d.scheduled)}</div>
          </div>
        )} />
      </div>
    </div>
  );
}

const DashList = ({ title, icon: Icon, tone, items, empty, render }) => {
  const toneColor = { red: "text-red-600", amber: "text-amber-600", emerald: "text-emerald-600" }[tone];
  return (
    <div className="bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 p-4">
      <div className={`flex items-center gap-1.5 text-sm font-medium mb-3 f-display ${toneColor}`}><Icon size={14} /> {title}</div>
      {items.length === 0 ? <EmptyState text={empty} /> : <div className="space-y-3">{items.map((it, i) => <div key={i} className="pb-3 border-b border-slate-50 last:border-0 last:pb-0">{render(it)}</div>)}</div>}
    </div>
  );
};

/* ============================== SEARCH RESULTS ============================== */
function SearchResults({ results, goTo }) {
  const groups = [
    ["brands", "Brands", (b) => <div onClick={() => goTo("brands", b.id)} className="cursor-pointer hover:text-red-600">{b.name} <span className="text-xs text-slate-400">— {b.poc}</span></div>],
    ["creators", "Creators", (c) => <div onClick={() => goTo("creators", c.id)} className="cursor-pointer hover:text-red-600">{c.name} <span className="text-xs text-slate-400">— {c.handle}</span></div>],
    ["campaigns", "Campaigns", (c) => <div onClick={() => goTo("campaigns", c.id)} className="cursor-pointer hover:text-red-600">{c.name}</div>],
    ["creatorInvoices", "Creator Invoices", (i) => <div onClick={() => goTo("creatorInvoices")} className="cursor-pointer hover:text-red-600">{i.invoiceNumber} <span className="text-xs text-slate-400">— {i.creator?.name}</span></div>],
    ["brandInvoices", "Brand Invoices", (i) => <div onClick={() => goTo("brandInvoices")} className="cursor-pointer hover:text-red-600">{i.invoiceNumber} <span className="text-xs text-slate-400">— {i.brand?.name}</span></div>],
  ];
  const any = groups.some(([k]) => results[k]?.length);
  return (
    <div>
      <SectionHeader title="Search Results" />
      {!any && <EmptyState text="No matches found." />}
      <div className="space-y-5">
        {groups.map(([key, label, render]) => results[key]?.length > 0 && (
          <div key={key} className="bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 p-4">
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 f-body">{label}</div>
            <div className="space-y-1.5 text-sm">{results[key].map((r) => <div key={r.id}>{render(r)}</div>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== BRANDS ============================== */
function BrandsList({ brands, brandTotals, goTo, onAdd }) {
  return (
    <div>
      <SectionHeader title="Brands" action={<Btn icon={Plus} onClick={onAdd}>Add Brand</Btn>} />
      <Table head={["Brand", "POC", "Active Campaigns", "Invoiced", "Received", "Outstanding", "Terms"]}>
        {brands.map((b) => {
          const t = brandTotals(b.id);
          const active = t.campaigns.filter((c) => c.status === "Active").length;
          return (
            <Tr key={b.id} onClick={() => goTo("brands", b.id)}>
              <Td><span className="font-medium text-slate-900">{b.name}</span></Td>
              <Td>{b.poc}</Td>
              <Td>{active}</Td>
              <Td mono>{inr(t.invoiced)}</Td>
              <Td mono>{inr(t.received)}</Td>
              <Td mono>{inr(t.outstanding)}</Td>
              <Td muted>{b.paymentTerms}</Td>
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}

function BrandDetail({ brand, totals, dealsWithJoins, brandInvoicesWithJoins, documents, goTo, back }) {
  const [tab, setTab] = useState("overview");
  if (!brand) return null;
  return (
    <div>
      <SectionHeader title={brand.name} crumbs={[{ label: "Brands", onClick: back }, { label: brand.name }]} />
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KPICard label="Total Business" value={inr(totals.invoiced)} tone="indigo" />
        <KPICard label="Amount Received" value={inr(totals.received)} tone="emerald" />
        <KPICard label="Outstanding" value={inr(totals.outstanding)} tone="amber" />
        <KPICard label="Active Campaigns" value={totals.campaigns.filter((c) => c.status === "Active").length} tone="slate" />
      </div>
      <Tabs tab={tab} setTab={setTab} tabs={["overview", "campaigns", "invoices", "documents"]} />
      {tab === "overview" && (
        <div className="bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 p-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label="POC" value={brand.poc} />
          <InfoRow label="Email" value={brand.email} />
          <InfoRow label="Phone" value={brand.phone} />
          <InfoRow label="Payment Terms" value={brand.paymentTerms} />
          <InfoRow label="Industry" value={brand.industry} />
          <InfoRow label="Notes" value={brand.notes} full />
        </div>
      )}
      {tab === "campaigns" && (
        <Table head={["Campaign", "Status", "Start", "End", "Budget"]}>
          {totals.campaigns.map((c) => (
            <Tr key={c.id} onClick={() => goTo("campaigns", c.id)}>
              <Td><span className="font-medium text-slate-900">{c.name}</span></Td>
              <Td><Badge tone={statusTone(c.status)}>{c.status}</Badge></Td>
              <Td muted>{fmtDate(c.start)}</Td>
              <Td muted>{fmtDate(c.end)}</Td>
              <Td mono>{inr(c.budget)}</Td>
            </Tr>
          ))}
        </Table>
      )}
      {tab === "invoices" && (
        <Table head={["Invoice #", "Campaign", "Date", "Total", "Received", "Pending", "Status", "Zoho"]}>
          {brandInvoicesWithJoins.map((i) => (
            <Tr key={i.id} onClick={() => goTo("brandInvoices")}>
              <Td>{i.invoiceNumber}</Td>
              <Td muted>{i.campaign?.name}</Td>
              <Td muted>{fmtDate(i.date)}</Td>
              <Td mono>{inr(i.total)}</Td>
              <Td mono>{inr(i.received)}</Td>
              <Td mono>{inr(i.pending)}</Td>
              <Td><Badge tone={statusTone(i.status)}>{i.status}</Badge></Td>
              <Td><Badge tone={statusTone(i.zoho)}>{i.zoho}</Badge></Td>
            </Tr>
          ))}
        </Table>
      )}
      {tab === "documents" && <DocsTable documents={documents} />}
    </div>
  );
}

/* ============================== CREATORS ============================== */
function CreatorsList({ creators, creatorTotals, goTo, onAdd, role }) {
  return (
    <div>
      <SectionHeader title="Creators" action={role !== "creator" && <Btn icon={Plus} onClick={onAdd}>Add Creator</Btn>} />
      <Table head={["Creator", "Platform", "Standard Commercials", "Total Earnings", "Paid", "Outstanding"]}>
        {creators.map((c) => {
          const t = creatorTotals(c.id);
          return (
            <Tr key={c.id} onClick={() => goTo("creators", c.id)}>
              <Td><span className="font-medium text-slate-900">{c.name}</span> <span className="text-slate-400 text-xs">{c.handle}</span></Td>
              <Td muted>{c.platform}</Td>
              <Td muted>{c.standard}</Td>
              <Td mono>{inr(t.earnings)}</Td>
              <Td mono>{inr(t.paid)}</Td>
              <Td mono>{inr(t.outstanding)}</Td>
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}

function CreatorDetail({ creator, totals, invoices, deliverablesWithJoins, documents, goTo, back }) {
  const [tab, setTab] = useState("overview");
  if (!creator) return null;
  const brandsWorked = [...new Set(totals.deals.map((d) => d.campaign?.brandId))].length;
  return (
    <div>
      <SectionHeader title={creator.name} crumbs={[{ label: "Creators", onClick: back }, { label: creator.name }]} />
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KPICard label="Total Earnings" value={inr(totals.earnings)} tone="indigo" />
        <KPICard label="Paid" value={inr(totals.paid)} tone="emerald" />
        <KPICard label="Outstanding" value={inr(totals.outstanding)} tone="amber" />
        <KPICard label="Brands Worked With" value={brandsWorked} tone="slate" />
      </div>
      <Tabs tab={tab} setTab={setTab} tabs={["overview", "campaigns", "invoices", "documents"]} />
      {tab === "overview" && (
        <div className="bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 p-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label="Handle" value={`${creator.handle} · ${creator.platform}`} />
          <InfoRow label="Phone" value={creator.phone} />
          <InfoRow label="Email" value={creator.email} />
          <InfoRow label="GST" value={creator.gst} />
          <InfoRow label="PAN" value={creator.pan} />
          <InfoRow label="Bank" value={`${creator.bank?.name} · ${creator.bank?.acc} · ${creator.bank?.ifsc}`} />
          <InfoRow label="Standard Commercials" value={creator.standard} full />
        </div>
      )}
      {tab === "campaigns" && (
        <Table head={["Campaign", "Brand", "Scope", "Amount", "Deal Status"]}>
          {totals.deals.map((d) => (
            <Tr key={d.id} onClick={() => goTo("campaigns", d.campaign?.id)}>
              <Td><span className="font-medium text-slate-900">{d.campaign?.name}</span></Td>
              <Td muted>{d.campaign?.brandId}</Td>
              <Td muted>{d.scope}</Td>
              <Td mono>{inr(d.amount)}</Td>
              <Td><Badge tone={statusTone(d.status)}>{d.status}</Badge></Td>
            </Tr>
          ))}
        </Table>
      )}
      {tab === "invoices" && (
        <Table head={["Invoice #", "Campaign", "Total", "Paid", "Pending", "Status", "Zoho"]}>
          {invoices.map((i) => (
            <Tr key={i.id} onClick={() => goTo("creatorInvoices")}>
              <Td>{i.invoiceNumber}</Td>
              <Td muted>{i.campaign?.name}</Td>
              <Td mono>{inr(i.total)}</Td>
              <Td mono>{inr(i.paid)}</Td>
              <Td mono>{inr(i.pending)}</Td>
              <Td><Badge tone={statusTone(i.status)}>{i.status}</Badge></Td>
              <Td><Badge tone={statusTone(i.zoho)}>{i.zoho}</Badge></Td>
            </Tr>
          ))}
        </Table>
      )}
      {tab === "documents" && <DocsTable documents={documents} />}
    </div>
  );
}

/* ============================== CAMPAIGNS ============================== */
function CampaignsList({ campaigns, brandById, campaignFinancials, goTo, onAdd, restricted }) {
  return (
    <div>
      <SectionHeader title={restricted ? "My Campaigns" : "Campaigns"} action={onAdd && <Btn icon={Plus} onClick={onAdd}>New Campaign</Btn>} />
      <Table head={["Campaign", "Brand", "Status", "Start", "End", "Revenue", "Margin"]}>
        {campaigns.map((c) => {
          const brand = brandById(c.brandId);
          const f = campaignFinancials(c.id);
          return (
            <Tr key={c.id} onClick={() => goTo("campaigns", c.id)}>
              <Td><span className="font-medium text-slate-900">{c.name}</span></Td>
              <Td muted>{brand?.name}</Td>
              <Td><Badge tone={statusTone(c.status)}>{c.status}</Badge></Td>
              <Td muted>{fmtDate(c.start)}</Td>
              <Td muted>{fmtDate(c.end)}</Td>
              <Td mono>{inr(f.revenue)}</Td>
              <Td mono>{f.revenue ? f.margin.toFixed(0) + "%" : "—"}</Td>
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}

function CampaignDetail({ campaign, brand, deals, deliverablesWithJoins, brandInvoices, financials, goTo, back, onAddDeal, onStatusChange, role }) {
  const [tab, setTab] = useState("overview");
  if (!campaign) return null;
  return (
    <div>
      <SectionHeader title={campaign.name} crumbs={[{ label: "Campaigns", onClick: back }, { label: campaign.name }]} action={<Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>} />
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KPICard label="Revenue" value={inr(financials.revenue)} tone="indigo" />
        <KPICard label="Creator Cost" value={inr(financials.creatorCost)} tone="slate" />
        <KPICard label="Expected Profit" value={inr(financials.profit)} tone={financials.profit >= 0 ? "emerald" : "red"} />
        <KPICard label="Margin" value={financials.revenue ? financials.margin.toFixed(1) + "%" : "—"} tone={financials.margin >= 0 ? "emerald" : "red"} />
      </div>
      <Tabs tab={tab} setTab={setTab} tabs={["overview", "deals", "deliverables", role !== "creator" ? "brand invoice" : null].filter(Boolean)} />
      {tab === "overview" && (
        <div className="bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 p-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label="Brand" value={<button onClick={() => goTo("brands", brand?.id)} className="text-red-600 hover:underline">{brand?.name}</button>} />
          <InfoRow label="POC" value={campaign.poc} />
          <InfoRow label="Start / End" value={`${fmtDate(campaign.start)} – ${fmtDate(campaign.end)}`} />
          <InfoRow label="Payment Terms" value={campaign.paymentTerms} />
          <InfoRow label="Internal Team" value={(campaign.team || []).join(", ") || "—"} />
          <InfoRow label="Creators Involved" value={deals.length} />
        </div>
      )}
      {tab === "deals" && (
        <div>
          {role !== "creator" && <div className="flex justify-end mb-3"><Btn size="sm" icon={Plus} onClick={onAddDeal}>Add Deal</Btn></div>}
          <Table head={["Creator", "Scope", "Amount", "Deal Status", "Approval"]}>
            {deals.map((d) => (
              <Tr key={d.id} onClick={() => goTo("creators", d.creator?.id)}>
                <Td><span className="font-medium text-slate-900">{d.creator?.name}</span></Td>
                <Td muted>{d.scope}</Td>
                <Td mono>{inr(d.amount)}</Td>
                <Td><Badge tone={statusTone(d.status)}>{d.status}</Badge></Td>
                <Td><Badge tone={statusTone(d.approval === "Approved" ? "Approved" : "Pending Review")}>{d.approval}</Badge></Td>
              </Tr>
            ))}
          </Table>
        </div>
      )}
      {tab === "deliverables" && (
        <Table head={["Creator", "Type", "Brief", "Due", "Status", role !== "creator" ? "Update" : null].filter(Boolean)}>
          {deliverablesWithJoins.map((d) => (
            <Tr key={d.id}>
              <Td>{d.creator?.name}</Td>
              <Td muted>{d.type}</Td>
              <Td muted>{d.brief}</Td>
              <Td className={isPast(d.due) && !["Live", "Completed"].includes(d.status) ? "text-red-600" : ""}>{fmtDate(d.due)}</Td>
              <Td><Badge tone={statusTone(d.status)}>{d.status}</Badge></Td>
              {role !== "creator" && <Td>
                <select value={d.status} onChange={(e) => onStatusChange(d.id, e.target.value)} className="text-xs border border-red-100 rounded-md px-1.5 py-1 f-body">
                  {DELIVERABLE_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Td>}
            </Tr>
          ))}
        </Table>
      )}
      {tab === "brand invoice" && (
        <Table head={["Invoice #", "Date", "Total", "Received", "Pending", "Status", "Zoho"]}>
          {brandInvoices.map((i) => (
            <Tr key={i.id} onClick={() => goTo("brandInvoices")}>
              <Td>{i.invoiceNumber}</Td>
              <Td muted>{fmtDate(i.date)}</Td>
              <Td mono>{inr(i.total)}</Td>
              <Td mono>{inr(i.received)}</Td>
              <Td mono>{inr(i.pending)}</Td>
              <Td><Badge tone={statusTone(i.status)}>{i.status}</Badge></Td>
              <Td><Badge tone={statusTone(i.zoho)}>{i.zoho}</Badge></Td>
            </Tr>
          ))}
        </Table>
      )}
    </div>
  );
}

/* ============================== DELIVERABLES ============================== */
function DeliverablesModule({ rows, onStatusChange, goTo, role }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  return (
    <div>
      <SectionHeader title={role === "creator" ? "My Deliverables" : "Deliverables"} action={
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="text-sm border border-red-100 rounded-lg px-2.5 py-1.5 f-body">
          <option value="all">All statuses</option>
          {DELIVERABLE_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      } />
      <Table head={["Creator", "Brand", "Campaign", "Type", "Brief", "Due", "Status", role !== "creator" ? "Update" : null].filter(Boolean)}>
        {filtered.length === 0 && <tr><td colSpan={8}><EmptyState text="No deliverables match this filter." /></td></tr>}
        {filtered.map((d) => (
          <Tr key={d.id}>
            <Td onClick={() => goTo("creators", d.creator?.id)}><span className="text-red-600 hover:underline cursor-pointer">{d.creator?.name}</span></Td>
            <Td muted onClick={() => goTo("brands", d.brand?.id)}>{d.brand?.name}</Td>
            <Td muted onClick={() => goTo("campaigns", d.campaign?.id)}>{d.campaign?.name}</Td>
            <Td>{d.type}</Td>
            <Td muted>{d.brief}</Td>
            <Td>{isPast(d.due) && !["Live", "Completed"].includes(d.status) ? <span className="text-red-600 font-medium">{fmtDate(d.due)}</span> : fmtDate(d.due)}</Td>
            <Td><Badge tone={statusTone(d.status)}>{d.status}</Badge></Td>
            {role !== "creator" && <Td>
              <select value={d.status} onChange={(e) => onStatusChange(d.id, e.target.value)} className="text-xs border border-red-100 rounded-md px-1.5 py-1 f-body">
                {DELIVERABLE_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Td>}
          </Tr>
        ))}
      </Table>
    </div>
  );
}

/* ============================== CREATOR INVOICES ============================== */
function CreatorInvoicesModule({ rows, onApprove, onReject, onRetrySync, onRecordPayment, onSubmit, goTo, role }) {
  const [payModal, setPayModal] = useState(null);
  return (
    <div>
      <SectionHeader title={role === "creator" ? "My Invoices" : "Creator Invoices"} action={<Btn icon={Plus} onClick={onSubmit}>Submit Invoice</Btn>} />
      <Table head={["Invoice #", "Creator", "Campaign", "Total", "Paid", "Pending", "Status", "Zoho", "Actions"]}>
        {rows.map((i) => (
          <Tr key={i.id}>
            <Td>{i.invoiceNumber}</Td>
            <Td onClick={() => goTo("creators", i.creator?.id)}><span className="text-red-600 hover:underline cursor-pointer">{i.creator?.name}</span></Td>
            <Td muted onClick={() => goTo("campaigns", i.campaign?.id)}>{i.campaign?.name}</Td>
            <Td mono>{inr(i.total)}</Td>
            <Td mono>{inr(i.paid)}</Td>
            <Td mono>{inr(i.pending)}</Td>
            <Td>
              <Badge tone={statusTone(i.status)}>{i.status}</Badge>
              {i.status === "Rejected" && i.rejectReason && <div className="text-xs text-red-500 mt-1 max-w-[160px]">{i.rejectReason}</div>}
            </Td>
            <Td>
              <div className="flex items-center gap-1.5">
                <Badge tone={statusTone(i.zoho)}>{i.zoho}</Badge>
                {i.zoho === "Sync Failed" && <button onClick={() => onRetrySync(i.id)} title="Retry sync"><RefreshCw size={12} className="text-slate-400 hover:text-red-600" /></button>}
              </div>
              {i.zohoBillId && <div className="text-xs text-slate-400 mt-1 f-ledger">{i.zohoBillId}</div>}
            </Td>
            <Td>
              <div className="flex gap-1.5 flex-wrap">
                {i.status === "Pending Review" && role !== "creator" && (
                  <>
                    <Btn size="sm" variant="success" icon={Check} onClick={() => onApprove(i.id)}>Approve</Btn>
                    <Btn size="sm" variant="danger" icon={XCircle} onClick={() => onReject(i.id, prompt("Rejection reason?") || undefined)}>Reject</Btn>
                  </>
                )}
                {i.status === "Approved" && i.pending > 0 && role !== "creator" && (
                  <Btn size="sm" variant="secondary" onClick={() => setPayModal(i)}>Record Payment</Btn>
                )}
              </div>
            </Td>
          </Tr>
        ))}
      </Table>
      {payModal && (
        <Modal title={`Record payment — ${payModal.invoiceNumber}`} onClose={() => setPayModal(null)}>
          <PaymentForm max={payModal.pending} onSave={(amt) => { onRecordPayment(payModal.id, amt); setPayModal(null); }} />
        </Modal>
      )}
    </div>
  );
}

/* ============================== BRAND INVOICES ============================== */
function BrandInvoicesModule({ rows, onRecordPayment, onCreate, goTo }) {
  const [payModal, setPayModal] = useState(null);
  return (
    <div>
      <SectionHeader title="Brand Invoices" action={<Btn icon={Plus} onClick={onCreate}>Create Invoice</Btn>} />
      <Table head={["Invoice #", "Brand", "Campaign", "Total", "Received", "Pending", "Due", "Status", "Zoho", "Actions"]}>
        {rows.map((i) => (
          <Tr key={i.id}>
            <Td>{i.invoiceNumber}</Td>
            <Td onClick={() => goTo("brands", i.brand?.id)}><span className="text-red-600 hover:underline cursor-pointer">{i.brand?.name}</span></Td>
            <Td muted onClick={() => goTo("campaigns", i.campaign?.id)}>{i.campaign?.name}</Td>
            <Td mono>{inr(i.total)}</Td>
            <Td mono>{inr(i.received)}</Td>
            <Td mono>{inr(i.pending)}</Td>
            <Td className={isPast(i.dueDate) && i.pending > 0 ? "text-red-600" : ""}>{fmtDate(i.dueDate)}</Td>
            <Td><Badge tone={statusTone(i.status)}>{i.status}</Badge></Td>
            <Td><Badge tone={statusTone(i.zoho)}>{i.zoho}</Badge></Td>
            <Td>{i.pending > 0 && <Btn size="sm" variant="secondary" onClick={() => setPayModal(i)}>Record Payment</Btn>}</Td>
          </Tr>
        ))}
      </Table>
      {payModal && (
        <Modal title={`Record payment — ${payModal.invoiceNumber}`} onClose={() => setPayModal(null)}>
          <PaymentForm max={payModal.pending} onSave={(amt) => { onRecordPayment(payModal.id, amt); setPayModal(null); }} />
        </Modal>
      )}
    </div>
  );
}

function PaymentForm({ max, onSave }) {
  const [amt, setAmt] = useState(max);
  return (
    <div>
      <Field label={`Amount (pending: ${inr(max)})`}>
        <input type="number" value={amt} max={max} onChange={(e) => setAmt(Number(e.target.value))} className={inputCls} />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="success" onClick={() => amt > 0 && amt <= max && onSave(amt)}>Record Payment</Btn>
      </div>
    </div>
  );
}

/* ============================== PAYMENTS LEDGER ============================== */
function PaymentsModule({ payments, creatorInvoicesWithJoins, brandInvoicesWithJoins, role, demoCreatorId }) {
  let rows = payments.map((p) => {
    if (p.refType === "creatorInvoice") {
      const inv = creatorInvoicesWithJoins.find((i) => i.id === p.refId);
      return { ...p, party: inv?.creator?.name, ref: inv?.invoiceNumber, creatorId: inv?.creator?.id };
    }
    const inv = brandInvoicesWithJoins.find((i) => i.id === p.refId);
    return { ...p, party: inv?.brand?.name, ref: inv?.invoiceNumber };
  });
  if (role === "creator") rows = rows.filter((r) => r.creatorId === demoCreatorId);
  return (
    <div>
      <SectionHeader title={role === "creator" ? "My Payments" : "Payments"} />
      <Table head={["Direction", "Party", "Invoice #", "Amount", "Date", "Method", "UTR", "Zoho Payment ID"]}>
        {rows.map((p) => (
          <Tr key={p.id}>
            <Td>{p.direction === "in" ? <Badge tone="emerald">Money In</Badge> : <Badge tone="amber">Money Out</Badge>}</Td>
            <Td>{p.party}</Td>
            <Td muted>{p.ref}</Td>
            <Td mono>{inr(p.amount)}</Td>
            <Td muted>{fmtDate(p.date)}</Td>
            <Td muted>{p.method}</Td>
            <Td mono muted>{p.utr}</Td>
            <Td mono muted>{p.zohoPaymentId}</Td>
          </Tr>
        ))}
      </Table>
    </div>
  );
}

/* ============================== REPORTS ============================== */
function ReportsModule({ db, campaigns, campaignFinancials, deliverablesWithJoins, brandInvoicesWithJoins, creatorInvoicesWithJoins }) {
  const chartData = campaigns.map((c) => {
    const f = campaignFinancials(c.id);
    return { name: c.name.split(" — ")[0], Revenue: f.revenue, "Creator Cost": f.creatorCost, Profit: f.profit };
  });
  const statusPie = Object.entries(deliverablesWithJoins.reduce((acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));
  const pieColors = ["#e11d2e", "#0f172a", "#b45309", "#059669", "#64748b", "#f97316", "#7c3aed", "#ca8a04", "#16a34a", "#9333ea"];

  const totalReceivable = brandInvoicesWithJoins.reduce((s, b) => s + b.pending, 0);
  const overdueReceivable = brandInvoicesWithJoins.filter((b) => b.pending > 0 && isPast(b.dueDate)).reduce((s, b) => s + b.pending, 0);
  const totalPayable = creatorInvoicesWithJoins.filter(i => i.status !== "Rejected").reduce((s, c) => s + c.pending, 0);
  const overduePayable = creatorInvoicesWithJoins.filter((c) => c.status !== "Rejected" && c.pending > 0 && isPast(c.dueDate)).reduce((s, c) => s + c.pending, 0);

  return (
    <div>
      <SectionHeader title="Financial / Profitability Reports" />
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KPICard label="Brand Receivables" value={inr(totalReceivable)} tone="amber" />
        <KPICard label="Overdue Receivables" value={inr(overdueReceivable)} tone="red" />
        <KPICard label="Creator Payables" value={inr(totalPayable)} tone="amber" />
        <KPICard label="Overdue Creator Payments" value={inr(overduePayable)} tone="red" />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 p-4">
          <div className="f-display text-sm font-medium text-slate-700 mb-3">Revenue vs Creator Cost vs Profit, by Campaign</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
              <Tooltip formatter={(v) => inr(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Revenue" fill="#e11d2e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Creator Cost" fill="#b45309" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Profit" fill="#059669" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 p-4">
          <div className="f-display text-sm font-medium text-slate-700 mb-3">Deliverables by Status</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={{ fontSize: 10 }}>
                {statusPie.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <Table head={["Campaign", "Revenue", "Creator Cost", "Other Costs", "Expected Profit", "Margin"]}>
        {campaigns.map((c) => {
          const f = campaignFinancials(c.id);
          return (
            <Tr key={c.id}>
              <Td><span className="font-medium text-slate-900">{c.name}</span></Td>
              <Td mono>{inr(f.revenue)}</Td>
              <Td mono>{inr(f.creatorCost)}</Td>
              <Td mono>{inr(f.otherCosts)}</Td>
              <Td mono><span className={f.profit >= 0 ? "text-emerald-700" : "text-red-600"}>{inr(f.profit)}</span></Td>
              <Td mono>{f.revenue ? f.margin.toFixed(1) + "%" : "—"}</Td>
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}

/* ============================== DOCUMENTS ============================== */
function DocumentsModule({ documents, brandById, creatorById }) {
  return (
    <div>
      <SectionHeader title="Documents" />
      <Table head={["File", "Type", "Linked To", "Uploaded By", "Date", ""]}>
        {documents.map((d) => {
          const owner = d.entityType === "brand" ? brandById(d.entityId)?.name : creatorById(d.entityId)?.name;
          return (
            <Tr key={d.id}>
              <Td>{d.fileName}</Td>
              <Td muted>{d.fileType}</Td>
              <Td muted>{owner} ({d.entityType})</Td>
              <Td muted>{d.uploadedBy}</Td>
              <Td muted>{fmtDate(d.uploadDate)}</Td>
              <Td><button className="text-red-600 hover:underline text-xs inline-flex items-center gap-1">View <ExternalLink size={11} /></button></Td>
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}
function DocsTable({ documents }) {
  return (
    <Table head={["File", "Type", "Uploaded By", "Date", ""]}>
      {documents.length === 0 && <tr><td colSpan={5}><EmptyState text="No documents uploaded." /></td></tr>}
      {documents.map((d) => (
        <Tr key={d.id}>
          <Td>{d.fileName}</Td>
          <Td muted>{d.fileType}</Td>
          <Td muted>{d.uploadedBy}</Td>
          <Td muted>{fmtDate(d.uploadDate)}</Td>
          <Td><button className="text-red-600 hover:underline text-xs inline-flex items-center gap-1">View <ExternalLink size={11} /></button></Td>
        </Tr>
      ))}
    </Table>
  );
}

/* ============================== CREATOR PORTAL HOME ============================== */
function CreatorHome({ creator, totals, deliverablesWithJoins, invoices, goTo }) {
  if (!creator) return null;
  const pendingDeliverables = deliverablesWithJoins.filter((d) => !["Live", "Completed"].includes(d.status));
  return (
    <div>
      <SectionHeader title={`Welcome, ${creator.name}`} />
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KPICard label="Total Earnings" value={inr(totals.earnings)} tone="indigo" />
        <KPICard label="Paid" value={inr(totals.paid)} tone="emerald" />
        <KPICard label="Outstanding" value={inr(totals.outstanding)} tone="amber" />
        <KPICard label="Active Campaigns" value={[...new Set(totals.deals.filter(d => d.status === "Active").map(d => d.campaignId))].length} tone="slate" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 p-4">
          <div className="f-display text-sm font-medium text-slate-700 mb-3">My Pending Deliverables</div>
          {pendingDeliverables.length === 0 ? <EmptyState text="You're all caught up." /> : (
            <div className="space-y-2">
              {pendingDeliverables.map((d) => (
                <div key={d.id} onClick={() => goTo("campaigns", d.campaign?.id)} className="flex justify-between items-center text-sm cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1.5">
                  <div>
                    <div className="text-slate-700 f-body">{d.brief}</div>
                    <div className="text-xs text-slate-400">{d.campaign?.name} — due {fmtDate(d.due)}</div>
                  </div>
                  <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white border border-red-100 rounded-xl shadow-sm shadow-rose-900/10 p-4">
          <div className="f-display text-sm font-medium text-slate-700 mb-3">My Invoices</div>
          <div className="space-y-2">
            {invoices.map((i) => (
              <div key={i.id} className="flex justify-between items-center text-sm px-2 py-1.5">
                <div>
                  <div className="text-slate-700 f-body">{i.invoiceNumber}</div>
                  <div className="text-xs text-slate-400 f-ledger">{inr(i.total)} · pending {inr(i.pending)}</div>
                </div>
                <Badge tone={statusTone(i.status)}>{i.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== SHARED SMALL COMPONENTS ============================== */
function Tabs({ tab, setTab, tabs }) {
  return (
    <div className="flex gap-1 mb-4 border-b border-red-100">
      {tabs.map((t) => (
        <button key={t} onClick={() => setTab(t)} className={`px-3.5 py-2 text-sm capitalize f-body border-b-2 -mb-px transition-colors ${tab === t ? "border-red-600 text-red-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t}</button>
      ))}
    </div>
  );
}
function InfoRow({ label, value, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-xs text-slate-400 f-body mb-0.5">{label}</div>
      <div className="text-slate-800 f-body">{value || "—"}</div>
    </div>
  );
}

/* ============================== FORM MODALS ============================== */
function AddBrandModal({ onClose, onSave }) {
  const [f, setF] = useState({ name: "", poc: "", email: "", phone: "", paymentTerms: "Net 30", industry: "", notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Add Brand" onClose={onClose}>
      <Field label="Brand Name"><input className={inputCls} value={f.name} onChange={set("name")} /></Field>
      <Field label="POC Name"><input className={inputCls} value={f.poc} onChange={set("poc")} /></Field>
      <Field label="Email"><input className={inputCls} value={f.email} onChange={set("email")} /></Field>
      <Field label="Phone"><input className={inputCls} value={f.phone} onChange={set("phone")} /></Field>
      <Field label="Payment Terms"><input className={inputCls} value={f.paymentTerms} onChange={set("paymentTerms")} /></Field>
      <Field label="Notes"><textarea className={inputCls} rows={2} value={f.notes} onChange={set("notes")} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => f.name && onSave(f)}>Save Brand</Btn></div>
    </Modal>
  );
}
function AddCreatorModal({ onClose, onSave }) {
  const [f, setF] = useState({ name: "", handle: "", platform: "", phone: "", email: "", gst: "", pan: "", standard: "", bank: { name: "", acc: "", ifsc: "" } });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Add Creator" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={set("name")} /></Field>
        <Field label="Handle"><input className={inputCls} value={f.handle} onChange={set("handle")} /></Field>
        <Field label="Platform"><input className={inputCls} value={f.platform} onChange={set("platform")} /></Field>
        <Field label="Phone"><input className={inputCls} value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Email"><input className={inputCls} value={f.email} onChange={set("email")} /></Field>
        <Field label="GST"><input className={inputCls} value={f.gst} onChange={set("gst")} /></Field>
        <Field label="PAN"><input className={inputCls} value={f.pan} onChange={set("pan")} /></Field>
        <Field label="Standard Commercials"><input className={inputCls} value={f.standard} onChange={set("standard")} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => f.name && onSave(f)}>Save Creator</Btn></div>
    </Modal>
  );
}
function AddCampaignModal({ brands, onClose, onSave }) {
  const [f, setF] = useState({ name: "", brandId: brands[0]?.id, poc: "", start: todayISO(), end: daysFromNow(30), budget: 0, paymentTerms: "Net 30" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="New Campaign" onClose={onClose}>
      <Field label="Campaign Name"><input className={inputCls} value={f.name} onChange={set("name")} /></Field>
      <Field label="Brand"><select className={inputCls} value={f.brandId} onChange={set("brandId")}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <Field label="POC"><input className={inputCls} value={f.poc} onChange={set("poc")} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start Date"><input type="date" className={inputCls} value={f.start} onChange={set("start")} /></Field>
        <Field label="End Date"><input type="date" className={inputCls} value={f.end} onChange={set("end")} /></Field>
      </div>
      <Field label="Budget (₹)"><input type="number" className={inputCls} value={f.budget} onChange={(e) => setF({ ...f, budget: Number(e.target.value) })} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => f.name && onSave(f)}>Create Campaign</Btn></div>
    </Modal>
  );
}
function AddDealModal({ creators, campaignId, onClose, onSave }) {
  const [f, setF] = useState({ creatorId: creators[0]?.id, scope: "", amount: 0 });
  return (
    <Modal title="Add Deal" onClose={onClose}>
      <Field label="Creator"><select className={inputCls} value={f.creatorId} onChange={(e) => setF({ ...f, creatorId: e.target.value })}>{creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Scope (e.g. 2 Reels + 1 Story)"><input className={inputCls} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} /></Field>
      <Field label="Amount (₹)"><input type="number" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => onSave({ ...f, campaignId })}>Add Deal</Btn></div>
    </Modal>
  );
}
function SubmitInvoiceModal({ deals, onClose, onSave }) {
  const [f, setF] = useState({ dealId: deals[0]?.id, invoiceNumber: "", date: todayISO(), amount: 0, dueDate: daysFromNow(30) });
  const gst = Math.round(f.amount * 0.18);
  const tds = Math.round(f.amount * 0.02);
  const total = f.amount + gst - tds;
  return (
    <Modal title="Submit Creator Invoice" onClose={onClose}>
      <Field label="Deal">
        <select className={inputCls} value={f.dealId} onChange={(e) => setF({ ...f, dealId: e.target.value })}>
          {deals.map((d) => <option key={d.id} value={d.id}>{d.creator?.name} — {d.campaign?.name}</option>)}
        </select>
      </Field>
      <Field label="Invoice Number"><input className={inputCls} value={f.invoiceNumber} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} /></Field>
      <Field label="Amount (₹, before GST)"><input type="number" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
      <div className="text-xs text-slate-400 f-body -mt-2 mb-3">GST (18%): {inr(gst)} · TDS (2%): {inr(tds)} · Total payable: <span className="f-ledger text-slate-600">{inr(total)}</span></div>
      <Field label="Due Date"><input type="date" className={inputCls} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => f.invoiceNumber && onSave({ dealId: f.dealId, invoiceNumber: f.invoiceNumber, date: f.date, amount: f.amount, gst, tds, total, dueDate: f.dueDate })}>Submit Invoice</Btn></div>
    </Modal>
  );
}
function CreateBrandInvoiceModal({ campaigns, brandById, onClose, onSave }) {
  const [f, setF] = useState({ campaignId: campaigns[0]?.id, invoiceNumber: "", amount: 0, dueDate: daysFromNow(30) });
  const gst = Math.round(f.amount * 0.18);
  const total = f.amount + gst;
  return (
    <Modal title="Create Brand Invoice" onClose={onClose}>
      <Field label="Campaign">
        <select className={inputCls} value={f.campaignId} onChange={(e) => setF({ ...f, campaignId: e.target.value })}>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} — {brandById(c.brandId)?.name}</option>)}
        </select>
      </Field>
      <Field label="Invoice Number"><input className={inputCls} value={f.invoiceNumber} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} /></Field>
      <Field label="Amount (₹, before GST)"><input type="number" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
      <div className="text-xs text-slate-400 f-body -mt-2 mb-3">GST (18%): {inr(gst)} · Total: <span className="f-ledger text-slate-600">{inr(total)}</span></div>
      <Field label="Due Date"><input type="date" className={inputCls} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => f.invoiceNumber && onSave({ campaignId: f.campaignId, invoiceNumber: f.invoiceNumber, date: todayISO(), amount: f.amount, gst, total, dueDate: f.dueDate })}>Create Invoice</Btn></div>
    </Modal>
  );
}
