import { useState, useMemo, useEffect } from "react";
import {
  LayoutDashboard, Building2, Users, Briefcase, ListChecks, Receipt, Wallet,
  BarChart3, FolderOpen, Bell, Search, ChevronRight, X, Plus, Check, XCircle,
  Clock, AlertTriangle, RefreshCw, ArrowUpRight, ArrowDownRight, UserCircle2,
  ChevronDown, ExternalLink, FileText, CircleDollarSign, CalendarClock, Filter,
  Lock, LogOut, Eye, EyeOff, AlertCircle, Camera, PlayCircle, MessageCircle, Link2, Globe
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { supabase } from "./supabaseClient";
import jsPDF from "jspdf";

/* ============================== FONTS / TOKENS ============================== */
const FontStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Manrope:wght@400;500;600;700&family=Poppins:wght@400;800&display=swap');
    .f-logo { font-family: 'Poppins', sans-serif; }
    .f-display { font-family: 'Sora', sans-serif; letter-spacing: -0.02em; }
    .f-body { font-family: 'Manrope', sans-serif; letter-spacing: -0.006em; }
    .f-ledger { font-family: 'Manrope', sans-serif; font-variant-numeric: tabular-nums; font-weight: 600; }
    .accent-bar { position: relative; }
    .accent-bar::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; border-radius:3px 0 0 3px; }
    h1, h2, h3, .f-display { font-weight: 700; }
    body, input, select, textarea, button { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { -moz-appearance: textfield; }
    nav::-webkit-scrollbar { display: none; }
    /* Rep Creators typography scale — used by shared components and new
       page sections; existing per-element sizes are migrated gradually. */
    .text-page-title { font-size: 26px; line-height: 1.2; font-weight: 700; }
    .text-metric { font-size: 28px; line-height: 1.15; font-weight: 700; }
    .text-section-heading { font-size: 16px; line-height: 1.3; font-weight: 600; }
    .text-card-title { font-size: 15px; line-height: 1.3; font-weight: 600; }
    .text-meta { font-size: 11.5px; line-height: 1.4; }
  `}</style>
);

const inr = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const neg = n < 0;
  const v = Math.abs(Math.round(n));
  const s = "₹" + v.toLocaleString("en-IN");
  return neg ? "\u2011" + s : s; // non-breaking hyphen — never wraps away from the amount
};
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const isWithinWeek = (d) => { if (!d) return false; const t = new Date(); const target = new Date(d); const diff = (target - t) / 86400000; return diff >= -0.5 && diff <= 7; };
const isPast = (d) => { if (!d) return false; return new Date(d) < new Date(new Date().toDateString()); };

// Indian financial year: April 1 – March 31. e.g. Feb 2027 -> "FY 2026-27".
const getFY = (dateStr) => {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12
  const startYear = m >= 4 ? y : y - 1;
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
};

// Parses a scope string like "2 Reels + 1 Story" or "3 Reels" into individual
// deliverable stubs: [{ type: "Reel", brief: "Reel 1" }, { type: "Reel", brief: "Reel 2" }, ...]
// Falls back to a single generic deliverable if the scope doesn't parse cleanly.
const parseScopeToDeliverables = (scope) => {
  if (!scope || !scope.trim()) return [];
  const parts = scope.split(/[+,]| and /i).map((s) => s.trim()).filter(Boolean);
  const rawTypes = [];
  parts.forEach((part) => {
    const m = part.match(/^(\d+)\s*(.+)$/);
    let count = 1, type = part;
    if (m) { count = parseInt(m[1], 10) || 1; type = m[2]; }
    type = type.trim().replace(/ies$/i, "y").replace(/s$/i, ""); // rough singularize
    if (!type) return;
    for (let i = 0; i < count; i++) rawTypes.push(type);
  });
  const seenCounts = {};
  return rawTypes.map((type) => {
    seenCounts[type] = (seenCounts[type] || 0) + 1;
    return { type, brief: `${type} ${seenCounts[type]}` };
  });
};

const timeAgo = (iso) => {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// ---------- PDF generation (client-side, no backend needed) ----------
const pdfHeader = (doc, title) => {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("rep/creators", 14, 17);
  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240);
  doc.text(title, 196, 17, { align: "right" });
  doc.setTextColor(30, 41, 59);
};

const pdfRow = (doc, y, label, value) => {
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(label, 14, y);
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.text(String(value ?? "—"), 70, y);
};

const downloadCreatorInvoicePDF = (inv) => {
  const doc = new jsPDF();
  pdfHeader(doc, "CREATOR INVOICE");
  let y = 42;
  doc.setFontSize(13);
  doc.text(`Invoice ${inv.invoiceNumber}`, 14, y); y += 10;
  pdfRow(doc, y, "Creator", inv.creator?.name); y += 7;
  pdfRow(doc, y, "Campaign", inv.campaign?.name); y += 7;
  pdfRow(doc, y, "Brand", inv.brand?.name); y += 7;
  pdfRow(doc, y, "Invoice Date", fmtDate(inv.date)); y += 7;
  pdfRow(doc, y, "Due Date", fmtDate(inv.dueDate)); y += 7;
  pdfRow(doc, y, "Status", inv.status); y += 12;

  doc.setDrawColor(226, 232, 240);
  doc.line(14, y, 196, y); y += 10;

  pdfRow(doc, y, "Base Amount", inr(inv.amount)); y += 7;
  pdfRow(doc, y, "GST", inr(inv.gst)); y += 7;
  pdfRow(doc, y, "TDS Deducted", "-" + inr(inv.tds)); y += 10;
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total Payable: ${inr(inv.total)}`, 14, y); y += 8;
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Paid so far: ${inr(inv.paid)}  ·  Pending: ${inr(inv.pending)}`, 14, y);

  if (inv.status === "Rejected" && inv.rejectReason) {
    y += 12;
    doc.setTextColor(220, 38, 38);
    doc.text(`Rejected: ${inv.rejectReason}`, 14, y);
  }

  doc.save(`${inv.invoiceNumber}.pdf`);
};

const downloadBrandInvoicePDF = (inv) => {
  const doc = new jsPDF();
  pdfHeader(doc, "BRAND INVOICE");
  let y = 42;
  doc.setFontSize(13);
  doc.text(`Invoice ${inv.invoiceNumber}`, 14, y); y += 10;
  pdfRow(doc, y, "Billed To", inv.brand?.name); y += 7;
  pdfRow(doc, y, "Campaign", inv.campaign?.name); y += 7;
  pdfRow(doc, y, "Invoice Date", fmtDate(inv.date)); y += 7;
  pdfRow(doc, y, "Due Date", fmtDate(inv.dueDate)); y += 7;
  pdfRow(doc, y, "Status", inv.status); y += 12;

  doc.setDrawColor(226, 232, 240);
  doc.line(14, y, 196, y); y += 10;

  pdfRow(doc, y, "Base Amount", inr(inv.amount)); y += 7;
  pdfRow(doc, y, "GST", inr(inv.gst)); y += 10;
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total: ${inr(inv.total)}`, 14, y); y += 8;
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Received so far: ${inr(inv.received)}  ·  Pending: ${inr(inv.pending)}`, 14, y);

  doc.save(`${inv.invoiceNumber}.pdf`);
};

// ---------- CSV export (client-side, no backend needed) ----------
const downloadCSV = (filename, headers, rows) => {
  const escapeCell = (val) => {
    const s = val === null || val === undefined ? "" : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const mapBrand = (r) => ({
  id: r.id, name: r.name, poc: r.poc, internalPoc: r.internal_poc, email: r.email, phone: r.phone,
  paymentTerms: r.payment_terms, notes: r.notes, industry: r.industry,
});
const mapCreator = (r) => ({
  id: r.id, name: r.name, handle: r.handle, platform: r.platform, phone: r.phone,
  email: r.email, gst: r.gst, pan: r.pan,
  bank: { name: r.bank_name, acc: r.bank_acc, ifsc: r.bank_ifsc },
  standard: r.standard, socialLinks: r.social_links || [], avatarUrl: r.avatar_url,
});
const mapCampaign = (r) => ({
  id: r.id, name: r.name, brandId: r.brand_id, poc: r.poc, internalPoc: r.internal_poc,
  start: r.start_date, end: r.end_date, budget: Number(r.budget) || 0,
  status: r.status, paymentTerms: r.payment_terms, team: r.team || [],
});
const mapDeal = (r) => ({
  id: r.id, campaignId: r.campaign_id, creatorId: r.creator_id,
  amount: Number(r.amount) || 0, brandCost: Number(r.brand_cost) || 0, scope: r.scope, status: r.status,
  approval: r.approval, notes: r.notes,
});
const mapDeliverable = (r) => ({
  id: r.id, dealId: r.deal_id, type: r.type, brief: r.brief, due: r.due,
  status: r.status, scheduled: r.scheduled, live: r.live, completed: r.completed,
  revisionNotes: r.revision_notes, stagesDone: r.stages_done || [], platformLink: r.platform_link,
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
const CAMPAIGN_STATUSES = ["Ongoing", "Closed"];
const STAGES = ["Briefing", "Scripting", "Shoot/Production", "Editing", "Approval", "Live"];

// Neutral avatar system: no gender guessing, no photo fetching — every
// creator gets a consistent icon + color, deterministically picked from
// their id, so it never changes between loads but requires no manual setup.
const AVATAR_PALETTE = [
  { bg: "bg-red-50", border: "border-red-200", icon: "text-red-500" },
  { bg: "bg-indigo-50", border: "border-indigo-200", icon: "text-indigo-500" },
  { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-500" },
  { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-500" },
  { bg: "bg-sky-50", border: "border-sky-200", icon: "text-sky-500" },
  { bg: "bg-purple-50", border: "border-purple-200", icon: "text-purple-500" },
];
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < (str || "").length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};
const avatarStyleFor = (id) => AVATAR_PALETTE[hashString(id) % AVATAR_PALETTE.length];

/* ============================== WORDMARK ============================== */
// Native brand mark — rendered as real typography, not a raster image, so
// it's always crisp and belongs to the UI itself rather than looking like
// an uploaded photo sitting in a frame. No box, border, or background.
// Exact vector trace of the real rep/creators logo artwork — extracted
// directly from the source PNG (potrace), not a font recreation. Crisp at
// any size, no image file needed, no box/frame around it.
const RepCreatorsLogo = ({ size = "md" }) => {
  const width = size === "sm" ? 130 : 190;
  return (
    <svg viewBox="0 0 974 458" style={{ width, height: width * 458 / 974 }} className="select-none block">
      <g transform="translate(0.000000,458.000000) scale(0.100000,-0.100000)">
        <path d="M556 1577 c-185 -616 -291 -966 -382 -1265 -36 -117 -62 -216 -59 -221 7 -12 323 -12 330 0 3 4 64 202 136 441 170 564 459 1520 474 1566 3 9 -34 12 -168 12 l-172 0 -159 -533z" fill="#ef4444" />
        <path d="M1135 4455 c-89 -16 -145 -38 -217 -85 l-57 -38 -3 52 -3 51 -292 3 -293 2 0 -820 0 -820 290 0 290 0 0 78 c4 755 6 889 19 924 50 136 205 191 346 123 33 -16 63 -29 67 -29 3 -1 81 98 173 219 l166 220 -41 37 c-92 83 -269 116 -445 83z M2168 4460 c-177 -30 -367 -127 -485 -247 -147 -150 -230 -342 -240 -559 -15 -313 135 -594 405 -757 261 -158 671 -181 949 -52 83 38 181 105 232 158 l33 35 -20 29 c-11 15 -79 86 -151 157 l-130 130 -44 -41 c-79 -73 -151 -106 -267 -122 -133 -18 -270 19 -343 93 -31 31 -87 122 -87 141 0 3 256 5 569 5 l570 0 8 48 c4 26 8 115 7 197 0 140 -2 156 -31 242 -119 358 -408 555 -808 552 -66 -1 -141 -5 -167 -9z m274 -420 c88 -25 178 -116 194 -197 l7 -33 -312 0 -312 0 6 23 c12 39 73 124 110 153 74 56 211 80 307 54z M4185 4463 c-114 -13 -193 -40 -327 -111 -4 -2 -8 16 -10 40 l-3 43 -290 0 -290 0 -3 -1157 -3 -1158 291 0 290 0 1 373 c1 204 1 375 0 380 -2 12 6 9 62 -22 104 -58 186 -76 352 -76 129 0 160 3 225 23 231 73 413 237 498 452 52 132 67 218 66 385 0 120 -5 166 -22 231 -44 167 -119 294 -236 400 -123 113 -260 174 -429 193 -95 11 -114 11 -172 4z m92 -551 c66 -34 110 -78 140 -140 24 -50 28 -69 28 -152 0 -82 -4 -103 -26 -151 -68 -145 -228 -213 -385 -163 -83 26 -166 107 -188 183 -21 71 -20 185 1 252 22 68 107 158 173 182 65 24 201 18 257 -11z M6010 1655 l0 -245 -145 0 -146 0 3 -87 3 -88 140 0 140 0 3 -508 2 -508 93 3 92 3 3 499 c1 275 4 502 7 504 2 2 66 5 142 7 l138 3 3 86 3 86 -146 0 -145 0 -2 193 c-1 105 -3 203 -4 217 -1 14 -2 37 -3 53 l-1 27 -90 0 -90 0 0 -245z M1561 1414 c-215 -47 -394 -215 -450 -422 -26 -95 -28 -249 -6 -337 27 -107 81 -202 159 -280 82 -81 162 -127 272 -155 94 -24 235 -26 319 -5 86 22 192 77 253 132 l53 48 -64 63 -64 63 -44 -37 c-59 -50 -129 -81 -217 -95 -190 -31 -366 61 -453 236 -33 68 -34 73 -34 190 0 117 1 122 34 190 87 176 262 267 453 236 85 -13 156 -46 215 -96 23 -19 45 -35 50 -35 13 0 113 104 113 117 0 21 -103 103 -174 138 -125 62 -275 80 -415 49z M2697 1411 c-73 -24 -129 -62 -167 -114 l-29 -40 -3 74 -3 74 -90 0 -90 0 0 -590 0 -590 92 -3 92 -3 3 403 c3 399 3 404 27 455 25 56 93 127 138 144 105 40 216 32 292 -22 24 -16 49 -28 56 -26 15 7 105 111 105 124 0 19 -67 73 -124 99 -80 37 -213 43 -299 15z M3585 1414 c-222 -47 -390 -212 -450 -442 -20 -75 -21 -230 -1 -314 37 -158 159 -319 293 -387 113 -56 201 -74 338 -68 172 7 303 59 400 157 l49 49 -62 62 -62 62 -39 -35 c-180 -164 -479 -158 -638 11 -40 41 -91 142 -100 195 l-6 36 476 0 c424 0 476 2 481 16 14 35 5 193 -14 268 -27 106 -63 169 -141 249 -131 132 -321 183 -524 141z m255 -180 c131 -39 226 -149 245 -286 l7 -48 -392 0 -393 0 6 35 c22 135 150 272 284 304 62 15 185 12 243 -5z M4830 1415 c-161 -36 -307 -154 -380 -306 -55 -114 -74 -208 -66 -329 7 -117 24 -183 73 -279 53 -104 140 -189 246 -240 97 -46 161 -61 265 -61 147 0 252 41 352 137 35 35 64 63 65 63 0 0 0 -39 0 -88 l0 -87 90 0 90 0 0 590 0 590 -90 0 -90 0 0 -88 c0 -48 -2 -87 -4 -87 -2 0 -21 20 -42 44 -48 54 -117 100 -195 127 -78 27 -226 34 -314 14z m273 -180 c178 -46 287 -205 287 -420 0 -148 -42 -250 -142 -339 -141 -127 -385 -125 -533 6 -206 180 -183 544 43 700 92 64 226 84 345 53z M7005 1413 c-83 -17 -201 -77 -267 -133 -61 -52 -139 -170 -168 -251 -34 -99 -39 -279 -11 -384 59 -215 222 -376 436 -430 75 -19 221 -19 302 0 112 26 190 71 279 161 134 133 192 285 181 472 -23 391 -366 648 -752 565z m226 -173 c171 -32 303 -175 332 -359 28 -184 -68 -376 -227 -454 -216 -106 -466 -18 -569 200 -30 65 -32 74 -32 188 0 114 2 123 32 187 86 183 267 275 464 238z M8351 1415 c-69 -20 -108 -44 -160 -100 -23 -25 -44 -45 -46 -45 -3 0 -5 32 -5 70 l0 70 -90 0 -90 0 0 -595 0 -595 90 0 90 0 0 358 c0 216 4 382 11 417 27 149 115 234 261 251 70 8 155 -16 201 -56 l34 -29 64 65 64 65 -52 49 c-29 27 -73 55 -100 65 -68 24 -205 29 -272 10z M9088 1414 c-177 -42 -271 -153 -273 -319 0 -68 4 -89 28 -137 50 -102 125 -148 348 -214 219 -64 274 -109 267 -218 -4 -52 -8 -63 -40 -92 -113 -103 -353 -78 -497 52 -58 52 -60 52 -134 -24 l-48 -49 65 -61 c112 -104 242 -152 418 -152 77 0 114 5 179 26 74 23 90 33 145 88 77 77 99 137 92 255 -11 182 -102 265 -380 347 -67 20 -145 48 -173 62 -124 67 -125 190 -1 251 40 20 63 24 135 24 109 0 185 -27 254 -91 l48 -46 62 62 61 62 -55 53 c-30 30 -80 66 -110 80 -108 53 -271 71 -391 41z" fill="#ffffff" />
      </g>
    </svg>
  );
};

/* ============================== SMALL UI PRIMITIVES ============================== */
const Badge = ({ children, tone = "slate" }) => {
  // One universal status system. Green = positive/paid/approved. Amber =
  // pending/needs action. Red = negative/rejected/overdue — reserved for
  // that meaning only, not used as a default neutral color. Indigo = a true
  // neutral "in progress / informational" state, so red doesn't dominate.
  const tones = {
    slate: "bg-slate-100 text-slate-600 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-600 border-red-200",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${tones[tone]}`}>{children}</span>;
};

const statusTone = (status) => {
  const map = {
    Active: "emerald", Completed: "slate", Upcoming: "indigo", Draft: "amber", Paused: "amber", Cancelled: "red",
    Ongoing: "emerald", Closed: "slate",
    Approved: "emerald", "Pending Review": "amber", Rejected: "red", Sent: "indigo", Paid: "emerald",
    Synced: "emerald", "Pending Sync": "amber", Syncing: "indigo", "Sync Failed": "red", "—": "slate",
    Live: "emerald", Scheduled: "indigo", "Video Submitted": "amber", "Script Pending": "amber",
    "Script Submitted": "amber", "Script Approved": "indigo", Revision: "red", Brief: "slate",
  };
  return map[status] || "slate";
};

const KPICard = ({ label, value, tone = "slate", icon: Icon, sub, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 px-4 py-3.5 transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:shadow-emerald-900/10 hover:-translate-y-0.5 active:translate-y-0" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide f-body">{label}</div>
          <div className="f-ledger text-metric text-slate-900 mt-1" style={{ whiteSpace: "nowrap" }}>{value}</div>
          {sub && <div className="text-xs text-slate-400 mt-0.5 f-body">{sub}</div>}
        </div>
        {Icon && <Icon size={16} className="text-slate-300 mt-0.5" />}
      </div>
    </div>
  );
};

const SectionHeader = ({ title, description, action, crumbs }) => (
  <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
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
      <h2 className="f-display text-2xl font-bold text-white">{title}</h2>
      {description && <p className="text-sm text-slate-400 f-body mt-1">{description}</p>}
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
    link: "bg-transparent text-red-600 hover:text-red-700 hover:underline border-transparent px-0",
  };
  const sizes = { sm: "text-xs px-2.5 py-1.5", md: "text-sm px-3.5 py-2" };
  return (
    <button type={type} onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg border font-medium f-body transition-colors ${variants[variant]} ${variant === "link" ? "" : sizes[size]}`}>
      {Icon && <Icon size={14} />} {children}
    </button>
  );
};

const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
    <div className={`bg-[#FCF9F3] rounded-xl shadow-xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-red-50 sticky top-0 bg-[#FCF9F3]">
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
const inputCls = "w-full border border-red-100 rounded-lg px-3 py-2 text-sm f-body text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400";

const Table = ({ head, children }) => (
  <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 overflow-x-auto">
    <table className="w-full text-sm min-w-[640px]">
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

/* ============================== LOGIN / SIGNUP SCREEN ============================== */
/* ============================== SET NEW PASSWORD (after clicking reset email link) ============================== */
function SetNewPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSave = async () => {
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message || "Could not update password.");
      return;
    }
    setDone(true);
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#12141A] f-body p-4">
      <FontStyles />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="mb-4"><RepCreatorsLogo /></div>
        </div>
        <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-6">
          {done ? (
            <div className="text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-3">
                <Check size={18} className="text-emerald-600" />
              </div>
              <h1 className="f-display text-lg font-semibold text-slate-900 mb-1">Password updated</h1>
              <p className="text-sm text-slate-500 f-body mb-4">You can now continue using rep/creators.</p>
              <Btn onClick={onDone}>Continue</Btn>
            </div>
          ) : (
            <>
              <h1 className="f-display text-lg font-semibold text-slate-900 mb-1">Set a new password</h1>
              <p className="text-sm text-slate-400 f-body mb-5">Choose a new password for your account.</p>
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
                  <AlertCircle size={15} className="shrink-0" /> {error}
                </div>
              )}
              <Field label="New Password">
                <div className="relative">
                  <input
                    autoFocus
                    type={showPw ? "text" : "password"}
                    className={inputCls + " pr-9"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm New Password">
                <input
                  type={showPw ? "text" : "password"}
                  className={inputCls}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  placeholder="••••••••"
                />
              </Field>
              <button
                type="button"
                disabled={loading}
                onClick={handleSave}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 font-medium f-body text-sm px-3.5 py-2.5 mt-2 transition-colors"
              >
                <Lock size={14} /> {loading ? "Saving…" : "Save New Password"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState("signin"); // signin | signup | signupSuccess | forgot | forgotSent
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message || "Could not send reset email.");
      return;
    }
    setMode("forgotSent");
  };

  const handleSignIn = async () => {
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

  const handleSignUp = async () => {
    if (!email.trim() || !password || !displayName.trim()) {
      setError("Fill in your name, email, and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    setLoading(false);
    if (signUpError) {
      // Supabase phrases "already registered" a few different ways —
      // show a calm, professional message either way.
      if (/already registered|already exists|user already/i.test(signUpError.message || "")) {
        setError("An account with this email already exists. Try signing in instead.");
      } else {
        setError("Confirmation pending.");
      }
      return;
    }
    // A database trigger (see auto_create_profile.sql) creates the matching
    // `profiles` row automatically, server-side, with role "pending" — this
    // happens regardless of whether email confirmation is required, so it's
    // reliable even without an active browser session at this point.
    setMode("signupSuccess");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") mode === "signup" ? handleSignUp() : handleSignIn();
  };

  if (mode === "signupSuccess") {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#12141A] f-body p-4">
        <FontStyles />
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-6">
            <div className="mb-4"><RepCreatorsLogo /></div>
          </div>
          <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-6 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-3">
              <Check size={18} className="text-emerald-600" />
            </div>
            <h1 className="f-display text-lg font-semibold text-slate-900 mb-1">Confirmation pending</h1>
            <Btn variant="secondary" onClick={() => { setMode("signin"); setPassword(""); }}>Back to sign in</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "forgotSent") {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#12141A] f-body p-4">
        <FontStyles />
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-6">
            <div className="mb-4"><RepCreatorsLogo /></div>
          </div>
          <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-6 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-3">
              <Check size={18} className="text-emerald-600" />
            </div>
            <h1 className="f-display text-lg font-semibold text-slate-900 mb-1">Check your email</h1>
            <p className="text-sm text-slate-500 f-body mb-4">
              If an account exists for {email}, a password reset link has been sent. Click it to set a new password.
            </p>
            <Btn variant="secondary" onClick={() => { setMode("signin"); setError(""); }}>Back to sign in</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#12141A] f-body p-4">
      <FontStyles />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="mb-4"><RepCreatorsLogo /></div>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Operations Platform</div>
        </div>

        <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-6">
          <h1 className="f-display text-lg font-semibold text-slate-900 mb-1">{mode === "signup" ? "Create account" : mode === "forgot" ? "Reset password" : "Sign in"}</h1>
          <p className="text-sm text-slate-400 f-body mb-5">
            {mode === "signup" ? "New accounts require admin approval before access is granted." : mode === "forgot" ? "Enter your email and we'll send you a reset link." : "Access the rep/creators portal"}
          </p>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
              <AlertCircle size={15} className="shrink-0" /> {error}
            </div>
          )}

          {mode === "signup" && (
            <Field label="Full Name">
              <input
                autoFocus
                type="text"
                className={inputCls}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Your name"
              />
            </Field>
          )}
          <Field label="Email">
            <input
              autoFocus={mode === "signin" || mode === "forgot"}
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="you@company.com"
            />
          </Field>
          {mode !== "forgot" && (
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
          )}

          {mode === "signin" && (
            <div className="text-right -mt-1 mb-2">
              <button type="button" onClick={() => { setMode("forgot"); setError(""); }} className="text-xs text-slate-400 hover:text-red-600 f-body">
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={mode === "signup" ? handleSignUp : mode === "forgot" ? handleForgotPassword : handleSignIn}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 font-medium f-body text-sm px-3.5 py-2.5 mt-2 transition-colors"
          >
            <Lock size={14} /> {loading ? (mode === "signup" ? "Creating account…" : mode === "forgot" ? "Sending…" : "Signing in…") : (mode === "signup" ? "Create Account" : mode === "forgot" ? "Send Reset Link" : "Sign In")}
          </button>

          <div className="text-center mt-4">
            {mode === "forgot" ? (
              <button type="button" onClick={() => { setMode("signin"); setError(""); }} className="text-sm text-red-600 hover:underline f-body">
                Back to sign in
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }}
                className="text-sm text-red-600 hover:underline f-body"
              >
                {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#FCF9F3]/80 border border-red-100 rounded-xl p-4 mt-4 text-xs text-slate-500 f-body">
          New accounts are created with pending status. An admin must approve access
          in the <span className="f-ledger">profiles</span> table before sign-in works.
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

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
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // Clicking the emailed reset link logs the user in via a special
      // "recovery" session and fires this event — show a "set new password"
      // screen instead of dropping them straight into the dashboard.
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
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
        supabase.from("brands").select("*").order("created_at", { ascending: false }),
        supabase.from("creators").select("*").order("created_at", { ascending: false }),
        supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
        supabase.from("deals").select("*").order("created_at"),
        supabase.from("deliverables").select("*").order("created_at").order("id"),
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
    // Campaign Value is the SUM of every shortlisted creator's brand cost —
    // not a single manually-typed number — so adding/editing/removing a
    // creator's brand cost updates this everywhere automatically.
    const revenue = cDeals.reduce((s, d) => s + (d.brandCost || 0), 0);
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

  /* ---------- auto-generated notifications from real data (replaces the static table) ---------- */
  const liveNotifications = useMemo(() => {
    const items = [];
    deliverablesWithJoins.forEach((d) => {
      if (!["Live", "Completed"].includes(d.status) && isPast(d.due)) {
        items.push({ id: `dlv-overdue-${d.id}`, text: `${d.type} for ${d.creator?.name} (${d.brand?.name}) is overdue`, severity: "high", created_at: d.due });
      }
    });
    creatorInvoicesWithJoins.forEach((i) => {
      if (i.status === "Pending Review") {
        items.push({ id: `ci-pending-${i.id}`, text: `${i.creator?.name} invoice ${i.invoiceNumber} awaiting accounts approval`, severity: "medium", created_at: i.date });
      }
      if (i.status === "Rejected") {
        items.push({ id: `ci-rejected-${i.id}`, text: `${i.creator?.name} invoice ${i.invoiceNumber} was rejected${i.rejectReason ? " — " + i.rejectReason : ""}`, severity: "high", created_at: i.date });
      }
    });
    // (campaign-ending-soon notifications removed — end date is no longer
    // collected now that campaigns just use an Ongoing/Closed status)
    brandInvoicesWithJoins.forEach((b) => {
      if (b.pending > 0 && isPast(b.dueDate)) {
        items.push({ id: `bi-overdue-${b.id}`, text: `${b.brand?.name} invoice ${b.invoiceNumber} is overdue for payment`, severity: "medium", created_at: b.dueDate });
      }
      if (b.status === "Draft") {
        items.push({ id: `bi-draft-${b.id}`, text: `${b.brand?.name} brand invoice is still a draft — not yet sent`, severity: "low", created_at: b.date || todayISO() });
      }
    });
    return items
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((n) => ({ ...n, time: timeAgo(n.created_at) }));
  }, [deliverablesWithJoins, creatorInvoicesWithJoins, brandInvoicesWithJoins, db.campaigns]);

  /* ---------- dashboard aggregates ---------- */
  const dash = useMemo(() => {
    const brandReceivables = brandInvoicesWithJoins.reduce((s, b) => s + b.pending, 0);
    const creatorPayables = creatorInvoicesWithJoins.filter(i => i.status !== "Rejected").reduce((s, c) => s + c.pending, 0);
    const revenue = brandInvoicesWithJoins.reduce((s, b) => s + b.total, 0);
    const creatorCost = dealsWithJoins.reduce((s, d) => s + d.amount, 0);
    const grossProfit = revenue - creatorCost;
    const paymentsReceived = db.payments.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
    const paymentsOverdue = brandInvoicesWithJoins.filter((b) => b.pending > 0 && isPast(b.dueDate)).length;
    const activeCampaigns = db.campaigns.filter((c) => c.status === "Ongoing").length;
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
  const updateCreatorInvoice = async (id, payload) => {
    const { error } = await supabase.from("creator_invoices").update({
      invoice_number: payload.invoiceNumber, date: payload.date,
      amount: payload.amount, gst: payload.gst, tds: payload.tds, total: payload.total,
      due_date: payload.dueDate,
    }).eq("id", id);
    if (error) { showToast("Failed to update invoice: " + error.message); return; }
    showToast("Invoice updated");
    fetchAllData();
  };
  const addBrand = async (payload) => {
    const { error } = await supabase.from("brands").insert({
      name: payload.name, poc: payload.poc, internal_poc: payload.internalPoc, email: payload.email, phone: payload.phone,
      payment_terms: payload.paymentTerms, notes: payload.notes, industry: payload.industry,
    });
    if (error) { showToast("Failed to create brand: " + error.message); return; }
    showToast("Brand created");
    fetchAllData();
  };
  const updateBrand = async (id, payload) => {
    const { error } = await supabase.from("brands").update({
      name: payload.name, poc: payload.poc, internal_poc: payload.internalPoc, email: payload.email, phone: payload.phone,
      payment_terms: payload.paymentTerms, notes: payload.notes, industry: payload.industry,
    }).eq("id", id);
    if (error) { showToast("Failed to update brand: " + error.message); return; }
    showToast("Brand updated");
    fetchAllData();
  };
  const addCreator = async (payload) => {
    // Whatever platform is picked here becomes the first entry on their
    // Social tab automatically — no need to re-enter it there separately.
    const socialLinks = payload.platform ? [{ platform: payload.platform, url: "", followers: "" }] : [];
    const { error } = await supabase.from("creators").insert({
      name: payload.name, handle: payload.handle, platform: payload.platform, phone: payload.phone,
      email: payload.email, gst: payload.gst, pan: payload.pan, standard: payload.standard,
      bank_name: payload.bank?.name, bank_acc: payload.bank?.acc, bank_ifsc: payload.bank?.ifsc,
      social_links: socialLinks,
    });
    if (error) { showToast("Failed to add creator: " + error.message); return; }
    showToast("Creator added");
    fetchAllData();
  };
  const updateCreator = async (id, payload) => {
    const patch = {
      name: payload.name, handle: payload.handle, platform: payload.platform, phone: payload.phone,
      email: payload.email, gst: payload.gst, pan: payload.pan, standard: payload.standard,
      bank_name: payload.bank?.name, bank_acc: payload.bank?.acc, bank_ifsc: payload.bank?.ifsc,
    };
    if (payload.socialLinks) patch.social_links = payload.socialLinks;
    const { error } = await supabase.from("creators").update(patch).eq("id", id);
    if (error) { showToast("Failed to update creator: " + error.message); return; }
    showToast("Creator updated");
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
  const updateCampaign = async (id, payload) => {
    const { error } = await supabase.from("campaigns").update({
      name: payload.name, brand_id: payload.brandId, poc: payload.poc,
      internal_poc: payload.internalPoc, start_date: payload.start, status: payload.status,
      payment_terms: payload.paymentTerms, budget: payload.budget || 0,
    }).eq("id", id);
    if (error) { showToast("Failed to update campaign: " + error.message); return; }
    showToast("Campaign updated");
    fetchAllData();
  };
  // The unified "New Campaign" flow: creates the brand (if new), the campaign,
  // then every shortlisted creator's deal and auto-generated deliverables —
  // all in one action. Everything created here is the same underlying data
  // the standalone Brands/Creators/Deliverables pages read from, so those
  // views update automatically too.
  const createFullCampaign = async (payload) => {
    let brandId = payload.brandId;
    if (payload.newBrandName?.trim()) {
      const { data, error } = await supabase.from("brands").insert({ name: payload.newBrandName.trim() }).select().single();
      if (error) { showToast("Failed to create brand: " + error.message); return; }
      brandId = data.id;
    }
    if (!brandId) { showToast("Please select or name a brand."); return; }

    const { data: campaignData, error: campErr } = await supabase.from("campaigns").insert({
      name: payload.name, brand_id: brandId, poc: payload.poc, internal_poc: payload.internalPoc,
      start_date: payload.startDate, status: payload.status, payment_terms: payload.paymentTerms, budget: payload.budget || 0, team: [],
    }).select().single();
    if (campErr) { showToast("Failed to create campaign: " + campErr.message); return; }
    const campaignId = campaignData.id;

    let deliverableCount = 0;
    for (const row of payload.creatorRows) {
      let creatorId = row.creatorId;
      if (row.newCreatorName?.trim()) {
        const { data, error } = await supabase.from("creators").insert({ name: row.newCreatorName.trim() }).select().single();
        if (error) { showToast(`Failed to create creator: ${error.message}`); continue; }
        creatorId = data.id;
      }
      if (!creatorId) continue;

      const platformLinks = (row.platformLinks || []).filter((l) => l.url?.trim());
      const { data: dealData, error: dealErr } = await supabase.from("deals").insert({
        campaign_id: campaignId, creator_id: creatorId, amount: row.amount || 0, brand_cost: row.brandCost || 0,
        scope: row.scope || "", status: "Draft", approval: "Pending", notes: row.notes || "",
        platform_links: platformLinks,
      }).select().single();
      if (dealErr) { showToast(`Failed to add deal: ${dealErr.message}`); continue; }

      const items = parseScopeToDeliverables(row.scope);
      if (items.length > 0) {
        const rows = items.map((it) => ({
          deal_id: dealData.id, type: it.type, brief: it.brief, due: row.dueDate || daysFromNow(14),
          status: "Brief", stages_done: [], platform_link: platformLinks[0]?.url || null,
        }));
        const { error: dlvErr } = await supabase.from("deliverables").insert(rows);
        if (!dlvErr) deliverableCount += rows.length;
      }
    }
    showToast(`Campaign created with ${payload.creatorRows.length} creator${payload.creatorRows.length === 1 ? "" : "s"}${deliverableCount ? ` and ${deliverableCount} deliverable${deliverableCount === 1 ? "" : "s"}` : ""}`);
    fetchAllData();
  };
  const addDeal = async (payload) => {
    const { data: newDeal, error } = await supabase.from("deals").insert({
      campaign_id: payload.campaignId, creator_id: payload.creatorId, amount: payload.amount, brand_cost: payload.brandCost || 0,
      scope: payload.scope, status: "Draft", approval: "Pending", notes: "",
    }).select().single();
    if (error) { showToast("Failed to add deal: " + error.message); return; }

    // Auto-create one deliverable per item parsed from the scope text
    // (e.g. "2 Reels + 1 Story" → Reel 1, Reel 2, Story 1), each with its
    // own independent stage checklist. Falls back to nothing if the scope
    // doesn't parse — deliverables can still be added manually any time.
    const items = parseScopeToDeliverables(payload.scope);
    if (items.length > 0 && newDeal) {
      const dueDate = payload.dueDate || daysFromNow(14);
      const rows = items.map((it) => ({
        deal_id: newDeal.id, type: it.type, brief: it.brief, due: dueDate,
        status: "Brief", stages_done: [],
      }));
      const { error: dlvError } = await supabase.from("deliverables").insert(rows);
      if (dlvError) { showToast("Deal added, but auto-creating deliverables failed: " + dlvError.message); fetchAllData(); return; }
    }
    showToast(items.length > 0 ? `Deal added with ${items.length} deliverable${items.length > 1 ? "s" : ""} created` : "Deal added");
    fetchAllData();
  };
  const updateDeal = async (id, payload) => {
    const { error } = await supabase.from("deals").update({
      creator_id: payload.creatorId, amount: payload.amount, brand_cost: payload.brandCost || 0, scope: payload.scope,
    }).eq("id", id);
    if (error) { showToast("Failed to update deal: " + error.message); return; }

    // Re-parse the (possibly changed) scope and top up any deliverables that
    // don't exist yet for this deal — e.g. editing "1 Reel" up to "2 Reels"
    // will add "Reel 2" without touching or duplicating the existing "Reel 1".
    const { data: existing } = await supabase.from("deliverables").select("brief").eq("deal_id", id);
    const existingBriefs = new Set((existing || []).map((d) => d.brief));
    const items = parseScopeToDeliverables(payload.scope).filter((it) => !existingBriefs.has(it.brief));
    if (items.length > 0) {
      const dueDate = payload.dueDate || daysFromNow(14);
      const rows = items.map((it) => ({
        deal_id: id, type: it.type, brief: it.brief, due: dueDate,
        status: "Brief", stages_done: [],
      }));
      const { error: dlvError } = await supabase.from("deliverables").insert(rows);
      if (dlvError) { showToast("Deal updated, but adding new deliverables failed: " + dlvError.message); fetchAllData(); return; }
    }
    showToast(items.length > 0 ? `Deal updated — ${items.length} new deliverable${items.length > 1 ? "s" : ""} added` : "Deal updated");
    fetchAllData();
  };
  const addDeliverable = async (payload) => {
    const { error } = await supabase.from("deliverables").insert({
      deal_id: payload.dealId, type: payload.type, brief: payload.brief, due: payload.due,
      status: "Brief", stages_done: [],
    });
    if (error) { showToast("Failed to add deliverable: " + error.message); return; }
    showToast("Deliverable added");
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
  const updateBrandInvoice = async (id, payload) => {
    const { error } = await supabase.from("brand_invoices").update({
      invoice_number: payload.invoiceNumber, date: payload.date,
      amount: payload.amount, gst: payload.gst, total: payload.total, due_date: payload.dueDate,
    }).eq("id", id);
    if (error) { showToast("Failed to update invoice: " + error.message); return; }
    showToast("Invoice updated");
    fetchAllData();
  };

  /* ---------- deletions ---------- */
  const deleteBrand = async (id) => {
    if (!confirm("Delete this brand? This also removes its campaigns, deals, deliverables, and invoices. This cannot be undone.")) return;
    const { error } = await supabase.from("brands").delete().eq("id", id);
    if (error) { showToast("Failed to delete brand: " + error.message); return; }
    showToast("Brand deleted");
    setSel((s) => ({ ...s, brand: null }));
    fetchAllData();
  };
  const deleteCreator = async (id) => {
    if (!confirm("Delete this creator? This also removes their deals, deliverables, and invoices. This cannot be undone.")) return;
    const { error } = await supabase.from("creators").delete().eq("id", id);
    if (error) { showToast("Failed to delete creator: " + error.message); return; }
    showToast("Creator deleted");
    setSel((s) => ({ ...s, creator: null }));
    fetchAllData();
  };
  const deleteCampaign = async (id) => {
    if (!confirm("Delete this campaign? This also removes its deals and deliverables. This cannot be undone.")) return;
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    if (error) { showToast("Failed to delete campaign: " + error.message); return; }
    showToast("Campaign deleted");
    setSel((s) => ({ ...s, campaign: null }));
    fetchAllData();
  };
  const deleteDeal = async (id) => {
    if (!confirm("Delete this deal? This also removes its deliverables. This cannot be undone.")) return;
    const { error } = await supabase.from("deals").delete().eq("id", id);
    if (error) { showToast("Failed to delete deal: " + error.message); return; }
    showToast("Deal deleted");
    fetchAllData();
  };
  const deleteDeliverable = async (id) => {
    if (!confirm("Delete this deliverable? This cannot be undone.")) return;
    const { error } = await supabase.from("deliverables").delete().eq("id", id);
    if (error) { showToast("Failed to delete deliverable: " + error.message); return; }
    showToast("Deliverable deleted");
    fetchAllData();
  };
  const updateCreatorSocials = async (id, socialLinks) => {
    const { error } = await supabase.from("creators").update({ social_links: socialLinks }).eq("id", id);
    if (error) { showToast("Failed to save social links: " + error.message); return; }
    showToast("Social links updated");
    fetchAllData();
  };
  const updateCreatorAvatar = async (id, avatarUrl) => {
    const { error } = await supabase.from("creators").update({ avatar_url: avatarUrl }).eq("id", id);
    if (error) { showToast("Failed to save profile picture: " + error.message); return; }
    fetchAllData();
  };
  const updateDeliverableStages = async (deliverable, stagesDone, notes) => {
    const derivedStatus = [...STAGES].reverse().find((s) => stagesDone.includes(s)) || "Brief";
    const patch = { stages_done: stagesDone, status: derivedStatus };
    // The moment "Live" gets ticked, record today's date automatically — but
    // don't overwrite an existing live date if it's ticked again later.
    if (stagesDone.includes("Live")) {
      patch.live = deliverable.live || todayISO();
    } else {
      patch.live = null;
    }
    if (notes !== undefined) patch.revision_notes = notes;
    const { error } = await supabase.from("deliverables").update(patch).eq("id", deliverable.id);
    if (error) { showToast("Failed to update deliverable: " + error.message); return; }
    fetchAllData();
  };
  const addDocument = async (entityType, entityId, file) => {
    const path = `${entityType}/${entityId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
    if (upErr) { showToast("Upload failed: " + upErr.message); return; }
    const { error: insErr } = await supabase.from("documents").insert({
      entity_type: entityType, entity_id: entityId, file_name: file.name,
      file_type: file.type || file.name.split(".").pop(), upload_date: todayISO(),
      uploaded_by: auth?.displayName || auth?.email || "Unknown", storage_path: path,
    });
    if (insErr) { showToast("Failed to save document record: " + insErr.message); return; }
    showToast("Document uploaded");
    fetchAllData();
  };
  const deleteDocument = async (doc) => {
    if (!confirm(`Delete "${doc.fileName}"? This cannot be undone.`)) return;
    if (doc.storagePath) {
      await supabase.storage.from("documents").remove([doc.storagePath]);
    }
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) { showToast("Failed to delete document: " + error.message); return; }
    showToast("Document deleted");
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
    { id: "campaigns", label: "Campaigns", icon: Briefcase },
    { id: "brands", label: "Brands", icon: Building2 },
    { id: "creators", label: "Creators", icon: Users },
    { id: "creatorInvoices", label: "Creator Invoices", icon: Receipt },
    { id: "brandInvoices", label: "Brand Invoices", icon: FileText },
    { id: "payments", label: "Payments", icon: Wallet },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "documents", label: "Documents", icon: FolderOpen },
    { id: "userApprovals", label: "User Approvals", icon: UserCircle2 },
  ];
  const NAV_CREATOR = [
    { id: "dashboard", label: "My Overview", icon: LayoutDashboard },
    { id: "campaigns", label: "My Campaigns", icon: Briefcase },
    { id: "creatorInvoices", label: "My Invoices", icon: Receipt },
    { id: "payments", label: "My Payments", icon: Wallet },
  ];
  const nav = role === "creator" ? NAV_CREATOR : NAV_FULL;

  /* ============================== RENDER ============================== */
  if (passwordRecovery) {
    return <SetNewPasswordScreen onDone={() => setPasswordRecovery(false)} />;
  }

  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#12141A]">
        <div className="text-slate-500 text-sm f-body">Loading…</div>
      </div>
    );
  }

  if (!auth) {
    return <LoginScreen />;
  }

  if (auth.role === "pending" || !auth.role) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#12141A] f-body p-4">
        <FontStyles />
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-6">
            <div className="mb-4"><RepCreatorsLogo /></div>
          </div>
          <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-6 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-3">
              <Clock size={18} className="text-amber-600" />
            </div>
            <h1 className="f-display text-lg font-semibold text-slate-900 mb-1">Awaiting approval</h1>
            <p className="text-sm text-slate-500 f-body mb-4">
              Hi {auth.displayName || auth.email} — your account is created but hasn't been approved yet. Check back once an admin grants you access.
            </p>
            <Btn variant="secondary" onClick={handleLogout}>Sign out</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex bg-[#12141A] f-body text-slate-200" style={{ fontFamily: "'Manrope', sans-serif" }}>
      <FontStyles />
      {/* SIDEBAR */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`w-56 shrink-0 bg-[#12141A] text-slate-300 flex flex-col fixed md:static inset-y-0 left-0 z-50 transition-transform duration-200 border-r border-white/5 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <div className="px-5 pt-7 pb-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <RepCreatorsLogo size="sm" />
            <div className="text-[11px] text-slate-500 mt-2 tracking-wide uppercase">Operations Platform</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <nav className="flex-1 pt-4 pb-3 overflow-y-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {nav.map((n) => {
            const Icon = n.icon;
            const active = activeModule === n.id;
            return (
              <button key={n.id} onClick={() => { goTo(n.id); setSidebarOpen(false); }} className={`w-full flex items-center gap-2.5 px-5 py-2.5 text-sm f-body transition-colors ${active ? "bg-slate-900 text-white border-r-2 border-red-500" : "text-slate-400 hover:text-white hover:bg-slate-900/60"}`}>
                <Icon size={15} /> {n.label}
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-white/5 text-[11px] text-slate-500 f-body">
          Zoho Books: <span className="text-emerald-400">Connected</span>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOPBAR */}
        <header className="h-14 shrink-0 bg-[#12141A] border-b border-white/5 flex items-center gap-3 px-4 sm:px-5">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 text-slate-400 hover:bg-white/5 rounded-lg shrink-0">
            <span className="block w-5 h-0.5 bg-slate-400 relative before:content-[''] before:absolute before:w-5 before:h-0.5 before:bg-slate-400 before:-translate-y-1.5 after:content-[''] after:absolute after:w-5 after:h-0.5 after:bg-slate-400 after:translate-y-1.5"></span>
          </button>
          <div className="flex-1" />
          <div className="relative">
            <button onClick={() => setNotifOpen((o) => !o)} className="relative p-2 rounded-lg hover:bg-white/5 text-slate-400">
              <Bell size={17} />
              {liveNotifications.length > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 shadow-lg z-40 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-red-50 font-medium text-sm f-display text-slate-900">Notifications</div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {liveNotifications.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-400 f-body">Nothing to flag right now.</div>}
                  {liveNotifications.map((n) => (
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
            <button onClick={() => setRoleOpen((o) => !o)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-sm">
              <UserCircle2 size={16} className="text-slate-400" />
              <span className="f-body text-slate-200">{auth?.displayName || (role === "admin" ? "Admin / Founder" : role === "poc" ? "POC / Campaign Manager" : "Creator")}</span>
              <ChevronDown size={13} className="text-slate-400" />
            </button>
            {roleOpen && (
              <div className="absolute right-0 top-11 w-64 bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 shadow-lg z-40 overflow-hidden">
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

          <>
              {activeModule === "dashboard" && role !== "creator" && <Dashboard dash={dash} deliverablesWithJoins={deliverablesWithJoins} creatorInvoicesWithJoins={creatorInvoicesWithJoins} brandInvoicesWithJoins={brandInvoicesWithJoins} db={db} goTo={goTo} displayName={auth?.displayName} />}
              {activeModule === "dashboard" && role === "creator" && <CreatorHome creatorId={demoCreatorId} creator={creatorById(demoCreatorId)} totals={creatorTotals(demoCreatorId)} deliverablesWithJoins={deliverablesWithJoins.filter((d) => d.creator?.id === demoCreatorId)} invoices={creatorInvoicesWithJoins.filter((i) => i.creator?.id === demoCreatorId)} goTo={goTo} />}

              {activeModule === "brands" && !sel.brand && <BrandsList brands={db.brands} brandTotals={brandTotals} goTo={goTo} onAdd={() => setModal({ type: "addBrand" })} />}
              {activeModule === "brands" && sel.brand && <BrandDetail brand={brandById(sel.brand)} totals={brandTotals(sel.brand)} dealsWithJoins={dealsWithJoins} brandInvoicesWithJoins={brandInvoicesWithJoins.filter((b) => b.brand?.id === sel.brand)} documents={db.documents.filter((d) => d.entityType === "brand" && d.entityId === sel.brand)} goTo={goTo} back={() => setSel((s) => ({ ...s, brand: null }))} onDelete={deleteBrand} onEdit={(brand) => setModal({ type: "editBrand", brand })} onAddDocument={(entityType, entityId) => setModal({ type: "addDocument", entityType, entityId })} onDeleteDocument={deleteDocument} />}

              {activeModule === "creators" && !sel.creator && <CreatorsList creators={db.creators} creatorTotals={creatorTotals} goTo={goTo} onAdd={() => setModal({ type: "addCreator" })} role={role} />}
              {activeModule === "creators" && sel.creator && <CreatorDetail creator={creatorById(sel.creator)} totals={creatorTotals(sel.creator)} invoices={creatorInvoicesWithJoins.filter((i) => i.creator?.id === sel.creator)} deliverablesWithJoins={deliverablesWithJoins.filter((d) => d.creator?.id === sel.creator)} documents={db.documents.filter((d) => d.entityType === "creator" && d.entityId === sel.creator)} goTo={goTo} back={() => setSel((s) => ({ ...s, creator: null }))} onDelete={deleteCreator} onEdit={(creator) => setModal({ type: "editCreator", creator })} onSaveSocials={updateCreatorSocials} onSaveAvatar={updateCreatorAvatar} onAddDocument={(entityType, entityId) => setModal({ type: "addDocument", entityType, entityId })} onDeleteDocument={deleteDocument} />}

              {activeModule === "campaigns" && !sel.campaign && role !== "creator" && <CampaignsList campaigns={db.campaigns} brandById={brandById} campaignFinancials={campaignFinancials} deliverablesWithJoins={deliverablesWithJoins} dealsWithJoins={dealsWithJoins} goTo={goTo} onAdd={() => setModal({ type: "addCampaign" })} />}
              {activeModule === "campaigns" && role === "creator" && (() => {
                const myCampIds = [...new Set(dealsWithJoins.filter(d => d.creatorId === demoCreatorId).map(d => d.campaignId))];
                return <CampaignsList campaigns={db.campaigns.filter(c => myCampIds.includes(c.id))} brandById={brandById} campaignFinancials={campaignFinancials} deliverablesWithJoins={deliverablesWithJoins} dealsWithJoins={dealsWithJoins} goTo={goTo} restricted />;
              })()}
              {activeModule === "campaigns" && sel.campaign && <CampaignDetail campaign={campaignById(sel.campaign)} brand={brandById(campaignById(sel.campaign)?.brandId)} deals={dealsWithJoins.filter((d) => d.campaignId === sel.campaign)} deliverablesWithJoins={deliverablesWithJoins.filter((d) => d.campaign?.id === sel.campaign)} brandInvoices={brandInvoicesWithJoins.filter((b) => b.campaignId === sel.campaign)} financials={campaignFinancials(sel.campaign)} goTo={goTo} back={() => setSel((s) => ({ ...s, campaign: null }))} onAddDeal={() => setModal({ type: "addDeal", campaignId: sel.campaign })} onEditDeal={(deal) => setModal({ type: "editDeal", deal })} onEditCampaign={(campaign) => setModal({ type: "editCampaign", campaign })} onAddDeliverable={() => setModal({ type: "addDeliverable", campaignId: sel.campaign })} onStagesChange={updateDeliverableStages} role={role} onDeleteCampaign={deleteCampaign} onDeleteDeal={deleteDeal} onDeleteDeliverable={deleteDeliverable} />}

              {activeModule === "creatorInvoices" && <CreatorInvoicesModule rows={role === "creator" ? creatorInvoicesWithJoins.filter(i => i.creator?.id === demoCreatorId) : creatorInvoicesWithJoins} onApprove={approveCreatorInvoice} onReject={rejectCreatorInvoice} onRetrySync={retryZohoSync} onRecordPayment={(id, amt) => recordCreatorPayment(id, amt)} onEdit={(invoice) => setModal({ type: "editCreatorInvoice", invoice })} onSubmit={() => setModal({ type: "submitInvoice" })} goTo={goTo} role={role} />}

              {activeModule === "brandInvoices" && role !== "creator" && <BrandInvoicesModule rows={brandInvoicesWithJoins} onRecordPayment={recordBrandPayment} onEdit={(invoice) => setModal({ type: "editBrandInvoice", invoice })} onCreate={() => setModal({ type: "createBrandInvoice" })} goTo={goTo} />}

              {activeModule === "payments" && <PaymentsModule payments={db.payments} creatorInvoicesWithJoins={creatorInvoicesWithJoins} brandInvoicesWithJoins={brandInvoicesWithJoins} role={role} demoCreatorId={demoCreatorId} />}

              {activeModule === "reports" && role !== "creator" && <ReportsModule db={db} campaigns={db.campaigns} campaignFinancials={campaignFinancials} deliverablesWithJoins={deliverablesWithJoins} brandInvoicesWithJoins={brandInvoicesWithJoins} creatorInvoicesWithJoins={creatorInvoicesWithJoins} />}

              {activeModule === "documents" && role !== "creator" && <DocumentsModule documents={db.documents} brandById={brandById} creatorById={creatorById} onDelete={deleteDocument} />}

              {activeModule === "userApprovals" && role === "admin" && <UserApprovalsModule creators={db.creators} showToast={showToast} />}
            </>
        </main>
      </div>

      {/* MODALS */}
      {modal?.type === "addBrand" && <AddBrandModal onClose={() => setModal(null)} onSave={(p) => { addBrand(p); setModal(null); }} />}
      {modal?.type === "editBrand" && <EditBrandModal brand={modal.brand} onClose={() => setModal(null)} onSave={(p) => { updateBrand(modal.brand.id, p); setModal(null); }} />}
      {modal?.type === "addCreator" && <AddCreatorModal onClose={() => setModal(null)} onSave={(p) => { addCreator(p); setModal(null); }} />}
      {modal?.type === "editCreator" && <EditCreatorModal creator={modal.creator} onClose={() => setModal(null)} onSave={(p) => { updateCreator(modal.creator.id, p); setModal(null); }} />}
      {modal?.type === "addCampaign" && <NewCampaignWizardModal brands={db.brands} creators={db.creators} onClose={() => setModal(null)} onSave={(p) => { createFullCampaign(p); setModal(null); }} />}
      {modal?.type === "editCampaign" && <EditCampaignModal campaign={modal.campaign} brands={db.brands} onClose={() => setModal(null)} onSave={(p) => { updateCampaign(modal.campaign.id, p); setModal(null); }} />}
      {modal?.type === "addDeal" && <AddDealModal creators={db.creators} campaignId={modal.campaignId} onClose={() => setModal(null)} onSave={(p) => { addDeal(p); setModal(null); }} />}
      {modal?.type === "editDeal" && <EditDealModal creators={db.creators} deal={modal.deal} onClose={() => setModal(null)} onSave={(p) => { updateDeal(modal.deal.id, p); setModal(null); }} />}
      {modal?.type === "addDeliverable" && <AddDeliverableModal deals={dealsWithJoins.filter((d) => d.campaignId === modal.campaignId)} onClose={() => setModal(null)} onSave={(p) => { addDeliverable(p); setModal(null); }} />}
      {modal?.type === "addDocument" && <AddDocumentModal onClose={() => setModal(null)} onSave={(file) => { addDocument(modal.entityType, modal.entityId, file); setModal(null); }} />}
      {modal?.type === "submitInvoice" && <SubmitInvoiceModal deals={dealsWithJoins} onClose={() => setModal(null)} onSave={(p) => { submitCreatorInvoice(p); setModal(null); }} />}
      {modal?.type === "editCreatorInvoice" && <EditCreatorInvoiceModal invoice={modal.invoice} onClose={() => setModal(null)} onSave={(p) => { updateCreatorInvoice(modal.invoice.id, p); setModal(null); }} />}
      {modal?.type === "createBrandInvoice" && <CreateBrandInvoiceModal campaigns={db.campaigns} brandById={brandById} onClose={() => setModal(null)} onSave={(p) => { createBrandInvoice(p); setModal(null); }} />}
      {modal?.type === "editBrandInvoice" && <EditBrandInvoiceModal invoice={modal.invoice} onClose={() => setModal(null)} onSave={(p) => { updateBrandInvoice(modal.invoice.id, p); setModal(null); }} />}
    </div>
  );
}

/* ============================== DASHBOARD ============================== */
function Dashboard({ dash, deliverablesWithJoins, creatorInvoicesWithJoins, brandInvoicesWithJoins, db, goTo, displayName }) {
  const liveThisWeekList = deliverablesWithJoins.filter((d) => (d.status === "Live" || d.status === "Scheduled") && isWithinWeek(d.live || d.scheduled)).slice(0, 5);
  const overdueList = deliverablesWithJoins.filter((d) => !["Live", "Completed"].includes(d.status) && isPast(d.due)).slice(0, 5);
  const approvalList = deliverablesWithJoins.filter((d) => d.status === "Video Submitted").slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (displayName || "").split(" ")[0];

  const attentionItems = [
    approvalList.length > 0 && { text: `${approvalList.length} deliverable${approvalList.length === 1 ? "" : "s"} awaiting approval`, onClick: () => goTo("deliverables") },
    dash.creatorPaymentsPending > 0 && { text: `${dash.creatorPaymentsPending} creator invoice${dash.creatorPaymentsPending === 1 ? "" : "s"} pending`, onClick: () => goTo("creatorInvoices") },
    overdueList.length > 0 && { text: `${overdueList.length} deliverable${overdueList.length === 1 ? "" : "s"} overdue`, onClick: () => goTo("deliverables") },
  ].filter(Boolean);

  return (
    <div>
      <div className="mb-6">
        <h2 className="f-display text-page-title text-white">{greeting}{firstName ? `, ${firstName}` : ""}</h2>
        <p className="text-sm text-slate-400 f-body mt-1">Here's what's happening across your campaigns today.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <KPICard label="Revenue (Billed)" value={inr(dash.revenue)} tone="indigo" icon={CircleDollarSign} onClick={() => goTo("brandInvoices")} />
        <KPICard label="Expected Gross Profit" value={inr(dash.grossProfit)} tone="emerald" icon={BarChart3} sub={`${dash.revenue ? ((dash.grossProfit / dash.revenue) * 100).toFixed(0) : 0}% margin`} onClick={() => goTo("reports")} />
        <KPICard label="Brand Receivables" value={inr(dash.brandReceivables)} tone="amber" icon={ArrowDownRight} sub={`${dash.brandPaymentsPending} invoices pending`} onClick={() => goTo("brandInvoices")} />
        <KPICard label="Creator Payables" value={inr(dash.creatorPayables)} tone="amber" icon={ArrowUpRight} sub={`${dash.creatorPaymentsPending} invoices pending`} onClick={() => goTo("creatorInvoices")} />
        <KPICard label="Payments Overdue" value={dash.paymentsOverdue} tone="red" icon={AlertTriangle} sub="brand invoices" onClick={() => goTo("brandInvoices")} />
      </div>

      {attentionItems.length > 0 && (
        <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 px-4 py-3 mb-6">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2 f-body">Needs Your Attention</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {attentionItems.map((item, i) => (
              <button key={i} onClick={item.onClick} className="inline-flex items-center gap-1.5 text-sm text-slate-700 f-body hover:text-red-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" /> {item.text}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
    <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-4">
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
          <div key={key} className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-4">
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
      <SectionHeader title="Brands" description="Manage your brand relationships and active campaigns." action={<Btn icon={Plus} onClick={onAdd}>Add Brand</Btn>} />
      {brands.length === 0 ? (
        <EmptyState text="No brands yet. Your brand relationships will appear here once you add one." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((b) => {
            const t = brandTotals(b.id);
            const active = t.campaigns.filter((c) => c.status === "Ongoing").length;
            const avatarStyle = avatarStyleFor(b.id);
            const initials = (b.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
            return (
              <div
                key={b.id}
                onClick={() => goTo("brands", b.id)}
                className="group bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-5 cursor-pointer hover:border-red-400 hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-12 h-12 rounded-xl ${avatarStyle.bg} border ${avatarStyle.border} flex items-center justify-center shrink-0`}>
                    <span className={`text-sm font-bold f-display ${avatarStyle.icon}`}>{initials}</span>
                  </div>
                  <Badge tone={active > 0 ? "emerald" : "slate"}>{active > 0 ? "Active" : "No Active Campaigns"}</Badge>
                </div>
                <div className="mb-4">
                  <div className="text-card-title text-slate-900 f-display truncate">{b.name}</div>
                  <div className="text-xs text-slate-400 f-body truncate mt-0.5">{b.poc || "No POC set"}</div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Campaigns</div>
                    <div className="text-xs text-slate-700 f-body font-medium">{t.campaigns.length} total · {active} active</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Outstanding</div>
                    <div className="f-ledger text-xs text-slate-700 font-medium">{inr(t.outstanding)}</div>
                  </div>
                </div>
                <div className="text-right mt-2">
                  <span className="text-xs text-red-600 font-medium f-body group-hover:underline">View Brand →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BrandDetail({ brand, totals, dealsWithJoins, brandInvoicesWithJoins, documents, goTo, back, onDelete, onEdit, onAddDocument, onDeleteDocument }) {
  const [tab, setTab] = useState("campaigns");
  if (!brand) return null;
  const fyTotals = brandInvoicesWithJoins.reduce((acc, i) => {
    if (!i.date) return acc;
    const fy = getFY(i.date);
    acc[fy] = (acc[fy] || 0) + i.total;
    return acc;
  }, {});
  const fyEntries = Object.entries(fyTotals).sort((a, b) => b[0].localeCompare(a[0]));
  return (
    <div>
      <SectionHeader title={brand.name} crumbs={[{ label: "Brands", onClick: back }, { label: brand.name }]} action={
        <div className="flex items-center gap-2">
          <Btn variant="secondary" size="sm" onClick={() => onEdit(brand)}>Edit Brand</Btn>
          <Btn variant="danger" size="sm" icon={XCircle} onClick={() => onDelete(brand.id)}>Delete Brand</Btn>
        </div>
      } />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <KPICard label="Amount Received" value={inr(totals.received)} tone="emerald" />
        <KPICard label="Outstanding" value={inr(totals.outstanding)} tone="amber" />
        <KPICard label="Ongoing Campaigns" value={totals.campaigns.filter((c) => c.status === "Ongoing").length} tone="slate" />
      </div>
      <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-4 mb-5">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2 f-body">Total Business by Financial Year</div>
        {fyEntries.length === 0 ? (
          <div className="text-sm text-slate-400 f-body">No invoiced business yet.</div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {fyEntries.map(([fy, amt]) => (
              <div key={fy}>
                <div className="text-[11px] text-slate-400 uppercase tracking-wide">{fy}</div>
                <div className="f-ledger text-slate-800 font-medium">{inr(amt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Tabs tab={tab} setTab={setTab} tabs={["campaigns", "invoices", "documents", "overview"]} />
      {tab === "overview" && (
        <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label="POC" value={brand.poc} />
          <InfoRow label="Internal POC" value={brand.internalPoc} />
          <InfoRow label="Email" value={brand.email} />
          <InfoRow label="Phone" value={brand.phone} />
          <InfoRow label="Payment Terms" value={brand.paymentTerms} />
          <InfoRow label="Industry" value={brand.industry} />
          <InfoRow label="Notes" value={brand.notes} full />
        </div>
      )}
      {tab === "campaigns" && (
        <Table head={["Campaign", "Status", "Start", "Campaign Value"]}>
          {totals.campaigns.map((c) => {
            const campValue = dealsWithJoins.filter((d) => d.campaignId === c.id).reduce((s, d) => s + (d.brandCost || 0), 0);
            return (
              <Tr key={c.id} onClick={() => goTo("campaigns", c.id)}>
                <Td><span className="font-medium text-slate-900">{c.name}</span></Td>
                <Td><Badge tone={statusTone(c.status)}>{c.status}</Badge></Td>
                <Td muted>{fmtDate(c.start)}</Td>
                <Td mono>{inr(campValue)}</Td>
              </Tr>
            );
          })}
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
      {tab === "documents" && (
        <div>
          <div className="flex justify-end mb-3"><Btn size="sm" icon={Plus} onClick={() => onAddDocument("brand", brand.id)}>Add Document</Btn></div>
          <DocsTable documents={documents} onDelete={onDeleteDocument} />
        </div>
      )}
    </div>
  );
}

/* ============================== CREATORS ============================== */
function CreatorsList({ creators, creatorTotals, goTo, onAdd, role }) {
  return (
    <div>
      <SectionHeader title="Creators" description="Your creator network, organized in one place." action={role !== "creator" && <Btn icon={Plus} onClick={onAdd}>Add Creator</Btn>} />
      {creators.length === 0 ? (
        <EmptyState text="No creators yet. Your creator network will appear here once you add one." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {creators.map((c) => {
            const t = creatorTotals(c.id);
            const avatarStyle = avatarStyleFor(c.id);
            const initials = (c.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
            const ongoingNames = t.deals.filter((d) => d.campaign?.status === "Ongoing").map((d) => d.campaign?.name).filter(Boolean);
            return (
              <div
                key={c.id}
                onClick={() => goTo("creators", c.id)}
                className="group bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-5 cursor-pointer hover:border-red-400 hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt={c.name} className="w-16 h-16 rounded-full object-cover border border-red-100 shrink-0" />
                  ) : (
                    <div className={`w-16 h-16 rounded-full ${avatarStyle.bg} border ${avatarStyle.border} flex items-center justify-center shrink-0`}>
                      <span className={`text-lg font-bold f-display ${avatarStyle.icon}`}>{initials}</span>
                    </div>
                  )}
                  <Badge tone={ongoingNames.length > 0 ? "emerald" : "slate"}>{ongoingNames.length > 0 ? "Active" : "Available"}</Badge>
                </div>
                <div className="mb-3">
                  <div className="text-card-title text-slate-900 f-display truncate">{c.name}</div>
                  <div className="text-xs text-slate-400 f-body truncate mt-0.5">{c.handle || c.platform || "—"}</div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-4">
                  {(() => {
                    const added = c.socialLinks || [];
                    const suggestions = ["Instagram", "YouTube", "LinkedIn", "X (Twitter)"].filter((p) => !added.some((l) => l.platform === p));
                    const slots = [...added, ...suggestions.map((p) => ({ platform: p, url: null }))].slice(0, 3);
                    return slots.map((slot, i) => {
                      const link = slot.url ? slot : null;
                      const Icon = platformIconFor(slot.platform);
                      return (
                        <div key={slot.platform + i} className={`rounded-lg border px-2 py-1.5 text-center ${link ? "bg-slate-50 border-slate-200" : "bg-[#FCF9F3] border-dashed border-slate-200"}`}>
                          <div className="flex items-center justify-center gap-1">
                            <Icon size={13} className={link ? "text-slate-700" : "text-slate-300"} />
                            {!link && <Plus size={10} className="text-slate-300" />}
                          </div>
                          {link ? (
                            <>
                              <div className="text-[11px] font-semibold text-slate-800 f-ledger mt-0.5">{link.followers || "—"}</div>
                              <div className="text-[8px] text-slate-400 uppercase tracking-wide">Followers</div>
                            </>
                          ) : (
                            <div className="text-[9px] text-slate-300 f-body mt-0.5">Add</div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 mb-2">
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Paid</div>
                    <div className="f-ledger text-xs text-slate-800 font-medium">{inr(t.paid)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Outstanding</div>
                    <div className="f-ledger text-xs text-slate-800 font-medium">{inr(t.outstanding)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wide">Ongoing</div>
                    <div className="text-xs text-slate-700 f-body font-medium truncate max-w-[140px]">{ongoingNames.join(", ") || "—"}</div>
                  </div>
                  <span className="text-xs text-red-600 font-medium f-body group-hover:underline shrink-0">View Profile →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreatorDetail({ creator, totals, invoices, deliverablesWithJoins, documents, goTo, back, onDelete, onEdit, onSaveSocials, onSaveAvatar, onAddDocument, onDeleteDocument }) {
  const [tab, setTab] = useState("campaigns");
  if (!creator) return null;
  const brandsWorked = [...new Set(totals.deals.map((d) => d.campaign?.brandId))].length;
  return (
    <div>
      <SectionHeader title={creator.name} crumbs={[{ label: "Creators", onClick: back }, { label: creator.name }]} action={
        <div className="flex items-center gap-2">
          <Btn variant="secondary" size="sm" onClick={() => onEdit(creator)}>Edit Creator</Btn>
          <Btn variant="danger" size="sm" icon={XCircle} onClick={() => onDelete(creator.id)}>Delete Creator</Btn>
        </div>
      } />
      <CreatorProfileHeader creator={creator} onSaveAvatar={onSaveAvatar} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KPICard label="Total Earnings" value={inr(totals.earnings)} tone="indigo" />
        <KPICard label="Paid" value={inr(totals.paid)} tone="emerald" />
        <KPICard label="Outstanding" value={inr(totals.outstanding)} tone="amber" />
        <KPICard label="Brands Worked With" value={brandsWorked} tone="slate" />
      </div>
      <Tabs tab={tab} setTab={setTab} tabs={["campaigns", "social", "invoices", "documents", "overview"]} />
      {tab === "overview" && (
        <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label="Handle" value={`${creator.handle} · ${creator.platform}`} />
          <InfoRow label="Phone" value={creator.phone} />
          <InfoRow label="Email" value={creator.email} />
          <InfoRow label="GST Number" value={creator.gst} />
          <InfoRow label="PAN" value={creator.pan} />
          <InfoRow label="Bank" value={`${creator.bank?.name} · ${creator.bank?.acc} · ${creator.bank?.ifsc}`} />
        </div>
      )}
      {tab === "social" && (
        <SocialLinksEditor creator={creator} onSave={onSaveSocials} />
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
      {tab === "documents" && (
        <div>
          <div className="flex justify-end mb-3"><Btn size="sm" icon={Plus} onClick={() => onAddDocument("creator", creator.id)}>Add Document</Btn></div>
          <DocsTable documents={documents} onDelete={onDeleteDocument} />
        </div>
      )}
    </div>
  );
}

/* ============================== CAMPAIGNS ============================== */
function CampaignsList({ campaigns, brandById, campaignFinancials, deliverablesWithJoins, dealsWithJoins, goTo, onAdd, restricted }) {
  const gridCols = "grid-cols-[1fr_110px_100px_90px]";
  return (
    <div>
      <SectionHeader title={restricted ? "My Campaigns" : "Campaigns"} description="Manage active campaigns, creators and deliverables." action={onAdd && <Btn icon={Plus} onClick={onAdd}>New Campaign</Btn>} />
      {campaigns.length === 0 ? (
        <EmptyState text="No campaigns yet. Your campaigns will appear here once you create one." />
      ) : (
        <div>
          <div className="space-y-2.5">
            {campaigns.map((c) => {
              const brand = brandById(c.brandId);
              const f = campaignFinancials(c.id);
              const campDeliverables = deliverablesWithJoins.filter((d) => d.campaign?.id === c.id);
              const campDeals = dealsWithJoins.filter((d) => d.campaignId === c.id);
              const liveCount = campDeliverables.filter((d) => (d.stagesDone || []).includes("Live")).length;
              const creatorCount = [...new Set(campDeliverables.map((d) => d.creator?.id))].length;
              return (
                <div
                  key={c.id}
                  className="group bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 px-4 py-3.5 hover:border-red-400 hover:shadow-md transition-all"
                >
                  <div onClick={() => goTo("campaigns", c.id)} className="cursor-pointer">
                    <div className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-1">{brand?.name}</div>
                    <div className={`grid ${gridCols} gap-3 items-end`}>
                      <div>
                        <span className="text-card-title text-slate-900 f-display truncate block">{c.name}</span>
                      </div>
                      <div>
                        <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Start Date</div>
                        <span className="text-xs text-slate-600 f-body">{fmtDate(c.start)}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Campaign Value</div>
                        <span className="f-ledger text-xs text-slate-700">{inr(f.revenue)}</span>
                      </div>
                      <div>
                        <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Status</div>
                        <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs text-slate-500 f-body">
                        Campaign Value <span className="f-ledger">{inr(f.revenue)}</span> · {creatorCount} creator{creatorCount === 1 ? "" : "s"} · Live {liveCount}/{campDeliverables.length}
                      </div>
                      <span className="text-xs text-red-600 font-medium f-body group-hover:underline shrink-0">View Campaign →</span>
                    </div>
                  </div>
                  <CampaignOverviewBlock deals={campDeals} deliverablesWithJoins={campDeliverables} goTo={goTo} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== SHARED CAMPAIGN OVERVIEW BLOCK (pipeline + due soon + creator progress) ============================== */
function CampaignOverviewBlock({ deals, deliverablesWithJoins, goTo }) {
  return (
    <div className="mt-3 pt-3 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 f-body">Stage Overview</div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {STAGES.map((stage) => {
          // Exclusive: a deliverable shows under its CURRENT stage only — the
          // furthest one ticked — so moving it to Editing removes it from
          // Briefing/Scripting automatically.
          const atThisStage = deliverablesWithJoins.filter((dl) => {
            const done = dl.stagesDone || [];
            const furthest = [...STAGES].reverse().find((s) => done.includes(s));
            return furthest === stage;
          });
          // Group by creator so someone with multiple deliverables at this
          // stage shows once, e.g. "Ankur Jain ×2", instead of repeating.
          const byCreator = atThisStage.reduce((acc, dl) => {
            const key = dl.creator?.id || "unknown";
            if (!acc[key]) acc[key] = { creatorId: dl.creator?.id, name: dl.creator?.name || "Unknown", items: [] };
            acc[key].items.push(`${dl.type}${dl.brief ? " — " + dl.brief : ""}`);
            return acc;
          }, {});
          const creatorList = Object.values(byCreator);
          return (
            <div key={stage} className="bg-slate-100 border border-slate-200 rounded-lg p-2 min-h-[68px]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-semibold text-slate-600 uppercase tracking-wide f-body leading-tight">{stage}</span>
                <span className="text-[10px] f-ledger text-slate-500 font-semibold">{atThisStage.length}</span>
              </div>
              {creatorList.length === 0 ? (
                <div className="text-[10px] text-slate-400 f-body">—</div>
              ) : (
                <div className="space-y-0.5">
                  {creatorList.slice(0, 3).map((cr) => (
                    <div
                      key={cr.creatorId || cr.name}
                      onClick={() => goTo("creators", cr.creatorId)}
                      title={cr.items.join(", ")}
                      className="text-[11px] text-slate-800 font-medium f-body truncate cursor-pointer hover:text-red-600"
                    >
                      {cr.name}{cr.items.length > 1 && <span className="text-slate-500 font-normal"> ×{cr.items.length}</span>}
                    </div>
                  ))}
                  {creatorList.length > 3 && <div className="text-[10px] text-slate-500 f-body">+{creatorList.length - 3} more</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CampaignDetail({ campaign, brand, deals, deliverablesWithJoins, brandInvoices, financials, goTo, back, onAddDeal, onEditDeal, onEditCampaign, onAddDeliverable, onStagesChange, role, onDeleteCampaign, onDeleteDeal, onDeleteDeliverable }) {
  const [tab, setTab] = useState("creators");
  if (!campaign) return null;
  return (
    <div>
      <SectionHeader title={campaign.name} crumbs={[{ label: "Campaigns", onClick: back }, { label: campaign.name }]} action={
        <div className="flex items-center gap-2">
          <Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>
          {role !== "creator" && <Btn variant="secondary" size="sm" onClick={() => onEditCampaign(campaign)}>Edit Campaign</Btn>}
          {role !== "creator" && <Btn variant="danger" size="sm" icon={XCircle} onClick={() => onDeleteCampaign(campaign.id)}>Delete Campaign</Btn>}
        </div>
      } />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <KPICard label="Campaign Value" value={inr(financials.revenue)} tone="indigo" />
        <KPICard label="Creator Cost" value={inr(financials.creatorCost)} tone="slate" />
        <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 px-4 py-3.5">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide f-body">Profit</div>
          <div className={`f-ledger text-xl font-semibold mt-1 ${financials.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {inr(financials.profit)} <span className="text-sm font-medium">({financials.revenue ? financials.margin.toFixed(0) : 0}% {financials.profit >= 0 ? "profit" : "loss"})</span>
          </div>
        </div>
      </div>
      <Tabs tab={tab} setTab={setTab} tabs={["creators", role !== "creator" ? "brand invoice" : null, "overview"].filter(Boolean)} />
      {tab === "overview" && (
        <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label="Brand" value={<button onClick={() => goTo("brands", brand?.id)} className="text-red-600 hover:underline">{brand?.name}</button>} />
          <InfoRow label="Status" value={<Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>} />
          <InfoRow label="POC" value={campaign.poc} />
          <InfoRow label="Internal POC" value={campaign.internalPoc} />
          <InfoRow label="Start Date" value={fmtDate(campaign.start)} />
          <InfoRow label="Payment Terms" value={campaign.paymentTerms} />
        </div>
      )}
      {tab === "creators" && (
        <div>
          {role !== "creator" && <div className="flex justify-end mb-3"><Btn size="sm" icon={Plus} onClick={onAddDeal}>Add Creator</Btn></div>}
          {deals.length === 0 ? (
            <EmptyState text="No creators shortlisted yet." />
          ) : (
            <div className="space-y-2.5">
              {deals.map((d) => (
                <CreatorDealRow
                  key={d.id}
                  deal={d}
                  deliverables={deliverablesWithJoins.filter((dl) => dl.dealId === d.id)}
                  goTo={goTo}
                  onEditDeal={onEditDeal}
                  onDeleteDeal={onDeleteDeal}
                  onAddDeliverable={onAddDeliverable}
                  onStagesChange={onStagesChange}
                  onDeleteDeliverable={onDeleteDeliverable}
                  role={role}
                />
              ))}
            </div>
          )}
        </div>
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

/* ============================== CLICKABLE CREATOR ROW — expands to deliverables + stages + notes ============================== */
function CreatorDealRow({ deal, deliverables, goTo, onEditDeal, onDeleteDeal, onAddDeliverable, onStagesChange, onDeleteDeliverable, role }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 overflow-hidden">
      <div onClick={() => setExpanded((e) => !e)} className="px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ChevronRight size={14} className={`text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
            <span className="font-semibold text-slate-900 f-body text-sm">{deal.creator?.name}</span>
            <span className="text-xs text-slate-400 f-body">{deal.scope}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="f-ledger text-xs text-slate-600">Brand {inr(deal.brandCost)} · Creator {inr(deal.amount)}</span>
            <Badge tone={statusTone(deal.approval === "Approved" ? "Approved" : "Pending Review")}>{deal.approval}</Badge>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
          {role !== "creator" && (
            <div className="flex items-center justify-end gap-2 mb-3">
              <Btn size="sm" variant="secondary" onClick={() => onEditDeal(deal)}>Edit Deal</Btn>
              <Btn size="sm" variant="secondary" onClick={onAddDeliverable}>Add Deliverable</Btn>
              <button onClick={() => onDeleteDeal(deal.id)} title="Delete deal"><XCircle size={16} className="text-slate-400 hover:text-red-600" /></button>
            </div>
          )}
          {deliverables.length === 0 ? (
            <EmptyState text="No deliverables yet for this creator." />
          ) : (
            <div className="space-y-2 mb-3">
              {deliverables.map((dl) => (
                <DeliverableStageCard key={dl.id} deliverable={dl} onStagesChange={onStagesChange} onDelete={onDeleteDeliverable} role={role} />
              ))}
            </div>
          )}
          <DealNotesEditor deal={deal} />
        </div>
      )}
    </div>
  );
}

function DealNotesEditor({ deal }) {
  const [notes, setNotes] = useState(deal.notes || "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    await supabase.from("deals").update({ notes }).eq("id", deal.id);
    setSaving(false);
  };
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 f-body">Notes</div>
      <div className="flex items-start gap-2">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for this creator's deal…"
          rows={2}
          className="flex-1 text-xs border border-red-100 rounded-lg px-2.5 py-1.5 f-body text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
        />
        {notes !== (deal.notes || "") && <Btn size="sm" variant="secondary" onClick={save}>{saving ? "Saving…" : "Save"}</Btn>}
      </div>
    </div>
  );
}

/* ============================== DELIVERABLES GROUPED BY CREATOR, WITH STAGE TICKS ============================== */
function CampaignDeliverablesByCreator({ deliverablesWithJoins, onStagesChange, onDeleteDeliverable, role }) {
  const byCreator = deliverablesWithJoins.reduce((acc, d) => {
    const key = d.creator?.id || "unknown";
    if (!acc[key]) acc[key] = { creator: d.creator, items: [] };
    acc[key].items.push(d);
    return acc;
  }, {});
  const groups = Object.values(byCreator);

  if (groups.length === 0) return <EmptyState text="No deliverables yet for this campaign." />;

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.creator?.id || "unknown"}>
          <div className="text-sm font-semibold text-white f-display mb-2">{g.creator?.name || "Unknown Creator"}</div>
          <div className="space-y-2">
            {g.items.map((d) => (
              <DeliverableStageCard
                key={d.id}
                deliverable={d}
                onStagesChange={onStagesChange}
                onDelete={onDeleteDeliverable}
                role={role}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DeliverableStageCard({ deliverable: d, onStagesChange, onDelete, role }) {
  // Local, per-card state seeded from the server value. Ticking updates this
  // instantly (so the UI never lags or appears to affect a different card
  // while the background save/refresh is in flight), and re-syncs if the
  // server value for THIS specific deliverable id changes.
  const [localStages, setLocalStages] = useState(d.stagesDone || []);
  useEffect(() => { setLocalStages(d.stagesDone || []); }, [d.id, JSON.stringify(d.stagesDone)]);

  const toggleStage = (stage) => {
    const done = localStages.includes(stage);
    const next = done ? localStages.filter((s) => s !== stage) : [...localStages, stage];
    setLocalStages(next); // instant visual feedback, scoped only to this card
    onStagesChange(d, next);
  };

  // Status shown to the user is derived purely from the furthest ticked
  // stage — no separate manual override, so the two can never drift apart.
  const derivedStatus = [...STAGES].reverse().find((s) => localStages.includes(s)) || "Not started";

  return (
    <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-3.5">
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
        <div>
          <div className="text-sm font-medium text-slate-900 f-body">{d.type} — {d.brief}</div>
          <div className="text-xs text-slate-400 f-body">
            Due {fmtDate(d.due)}
            {d.live && <> · Went live {fmtDate(d.live)}</>}
            {d.platformLink && <> · <a href={d.platformLink} target="_blank" rel="noreferrer" className="text-red-600 hover:underline">Link</a></>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={derivedStatus === "Live" ? "emerald" : derivedStatus === "Not started" ? "slate" : "indigo"}>{derivedStatus}</Badge>
          {role !== "creator" && <button onClick={() => onDelete(d.id)} title="Delete"><XCircle size={15} className="text-slate-400 hover:text-red-600" /></button>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {STAGES.map((stage) => {
          const done = localStages.includes(stage);
          return (
            <label key={`${d.id}-${stage}`} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer select-none transition-colors ${done ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-100 text-slate-500 hover:border-red-200"}`}>
              <input
                type="checkbox"
                checked={done}
                onChange={() => toggleStage(stage)}
                className="accent-emerald-600"
              />
              {stage}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== DELIVERABLES ============================== */
function DeliverablesModule({ rows, goTo, role, onDelete }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  return (
    <div>
      <SectionHeader title={role === "creator" ? "My Deliverables" : "Deliverables"} action={
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="text-sm border border-red-100 rounded-lg px-2.5 py-1.5 f-body text-slate-900 bg-white">
          <option value="all">All statuses</option>
          {DELIVERABLE_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      } />
      <Table head={["Creator", "Brand", "Campaign", "Type", "Brief", "Due", "Status", role !== "creator" ? "" : null].filter(Boolean)}>
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
            {role !== "creator" && <Td><button onClick={() => onDelete(d.id)} title="Delete"><XCircle size={15} className="text-slate-400 hover:text-red-600" /></button></Td>}
          </Tr>
        ))}
      </Table>
    </div>
  );
}

/* ============================== CREATOR INVOICES ============================== */
function CreatorInvoicesModule({ rows, onApprove, onReject, onRetrySync, onRecordPayment, onEdit, onSubmit, goTo, role }) {
  const [payModal, setPayModal] = useState(null);
  const exportCSV = () => downloadCSV("creator-invoices.csv",
    ["Invoice #", "Creator", "Campaign", "Amount", "GST", "TDS", "Total", "Paid", "Pending", "Status", "Due Date"],
    rows.map((i) => [i.invoiceNumber, i.creator?.name, i.campaign?.name, i.amount, i.gst, i.tds, i.total, i.paid, i.pending, i.status, i.dueDate])
  );
  return (
    <div>
      <SectionHeader title={role === "creator" ? "My Invoices" : "Creator Invoices"} action={
        <div className="flex gap-2">
          <Btn variant="secondary" icon={FileText} onClick={exportCSV}>Export CSV</Btn>
          <Btn icon={Plus} onClick={onSubmit}>Submit Invoice</Btn>
        </div>
      } />
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
                {role !== "creator" && <Btn size="sm" variant="secondary" onClick={() => onEdit(i)}>Edit</Btn>}
                <Btn size="sm" variant="secondary" onClick={() => downloadCreatorInvoicePDF(i)}>Download PDF</Btn>
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
function BrandInvoicesModule({ rows, onRecordPayment, onEdit, onCreate, goTo }) {
  const [payModal, setPayModal] = useState(null);
  const exportCSV = () => downloadCSV("brand-invoices.csv",
    ["Invoice #", "Brand", "Campaign", "Amount", "GST", "Total", "Received", "Pending", "Status", "Due Date"],
    rows.map((i) => [i.invoiceNumber, i.brand?.name, i.campaign?.name, i.amount, i.gst, i.total, i.received, i.pending, i.status, i.dueDate])
  );
  return (
    <div>
      <SectionHeader title="Brand Invoices" action={
        <div className="flex gap-2">
          <Btn variant="secondary" icon={FileText} onClick={exportCSV}>Export CSV</Btn>
          <Btn icon={Plus} onClick={onCreate}>Create Invoice</Btn>
        </div>
      } />
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
            <Td>
              <div className="flex gap-1.5 flex-wrap">
                {i.pending > 0 && <Btn size="sm" variant="secondary" onClick={() => setPayModal(i)}>Record Payment</Btn>}
                <Btn size="sm" variant="secondary" onClick={() => onEdit(i)}>Edit</Btn>
                <Btn size="sm" variant="secondary" onClick={() => downloadBrandInvoicePDF(i)}>Download PDF</Btn>
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

  const totalReceivable = brandInvoicesWithJoins.reduce((s, b) => s + b.pending, 0);
  const overdueReceivable = brandInvoicesWithJoins.filter((b) => b.pending > 0 && isPast(b.dueDate)).reduce((s, b) => s + b.pending, 0);
  const totalPayable = creatorInvoicesWithJoins.filter(i => i.status !== "Rejected").reduce((s, c) => s + c.pending, 0);
  const overduePayable = creatorInvoicesWithJoins.filter((c) => c.status !== "Rejected" && c.pending > 0 && isPast(c.dueDate)).reduce((s, c) => s + c.pending, 0);

  const exportCSV = () => downloadCSV("campaign-financials.csv",
    ["Campaign", "Revenue", "Creator Cost", "Other Costs", "Expected Profit", "Margin %"],
    campaigns.map((c) => {
      const f = campaignFinancials(c.id);
      return [c.name, f.revenue, f.creatorCost, f.otherCosts, f.profit, f.revenue ? f.margin.toFixed(1) : ""];
    })
  );

  return (
    <div>
      <SectionHeader title="Financial / Profitability Reports" action={<Btn variant="secondary" icon={FileText} onClick={exportCSV}>Export CSV</Btn>} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KPICard label="Brand Receivables" value={inr(totalReceivable)} tone="amber" />
        <KPICard label="Overdue Receivables" value={inr(overdueReceivable)} tone="red" />
        <KPICard label="Creator Payables" value={inr(totalPayable)} tone="amber" />
        <KPICard label="Overdue Creator Payments" value={inr(overduePayable)} tone="red" />
      </div>
      <div className="mb-5">
        <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-4">
          <div className="f-display text-sm font-medium text-slate-700 mb-3">Revenue vs Creator Cost vs Profit, by Campaign</div>
          <ResponsiveContainer width="100%" height={280}>
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
function DocumentsModule({ documents, brandById, creatorById, onDelete }) {
  const viewUrl = (doc) => {
    if (!doc.storagePath) return null;
    const { data } = supabase.storage.from("documents").getPublicUrl(doc.storagePath);
    return data?.publicUrl;
  };
  return (
    <div>
      <SectionHeader title="Documents" />
      <Table head={["File", "Type", "Linked To", "Uploaded By", "Date", ""]}>
        {documents.length === 0 && <tr><td colSpan={6}><EmptyState text="No documents uploaded yet." /></td></tr>}
        {documents.map((d) => {
          const owner = d.entityType === "brand" ? brandById(d.entityId)?.name : creatorById(d.entityId)?.name;
          return (
            <Tr key={d.id}>
              <Td>{d.fileName}</Td>
              <Td muted>{d.fileType}</Td>
              <Td muted>{owner} ({d.entityType})</Td>
              <Td muted>{d.uploadedBy}</Td>
              <Td muted>{fmtDate(d.uploadDate)}</Td>
              <Td>
                <div className="flex items-center gap-2">
                  {viewUrl(d) ? (
                    <a href={viewUrl(d)} target="_blank" rel="noreferrer" className="text-red-600 hover:underline text-xs inline-flex items-center gap-1">View <ExternalLink size={11} /></a>
                  ) : (
                    <span className="text-xs text-slate-300">No file</span>
                  )}
                  {onDelete && <button onClick={() => onDelete(d)} title="Delete"><XCircle size={14} className="text-slate-400 hover:text-red-600" /></button>}
                </div>
              </Td>
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}
function DocsTable({ documents, onDelete }) {
  const viewUrl = (doc) => {
    if (!doc.storagePath) return null;
    const { data } = supabase.storage.from("documents").getPublicUrl(doc.storagePath);
    return data?.publicUrl;
  };
  return (
    <Table head={["File", "Type", "Uploaded By", "Date", ""]}>
      {documents.length === 0 && <tr><td colSpan={5}><EmptyState text="No documents uploaded." /></td></tr>}
      {documents.map((d) => (
        <Tr key={d.id}>
          <Td>{d.fileName}</Td>
          <Td muted>{d.fileType}</Td>
          <Td muted>{d.uploadedBy}</Td>
          <Td muted>{fmtDate(d.uploadDate)}</Td>
          <Td>
            <div className="flex items-center gap-2">
              {viewUrl(d) ? (
                <a href={viewUrl(d)} target="_blank" rel="noreferrer" className="text-red-600 hover:underline text-xs inline-flex items-center gap-1">View <ExternalLink size={11} /></a>
              ) : (
                <span className="text-xs text-slate-300">No file</span>
              )}
              {onDelete && <button onClick={() => onDelete(d)} title="Delete"><XCircle size={14} className="text-slate-400 hover:text-red-600" /></button>}
            </div>
          </Td>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KPICard label="Total Earnings" value={inr(totals.earnings)} tone="indigo" />
        <KPICard label="Paid" value={inr(totals.paid)} tone="emerald" />
        <KPICard label="Outstanding" value={inr(totals.outstanding)} tone="amber" />
        <KPICard label="Active Campaigns" value={[...new Set(totals.deals.filter(d => d.campaign?.status === "Ongoing").map(d => d.campaignId))].length} tone="slate" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-4">
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
        <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-4">
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

/* ============================== USER APPROVALS ============================== */
function UserApprovalsModule({ creators, showToast }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, role, creator_id, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      showToast("Failed to load users: " + error.message);
      setLoading(false);
      return;
    }
    setProfiles(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchProfiles(); }, []);

  const updateRole = async (id, role, creatorId) => {
    setSavingId(id);
    const patch = { role };
    if (role === "creator") patch.creator_id = creatorId || null;
    if (role !== "creator") patch.creator_id = null;
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    setSavingId(null);
    if (error) { showToast("Failed to update user: " + error.message); return; }
    showToast("User updated");
    fetchProfiles();
  };

  const pending = profiles.filter((p) => p.role === "pending" || !p.role);
  const approved = profiles.filter((p) => p.role && p.role !== "pending");

  return (
    <div>
      <SectionHeader title="User Approvals" action={<Btn size="sm" icon={RefreshCw} variant="secondary" onClick={fetchProfiles}>Refresh</Btn>} />

      <div className="mb-6">
        <div className="text-sm font-medium text-slate-700 f-display mb-2">Pending ({pending.length})</div>
        {loading ? (
          <div className="text-sm text-slate-400 f-body">Loading…</div>
        ) : pending.length === 0 ? (
          <EmptyState text="No accounts waiting on approval." />
        ) : (
          <div className="space-y-3">
            {pending.map((p) => (
              <PendingUserRow key={p.id} profile={p} creators={creators} onApprove={updateRole} saving={savingId === p.id} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-sm font-medium text-slate-700 f-display mb-2">Approved Users ({approved.length})</div>
        <Table head={["Name", "Role", "Linked Creator", "Actions"]}>
          {approved.length === 0 && <tr><td colSpan={4}><EmptyState text="No approved users yet." /></td></tr>}
          {approved.map((p) => {
            const linkedCreator = creators.find((c) => c.id === p.creator_id);
            return (
              <Tr key={p.id}>
                <Td><span className="font-medium text-slate-900">{p.display_name || "—"}</span></Td>
                <Td>
                  <select
                    value={p.role}
                    onChange={(e) => updateRole(p.id, e.target.value, p.creator_id)}
                    className="text-xs border border-red-100 rounded-md px-1.5 py-1 f-body text-slate-900 bg-white"
                  >
                    <option value="admin">Admin</option>
                    <option value="poc">POC</option>
                    <option value="creator">Creator</option>
                    <option value="pending">Pending (revoke)</option>
                  </select>
                </Td>
                <Td muted>
                  {p.role === "creator" ? (
                    <select
                      value={p.creator_id || ""}
                      onChange={(e) => updateRole(p.id, "creator", e.target.value)}
                      className="text-xs border border-red-100 rounded-md px-1.5 py-1 f-body text-slate-900 bg-white"
                    >
                      <option value="">— none —</option>
                      {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : "—"}
                </Td>
                <Td>{savingId === p.id && <span className="text-xs text-slate-400">Saving…</span>}</Td>
              </Tr>
            );
          })}
        </Table>
      </div>
    </div>
  );
}

function PendingUserRow({ profile, creators, onApprove, saving }) {
  const [role, setRole] = useState("poc");
  const [creatorId, setCreatorId] = useState("");
  return (
    <div className="bg-[#FCF9F3] border border-amber-200 rounded-xl shadow-sm shadow-rose-900/10 p-4 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <div className="font-medium text-slate-900 f-body">{profile.display_name || "Unnamed user"}</div>
        <div className="text-xs text-slate-400 f-ledger">{profile.id}</div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="text-sm border border-red-100 rounded-lg px-2.5 py-1.5 f-body text-slate-900 bg-white">
          <option value="admin">Admin</option>
          <option value="poc">POC</option>
          <option value="creator">Creator</option>
        </select>
        {role === "creator" && (
          <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} className="text-sm border border-red-100 rounded-lg px-2.5 py-1.5 f-body text-slate-900 bg-white">
            <option value="">Link to creator…</option>
            {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <Btn size="sm" variant="success" icon={Check} onClick={() => onApprove(profile.id, role, creatorId)} disabled={saving}>
          {saving ? "Saving…" : "Approve"}
        </Btn>
      </div>
    </div>
  );
}

const SOCIAL_PLATFORMS = ["Instagram", "YouTube", "X (Twitter)", "LinkedIn", "TikTok", "Facebook", "Threads", "Telegram", "Other"];
const platformIconFor = (platform) => {
  const map = { "Instagram": Camera, "YouTube": PlayCircle, "X (Twitter)": MessageCircle, "LinkedIn": Link2 };
  return map[platform] || Globe;
};

function SocialLinksEditor({ creator, onSave }) {
  const [links, setLinks] = useState(creator.socialLinks && creator.socialLinks.length ? creator.socialLinks : [{ platform: "Instagram", url: "", followers: "" }]);
  const [saving, setSaving] = useState(false);

  const updateLink = (i, key, value) => {
    setLinks((prev) => prev.map((l, idx) => idx === i ? { ...l, [key]: value } : l));
  };
  const addLink = () => setLinks((prev) => [...prev, { platform: "Instagram", url: "", followers: "" }]);
  const removeLink = (i) => setLinks((prev) => prev.filter((_, idx) => idx !== i));
  const save = async () => {
    setSaving(true);
    const cleaned = links.filter((l) => l.url.trim());
    await onSave(creator.id, cleaned);
    setSaving(false);
  };

  return (
    <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-5">
      <div className="text-xs text-slate-400 f-body mb-3">
        Follower counts are entered manually — automatic fetching isn't available without a paid third-party API, so update these numbers here as they change.
      </div>
      <div className="space-y-3 mb-4">
        {links.map((l, i) => (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            <select value={l.platform} onChange={(e) => updateLink(i, "platform", e.target.value)} className="text-sm border border-red-100 rounded-lg px-2.5 py-2 f-body w-36 shrink-0 text-slate-900 bg-white">
              {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              type="url"
              placeholder="https://..."
              value={l.url}
              onChange={(e) => updateLink(i, "url", e.target.value)}
              className={inputCls + " flex-1 min-w-[160px]"}
            />
            <input
              type="text"
              placeholder="Followers, e.g. 336K"
              value={l.followers || ""}
              onChange={(e) => updateLink(i, "followers", e.target.value)}
              className="border border-red-100 rounded-lg px-3 py-2 text-sm f-body w-32 shrink-0 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-200"
            />
            <button onClick={() => removeLink(i)} className="text-slate-400 hover:text-red-600 shrink-0"><X size={16} /></button>
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <Btn variant="secondary" size="sm" icon={Plus} onClick={addLink}>Add Platform</Btn>
        <Btn variant="success" size="sm" onClick={save}>{saving ? "Saving…" : "Save Social Links"}</Btn>
      </div>
      {creator.socialLinks && creator.socialLinks.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
          {creator.socialLinks.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs bg-slate-50 border border-red-100 rounded-full px-2.5 py-1 text-slate-600 hover:text-red-600">
              {l.platform}{l.followers && <span className="f-ledger">· {l.followers}</span>} <ExternalLink size={10} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== CREATOR PROFILE HEADER ============================== */
function CreatorProfileHeader({ creator, onSaveAvatar }) {
  const [uploading, setUploading] = useState(false);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `avatars/${creator.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
    if (!upErr) {
      const { data } = supabase.storage.from("documents").getPublicUrl(path);
      await onSaveAvatar(creator.id, data?.publicUrl);
    }
    setUploading(false);
  };

  const avatarStyle = avatarStyleFor(creator.id);
  const initials = (creator.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="bg-[#FCF9F3] border border-red-200 rounded-xl shadow-sm shadow-rose-900/10 p-5 mb-5 flex items-center gap-4 flex-wrap">
      <div className="relative shrink-0">
        {creator.avatarUrl ? (
          <img src={creator.avatarUrl} alt={creator.name} className="w-16 h-16 rounded-full object-cover border border-red-100" />
        ) : (
          <div className={`w-16 h-16 rounded-full ${avatarStyle.bg} border ${avatarStyle.border} flex items-center justify-center`}>
            <span className={`text-lg font-bold f-display ${avatarStyle.icon}`}>{initials}</span>
          </div>
        )}
        <label className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center cursor-pointer hover:bg-red-700 shadow">
          <Plus size={13} />
          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={uploading} />
        </label>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-semibold text-slate-900 f-display">{creator.name}</div>
        <div className="text-sm text-slate-400 f-body mb-3">{creator.handle} {creator.platform && `· ${creator.platform}`}</div>
        <div className="flex flex-wrap gap-2">
          {creator.socialLinks && creator.socialLinks.length > 0 && creator.socialLinks.map((l, i) => {
            const Icon = platformIconFor(l.platform);
            return (
              <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 hover:border-red-300 min-w-[76px]">
                <Icon size={16} className="text-slate-700 mb-1" />
                <div className="text-xs font-semibold text-slate-800 f-ledger">{l.followers || "—"}</div>
                <div className="text-[9px] text-slate-400 uppercase tracking-wide">Followers</div>
              </a>
            );
          })}
          {["Instagram", "YouTube", "X (Twitter)"].filter((p) => !(creator.socialLinks || []).some((l) => l.platform === p)).map((platform) => {
            const Icon = platformIconFor(platform);
            return (
              <div key={platform} className="flex flex-col items-center bg-white border border-dashed border-slate-200 rounded-lg px-3 py-2 min-w-[76px]">
                <div className="flex items-center gap-0.5 mb-1">
                  <Icon size={16} className="text-slate-300" />
                  <Plus size={11} className="text-slate-300" />
                </div>
                <div className="text-[9px] text-slate-400 f-body">{platform}</div>
              </div>
            );
          })}
        </div>
      </div>
      {uploading && <span className="text-xs text-slate-400 f-body ml-auto">Uploading photo…</span>}
    </div>
  );
}

/* ============================== SHARED SMALL COMPONENTS ============================== */
function Tabs({ tab, setTab, tabs }) {
  return (
    <div className="flex gap-1 mb-4 border-b border-white/10">
      {tabs.map((t) => (
        <button key={t} onClick={() => setTab(t)} className={`px-3.5 py-2 text-sm capitalize f-body border-b-2 -mb-px transition-colors ${tab === t ? "border-red-500 text-red-400 font-medium" : "border-transparent text-slate-400 hover:text-slate-200"}`}>{t}</button>
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
  const [f, setF] = useState({ name: "", poc: "", internalPoc: "", email: "", phone: "", paymentTerms: "Net 30", industry: "", notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Add Brand" onClose={onClose}>
      <Field label="Brand Name"><input className={inputCls} value={f.name} onChange={set("name")} /></Field>
      <Field label="POC Name"><input className={inputCls} value={f.poc} onChange={set("poc")} /></Field>
      <Field label="Internal POC"><input className={inputCls} value={f.internalPoc} onChange={set("internalPoc")} /></Field>
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
        <Field label="Platform"><select className={inputCls} value={f.platform} onChange={set("platform")}><option value="">Select…</option>{SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="Phone"><input className={inputCls} value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Email"><input className={inputCls} value={f.email} onChange={set("email")} /></Field>
        <Field label="GST Number"><input className={inputCls} value={f.gst} onChange={set("gst")} /></Field>
        <Field label="PAN"><input className={inputCls} value={f.pan} onChange={set("pan")} /></Field>
      </div>
      <p className="text-xs text-slate-400 f-body -mt-1 mb-3">Platform picked here shows up automatically on their Social tab — add followers/links there.</p>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => f.name && onSave(f)}>Save Creator</Btn></div>
    </Modal>
  );
}
function EditBrandModal({ brand, onClose, onSave }) {
  const [f, setF] = useState({ name: brand.name || "", poc: brand.poc || "", internalPoc: brand.internalPoc || "", email: brand.email || "", phone: brand.phone || "", paymentTerms: brand.paymentTerms || "Net 30", industry: brand.industry || "", notes: brand.notes || "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Edit Brand" onClose={onClose}>
      <Field label="Brand Name"><input className={inputCls} value={f.name} onChange={set("name")} /></Field>
      <Field label="POC Name"><input className={inputCls} value={f.poc} onChange={set("poc")} /></Field>
      <Field label="Internal POC"><input className={inputCls} value={f.internalPoc} onChange={set("internalPoc")} /></Field>
      <Field label="Email"><input className={inputCls} value={f.email} onChange={set("email")} /></Field>
      <Field label="Phone"><input className={inputCls} value={f.phone} onChange={set("phone")} /></Field>
      <Field label="Payment Terms"><input className={inputCls} value={f.paymentTerms} onChange={set("paymentTerms")} /></Field>
      <Field label="Industry"><input className={inputCls} value={f.industry} onChange={set("industry")} /></Field>
      <Field label="Notes"><textarea className={inputCls} rows={2} value={f.notes} onChange={set("notes")} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => f.name && onSave(f)}>Save Changes</Btn></div>
    </Modal>
  );
}
function EditCreatorModal({ creator, onClose, onSave }) {
  const [f, setF] = useState({
    name: creator.name || "", handle: creator.handle || "",
    platform: creator.socialLinks?.[0]?.platform || creator.platform || "",
    phone: creator.phone || "", email: creator.email || "", gst: creator.gst || "", pan: creator.pan || "",
    standard: creator.standard || "", bank: { name: creator.bank?.name || "", acc: creator.bank?.acc || "", ifsc: creator.bank?.ifsc || "" },
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setBank = (k) => (e) => setF({ ...f, bank: { ...f.bank, [k]: e.target.value } });
  return (
    <Modal title="Edit Creator" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={set("name")} /></Field>
        <Field label="Handle"><input className={inputCls} value={f.handle} onChange={set("handle")} /></Field>
        <Field label="Platform"><select className={inputCls} value={f.platform} onChange={set("platform")}><option value="">Select…</option>{SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="Phone"><input className={inputCls} value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Email"><input className={inputCls} value={f.email} onChange={set("email")} /></Field>
        <Field label="GST Number"><input className={inputCls} value={f.gst} onChange={set("gst")} /></Field>
        <Field label="PAN"><input className={inputCls} value={f.pan} onChange={set("pan")} /></Field>
        <Field label="Bank Account Name"><input className={inputCls} value={f.bank.name} onChange={setBank("name")} /></Field>
        <Field label="Bank Account Number"><input className={inputCls} value={f.bank.acc} onChange={setBank("acc")} /></Field>
        <Field label="Bank IFSC"><input className={inputCls} value={f.bank.ifsc} onChange={setBank("ifsc")} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => {
        if (!f.name) return;
        // Keep the Platform field and Social tab in sync: update (or create)
        // the first social-link entry's platform to match what was picked here,
        // without touching any URL/follower count already saved there.
        const existingLinks = creator.socialLinks || [];
        let socialLinks = existingLinks;
        if (f.platform) {
          socialLinks = existingLinks.length > 0
            ? existingLinks.map((l, i) => i === 0 ? { ...l, platform: f.platform } : l)
            : [{ platform: f.platform, url: "", followers: "" }];
        }
        onSave({ ...f, socialLinks });
      }}>Save Changes</Btn></div>
    </Modal>
  );
}
const emptyCreatorRow = () => ({ creatorId: "", newCreatorName: "", scope: "", amount: 0, brandCost: 0, platformLinks: [], notes: "", dueDate: daysFromNow(14) });

// Small reusable "one or more text values" editor — used for POC / Internal POC
// wherever a brand or campaign might have more than one contact.
function MultiTextField({ label, values, onChange, placeholder }) {
  const list = values.length ? values : [""];
  const update = (i, v) => onChange(list.map((val, idx) => idx === i ? v : val));
  const add = () => onChange([...list, ""]);
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  return (
    <div className="mb-3">
      <span className="block text-xs font-medium text-slate-500 mb-1 f-body">{label}</span>
      <div className="space-y-1.5">
        {list.map((v, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input className={inputCls} value={v} onChange={(e) => update(i, e.target.value)} placeholder={placeholder} />
            {list.length > 1 && <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-600 shrink-0"><X size={14} /></button>}
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="text-xs text-red-600 hover:underline mt-1">+ Add another</button>
    </div>
  );
}

const InfoDot = ({ text }) => (
  <span title={text} className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold cursor-help select-none">i</span>
);

const emptyPlatformLink = () => ({ platform: "Instagram", url: "" });

function PlatformLinksEditor({ links, onChange }) {
  const list = links.length ? links : [emptyPlatformLink()];
  const update = (i, patch) => onChange(list.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const add = () => onChange([...list, emptyPlatformLink()]);
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  return (
    <div className="mb-3 sm:col-span-2">
      <span className="block text-xs font-medium text-slate-500 mb-1 f-body">Platform(s)</span>
      <div className="space-y-1.5">
        {list.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select value={l.platform} onChange={(e) => update(i, { platform: e.target.value })} className="text-sm border border-red-100 rounded-lg px-2.5 py-2 f-body w-36 shrink-0 text-slate-900 bg-white">
              {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className={inputCls} value={l.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://…" />
            {list.length > 1 && <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-600 shrink-0"><X size={14} /></button>}
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="text-xs text-red-600 hover:underline mt-1">+ Add platform</button>
    </div>
  );
}

function NewCampaignWizardModal({ brands, creators, onClose, onSave }) {
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState(brands[0]?.id || "__new__");
  const [newBrandName, setNewBrandName] = useState("");
  const [pocList, setPocList] = useState([""]);
  const [internalPocList, setInternalPocList] = useState([""]);
  const [startDate, setStartDate] = useState(todayISO());
  const [status, setStatus] = useState("Ongoing");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [budget, setBudget] = useState(0);
  const [rows, setRows] = useState([{ ...emptyCreatorRow(), platformLinks: [emptyPlatformLink()] }]);
  const [saving, setSaving] = useState(false);

  const updateRow = (i, patch) => setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setRows((prev) => [...prev, { ...emptyCreatorRow(), platformLinks: [emptyPlatformLink()] }]);
  const removeRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const canSave = name.trim() && (brandId !== "__new__" || newBrandName.trim()) &&
    rows.some((r) => r.creatorId || r.newCreatorName.trim());

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      brandId: brandId === "__new__" ? null : brandId,
      newBrandName: brandId === "__new__" ? newBrandName : null,
      poc: pocList.filter(Boolean).join(", "),
      internalPoc: internalPocList.filter(Boolean).join(", "),
      startDate, status, paymentTerms, budget,
      creatorRows: rows.filter((r) => r.creatorId || r.newCreatorName.trim()),
    });
    setSaving(false);
  };

  return (
    <Modal title="New Campaign" onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Field label="Campaign Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Brand">
          <select className={inputCls} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="__new__">+ Add New Brand</option>
          </select>
        </Field>
        {brandId === "__new__" && (
          <Field label="New Brand Name"><input className={inputCls} value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} placeholder="Brand name" /></Field>
        )}
        <MultiTextField label="POC" values={pocList} onChange={setPocList} placeholder="POC name" />
        <MultiTextField label="Internal POC" values={internalPocList} onChange={setInternalPocList} placeholder="Internal POC name" />
        <Field label="Start Date"><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Status">
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="Ongoing">Ongoing</option>
            <option value="Closed">Closed</option>
          </select>
        </Field>
        <Field label="Payment Terms"><input className={inputCls} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-slate-400 f-body -mt-2 mb-3">Campaign Value is calculated automatically as the total of every creator's Brand Cost below — no need to enter it separately.</p>

      <div className="mt-2 mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Shortlisted Creators</div>
      <div className="space-y-4">
        {rows.map((row, i) => {
          const preview = parseScopeToDeliverables(row.scope);
          return (
            <div key={i} className="border border-red-100 rounded-lg p-3 bg-slate-50/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">Creator {i + 1}</span>
                {rows.length > 1 && <button onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-600"><X size={14} /></button>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                <Field label="Creator">
                  <select className={inputCls} value={row.creatorId || (row.newCreatorName ? "__new__" : "")} onChange={(e) => {
                    if (e.target.value === "__new__") updateRow(i, { creatorId: "", newCreatorName: " " });
                    else {
                      // Auto-pull this creator's real, already-saved platform
                      // links instead of leaving it blank for re-typing.
                      const picked = creators.find((c) => c.id === e.target.value);
                      const existing = picked?.socialLinks?.length ? picked.socialLinks.map((l) => ({ platform: l.platform, url: l.url || "" })) : [emptyPlatformLink()];
                      updateRow(i, { creatorId: e.target.value, newCreatorName: "", platformLinks: existing });
                    }
                  }}>
                    <option value="">Select…</option>
                    {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value="__new__">+ Add New Creator</option>
                  </select>
                </Field>
                {(row.newCreatorName || (!row.creatorId && row.newCreatorName !== "")) && (
                  <Field label="New Creator Name"><input className={inputCls} value={row.newCreatorName.trim()} onChange={(e) => updateRow(i, { newCreatorName: e.target.value })} placeholder="Creator name" /></Field>
                )}
                <div>
                  <span className="text-xs font-medium text-slate-500 mb-1 f-body inline-flex items-center gap-1">Scope of Work <InfoDot text="e.g. 2 Reels + 1 Story" /></span>
                  <input className={inputCls} value={row.scope} onChange={(e) => updateRow(i, { scope: e.target.value })} />
                </div>
                <Field label="Brand Cost (₹)"><input type="number" className={inputCls} value={row.brandCost || 0} onChange={(e) => updateRow(i, { brandCost: Number(e.target.value) })} /></Field>
                <Field label="Creator Cost (₹)"><input type="number" className={inputCls} value={row.amount} onChange={(e) => updateRow(i, { amount: Number(e.target.value) })} /></Field>
                <PlatformLinksEditor links={row.platformLinks || []} onChange={(links) => updateRow(i, { platformLinks: links })} />
                <Field label="Go Live Date"><input type="date" className={inputCls} value={row.dueDate} onChange={(e) => updateRow(i, { dueDate: e.target.value })} /></Field>
                <div className="sm:col-span-2">
                  <Field label="Notes"><textarea className={inputCls} rows={1} value={row.notes} onChange={(e) => updateRow(i, { notes: e.target.value })} /></Field>
                </div>
              </div>
              {preview.length > 0 && (
                <div className="text-xs text-slate-500 f-body bg-[#FCF9F3] border border-slate-100 rounded-lg px-2.5 py-2">
                  Will auto-create: {preview.map((p) => p.brief).join(", ")}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3"><Btn size="sm" variant="secondary" icon={Plus} onClick={addRow}>Add Another Creator</Btn></div>

      <div className="flex justify-end gap-2 mt-5"><Btn onClick={handleSave} disabled={!canSave || saving}>{saving ? "Creating…" : "Create Campaign"}</Btn></div>
    </Modal>
  );
}

function EditCampaignModal({ campaign, brands, onClose, onSave }) {
  const [name, setName] = useState(campaign.name || "");
  const [brandId, setBrandId] = useState(campaign.brandId || "");
  const [pocList, setPocList] = useState(campaign.poc ? campaign.poc.split(",").map((s) => s.trim()) : [""]);
  const [internalPocList, setInternalPocList] = useState(campaign.internalPoc ? campaign.internalPoc.split(",").map((s) => s.trim()) : [""]);
  const [start, setStart] = useState(campaign.start || todayISO());
  const [status, setStatus] = useState(campaign.status || "Ongoing");
  const [paymentTerms, setPaymentTerms] = useState(campaign.paymentTerms || "Net 30");
  const [budget, setBudget] = useState(campaign.budget || 0);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(), brandId, start, status, paymentTerms, budget,
      poc: pocList.filter(Boolean).join(", "),
      internalPoc: internalPocList.filter(Boolean).join(", "),
    });
  };

  return (
    <Modal title="Edit Campaign" onClose={onClose}>
      <Field label="Campaign Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Brand"><select className={inputCls} value={brandId} onChange={(e) => setBrandId(e.target.value)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <MultiTextField label="POC" values={pocList} onChange={setPocList} placeholder="POC name" />
      <MultiTextField label="Internal POC" values={internalPocList} onChange={setInternalPocList} placeholder="Internal POC name" />
      <Field label="Start Date"><input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label="Status">
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="Ongoing">Ongoing</option>
          <option value="Closed">Closed</option>
        </select>
      </Field>
      <Field label="Payment Terms"><input className={inputCls} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} /></Field>
      <p className="text-xs text-slate-400 f-body mb-3">Campaign Value is calculated automatically from every creator's Brand Cost — edit those under the Creators tab.</p>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={handleSave}>Save Changes</Btn></div>
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
      <Field label="Campaign Value (₹)"><input type="number" className={inputCls} value={f.budget} onChange={(e) => setF({ ...f, budget: Number(e.target.value) })} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => f.name && onSave(f)}>Create Campaign</Btn></div>
    </Modal>
  );
}
function AddDealModal({ creators, campaignId, onClose, onSave }) {
  const [f, setF] = useState({ creatorId: creators[0]?.id, scope: "", amount: 0, dueDate: daysFromNow(14) });
  const preview = parseScopeToDeliverables(f.scope);
  return (
    <Modal title="Add Deal" onClose={onClose}>
      <Field label="Creator"><select className={inputCls} value={f.creatorId} onChange={(e) => setF({ ...f, creatorId: e.target.value })}>{creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Scope (e.g. 2 Reels + 1 Story)"><input className={inputCls} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} /></Field>
      {preview.length > 0 && (
        <div className="text-xs text-slate-500 f-body -mt-2 mb-3 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">
          Will auto-create: {preview.map((p) => p.brief).join(", ")}
        </div>
      )}
      <Field label="Amount (₹)"><input type="number" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
      <Field label="Deliverables Due Date"><input type="date" className={inputCls} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => onSave({ ...f, campaignId })}>Add Deal</Btn></div>
    </Modal>
  );
}
function AddDeliverableModal({ deals, onClose, onSave }) {
  const [f, setF] = useState({ dealId: deals[0]?.id || "", type: "Reel", brief: "", due: daysFromNow(14) });
  return (
    <Modal title="Add Deliverable" onClose={onClose}>
      <Field label="Creator / Deal">
        <select className={inputCls} value={f.dealId} onChange={(e) => setF({ ...f, dealId: e.target.value })}>
          {deals.map((d) => <option key={d.id} value={d.id}>{d.creator?.name} — {d.scope}</option>)}
        </select>
      </Field>
      <Field label="Type">
        <select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="Reel">Reel</option>
          <option value="Story">Story</option>
          <option value="Post">Post</option>
          <option value="Video">Video (YouTube)</option>
          <option value="Live Session">Live Session</option>
        </select>
      </Field>
      <Field label="Brief"><input className={inputCls} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} placeholder="e.g. Product walkthrough reel" /></Field>
      <Field label="Go Live Date"><input type="date" className={inputCls} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => f.dealId && f.brief && onSave(f)}>Add Deliverable</Btn></div>
    </Modal>
  );
}
function AddDocumentModal({ onClose, onSave }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const handleSave = async () => {
    if (!file) return;
    setUploading(true);
    await onSave(file);
    setUploading(false);
  };
  return (
    <Modal title="Add Document" onClose={onClose}>
      <Field label="File">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full text-sm f-body file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-red-100 file:bg-white file:text-slate-700 file:text-sm hover:file:bg-slate-50"
        />
      </Field>
      {file && <div className="text-xs text-slate-400 f-body -mt-2 mb-3">{file.name} ({(file.size / 1024).toFixed(0)} KB)</div>}
      <div className="flex justify-end gap-2 mt-3">
        <Btn onClick={handleSave} disabled={!file || uploading}>{uploading ? "Uploading…" : "Upload Document"}</Btn>
      </div>
    </Modal>
  );
}
function EditDealModal({ creators, deal, onClose, onSave }) {
  const [f, setF] = useState({ creatorId: deal.creatorId, scope: deal.scope || "", amount: deal.amount || 0, brandCost: deal.brandCost || 0, dueDate: daysFromNow(14) });
  const preview = parseScopeToDeliverables(f.scope);
  return (
    <Modal title="Edit Deal" onClose={onClose}>
      <Field label="Creator"><select className={inputCls} value={f.creatorId} onChange={(e) => setF({ ...f, creatorId: e.target.value })}>{creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label={<span className="inline-flex items-center gap-1">Scope of Work <span title="e.g. 2 Reels + 1 Story" className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold cursor-help">i</span></span>}><input className={inputCls} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} /></Field>
      {preview.length > 0 && (
        <div className="text-xs text-slate-500 f-body -mt-2 mb-3 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">
          Expected deliverables: {preview.map((p) => p.brief).join(", ")}. Any that don't already exist yet will be created — existing ones are left untouched.
        </div>
      )}
      <Field label="Brand Cost (₹)"><input type="number" className={inputCls} value={f.brandCost} onChange={(e) => setF({ ...f, brandCost: Number(e.target.value) })} /></Field>
      <Field label="Creator Cost (₹)"><input type="number" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
      <Field label="Go Live Date for any newly-added deliverables"><input type="date" className={inputCls} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => onSave(f)}>Save Changes</Btn></div>
    </Modal>
  );
}

function SubmitInvoiceModal({ deals, onClose, onSave }) {
  const [f, setF] = useState({ dealId: deals[0]?.id, invoiceNumber: "", date: todayISO(), amount: 0, dueDate: daysFromNow(30) });
  const gst = Math.round(f.amount * 0.18);
  const tds = Math.round(f.amount * 0.01);
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
      <div className="text-xs text-slate-400 f-body -mt-2 mb-3">GST (18%): {inr(gst)} · TDS (1%): {inr(tds)} · Total payable: <span className="f-ledger text-slate-600">{inr(total)}</span></div>
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

function EditCreatorInvoiceModal({ invoice, onClose, onSave }) {
  const [f, setF] = useState({
    invoiceNumber: invoice.invoiceNumber || "", date: invoice.date || todayISO(),
    amount: invoice.amount || 0, dueDate: invoice.dueDate || daysFromNow(30),
  });
  const gst = Math.round(f.amount * 0.18);
  const tds = Math.round(f.amount * 0.01);
  const total = f.amount + gst - tds;
  return (
    <Modal title={`Edit Invoice — ${invoice.invoiceNumber}`} onClose={onClose}>
      <Field label="Invoice Number"><input className={inputCls} value={f.invoiceNumber} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} /></Field>
      <Field label="Invoice Date"><input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Amount (₹, before GST)"><input type="number" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
      <div className="text-xs text-slate-400 f-body -mt-2 mb-3">GST (18%): {inr(gst)} · TDS (1%): {inr(tds)} · Total payable: <span className="f-ledger text-slate-600">{inr(total)}</span></div>
      <Field label="Due Date"><input type="date" className={inputCls} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => f.invoiceNumber && onSave({ invoiceNumber: f.invoiceNumber, date: f.date, amount: f.amount, gst, tds, total, dueDate: f.dueDate })}>Save Changes</Btn></div>
    </Modal>
  );
}

function EditBrandInvoiceModal({ invoice, onClose, onSave }) {
  const [f, setF] = useState({
    invoiceNumber: invoice.invoiceNumber || "", date: invoice.date || todayISO(),
    amount: invoice.amount || 0, dueDate: invoice.dueDate || daysFromNow(30),
  });
  const gst = Math.round(f.amount * 0.18);
  const total = f.amount + gst;
  return (
    <Modal title={`Edit Invoice — ${invoice.invoiceNumber}`} onClose={onClose}>
      <Field label="Invoice Number"><input className={inputCls} value={f.invoiceNumber} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} /></Field>
      <Field label="Invoice Date"><input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Amount (₹, before GST)"><input type="number" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
      <div className="text-xs text-slate-400 f-body -mt-2 mb-3">GST (18%): {inr(gst)} · Total: <span className="f-ledger text-slate-600">{inr(total)}</span></div>
      <Field label="Due Date"><input type="date" className={inputCls} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-3"><Btn onClick={() => f.invoiceNumber && onSave({ invoiceNumber: f.invoiceNumber, date: f.date, amount: f.amount, gst, total, dueDate: f.dueDate })}>Save Changes</Btn></div>
    </Modal>
  );
}