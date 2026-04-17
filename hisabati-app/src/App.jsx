import React, { useState, useEffect, useCallback, useRef } from 'react'
import './app.css'
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
const CSS = ''  // moved to app.css

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
  const [shareP, setShareP] = useState(null)  // person to share
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
  const restoreRef = useRef(null)

  useEffect(() => {
    kv('get', DK).then(d => setData(d || defaultData))
    requestNotifPermission()
  }, [])

  const persist = useCallback(d => { setData(d); kv('set', DK, d) }, [DK])

  if (!data) return <><div className="loading"><div className="spin"/></div></>

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

  const backupData = () => {
    const payload = { version: "1.0", exportedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `حساباتي_نسخة_احتياطية_${new Date().toLocaleDateString("ar-SA").replace(/\//g,"-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restoreData = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const payload = JSON.parse(ev.target.result);
        const restored = payload.data || payload;
        if (!restored.friends || !restored.transactions) { alert("ملف غير صالح"); return; }
        if (window.confirm("سيتم استبدال بياناتك الحالية بالنسخة الاحتياطية. هل أنت متأكد؟")) {
          persist(restored);
          alert("✅ تم استعادة البيانات بنجاح!");
        }
      } catch { alert("تعذر قراءة الملف"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const logout = async () => { await kv('set',SESSION_KEY,null); onLogout() }

  const LB = () => lb ? (
    <div className="lb" onClick={()=>setLB(null)}>
      <button className="lb-close" onClick={()=>setLB(null)}><I.X/></button>
      <img className="lb-img" src={lb.src} alt="إيصال" onClick={e=>e.stopPropagation()}/>
    </div>
  ) : null

  // Statements screen
  if (scr==='statements') return (
    <div className="app"><LB/>
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


  // Share person sheet
  const SharePersonSheet = () => {
    if (!shareP) return null
    const { person, transactions, balance } = shareP

    const buildText = () => {
      const lines = [
        `📊 كشف حساب - ${person.name}`,
        `📅 ${new Date().toLocaleDateString('ar-SA',{day:'numeric',month:'long',year:'numeric'})}`,
        '',
        `💰 الرصيد الحالي: ${balance >= 0 ? '+' : ''}${balance.toFixed(2)} ر.س`,
        `${balance > 0 ? '✅ له عندك' : balance < 0 ? '🔴 عليك له' : '⚖️ متعادل'}`,
        '',
        `📋 المعاملات (${transactions.length}):`,
        ...transactions.map(t =>
          `${t.type==='lent'?'💚':'❤️'} ${t.desc} — ${t.type==='lent'?'+':'-'}${t.amount.toFixed(2)} ر.س — ${new Date(t.date).toLocaleDateString('ar-SA',{day:'numeric',month:'short'})}`
        ),
        '',
        '─────────────────',
        '💰 تطبيق حساباتي',
      ]
      return lines.join('\n')
    }

    const exportPersonCSV = () => {
      const BOM = '\uFEFF'
      const rows = [
        [`كشف حساب - ${person.name}`],
        ['التاريخ', new Date().toLocaleDateString('ar-SA')],
        ['الرصيد', `${balance.toFixed(2)} ر.س`],
        [],
        ['النوع','الوصف','المبلغ','التاريخ','موعد السداد'],
        ...transactions.map(t => [
          t.type==='lent'?'أعطيته':'أخذته منه',
          t.desc,
          `${t.type==='lent'?'+':'-'}${t.amount.toFixed(2)}`,
          new Date(t.date).toLocaleDateString('ar-SA'),
          t.dueDate ? new Date(t.dueDate).toLocaleDateString('ar-SA') : '',
        ]),
      ]
      const csv = BOM + rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
      const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'})
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href=url; a.download=`حساب_${person.name}.csv`; a.click()
      URL.revokeObjectURL(url)
    }

    const exportPersonPDF = () => {
      const rows = transactions.map(t=>`
        <tr>
          <td style="color:${t.type==='lent'?'#16a34a':'#dc2626'}">${t.type==='lent'?'💚 أعطيته':'❤️ أخذته'}</td>
          <td>${t.desc}</td>
          <td style="font-weight:700;color:${t.type==='lent'?'#16a34a':'#dc2626'}">${t.type==='lent'?'+':'-'}${t.amount.toFixed(2)} ر.س</td>
          <td style="color:#888">${new Date(t.date).toLocaleDateString('ar-SA',{day:'numeric',month:'short',year:'numeric'})}</td>
          <td style="color:#b8860b">${t.dueDate?new Date(t.dueDate).toLocaleDateString('ar-SA',{day:'numeric',month:'short'}):'-'}</td>
        </tr>`).join('')
      const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>كشف حساب ${person.name}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'IBM Plex Sans Arabic',Arial,sans-serif;background:#fff;color:#111;padding:28px;direction:rtl}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #d4a843}
.logo{font-size:20px;font-weight:700}.name{font-size:26px;font-weight:700;color:#d4a843;margin-top:3px}
.meta{text-align:left;font-size:11px;color:#666;line-height:1.7}
.bal{border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;background:${balance>=0?'#f0fdf4':'#fef2f2'};border:1px solid ${balance>=0?'#bbf7d0':'#fecaca'}}
.bal-l{font-size:12px;color:#666}.bal-v{font-size:26px;font-weight:700;color:${balance>=0?'#16a34a':'#dc2626'}}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#1a1a2e;color:#fff;padding:9px 11px;text-align:right;font-weight:600;font-size:11px}
td{padding:8px 11px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#fafafa}
.footer{margin-top:18px;padding-top:10px;border-top:1px solid #eee;font-size:10px;color:#999;display:flex;justify-content:space-between}
@media print{body{padding:16px}}</style></head><body>
<div class="hdr"><div><div class="logo">💰 حساباتي</div><div class="name">${person.name}</div></div>
<div class="meta"><div>صادر لـ: ${user.name}</div><div>${new Date().toLocaleDateString('ar-SA')}</div></div></div>
<div class="bal"><div><div class="bal-l">${balance>=0?'له عندك':'عليك له'}</div><div class="bal-v">${balance>=0?'+':'-'}${Math.abs(balance).toFixed(2)} ر.س</div></div>
<div style="font-size:11px;color:#888">${transactions.length} معاملة</div></div>
<table><thead><tr><th>النوع</th><th>الوصف</th><th>المبلغ</th><th>التاريخ</th><th>موعد السداد</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="footer"><span>تطبيق حساباتي</span><span>${new Date().toLocaleDateString('ar-SA')}</span></div>
<script>window.onload=()=>window.print()<\/script></body></html>`
      const w = window.open('','_blank','width=800,height=600')
      if(w){w.document.write(html);w.document.close()}
    }

    const actions = [
      { emoji:'💬', color:'#25D366', label:'واتساب', action:()=>{
          window.open(`https://wa.me/?text=${encodeURIComponent(buildText())}`, '_blank')
      }},
      { emoji:'📋', color:'var(--gold)', label:'نسخ النص', action:async()=>{
          try { await navigator.clipboard.writeText(buildText()) } catch {}
          alert('✅ تم نسخ الكشف')
      }},
      { emoji:'📊', color:'#16a34a', label:'Excel', action: exportPersonCSV },
      { emoji:'🖨️', color:'#ef4444', label:'طباعة PDF', action: exportPersonPDF },
    ]

    return (
      <div className="ov" onClick={()=>setShareP(null)}>
        <div className="sht" onClick={e=>e.stopPropagation()}>
          <div className="sht-h"/>
          <div className="sht-title">
            مشاركة حساب {person.name}
            <button className="sht-close" onClick={()=>setShareP(null)}><I.X/></button>
          </div>
          <div style={{fontSize:12,color:'var(--tx3)',marginBottom:16}}>اختر صيغة المشاركة</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
            {actions.map((a,i)=>(
              <button key={i} onClick={()=>{a.action();setShareP(null)}}
                style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'14px 6px',
                  borderRadius:12,border:'1px solid var(--b2)',background:'var(--sf2)',cursor:'pointer',transition:'all .2s'}}
                onMouseOver={e=>e.currentTarget.style.borderColor=a.color}
                onMouseOut={e=>e.currentTarget.style.borderColor='var(--b2)'}>
                <div style={{width:44,height:44,borderRadius:12,background:'var(--sf3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>{a.emoji}</div>
                <span style={{fontSize:10,color:'var(--tx2)',fontWeight:600,textAlign:'center'}}>{a.label}</span>
              </button>
            ))}
          </div>
          <button className="btn-d" style={{marginTop:0}} onClick={()=>setShareP(null)}>إلغاء</button>
        </div>
      </div>
    )
  }

  // Person detail screen
  if (scr==='friend' && selP) {
    const bal = getBal(selP.id)
    const ptx = data.transactions.filter(t=>t.friendId===selP.id&&!t.archived)
    const bc  = bal>0?'pos':bal<0?'neg':'z'
    return (
      <div className="app"><LB/><SharePersonSheet/>
        <div className="hdr">
          <div><div className="hdr-title">{selP.name}</div><div className="hdr-sub">{ptx.length} معاملة نشطة</div></div>
          <div style={{display:'flex',gap:7}}>
            <button className="hbtn" onClick={()=>setShareP({person:selP,transactions:ptx,balance:bal})} title="مشاركة"><I.Share/></button>
            <button className="hbtn" onClick={()=>setScr('home')}><I.Back/></button>
          </div>
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
    <div className="app"><LB/>
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


// ── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#080810',color:'#eeeef8',padding:24,direction:'rtl',textAlign:'center',gap:16}}>
        <div style={{fontSize:40}}>⚠️</div>
        <div style={{fontSize:18,fontWeight:700}}>حدث خطأ في التطبيق</div>
        <div style={{fontSize:12,color:'#8080a0',maxWidth:300}}>{String(this.state.error)}</div>
        <button onClick={()=>window.location.reload()} style={{marginTop:12,padding:'12px 24px',background:'#d4a843',color:'#160f00',border:'none',borderRadius:10,fontSize:14,fontWeight:700,cursor:'pointer'}}>
          إعادة تحميل التطبيق
        </button>
      </div>
    )
    return this.props.children
  }
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

  if (state==='loading') return <><div className="loading"><div className="spin"/></div></>
  if (state==='auth')    return <ErrorBoundary><AuthScreen onLogin={u=>{setUser(u);setState('app')}}/></ErrorBoundary>
  return <ErrorBoundary><MainApp user={user} onLogout={()=>{setUser(null);setState('auth')}}/></ErrorBoundary>
}
