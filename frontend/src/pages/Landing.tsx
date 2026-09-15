import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  EyeOff,
  HeartHandshake,
  LockKeyhole,
  Radio,
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import styles from "./Landing.module.css";

const terminalLines = [
  ["record", "Open the camera. Talk about your day. Sixty seconds is plenty."],
  ["keep", "It lands in your box, encrypted, out of everyone else's reach."],
  ["revisit", "Scroll back through the ordinary days that turned out to matter."],
  ["pass on", "Choose who opens which entry, and when they get to."],
] as const;

function Terminal() {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;

    let timeout: number;
    let stopped = false;

    const run = async () => {
      for (const [command, output] of terminalLines) {
        for (const [prefix, text, className, speed] of [
          ["$", command, styles.command, 18],
          ["", output, styles.output, 10],
        ] as const) {
          const line = document.createElement("div");
          line.className = styles.terminalLine;
          line.innerHTML = `<span class="${styles.prefix}">${prefix}</span><span class="${className}"></span>`;
          const content = line.lastElementChild!;
          container.appendChild(line);

          for (let index = 0; index <= text.length; index += 1) {
            if (stopped) return;
            content.textContent = text.slice(0, index) + (index === text.length ? "" : "▍");
            await new Promise<void>((resolve) => {
              timeout = window.setTimeout(resolve, index === text.length ? (prefix ? 260 : 700) : speed);
            });
          }
        }
      }

      timeout = window.setTimeout(() => {
        container.replaceChildren();
        if (!stopped) void run();
      }, 7000);
    };

    timeout = window.setTimeout(() => void run(), 400);
    return () => {
      stopped = true;
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <div className={styles.terminal}>
      <div className={styles.terminalTitlebar}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={`${styles.dot} ${styles.accentDot}`} />
        <span className={styles.terminalLabel}>what blackbox does</span>
      </div>
      <div ref={bodyRef} className={styles.terminalBody} aria-live="polite" />
    </div>
  );
}

export default function Landing() {
  const { isLoggedIn } = useAuth();
  const appPath = isLoggedIn ? "/home" : "/login";

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <span className={styles.brand}>blackbox</span>
        <div className={styles.navRight}>
          <span className={styles.beta}>Early access</span>
          <Link className={styles.outlineButton} to={appPath}>
            Try the beta <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <p className={styles.kicker}>A safe keep for video diaries</p>
          <h1>One day they&apos;ll want to hear your voice.</h1>
          <p className={styles.subtitle}>Record a minute of today. Seal it. Choose who opens it, and when.</p>
          <Terminal />
          <div className={styles.ctaRow}>
            <Link className={`${styles.outlineButton} ${styles.ctaButton}`} to={appPath}>
              <Radio size={16} /> Start recording — free
            </Link>
            <a className={styles.ghostButton} href="#privacy">See how it&apos;s protected</a>
          </div>
        </section>

        <section className={styles.banner}>
          <div className={styles.bannerInfo}>
            <Smartphone className={styles.bannerIcon} />
            <div>
              <p className={styles.bannerTitle}>The mobile app is coming</p>
              <p className={styles.bannerDescription}>iOS and Android — record wherever the moment happens.</p>
            </div>
          </div>
          <span className={styles.soon}>Soon</span>
        </section>

        <section className={styles.privacy} id="privacy">
          <h2>A black box, not a feed</h2>
          <p className={styles.privacySubtitle}>Nothing you record is public, promoted, or read by us.</p>
          <div className={styles.privacyGrid}>
            <article className={styles.privacyCard}>
              <LockKeyhole className={styles.cardIcon} />
              <h3>Sealed on your device</h3>
              <p>Entries are encrypted before upload. We store the box; you hold the key.</p>
            </article>
            <article className={styles.privacyCard}>
              <EyeOff className={styles.cardIcon} />
              <h3>No eyes but yours</h3>
              <p>Never scanned for ads, never used to train models, never shown to strangers.</p>
            </article>
            <article className={styles.privacyCard}>
              <HeartHandshake className={styles.cardIcon} />
              <h3>Passed on, on your terms</h3>
              <p>Name who inherits an entry and the moment it should reach them.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>blackbox — beta 0.4</span>
        <div><a href="#privacy">Privacy policy</a><a href="mailto:hello@blackbox.app">Contact</a></div>
      </footer>
    </div>
  );
}
