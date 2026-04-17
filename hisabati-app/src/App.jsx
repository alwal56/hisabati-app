import { useState, useEffect, useCallback, useRef } from 'react'
import { kv } from './storage.js'
import { requestNotifPermission, schedulePaymentReminder, cancelNotification } from './notifications.js'
import { nativeShare } from './share.js'

// ─── Constants ────────────────────────────────────────────────────────────────
const USERS_KEY   = 'hisabati_users'
const SESSION_KEY = 'hisabati_session'
const DATA_PREFIX = 'hisabati_data_'
const OTP_KEY     = 'hisabati_otp'
const defaultData = { friends: [], transactions: [], statements: [], notifications: [] }

// ─── Crypto ───────────────────────────────────────────────────────────────────
async function hashPwd(pwd) {
  const enc = new TextEncoder().encode(pwd + 'hisabati_2026')
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function genOTP() { return String(Math.floor(100000 + Math.random() * 900000)) }

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmt      = iso => new Date(iso).toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric' })
const fmtShort = iso => new Date(iso).toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtMoney = n   => new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2 }).format(Math.abs(n))
const todayISO = ()  => new Date().toISOString().split('T')[0]
const monthLbl = (d = new Date()) => d.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })
const monthKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }

function fileToB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

// ─── Exports ──────────────────────────────────────────────────────────────────
function exportCSV(stmt) {
  const BOM  = '\uFEFF'
  const rows = [
    ['كشف حساب - ' + stmt.label],
    ['تاريخ الإقفال', fmtShort(stmt.lockedAt)],
    [''],
    ['الشخص', 'الرصيد (ر.س)', 'الحالة'],
    ...stmt.snapshot.map(s => [s.friendName, s.balance.toFixed(2), s.balance > 0 ? 'له عندك' : s.balance < 0 ? 'عليك له' : 'متعادل']),
    [''],
    ['الإجمالي', stmt.snapshot.reduce((a,s) => a+s.balance, 0).toFixed(2), ''],
  ]
  const csv  = BOM + rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `كشف_حساب_${stmt.label}.csv`; a.click()
  URL.revokeObjectURL(url)
}

function exportPDF(stmt, userName) {
  const total = stmt.snapshot.reduce((a,s) => a+s.balance, 0)
  const rows  = stmt.snapshot.map(s => `
    <tr>
      <td>${s.friendName}</td>
      <td class="${s.balance>0?'pos':s.balance<0?'neg':'neu'}">${s.balance>0?'+':s.balance<0?'-':''}${fmtMoney(s.balance)} ر.س</td>
      <td class="${s.balance>0?'pos':s.balance<0?'neg':'neu'}">${s.balance>0?'له عندك':s.balance<0?'عليك له':'متعادل'}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>كشف حساب</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'IBM Plex Sans Arabic',Arial,sans-serif;background:#fff;color:#111;padding:32px;direction:rtl}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:18px;border-bottom:2.5px solid #d4a843}
  .logo{font-size:26px;font-weight:700}.logo span{color:#d4a843}
  .meta{text-align:left;font-size:13px;color:#555}
  .badge{display:inline-block;background:#fff8e6;border:1px solid #d4a843;color:#b8860b;padding:3px 12px;border-radius:100px;font-size:11px;font-weight:600;margin-bottom:18px}
  .boxes{display:flex;gap:12px;margin-bottom:20px}
  .box{flex:1;padding:14px;border-radius:10px;text-align:center}
  .box-lbl{font-size:11px;margin-bottom:4px;color:#666}
  .box-val{font-size:19px;font-weight:700}
  .box.g{background:#f0fdf4;border:1px solid #bbf7d0}
  .box.r{background:#fef2f2;border:1px solid #fecaca}
  .box.b{background:#eff6ff;border:1px solid #bfdbfe}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#1a1a2e;color:#fff;padding:11px 13px;text-align:right;font-weight:600;font-size:12px}
  td{padding:10px 13px;border-bottom:1px solid #eee}
  tr:nth-child(even) td{background:#fafafa}
  .pos{color:#16a34a;font-weight:600}.neg{color:#dc2626;font-weight:600}.neu{color:#888}
  .tot td{background:#f8f4e8!important;border-top:2px solid #d4a843;font-weight:700;font-size:14px}
  .footer{margin-top:24px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#999;display:flex;justify-content:space-between}
  @media print{body{padding:20px}}
</style></head><body>
<div class="hdr">
  <div><div class="logo">حساباتي <span>💰</span></div><div style="font-size:12px;color:#666;margin-top:3px">${userName}</div></div>
  <div class="meta"><div style="font-size:15px;font-weight:700;margin-bottom:3px">كشف حساب شهري</div><div>${stmt.label}</div><div>تاريخ الإصدار: ${fmtShort(stmt.lockedAt)}</div></div>
</div>
<div class="badge">🔒 مقفل ومؤرشف</div>
<div class="boxes">
  <div class="box g"><div class="box-lbl">لي عندهم</div><div class="box-val pos">+${fmtMoney(stmt.snapshot.reduce((a,s)=>s.balance>0?a+s.balance:a,0))} ر.س</div></div>
  <div class="box r"><div class="box-lbl">عليّ لهم</div><div class="box-val neg">-${fmtMoney(stmt.snapshot.reduce((a,s)=>s.balance<0?a+Math.abs(s.balance):a,0))} ر.س</div></div>
  <div class="box b"><div class="box-lbl">صافي الرصيد</div><div class="box-val ${total>=0?'pos':'neg'}">${total>=0?'+':'-'}${fmtMoney(total)} ر.س</div></div>
</div>
<table>
  <thead><tr><th>الشخص</th><th>المبلغ</th><th>الحالة</th></tr></thead>
  <tbody>${rows}<tr class="tot"><td>الإجمالي</td><td class="${total>=0?'pos':'neg'}">${total>=0?'+':'-'}${fmtMoney(total)} ر.س</td><td></td></tr></tbody>
</table>
<div class="footer"><span>تم إنشاؤه بواسطة تطبيق حساباتي</span><span>${new Date().toLocaleDateString('ar-SA')}</span></div>
<script>window.onload=()=>{window.print()}<\/script>
</body></html>`

  const w = window.open('','_blank','width=820,height=640')
  if (w) { w.document.write(html); w.document.close() }
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  Plus:       ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Back:       ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Bell:       ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Lock:       ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Trash:      ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  FileText:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  X:          ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check:      ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Eye:        ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Phone:      ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.78a16 16 0 0 0 6.29 6.29l1.88-1.84a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Mail:       ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  User:       ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  LogOut:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Image:      ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  Clip:       ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
  Camera:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Shield:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Download:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Share:      ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  XlIcon:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>,
  Sms:        ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#080810;--sf:#11111d;--sf2:#191926;--sf3:#222233;
  --b1:rgba(255,255,255,.06);--b2:rgba(255,255,255,.11);--b3:rgba(255,255,255,.18);
  --tx:#eeeef8;--tx2:#8080a0;--tx3:#484860;
  --gold:#d4a843;--gold2:#f2c455;--gdim:rgba(212,168,67,.11);--gglow:rgba(212,168,67,.28);
  --grn:#22c55e;--gdim2:rgba(34,197,94,.1);
  --red:#ef4444;--rdim:rgba(239,68,68,.1);
  --r:18px;--rs:12px;--rx:9px;
  --sat: env(safe-area-inset-top, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
}
html,body{height:100%;overflow:hidden;overscroll-behavior:none;background:var(--bg)}
body{color:var(--tx);font-family:'IBM Plex Sans Arabic',sans-serif;-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent}
input,button,select,textarea{font-family:inherit;-webkit-appearance:none;appearance:none}
button{cursor:pointer}

/* scroll containers */
.scroll-y{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain}

.app{height:100vh;height:100dvh;max-width:430px;margin:0 auto;background:var(--bg);direction:rtl;display:flex;flex-direction:column;position:relative}
.scr{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;position:relative;z-index:1}
.pb{padding-bottom:calc(88px + var(--sab))}

/* ── Auth ── */
.a-bg{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:calc(24px + var(--sat)) 20px calc(24px + var(--sab));position:relative;overflow:hidden}
.orb{position:absolute;border-radius:50%;pointer-events:none}
.orb1{top:-80px;right:-60px;width:280px;height:280px;background:radial-gradient(circle,rgba(212,168,67,.13) 0%,transparent 70%)}
.orb2{bottom:-100px;left:-80px;width:320px;height:320px;background:radial-gradient(circle,rgba(100,80,200,.07) 0%,transparent 70%)}
.a-logo{width:72px;height:72px;border-radius:22px;background:linear-gradient(135deg,#1e1a0e,#2a2010);border:1.5px solid rgba(212,168,67,.28);display:flex;align-items:center;justify-content:center;margin-bottom:18px;box-shadow:0 8px 32px rgba(212,168,67,.14);font-size:32px}
.a-title{font-size:26px;font-weight:700;letter-spacing:-.5px;margin-bottom:5px;text-align:center}
.a-sub{font-size:13px;color:var(--tx2);text-align:center;margin-bottom:26px;line-height:1.5}
.a-card{width:100%;background:var(--sf);border:1px solid var(--b2);border-radius:var(--r);padding:22px 18px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.m-tabs{display:flex;background:var(--sf2);border-radius:var(--rx);padding:3px;gap:3px;margin-bottom:16px}
.m-tab{flex:1;padding:9px 6px;border-radius:7px;border:none;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;color:var(--tx2);background:transparent;transition:all .2s}
.m-tab.on{background:var(--sf3);color:var(--tx);box-shadow:0 1px 4px rgba(0,0,0,.35)}
.m-tab svg{width:14px;height:14px}
.afield{margin-bottom:13px}
.afield label{font-size:11px;color:var(--tx2);font-weight:600;display:block;margin-bottom:5px;letter-spacing:.3px}
.aiwrap{position:relative}
.ainput{width:100%;background:var(--sf2);border:1px solid var(--b2);border-radius:var(--rx);padding:13px 42px 13px 13px;color:var(--tx);font-size:15px;outline:none;direction:rtl;transition:border-color .2s,box-shadow .2s}
.ainput:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(212,168,67,.1)}
.ainput::placeholder{color:var(--tx3)}
.ainput.ltr{direction:ltr;text-align:left;padding-right:13px;padding-left:42px}
.ai-icon{position:absolute;right:13px;top:50%;transform:translateY(-50%);color:var(--tx3);pointer-events:none;display:flex}
.ai-icon.l{right:auto;left:13px}
.ai-icon svg{width:15px;height:15px}
.a-eye{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--tx3);cursor:pointer;background:none;border:none;padding:3px;display:flex}
.a-eye svg{width:16px;height:16px}
.pbar{height:3px;border-radius:2px;margin-top:5px;background:var(--sf3);overflow:hidden}
.pbar-f{height:100%;border-radius:2px;transition:all .4s}
.sw{background:#ef4444}.sm{background:#f59e0b}.sg{background:#22c55e}
.a-err{background:var(--rdim);border:1px solid rgba(239,68,68,.22);border-radius:var(--rx);padding:10px 13px;font-size:12px;color:var(--red);margin-bottom:12px}
.a-ok{background:var(--gdim2);border:1px solid rgba(34,197,94,.22);border-radius:var(--rx);padding:10px 13px;font-size:12px;color:var(--grn);margin-bottom:12px}
.a-btn{width:100%;padding:14px;margin-top:5px;background:linear-gradient(135deg,var(--gold),var(--gold2));color:#160f00;border:none;border-radius:var(--rx);font-size:14px;font-weight:700;box-shadow:0 4px 18px var(--gglow);transition:all .2s;display:flex;align-items:center;justify-content:center;gap:7px}
.a-btn:active{transform:scale(.98)}
.a-btn:disabled{opacity:.5;pointer-events:none}
.a-btn svg{width:16px;height:16px}
.a-ghost{width:100%;padding:12px;margin-top:8px;background:var(--sf2);color:var(--tx2);border:1px solid var(--b2);border-radius:var(--rx);font-size:13px;font-weight:500;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px}
.a-ghost svg{width:14px;height:14px}
.a-div{display:flex;align-items:center;gap:10px;margin:14px 0}
.a-div-l{flex:1;height:1px;background:var(--b2)}
.a-div-t{font-size:10px;color:var(--tx3)}
.a-sw{margin-top:14px;text-align:center;font-size:12px;color:var(--tx2)}
.a-sw b{color:var(--gold);cursor:pointer;font-weight:600}
.a-terms{font-size:10px;color:var(--tx3);text-align:center;margin-top:12px;line-height:1.5}

/* ── OTP ── */
.otp-tag{background:var(--sf2);border:1px solid var(--b2);border-radius:var(--rx);padding:10px 13px;font-size:13px;color:var(--tx);margin-bottom:13px;display:flex;align-items:center;justify-content:space-between}
.otp-tag span{color:var(--gold);cursor:pointer;font-size:11px;font-weight:600}
.sms-wrap{background:linear-gradient(135deg,rgba(34,197,94,.06),rgba(34,197,94,.02));border:1px solid rgba(34,197,94,.15);border-radius:var(--rs);padding:14px;margin-bottom:14px}
.sms-hdr{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.sms-av{width:30px;height:30px;border-radius:50%;background:rgba(34,197,94,.15);display:flex;align-items:center;justify-content:center;color:var(--grn)}
.sms-av svg{width:14px;height:14px}
.sms-name{font-size:11px;font-weight:700;color:var(--grn)}
.sms-time{font-size:10px;color:var(--tx3);margin-right:auto}
.sms-msg{font-size:12px;color:var(--tx2);line-height:1.5}
.sms-code{font-size:30px;font-weight:700;letter-spacing:10px;text-align:center;margin:10px 0 5px;direction:ltr;color:var(--tx)}
.sms-note{font-size:10px;color:var(--tx3);text-align:center}
.otp-boxes{display:flex;gap:8px;justify-content:center;margin-bottom:5px;direction:ltr}
.otp-b{width:44px;height:52px;background:var(--sf2);border:1.5px solid var(--b2);border-radius:var(--rx);text-align:center;font-size:22px;font-weight:700;color:var(--tx);outline:none;caret-color:var(--gold);transition:border-color .2s}
.otp-b:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(212,168,67,.1)}
.otp-b.on{border-color:rgba(212,168,67,.4)}
.otp-timer{text-align:center;font-size:11px;color:var(--tx3);margin-top:4px}
.otp-timer b{color:var(--gold)}
.otp-rsnd{text-align:center;font-size:12px;color:var(--gold);cursor:pointer;font-weight:600;margin-top:3px}
.otp-rsnd.off{color:var(--tx3);pointer-events:none}

/* ── Header ── */
.bg-orb{position:fixed;top:-120px;right:-80px;width:400px;height:400px;background:radial-gradient(circle,rgba(212,168,67,.04) 0%,transparent 70%);pointer-events:none;z-index:0}
.hdr{padding:calc(52px + var(--sat)) 18px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0}
.hdr-title{font-size:24px;font-weight:700;letter-spacing:-.5px}
.hdr-sub{font-size:11px;color:var(--tx2);margin-top:2px}
.hdr-acts{display:flex;gap:7px;align-items:center}
.hbtn{width:36px;height:36px;background:var(--sf2);border:1px solid var(--b1);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--tx2);flex-shrink:0;transition:all .2s;border:none}
.hbtn:active{background:var(--sf3)}
.hbtn svg{width:16px;height:16px}

/* ── Summary ── */
.sum-card{margin:0 14px 15px;background:linear-gradient(145deg,var(--sf2),#181828);border:1px solid var(--b2);border-radius:var(--r);padding:17px;position:relative;overflow:hidden;flex-shrink:0}
.sum-card::before{content:'';position:absolute;top:-20px;left:-20px;width:100px;height:100px;background:radial-gradient(circle,rgba(212,168,67,.11) 0%,transparent 70%);pointer-events:none}
.sum-lbl{font-size:10px;color:var(--tx2);margin-bottom:3px;font-weight:500}
.sum-amt{font-size:32px;font-weight:700;letter-spacing:-1px}
.sum-row{display:flex;justify-content:space-between;margin-top:13px}
.sum-item{text-align:center}
.sum-item-l{font-size:10px;color:var(--tx3);margin-bottom:2px}
.sum-item-v{font-size:15px;font-weight:600}

/* ── Tabs ── */
.tabs{display:flex;margin:0 14px 11px;background:var(--sf2);border-radius:var(--rx);padding:3px;gap:3px;flex-shrink:0}
.tab{flex:1;padding:8px;border-radius:7px;text-align:center;font-size:12px;font-weight:500;cursor:pointer;color:var(--tx2);transition:all .2s;border:none;background:transparent}
.tab.on{background:var(--sf3);color:var(--tx);box-shadow:0 1px 4px rgba(0,0,0,.3)}

/* ── Person cards ── */
.sec-lbl{font-size:10px;color:var(--tx3);font-weight:700;letter-spacing:.6px;padding:0 18px;margin-bottom:7px}
.plist{padding:0 10px;display:flex;flex-direction:column;gap:6px}
.pcard{background:var(--sf);border:1px solid var(--b1);border-radius:var(--r);padding:13px 13px;display:flex;align-items:center;gap:11px;transition:all .2s;border:none;width:100%;text-align:right}
.pcard:active{background:var(--sf2)}
.av{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;flex-shrink:0;background:var(--sf3);border:1.5px solid var(--b2);color:var(--gold)}
.pinfo{flex:1;min-width:0}
.pname{font-size:14px;font-weight:600;color:var(--tx)}
.pmeta{font-size:10px;color:var(--tx3);margin-top:2px}
.pbal{text-align:left}
.pbal-a{font-size:15px;font-weight:700}
.pbal-l{font-size:10px;color:var(--tx3);margin-top:1px}
.pos{color:var(--grn)}.neg{color:var(--red)}.neu{color:var(--tx2)}

/* ── FAB ── */
.fab{position:fixed;bottom:calc(26px + var(--sab));left:50%;transform:translateX(-50%);z-index:50;min-width:178px;background:linear-gradient(135deg,var(--gold),var(--gold2));color:#160f00;border:none;border-radius:100px;padding:13px 20px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;box-shadow:0 4px 22px var(--gglow);transition:all .2s}
.fab:active{transform:translateX(-50%) scale(.97)}
.fab svg{width:16px;height:16px}

/* ── Sheet ── */
.ov{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.78);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;animation:fi .2s}
@keyframes fi{from{opacity:0}to{opacity:1}}
.sht{width:100%;max-width:430px;background:var(--sf);border-radius:22px 22px 0 0;border:1px solid var(--b2);border-bottom:none;padding:16px 18px calc(28px + var(--sab));animation:su .3s cubic-bezier(.34,1.56,.64,1);max-height:93dvh;overflow-y:auto;-webkit-overflow-scrolling:touch}
@keyframes su{from{transform:translateY(100%)}to{transform:translateY(0)}}
.sht-h{width:32px;height:4px;background:var(--sf3);border-radius:2px;margin:0 auto 16px}
.sht-title{font-size:16px;font-weight:700;margin-bottom:15px;color:var(--tx);display:flex;align-items:center;justify-content:space-between}
.sht-close{width:27px;height:27px;background:var(--sf2);border:1px solid var(--b1);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--tx2);flex-shrink:0;border:none}
.sht-close svg{width:12px;height:12px}

/* ── Form ── */
.fg{margin-bottom:13px}
.fg label{font-size:11px;color:var(--tx2);margin-bottom:5px;display:block;font-weight:600;letter-spacing:.3px}
.fi{width:100%;background:var(--sf2);border:1px solid var(--b2);border-radius:var(--rx);padding:11px 12px;color:var(--tx);font-size:14px;outline:none;direction:rtl;transition:border-color .2s}
.fi:focus{border-color:var(--gold)}
.fi::placeholder{color:var(--tx3)}
.t-sel{display:flex;gap:6px}
.t-btn{flex:1;padding:11px;border-radius:var(--rx);border:1.5px solid var(--b1);background:var(--sf2);color:var(--tx2);font-size:12px;font-weight:600;cursor:pointer;text-align:center;transition:all .2s;-webkit-appearance:none}
.t-btn.g.on{background:var(--gdim2);border-color:var(--grn);color:var(--grn)}
.t-btn.r.on{background:var(--rdim);border-color:var(--red);color:var(--red)}

/* ── Attach ── */
.att-opts{display:flex;gap:6px}
.att-opt{flex:1;padding:10px 5px;border-radius:var(--rx);border:1.5px dashed var(--b2);background:var(--sf2);color:var(--tx2);font-size:11px;font-weight:500;cursor:pointer;text-align:center;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:4px;-webkit-appearance:none}
.att-opt:active{border-color:var(--gold);color:var(--gold);background:var(--gdim)}
.att-opt svg{width:18px;height:18px}
.att-prev{position:relative;border-radius:var(--rx);overflow:hidden;border:1.5px solid var(--b2)}
.att-prev img{width:100%;max-height:140px;object-fit:cover;display:block}
.att-pbar{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;padding:7px;background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent)}
.att-pbtn{width:27px;height:27px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer}
.att-pbtn.v{background:rgba(255,255,255,.15);color:#fff;backdrop-filter:blur(6px)}
.att-pbtn.r{background:rgba(239,68,68,.85);color:#fff}
.att-pbtn svg{width:12px;height:12px}
.att-badge{position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);color:#fff;font-size:9px;padding:2px 8px;border-radius:100px;display:flex;align-items:center;gap:3px}

/* ── Buttons ── */
.btn-g{width:100%;padding:13px;background:linear-gradient(135deg,var(--gold),var(--gold2));color:#160f00;border:none;border-radius:var(--rx);font-size:14px;font-weight:700;cursor:pointer;margin-top:5px;transition:opacity .2s;display:flex;align-items:center;justify-content:center;gap:6px}
.btn-g:active{opacity:.85}
.btn-g svg{width:15px;height:15px}
.btn-d{width:100%;padding:12px;background:var(--rdim);color:var(--red);border:1px solid rgba(239,68,68,.22);border-radius:var(--rx);font-size:13px;font-weight:600;cursor:pointer;margin-top:5px;-webkit-appearance:none}

/* ── TX cards ── */
.txl{padding:0 10px;display:flex;flex-direction:column;gap:6px}
.txc{background:var(--sf);border:1px solid var(--b1);border-radius:var(--r);overflow:hidden}
.txm{padding:12px 13px;display:flex;align-items:center;gap:10px}
.tx-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.tx-dot.g{background:var(--grn);box-shadow:0 0 6px rgba(34,197,94,.5)}
.tx-dot.r{background:var(--red);box-shadow:0 0 6px rgba(239,68,68,.5)}
.txi{flex:1}
.tx-desc{font-size:13px;font-weight:500;color:var(--tx)}
.tx-dt{font-size:10px;color:var(--tx3);margin-top:1px}
.tx-due{font-size:10px;color:var(--gold);margin-top:1px}
.tx-a{font-size:14px;font-weight:700}
.tx-del{width:27px;height:27px;background:var(--rdim);border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--red);flex-shrink:0}
.tx-del svg{width:11px;height:11px}
.tx-att{border-top:1px solid var(--b1);cursor:pointer;overflow:hidden;position:relative}
.tx-att img{width:100%;max-height:110px;object-fit:cover;display:block;transition:transform .3s}
.tx-att-badge{position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);color:#fff;font-size:9px;padding:2px 8px;border-radius:100px;display:flex;align-items:center;gap:3px}
.tx-att-badge svg{width:9px;height:9px}

/* ── Lightbox ── */
.lb{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.95);backdrop-filter:blur(10px);display:flex;flex-direction:column;align-items:center;justify-content:center;animation:fi .2s}
.lb-img{max-width:96vw;max-height:82dvh;object-fit:contain;border-radius:12px}
.lb-close{position:absolute;top:calc(20px + var(--sat));left:20px;width:38px;height:38px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;border:none}
.lb-close svg{width:16px;height:16px}

/* ── Detail balance ── */
.dbal{margin:0 14px 16px;border-radius:var(--r);padding:16px;text-align:center}
.dbal.pos{background:var(--gdim2);border:1px solid rgba(34,197,94,.2)}
.dbal.neg{background:var(--rdim);border:1px solid rgba(239,68,68,.2)}
.dbal.z{background:var(--sf2);border:1px solid var(--b1)}
.dbal-l{font-size:11px;color:var(--tx2);margin-bottom:4px}
.dbal-a{font-size:36px;font-weight:700;letter-spacing:-1px}

/* ── Statements ── */
.stc{background:var(--sf);border:1px solid var(--b1);border-radius:var(--r);margin:0 10px 7px;overflow:hidden}
.st-hdr{padding:12px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border:none;background:transparent;width:100%;text-align:right}
.st-title{font-size:13px;font-weight:600;color:var(--tx);display:flex;align-items:center;gap:6px}
.st-title svg{width:13px;height:13px;color:var(--gold)}
.st-badge{font-size:10px;padding:2px 8px;border-radius:100px;background:var(--gdim);color:var(--gold);font-weight:600}
.st-body{padding:0 14px 12px;border-top:1px solid var(--b1)}
.st-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--b1);font-size:12px}
.st-row:last-child{border-bottom:none}
.st-rn{color:var(--tx2)}
.st-rv{font-weight:600}
.exp-strip{display:flex;gap:6px;padding:10px 14px 0}
.exp-btn{flex:1;padding:8px 5px;border-radius:8px;border:1px solid var(--b2);background:var(--sf2);color:var(--tx2);font-size:10px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;transition:all .2s;-webkit-appearance:none}
.exp-btn:active{border-color:var(--gold);color:var(--gold);background:var(--gdim)}
.exp-btn svg{width:15px;height:15px}

/* ── Notifs ── */
.nc{background:var(--sf);border:1px solid var(--b1);border-radius:var(--r);margin:0 10px 6px;padding:12px 13px;display:flex;align-items:center;gap:10px}
.ni{width:36px;height:36px;border-radius:50%;background:var(--gdim);border:1px solid rgba(212,168,67,.2);display:flex;align-items:center;justify-content:center;color:var(--gold);flex-shrink:0}
.ni svg{width:15px;height:15px}
.nt{font-size:12px;color:var(--tx);flex:1;line-height:1.5}
.nd{background:none;border:none;color:var(--tx3);cursor:pointer;padding:4px}
.nd svg{width:14px;height:14px}

/* ── Misc ── */
.empty{text-align:center;padding:52px 20px;color:var(--tx3)}
.empty-i{font-size:36px;margin-bottom:9px}
.empty-t{font-size:13px;line-height:1.6}
.roll-banner{margin:0 10px 12px;background:linear-gradient(135deg,rgba(212,168,67,.09),rgba(212,168,67,.03));border:1px solid rgba(212,168,67,.17);border-radius:var(--r);padding:12px 13px;display:flex;align-items:center;justify-content:space-between;gap:9px}
.roll-t{font-size:12px;color:var(--gold);flex:1;line-height:1.4}
.roll-btn{background:var(--gold);color:#160f00;border:none;border-radius:7px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}
.chip{display:flex;align-items:center;gap:5px;background:var(--sf2);border:1px solid var(--b1);border-radius:100px;padding:3px 9px 3px 3px}
.chip-av{width:24px;height:24px;border-radius:50%;background:var(--gdim);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--gold)}
.chip-name{font-size:11px;color:var(--tx2);max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.loading{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--gold);font-size:13px;background:var(--bg)}
.spin{width:30px;height:30px;border:2.5px solid var(--sf3);border-top-color:var(--gold);border-radius:50%;animation:rot .7s linear infinite}
@keyframes rot{to{transform:rotate(360deg)}}
`

// ── OTP Component ─────────────────────────────────────────────────────────────
function OTPStep({ phone, onVerified, onBack }) {
  const [code, setCode]   = useState(['','','','','',''])
  const [otp, setOtp]     = useState(null)
  const [timer, setTimer] = useState(300)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const refs = useRef([])

  const sendOTP = () => {
    const c = genOTP()
    setOtp(c)
    kv('set', OTP_KEY, { code: c, phone, exp: Date.now() + 5*60*1000 })
    setTimer(300); setCode(['','','','','','']); setError('')
    setTimeout(() => refs.current[0]?.focus(), 100)
  }

  useEffect(() => { sendOTP() }, [])

  useEffect(() => {
    if (timer <= 0) return
    const id = setInterval(() => setTimer(t => { if(t<=1){clearInterval(id);return 0} return t-1 }), 1000)
    return () => clearInterval(id)
  }, [timer])

  const handleBox = (i, val) => {
    const d = val.replace(/\D/g,'').slice(-1)
    const nc = [...code]; nc[i] = d; setCode(nc)
    if (d && i < 5) refs.current[i+1]?.focus()
    if (!d && i > 0) refs.current[i-1]?.focus()
  }

  const handleKey = (i, e) => {
    if (e.key==='Backspace' && !code[i] && i>0) refs.current[i-1]?.focus()
  }

  const handlePaste = e => {
    e.preventDefault()
    const p = e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6)
    if (p.length===6) { setCode(p.split('')); refs.current[5]?.focus() }
  }

  const verify = async () => {
    const entered = code.join('')
    if (entered.length < 6) { setError('أدخل الرمز المكوّن من 6 أرقام'); return }
    setLoading(true)
    const stored = await kv('get', OTP_KEY)
    if (!stored || Date.now() > stored.exp) { setError('انتهت صلاحية الرمز، اطلب رمزاً جديداً'); setLoading(false); return }
    if (stored.code !== entered) { setError('الرمز غير صحيح'); setLoading(false); return }
    await kv('del', OTP_KEY)
    setLoading(false); onVerified()
  }

  const m = String(Math.floor(timer/60)).padStart(2,'0')
  const s = String(timer%60).padStart(2,'0')

  return (<>
    <div className="otp-tag"><span>📱 {phone}</span><span onClick={onBack}>تعديل</span></div>
    {otp && (
      <div className="sms-wrap">
        <div className="sms-hdr">
          <div className="sms-av"><I.Sms/></div>
          <div><div className="sms-name">حساباتي</div></div>
          <div className="sms-time">الآن</div>
        </div>
        <div className="sms-msg">رمز التحقق الخاص بك لتطبيق حساباتي:</div>
        <div className="sms-code">{otp}</div>
        <div className="sms-note">لا تشارك هذا الرمز مع أحد · صالح 5 دقائق</div>
      </div>
    )}
    {error && <div className="a-err">⚠️ {error}</div>}
    <div className="fg">
      <label>أدخل رمز التحقق</label>
      <div className="otp-boxes">
        {code.map((v,i) => (
          <input key={i} ref={el=>refs.current[i]=el} className={`otp-b ${v?'on':''}`}
            type="tel" inputMode="numeric" maxLength={1} value={v}
            onChange={e=>handleBox(i,e.target.value)} onKeyDown={e=>handleKey(i,e)} onPaste={handlePaste}/>
        ))}
      </div>
      <div className="otp-timer">{timer>0?<span>ينتهي خلال <b>{m}:{s}</b></span>:<span style={{color:'var(--red)'}}>انتهت الصلاحية</span>}</div>
      {timer===0 ? <div className="otp-rsnd" onClick={sendOTP}>↺ إعادة الإرسال</div>
                 : <div className="otp-rsnd off">إعادة الإرسال ({m}:{s})</div>}
    </div>
    <button className="a-btn" onClick={verify} disabled={loading||code.join('').length<6}>
      {loading?<><div className="spin" style={{width:15,height:15,borderWidth:2}}/>جاري التحقق...</>:<><I.Shield/>تأكيد الرمز</>}
    </button>
    <button className="a-ghost" onClick={onBack}><I.Back/>رجوع</button>
  </>)
}

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [mode, setMode]     = useState('login')
  const [method, setMethod] = useState('phone')
  const [step, setStep]     = useState('form')
  const [id, setId]         = useState('')
  const [pwd, setPwd]       = useState('')
  const [cfm, setCfm]       = useState('')
  const [name, setName]     = useState('')
  const [showP, setShowP]   = useState(false)
  const [showC, setShowC]   = useState(false)
  const [err, setErr]       = useState('')
  const [loading, setLoad]  = useState(false)
  const [pending, setPend]  = useState(null)

  const phoneRx = /^05\d{8}$/
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const ps = (p) => { if(!p)return 0; let s=0; if(p.length>=8)s++; if(/[A-Z]/.test(p))s++; if(/[0-9]/.test(p))s++; if(/[^A-Za-z0-9]/.test(p))s++; return s }
  const str = ps(pwd)
  const sLbl = ['','ضعيفة','متوسطة','جيدة','قوية'][str]
  const sCls = ['','sw','sm','sg','sg'][str]
  const nId  = v => method==='phone' ? v.trim() : v.trim().toLowerCase()

  const submit = async () => {
    setErr('')
    const uid = nId(id)
    if (!uid) { setErr('أدخل '+(method==='phone'?'رقم الجوال':'البريد الإلكتروني')); return }
    if (method==='phone' && !phoneRx.test(uid)) { setErr('رقم الجوال يبدأ بـ 05 ويتكون من 10 أرقام'); return }
    if (method==='email' && !emailRx.test(uid)) { setErr('صيغة البريد غير صحيحة'); return }
    if (!pwd) { setErr('أدخل كلمة المرور'); return }
    if (mode==='register') {
      if (!name.trim()) { setErr('أدخل اسمك'); return }
      if (pwd.length < 8) { setErr('كلمة المرور 8 أحرف على الأقل'); return }
      if (pwd !== cfm) { setErr('كلمتا المرور غير متطابقتين'); return }
    }
    setLoad(true)
    const users = (await kv('get', USERS_KEY)) || {}
    const hash  = await hashPwd(pwd)
    if (mode==='login') {
      const u = users[uid]
      if (!u) { setErr('الحساب غير موجود، أنشئ حساباً جديداً'); setLoad(false); return }
      if (u.hash !== hash) { setErr('كلمة المرور غير صحيحة'); setLoad(false); return }
      await kv('set', SESSION_KEY, { id: uid, name: u.name, method: u.method, loggedInAt: Date.now() })
      onLogin({ id: uid, name: u.name, method: u.method })
    } else {
      if (users[uid]) { setErr('الحساب موجود، سجّل الدخول'); setLoad(false); return }
      if (method==='phone') {
        setPend({ id: uid, hash, name: name.trim(), method }); setLoad(false); setStep('otp')
      } else {
        users[uid] = { hash, name: name.trim(), method, createdAt: Date.now() }
        await kv('set', USERS_KEY, users)
        await kv('set', SESSION_KEY, { id: uid, name: name.trim(), method, loggedInAt: Date.now() })
        onLogin({ id: uid, name: name.trim(), method })
      }
    }
    setLoad(false)
  }

  const otpDone = async () => {
    if (!pending) return
    const users = (await kv('get', USERS_KEY)) || {}
    users[pending.id] = { hash: pending.hash, name: pending.name, method: pending.method, createdAt: Date.now() }
    await kv('set', USERS_KEY, users)
    await kv('set', SESSION_KEY, { id: pending.id, name: pending.name, method: pending.method, loggedInAt: Date.now() })
    onLogin({ id: pending.id, name: pending.name, method: pending.method })
  }

  const toggle = () => { setMode(m=>m==='login'?'register':'login'); setErr(''); setPwd(''); setCfm(''); setId(''); setName(''); setStep('form') }

  return (
    <div className="app">
      <style>{CSS}</style>
      <div className="a-bg">
        <div className="orb orb1"/><div className="orb orb2"/>
        <div className="a-logo">💰</div>
        <div className="a-title">حساباتي</div>
        <div className="a-sub">{step==='otp'?'تحقق من رقم جوالك':mode==='login'?'أهلاً بعودتك! سجّل دخولك':'أنشئ حسابك الجديد'}</div>
        <div className="a-card">
          {step==='otp'
            ? <OTPStep phone={nId(id)} onVerified={otpDone} onBack={()=>setStep('form')}/>
            : (<>
                <div className="m-tabs">
                  <button className={`m-tab ${method==='phone'?'on':''}`} onClick={()=>{setMethod('phone');setId('');setErr('')}}><I.Phone/>رقم الجوال</button>
                  <button className={`m-tab ${method==='email'?'on':''}`} onClick={()=>{setMethod('email');setId('');setErr('')}}><I.Mail/>البريد</button>
                </div>
                {err && <div className="a-err">⚠️ {err}</div>}
                {mode==='register' && (
                  <div className="afield"><label>الاسم</label>
                    <div className="aiwrap"><input className="ainput" placeholder="اسمك الكامل" value={name} onChange={e=>setName(e.target.value)}/><span className="ai-icon"><I.User/></span></div>
                  </div>
                )}
                <div className="afield"><label>{method==='phone'?'رقم الجوال':'البريد الإلكتروني'}</label>
                  <div className="aiwrap">
                    <input className={`ainput ${method==='email'?'ltr':''}`} placeholder={method==='phone'?'05xxxxxxxx':'example@email.com'}
                      value={id} onChange={e=>setId(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} type={method==='phone'?'tel':'email'} inputMode={method==='phone'?'tel':'email'}/>
                    <span className="ai-icon">{method==='phone'?<I.Phone/>:<I.Mail/>}</span>
                  </div>
                </div>
                <div className="afield"><label>كلمة المرور</label>
                  <div className="aiwrap">
                    <input className="ainput ltr" type={showP?'text':'password'} placeholder="••••••••" value={pwd} onChange={e=>setPwd(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} style={{paddingLeft:42}} autoComplete={mode==='login'?'current-password':'new-password'}/>
                    <button className="a-eye" type="button" onClick={()=>setShowP(p=>!p)}>{showP?<I.EyeOff/>:<I.Eye/>}</button>
                  </div>
                  {mode==='register' && pwd && (<><div className="pbar"><div className={`pbar-f ${sCls}`} style={{width:`${(str/4)*100}%`}}/></div><div style={{fontSize:10,color:'var(--tx3)',marginTop:3}}>قوة كلمة المرور: {sLbl}</div></>)}
                </div>
                {mode==='register' && (
                  <div className="afield"><label>تأكيد كلمة المرور</label>
                    <div className="aiwrap">
                      <input className="ainput ltr" type={showC?'text':'password'} placeholder="••••••••" value={cfm} onChange={e=>setCfm(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} style={{paddingLeft:42,borderColor:cfm&&cfm!==pwd?'var(--red)':''}} autoComplete="new-password"/>
                      <button className="a-eye" type="button" onClick={()=>setShowC(p=>!p)}>{showC?<I.EyeOff/>:<I.Eye/>}</button>
                    </div>
                    {cfm && cfm!==pwd && <div style={{fontSize:10,color:'var(--red)',marginTop:3}}>كلمتا المرور غير متطابقتين</div>}
                  </div>
                )}
                <button className="a-btn" onClick={submit} disabled={loading}>
                  {loading?<><div className="spin" style={{width:15,height:15,borderWidth:2,borderColor:'rgba(0,0,0,.25)',borderTopColor:'#160f00'}}/>جاري...</>
                          :mode==='login'?<><I.Shield/>تسجيل الدخول</>:<><I.Check/>{method==='phone'?'إرسال رمز التحقق':'إنشاء الحساب'}</>}
                </button>
                <div className="a-div"><div className="a-div-l"/><span className="a-div-t">أو</span><div className="a-div-l"/></div>
                <div className="a-sw">{mode==='login'?<>ليس لديك حساب؟ <b onClick={toggle}>أنشئ حساباً جديداً</b></>:<>لديك حساب؟ <b onClick={toggle}>سجّل الدخول</b></>}</div>
              </>)
          }
        </div>
        <div className="a-terms">🔒 بياناتك محفوظة بشكل آمن على جهازك</div>
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
function MainApp({ user, onLogout }) {
  const DK = DATA_PREFIX + user.id
  const [data, setData]   = useState(null)
  const [scr, setScr]     = useState('home')
  const [selP, setSelP]   = useState(null)
  const [tab, setTab]     = useState('friends')
  const [showAP, setAP]   = useState(false)
  const [showAT, setAT]   = useState(false)
  const [expStmt, setES]  = useState(null)
  const [lb, setLB]       = useState(null)
  const [pName, setPName] = useState('')
  const [txDesc, setTD]   = useState('')
  const [txAmt, setTA]    = useState('')
  const [txType, setTT]   = useState('lent')
  const [txDate, setTDt]  = useState(todayISO())
  const [txDue, setTDue]  = useState('')
  const [txAtt, setTAtt]  = useState(null)
  const fRef = useRef(null)

  useEffect(() => {
    kv('get', DK).then(d => setData(d || defaultData))
    requestNotifPermission()
  }, [])

  const persist = useCallback(d => { setData(d); kv('set', DK, d) }, [DK])

  if (!data) return <div className="loading"><div className="spin"/></div>

  const getBal   = id => data.transactions.filter(t=>t.friendId===id&&!t.archived).reduce((s,t)=>s+(t.type==='lent'?t.amount:-t.amount),0)
  const totPos   = data.friends.reduce((s,f)=>{ const b=getBal(f.id); return b>0?s+b:s },0)
  const totNeg   = data.friends.reduce((s,f)=>{ const b=getBal(f.id); return b<0?s+Math.abs(b):s },0)
  const net      = totPos - totNeg
  const noStmt   = !data.statements.some(s=>s.monthKey===monthKey())

  const trigFile = (accept, cap) => {
    fRef.current.accept = accept
    cap ? fRef.current.setAttribute('capture', cap) : fRef.current.removeAttribute('capture')
    fRef.current.click()
  }
  const onFile = async e => {
    const f = e.target.files?.[0]; if(!f) return
    if (f.size>4*1024*1024) { alert('الملف أكبر من 4MB'); e.target.value=''; return }
    try { setTAtt(await fileToB64(f)) } catch { alert('تعذر تحميل الملف') }
    e.target.value=''
  }

  const addPerson = () => {
    if (!pName.trim()) return
    persist({ ...data, friends: [...data.friends, {id:Date.now().toString(),name:pName.trim(),createdAt:new Date().toISOString()}] })
    setPName(''); setAP(false)
  }
  const delPerson = id => {
    persist({ ...data, friends:data.friends.filter(f=>f.id!==id), transactions:data.transactions.filter(t=>t.friendId!==id) })
    setScr('home')
  }
  const addTx = async () => {
    if (!txAmt||isNaN(parseFloat(txAmt))) return
    const tx = { id:Date.now().toString(), friendId:selP.id, type:txType, amount:parseFloat(txAmt),
      desc:txDesc||(txType==='lent'?'مبلغ أعطيته':'مبلغ أخذته'), date:txDate, dueDate:txDue||null, attachment:txAtt||null, archived:false }
    let notifs = data.notifications
    if (txDue) {
      const notif = { id:Date.now()+'_n', friendId:selP.id, friendName:selP.name, txId:tx.id, dueDate:txDue, amount:tx.amount, type:txType, desc:tx.desc, read:false }
      notifs = [...notifs, notif]
      await schedulePaymentReminder({ id:notif.id, title:'حساباتي - تذكير سداد', body:`موعد سداد مبلغ ${selP.name} غداً`, dueDate:txDue })
    }
    persist({ ...data, transactions:[...data.transactions,tx], notifications:notifs })
    setTD(''); setTA(''); setTDue(''); setTDt(todayISO()); setTT('lent'); setTAtt(null); setAT(false)
  }
  const delTx    = async id => { const n=data.notifications.find(n=>n.txId===id); if(n) await cancelNotification(n.id); persist({...data,transactions:data.transactions.filter(t=>t.id!==id),notifications:data.notifications.filter(n=>n.txId!==id)}) }
  const delNotif = id => persist({...data,notifications:data.notifications.filter(n=>n.id!==id)})
  const doRoll   = () => {
    const mk=monthKey(); const snap=data.friends.map(f=>({friendId:f.id,friendName:f.name,balance:getBal(f.id)}))
    persist({...data,transactions:data.transactions.map(t=>t.archived?t:{...t,archived:true}),statements:[...data.statements,{id:Date.now().toString(),monthKey:mk,label:monthLbl(),snapshot:snap,lockedAt:new Date().toISOString()}]})
  }
  const logout = async () => { await kv('set',SESSION_KEY,null); onLogout() }

  const LB = () => lb ? (
    <div className="lb" onClick={()=>setLB(null)}>
      <button className="lb-close" onClick={()=>setLB(null)}><I.X/></button>
      <img className="lb-img" src={lb.src} alt="إيصال" onClick={e=>e.stopPropagation()}/>
    </div>
  ) : null

  // Statements screen
  if (scr==='statements') return (
    <div className="app"><style>{CSS}</style><LB/>
      <div className="hdr" style={{paddingTop:`calc(52px + var(--sat))`}}>
        <div><div className="hdr-title">كشوفات الحسابات</div><div className="hdr-sub">الأرشيف الشهري المقفل</div></div>
        <button className="hbtn" onClick={()=>setScr('home')}><I.Back/></button>
      </div>
      <div className="scr pb">
        {data.statements.length===0
          ? <div className="empty"><div className="empty-i">📋</div><div className="empty-t">لا توجد كشوفات بعد<br/>قم بترحيل الشهر أولاً</div></div>
          : [...data.statements].reverse().map(s=>(
            <div key={s.id} className="stc">
              <button className="st-hdr" onClick={()=>setES(expStmt===s.id?null:s.id)}>
                <div className="st-title"><I.Lock/>{s.label}</div>
                <div className="st-badge">مقفل ✓</div>
              </button>
              {expStmt===s.id && (
                <div className="st-body">
                  <div style={{fontSize:10,color:'var(--tx3)',marginBottom:7}}>تاريخ الإقفال: {fmt(s.lockedAt)}</div>
                  {s.snapshot.map(r=>(
                    <div key={r.friendId} className="st-row">
                      <span className="st-rn">{r.friendName}</span>
                      <span className={`st-rv ${r.balance>0?'pos':r.balance<0?'neg':'neu'}`}>{r.balance>0?'+':r.balance<0?'-':''}{fmtMoney(r.balance)} ر.س</span>
                    </div>
                  ))}
                  <div className="st-row" style={{borderTop:'1px solid var(--b1)',marginTop:3}}>
                    <span className="st-rn" style={{fontWeight:700,color:'var(--tx)'}}>الإجمالي</span>
                    <span className={`st-rv ${s.snapshot.reduce((a,r)=>a+r.balance,0)>=0?'pos':'neg'}`} style={{fontSize:13}}>{fmtMoney(s.snapshot.reduce((a,r)=>a+r.balance,0))} ر.س</span>
                  </div>
                  <div className="exp-strip">
                    <button className="exp-btn" onClick={()=>exportCSV(s)}><I.XlIcon/>Excel</button>
                    <button className="exp-btn" onClick={()=>exportPDF(s,user.name)}><I.FileText/>PDF</button>
                    <button className="exp-btn" onClick={()=>{
                      const lines=[`📊 كشف حساب ${s.label}`,`تاريخ الإقفال: ${fmtShort(s.lockedAt)}`,'', ...s.snapshot.map(r=>`${r.friendName}: ${r.balance>0?'+':''}${r.balance.toFixed(2)} ر.س`),'',`الإجمالي: ${s.snapshot.reduce((a,r)=>a+r.balance,0).toFixed(2)} ر.س`]
                      nativeShare({title:'كشف حساب حساباتي',text:lines.join('\n')})
                    }}><I.Share/>مشاركة</button>
                  </div>
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  )

  // Person detail screen
  if (scr==='friend' && selP) {
    const bal = getBal(selP.id)
    const ptx = data.transactions.filter(t=>t.friendId===selP.id&&!t.archived)
    const bc  = bal>0?'pos':bal<0?'neg':'z'
    return (
      <div className="app"><style>{CSS}</style><LB/>
        <div className="hdr">
          <div><div className="hdr-title">{selP.name}</div><div className="hdr-sub">{ptx.length} معاملة نشطة</div></div>
          <button className="hbtn" onClick={()=>setScr('home')}><I.Back/></button>
        </div>
        <div className="scr pb">
          <div className={`dbal ${bc}`}>
            <div className="dbal-l">{bal>0?'له عندك':bal<0?'عليك له':'متعادل'}</div>
            <div className={`dbal-a ${bal>0?'pos':bal<0?'neg':''}`}>{fmtMoney(bal)} <span style={{fontSize:16}}>ر.س</span></div>
          </div>
          <div className="sec-lbl">المعاملات</div>
          {ptx.length===0
            ? <div className="empty"><div className="empty-i">💳</div><div className="empty-t">لا توجد معاملات<br/>أضف معاملة جديدة</div></div>
            : <div className="txl">{[...ptx].reverse().map(tx=>(
                <div key={tx.id} className="txc">
                  <div className="txm">
                    <div className={`tx-dot ${tx.type==='lent'?'g':'r'}`}/>
                    <div className="txi">
                      <div className="tx-desc">{tx.desc}</div>
                      <div className="tx-dt">{fmt(tx.date)}</div>
                      {tx.dueDate&&<div className="tx-due">⏰ {fmt(tx.dueDate)}</div>}
                    </div>
                    <div className={`tx-a ${tx.type==='lent'?'pos':'neg'}`}>{tx.type==='lent'?'+':'-'}{fmtMoney(tx.amount)}</div>
                    <button className="tx-del" onClick={()=>delTx(tx.id)}><I.Trash/></button>
                  </div>
                  {tx.attachment&&(
                    <div className="tx-att" onClick={()=>setLB({src:tx.attachment})}>
                      <img src={tx.attachment} alt="إيصال"/>
                      <div className="tx-att-badge"><I.Eye/> عرض</div>
                    </div>
                  )}
                </div>
              ))}</div>
          }
          <div style={{padding:'14px 10px 0'}}><button className="btn-d" onClick={()=>delPerson(selP.id)}>حذف هذا الشخص وجميع معاملاته</button></div>
        </div>

        <button className="fab" onClick={()=>setAT(true)}><I.Plus/>إضافة معاملة</button>
        <input ref={fRef} type="file" style={{display:'none'}} onChange={onFile}/>

        {showAT && (
          <div className="ov" onClick={()=>{setAT(false);setTAtt(null)}}>
            <div className="sht" onClick={e=>e.stopPropagation()}>
              <div className="sht-h"/>
              <div className="sht-title">معاملة مع {selP.name}<button className="sht-close" onClick={()=>{setAT(false);setTAtt(null)}}><I.X/></button></div>
              <div className="fg"><label>نوع المعاملة</label>
                <div className="t-sel">
                  <button className={`t-btn g ${txType==='lent'?'on':''}`} onClick={()=>setTT('lent')}>💚 أعطيته</button>
                  <button className={`t-btn r ${txType==='borrowed'?'on':''}`} onClick={()=>setTT('borrowed')}>❤️ أخذته منه</button>
                </div>
              </div>
              <div className="fg"><label>المبلغ (ر.س)</label>
                <input className="fi" type="number" placeholder="0.00" value={txAmt} onChange={e=>setTA(e.target.value)} inputMode="decimal" style={{fontSize:22,fontWeight:700,textAlign:'center'}}/>
              </div>
              <div className="fg"><label>الوصف (اختياري)</label>
                <input className="fi" placeholder={txType==='lent'?'مبلغ أعطيته...':'مبلغ أخذته منه...'} value={txDesc} onChange={e=>setTD(e.target.value)}/>
              </div>
              <div className="fg"><label>التاريخ</label><input className="fi" type="date" value={txDate} onChange={e=>setTDt(e.target.value)}/></div>
              <div className="fg"><label>موعد السداد (اختياري)</label><input className="fi" type="date" value={txDue} onChange={e=>setTDue(e.target.value)}/></div>
              <div className="fg"><label>📎 إرفاق إيصال أو فاتورة (اختياري)</label>
                {txAtt
                  ? <div className="att-prev"><img src={txAtt} alt="p"/><div className="att-pbar"><button className="att-pbtn v" onClick={()=>setLB({src:txAtt})}><I.Eye/></button><button className="att-pbtn r" onClick={()=>setTAtt(null)}><I.X/></button></div><div className="att-badge"><I.Check/>تم الرفع</div></div>
                  : <div className="att-opts"><button className="att-opt" onClick={()=>trigFile('image/*','environment')}><I.Camera/><span>صورة</span></button><button className="att-opt" onClick={()=>trigFile('image/*',null)}><I.Image/><span>المعرض</span></button><button className="att-opt" onClick={()=>trigFile('image/*,application/pdf',null)}><I.Clip/><span>ملف/PDF</span></button></div>
                }
              </div>
              <button className="btn-g" onClick={addTx}><I.Check/>إضافة المعاملة</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Home screen
  const unread = data.notifications.filter(n=>!n.read).length
  return (
    <div className="app"><style>{CSS}</style><LB/>
      <div className="bg-orb"/>
      <div className="hdr">
        <div><div className="hdr-title">حساباتي 💰</div><div className="hdr-sub">{monthLbl()}</div></div>
        <div className="hdr-acts">
          <div className="chip"><div className="chip-av">{user.name?.charAt(0)||'؟'}</div><span className="chip-name">{user.name}</span></div>
          <button className="hbtn" onClick={()=>setScr('statements')}><I.FileText/></button>
          <button className="hbtn" onClick={logout}><I.LogOut/></button>
        </div>
      </div>

      <div className="scr pb">
        <div className="sum-card">
          <div className="sum-lbl">صافي الرصيد</div>
          <div className={`sum-amt ${net>=0?'pos':'neg'}`}>{net>=0?'+':'-'}{fmtMoney(net)} <span style={{fontSize:18}}>ر.س</span></div>
          <div className="sum-row">
            <div className="sum-item"><div className="sum-item-l">لي عندهم</div><div className="sum-item-v pos">+{fmtMoney(totPos)}</div></div>
            <div style={{width:1,background:'var(--b1)'}}/>
            <div className="sum-item"><div className="sum-item-l">عليّ لهم</div><div className="sum-item-v neg">-{fmtMoney(totNeg)}</div></div>
          </div>
        </div>

        {noStmt && data.transactions.filter(t=>!t.archived).length>0 && (
          <div className="roll-banner">
            <div className="roll-t">🔒 الشهر لم يُرحَّل بعد. قفّل لتأريخه</div>
            <button className="roll-btn" onClick={doRoll}>ترحيل الشهر</button>
          </div>
        )}

        <div className="tabs">
          <button className={`tab ${tab==='friends'?'on':''}`} onClick={()=>setTab('friends')}>الأشخاص {data.friends.length>0&&`(${data.friends.length})`}</button>
          <button className={`tab ${tab==='notifications'?'on':''}`} onClick={()=>setTab('notifications')}>الإشعارات {unread>0&&`(${unread})`}</button>
        </div>

        {tab==='friends' && (
          data.friends.length===0
            ? <div className="empty"><div className="empty-i">👥</div><div className="empty-t">لا يوجد أشخاص بعد<br/>أضف شخصاً لتبدأ</div></div>
            : <><div className="sec-lbl">قائمة الأشخاص</div>
                <div className="plist">{data.friends.map(f=>{
                  const b=getBal(f.id); const tc=data.transactions.filter(t=>t.friendId===f.id&&!t.archived).length
                  const ha=data.transactions.some(t=>t.friendId===f.id&&!t.archived&&t.attachment)
                  return (
                    <button key={f.id} className="pcard" onClick={()=>{setSelP(f);setScr('friend')}}>
                      <div className="av">{f.name.charAt(0)}</div>
                      <div className="pinfo"><div className="pname">{f.name}</div><div className="pmeta">{tc} معاملة {ha&&'· 📎'}</div></div>
                      <div className="pbal"><div className={`pbal-a ${b>0?'pos':b<0?'neg':'neu'}`}>{b>0?'+':''}{fmtMoney(b)}</div><div className="pbal-l">{b>0?'له عندك':b<0?'عليك له':'متعادل'}</div></div>
                    </button>
                  )
                })}</div>
              </>
        )}

        {tab==='notifications' && (
          data.notifications.length===0
            ? <div className="empty"><div className="empty-i">🔔</div><div className="empty-t">لا توجد إشعارات<br/>ستظهر هنا مواعيد السداد</div></div>
            : <div style={{paddingBottom:8}}>
                <div className="sec-lbl">مواعيد السداد</div>
                {[...data.notifications].sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).map(n=>{
                  const ip=new Date(n.dueDate)<new Date(); const is=!ip&&(new Date(n.dueDate)-new Date())<3*86400000
                  return (
                    <div key={n.id} className="nc" style={ip?{borderColor:'rgba(239,68,68,.3)'}:is?{borderColor:'rgba(212,168,67,.3)'}:{}}>
                      <div className="ni" style={ip?{background:'var(--rdim)',color:'var(--red)'}:{}}><I.Bell/></div>
                      <div className="nt"><strong style={{color:ip?'var(--red)':is?'var(--gold)':'var(--tx)'}}>{ip?'⚠️ متأخر! ':is?'⏰ قريباً! ':''}{n.friendName}</strong><br/>{n.type==='lent'?'له عندك':'عليك له'} {fmtMoney(n.amount)} ر.س<br/><span style={{color:'var(--tx3)',fontSize:10}}>{n.desc} · {fmt(n.dueDate)}</span></div>
                      <button className="nd" onClick={()=>delNotif(n.id)}><I.X/></button>
                    </div>
                  )
                })}
              </div>
        )}
      </div>

      {tab==='friends' && <button className="fab" onClick={()=>setAP(true)}><I.Plus/>إضافة شخص</button>}

      {showAP && (
        <div className="ov" onClick={()=>setAP(false)}>
          <div className="sht" onClick={e=>e.stopPropagation()}>
            <div className="sht-h"/>
            <div className="sht-title">إضافة شخص جديد<button className="sht-close" onClick={()=>setAP(false)}><I.X/></button></div>
            <div className="fg"><label>اسم الشخص</label><input className="fi" placeholder="مثال: محمد" value={pName} onChange={e=>setPName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addPerson()} autoFocus/></div>
            <button className="btn-g" onClick={addPerson}><I.Check/>إضافة</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState('loading')
  const [user,  setUser]  = useState(null)

  useEffect(() => {
    kv('get', SESSION_KEY).then(s => {
      if (s?.id) { setUser(s); setState('app') }
      else setState('auth')
    })
  }, [])

  if (state==='loading') return <div className="loading"><div className="spin"/></div>
  if (state==='auth')    return <AuthScreen onLogin={u=>{setUser(u);setState('app')}}/>
  return <MainApp user={user} onLogout={()=>{setUser(null);setState('auth')}}/>
}
