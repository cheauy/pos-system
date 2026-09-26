import styles from './workspace-activity.module.css';

export default function RingLoader() {
  return <svg className={styles.rings} width="240" height="240" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
    <circle className={styles.a} cx="120" cy="120" r="105" fill="none" strokeWidth="20" strokeDasharray="0 660" strokeDashoffset="-330" strokeLinecap="round" />
    <circle className={styles.b} cx="120" cy="120" r="35" fill="none" strokeWidth="20" strokeDasharray="0 220" strokeDashoffset="-110" strokeLinecap="round" />
    <circle className={styles.c} cx="85" cy="120" r="70" fill="none" strokeWidth="20" strokeDasharray="0 440" strokeLinecap="round" />
    <circle className={styles.d} cx="155" cy="120" r="70" fill="none" strokeWidth="20" strokeDasharray="0 440" strokeLinecap="round" />
  </svg>;
}
