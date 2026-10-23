import { ReactNode, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { CONTACT_EMAIL, CURRENT_TERMS_VERSION, LEGAL_EFFECTIVE_DATE, LEGAL_LINKS } from '@/lib/legal';
import styles from './Legal.module.css';

interface LegalPageProps {
  title: string;
  children: ReactNode;
}

// Shared frame for the public legal documents. Every visitor can reach
// these without an account — they're linked from the landing page, the
// sign-up checkbox, and Settings.
export function LegalPage({ title, children }: LegalPageProps) {
  const { hash } = useLocation();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} · Blackbox`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  // A link like /privacy#who-can-see-entries should land on that section;
  // anything else starts at the top rather than wherever the last page was.
  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [title, hash]);

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link to="/" className={styles.brand}>blackb0x</Link>
        <nav className={styles.navLinks} aria-label="Legal documents">
          {LEGAL_LINKS.map(({ to, label }) => (
            <NavLink key={to} to={to}>{label}</NavLink>
          ))}
        </nav>
      </header>

      <main className={styles.doc}>
        <p className={styles.kicker}>Legal</p>
        <h1>{title}</h1>
        <p className={styles.meta}>Effective {LEGAL_EFFECTIVE_DATE} · version {CURRENT_TERMS_VERSION}</p>
        {children}
      </main>

      <footer className={styles.footer}>
        <span>blackbox</span>
        <div>
          <Link to="/">Home</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
        </div>
      </footer>
    </div>
  );
}

interface TableProps {
  head: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}

export function LegalTable({ head, rows }: TableProps) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>{head.map((cell) => <th key={cell} scope="col">{cell}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ContactLink = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
