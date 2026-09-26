'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, WifiOff } from 'lucide-react';
import { activity, trackedFetch } from '@/lib/ui/activity';
import { useLanguage } from '@/components/providers/language-provider';
import RingLoader from './ring-loader';
import styles from './workspace-activity.module.css';

type Connection = 'online' | 'offline' | 'unavailable' | 'restored';
const serverSnapshot = () => false;

export default function WorkspaceActivity() {
  const pending = useSyncExternalStore(activity.subscribe, activity.getSnapshot, serverSnapshot);
  const [visible, setVisible] = useState(false);
  const [connection, setConnection] = useState<Connection>('online');
  const [checking, setChecking] = useState(false);
  const checkRef = useRef<() => void>(() => {});
  const { language } = useLanguage();
  const khmer = language === 'km';

  useEffect(() => {
    // Skip very fast requests; bridge small gaps between fetch and React commit.
    const timer = setTimeout(() => setVisible(pending), pending ? 100 : 250);
    return () => clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    const original = window.fetch;
    let disposed = false;
    let disconnected = !navigator.onLine;
    let probe: AbortController | null = null;
    let restoredTimer: ReturnType<typeof setTimeout> | undefined;
    let probeTimer: ReturnType<typeof setTimeout> | undefined;

    const markDisconnected = (state: 'offline' | 'unavailable') => {
      disconnected = true;
      clearTimeout(restoredTimer);
      setConnection(state);
    };
    const check = async () => {
      if (disposed || probe) return;
      if (!navigator.onLine) { markDisconnected('offline'); return; }
      const controller = new AbortController();
      probe = controller;
      setChecking(true);
      probeTimer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await original.call(window, '/api/connection', {
          cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        });
        if (disposed) return;
        if (!navigator.onLine) { markDisconnected('offline'); return; }
        if (response.status !== 204) { markDisconnected('unavailable'); return; }
        if (disconnected) {
          disconnected = false;
          setConnection('restored');
          clearTimeout(restoredTimer);
          restoredTimer = setTimeout(() => setConnection('online'), 4000);
        }
      } catch {
        if (!disposed) markDisconnected(navigator.onLine ? 'unavailable' : 'offline');
      } finally {
        clearTimeout(probeTimer);
        probe = null;
        if (!disposed) setChecking(false);
      }
    };
    checkRef.current = () => { void check(); };
    const offline = () => { probe?.abort(); markDisconnected('offline'); };
    const online = () => { void check(); };
    const focus = () => { if (disconnected) void check(); };
    let serviceOrigin: string | undefined;
    try { serviceOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin; } catch { /* Same-origin requests still work. */ }
    const observed = trackedFetch(original.bind(window), {
      origin: window.location.origin, serviceOrigin, begin: activity.begin,
      onNetworkFailure: () => { if (!disposed) void check(); },
    });
    window.fetch = observed;
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener('focus', focus);
    const initial = setTimeout(() => { if (!navigator.onLine) offline(); }, 0);
    const retry = setInterval(() => { if (disconnected && document.visibilityState === 'visible') void check(); }, 15000);
    return () => {
      disposed = true;
      probe?.abort();
      clearTimeout(initial); clearTimeout(restoredTimer); clearTimeout(probeTimer); clearInterval(retry);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', focus);
      if (window.fetch === observed) window.fetch = original;
      checkRef.current = () => {};
    };
  }, []);

  const offline = connection === 'offline' || connection === 'unavailable';
  return <aside className={styles.dock} data-i18n-ignore="true" aria-label={khmer ? 'ស្ថានភាពការតភ្ជាប់' : 'Connection and activity'}>
    {offline ? <div className={styles.notice} role="status" aria-live="polite">
      <div className={styles.heading}><WifiOff size={20} aria-hidden="true" className="text-amber-500" />
        {connection === 'offline' ? (khmer ? 'គ្មានការតភ្ជាប់អ៊ីនធឺណិត' : "You're offline") : (khmer ? 'មិនអាចភ្ជាប់ទៅប្រព័ន្ធបាន' : 'Cannot reach the app')}
      </div>
      <p>{khmer ? 'ទំព័ររបស់អ្នកនៅតែបើក។ សូមពិនិត្យការតភ្ជាប់ ហើយផ្ទៀងផ្ទាត់ស្ថានភាពការរក្សាទុក ឬការទូទាត់ មុនពេលព្យាយាមម្ដងទៀត។' : 'Your page is still open. Check your connection, then verify any pending save or payment before trying again.'}</p>
      <button type="button" disabled={checking} onClick={() => checkRef.current()}>{checking ? (khmer ? 'កំពុងពិនិត្យ…' : 'Checking…') : (khmer ? 'ពិនិត្យការតភ្ជាប់' : 'Check connection')}</button>
    </div> : connection === 'restored' ? <div className={`${styles.notice} ${styles.recovered}`} role="status"><CheckCircle2 size={20} aria-hidden="true" /><span>{khmer ? 'បានភ្ជាប់ឡើងវិញ' : 'Back online'}</span></div>
      : visible ? <div className={styles.loading} role="status" aria-live="polite"><RingLoader /><span className="sr-only">{khmer ? 'កំពុងធ្វើបច្ចុប្បន្នភាព…' : 'Updating…'}</span></div> : null}
  </aside>;
}
