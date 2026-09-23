'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Circle, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { completeTeamPasswordSetup } from './actions';

const buttonStyle = 'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60';

export default function TeamSetupPage() {
  const [db] = useState(() => createClient());
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState({ password: false, confirm: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const validLength = password.length >= 12 && password.length <= 128;
  const matches = confirm.length > 0 && password === confirm;

  useEffect(() => {
    let alive = true;
    void db.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      setSignedIn(Boolean(data.session));
      setReady(true);
      if (error || new URLSearchParams(window.location.search).get('error')) setMessage('Your setup session has expired. Sign in again with the temporary password from your store owner.');
    }).catch(() => {
      if (alive) { setReady(true); setMessage('Unable to check your session. Please sign in again.'); }
    });
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      if (alive) { setSignedIn(Boolean(session)); setReady(true); }
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [db]);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const { error } = await db.auth.signOut();
      if (error) throw error;
      window.location.assign(saved ? '/login?setup=complete' : '/login');
    } catch { setMessage('Unable to sign out. Please try again.'); setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!validLength || !matches) { setMessage('Use 12–128 characters and enter the same password in both fields.'); return; }
    setBusy(true);
    setMessage('');
    try {
      const result = await completeTeamPasswordSetup(password, confirm);
      if (!result.success) { setMessage(result.message); return; }
      setSaved(true);
      setPassword('');
      setConfirm('');
      const { error } = await db.auth.signOut();
      if (error) { setMessage('Your password is saved. Please try continuing to sign in again.'); return; }
      window.location.assign('/login?setup=complete');
    } catch { setMessage('Setup could not be confirmed. Please retry with the same password.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#f4f7fc] px-4 py-6 text-slate-900 sm:px-8 sm:py-8">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-2.5">
        <Image src="/tenh-pos-logo.png" alt="" width={42} height={42} priority className="h-10 w-10 object-contain" />
        <span className="text-xl font-extrabold tracking-tight">TENH <span className="text-blue-600">POS</span></span>
        <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-slate-500"><ShieldCheck size={15} aria-hidden="true" /> Team account setup</span>
      </header>
      <div className="flex flex-1 items-center justify-center py-8 sm:py-12">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 md:grid-cols-[0.8fr_1fr]">
          <aside className="flex flex-col justify-between bg-[#102b60] p-7 text-white sm:p-10 md:p-11">
            <div>
              <div className="mb-7 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10"><KeyRound size={26} aria-hidden="true" /></div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Welcome to your team</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Your workspace.<br />Your own password.</h2>
              <p className="mt-4 max-w-xs text-sm leading-6 text-blue-100">Replace your temporary password with one only you know, then sign in to get started.</p>
            </div>
            <ol aria-label="Setup steps" className="mt-8 space-y-4 text-sm md:mt-16">
              <li aria-current={saved ? undefined : 'step'} className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-blue-900">{saved ? <Check size={16} aria-hidden="true" /> : '1'}</span>Set your password</li>
              <li aria-current={saved ? 'step' : undefined} className="flex items-center gap-3 text-blue-100"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-300/40 text-sm">2</span>Sign in to your workspace</li>
            </ol>
          </aside>
          <section aria-labelledby="setup-title" className="p-7 sm:p-10 md:p-11">
            <h1 id="setup-title" className="text-2xl font-bold tracking-tight sm:text-3xl">{saved ? 'You’re all set' : 'Set your password'}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">{saved ? 'Your new password is ready. Use it the next time you sign in.' : 'One last step before you join your business workspace.'}</p>
            {message && <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{message}</p>}
            {!ready ? <p role="status" className="flex items-center gap-3 py-12 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={20} aria-hidden="true" />Checking your session…</p> : saved ? (
              <button type="button" disabled={busy} onClick={signOut} className={`mt-7 ${buttonStyle}`}>{busy ? 'Continuing…' : 'Continue to sign in'}<ArrowRight size={18} aria-hidden="true" /></button>
            ) : !signedIn ? (
              <div className="mt-7 space-y-5"><p className="text-sm leading-6 text-slate-600">Sign in with the temporary password provided by your store owner to finish setting up your account.</p><Link href="/login" className={buttonStyle}>Go to sign in<ArrowRight size={18} aria-hidden="true" /></Link></div>
            ) : (
              <form onSubmit={submit} className="mt-7 space-y-5" aria-busy={busy}>
                {(['password', 'confirm'] as const).map(field => {
                  const isConfirm = field === 'confirm';
                  const mismatch = isConfirm && confirm.length > 0 && !matches;
                  return <div key={field}>
                    <label htmlFor={field} className="mb-2 block text-sm font-semibold">{isConfirm ? 'Confirm password' : 'New password'} <span className="text-blue-600" aria-hidden="true">*</span></label>
                    <div className="relative">
                      <LockKeyhole size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-4 text-slate-400" />
                      <input id={field} name={field} type={visible[field] ? 'text' : 'password'} required minLength={12} maxLength={128} autoComplete="new-password" spellCheck={false} autoCapitalize="none" value={isConfirm ? confirm : password} onChange={event => { (isConfirm ? setConfirm : setPassword)(event.target.value); setMessage(''); }} disabled={busy} placeholder={isConfirm ? 'Re-enter your password' : 'Create a new password'} aria-invalid={mismatch || undefined} aria-describedby={isConfirm ? 'password-match' : 'password-length'} className={`h-12 w-full rounded-xl border bg-white pl-11 pr-12 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50 ${mismatch ? 'border-rose-300' : 'border-slate-300'}`} />
                      <button type="button" disabled={busy} aria-label={`${visible[field] ? 'Hide' : 'Show'} ${isConfirm ? 'confirmation password' : 'new password'}`} aria-pressed={visible[field]} onClick={() => setVisible(current => ({ ...current, [field]: !current[field] }))} className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600">{visible[field] ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
                    </div>
                  </div>;
                })}
                <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-xs" aria-live="polite">
                  <p id="password-length" className={`flex items-center gap-2 ${validLength ? 'text-emerald-700' : 'text-slate-500'}`}>{validLength ? <Check size={15} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}Use 12–128 characters</p>
                  <p id="password-match" className={`flex items-center gap-2 ${matches ? 'text-emerald-700' : confirm ? 'text-rose-600' : 'text-slate-500'}`}>{matches ? <Check size={15} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}{matches ? 'Passwords match' : confirm ? 'Passwords don’t match yet' : 'Enter the same password in both fields'}</p>
                </div>
                <button type="submit" disabled={busy} className={buttonStyle}>{busy ? <><LoaderCircle size={18} className="animate-spin" aria-hidden="true" />Saving password…</> : <>Save password & continue<ArrowRight size={18} aria-hidden="true" /></>}</button>
                <p className="text-center text-xs leading-5 text-slate-500">You’ll sign in again with your new password.</p>
                <div className="border-t border-slate-100 pt-4 text-center"><button type="button" disabled={busy} onClick={signOut} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50"><LogOut size={16} aria-hidden="true" />Sign out</button></div>
              </form>
            )}
          </section>
        </div>
      </div>
      <footer className="text-center text-xs text-slate-500">Need help getting started? Contact your store owner.</footer>
    </main>
  );
}
