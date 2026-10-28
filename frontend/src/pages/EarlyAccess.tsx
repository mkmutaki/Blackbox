import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Smartphone } from "lucide-react";
import { getErrorMessage } from "@/lib/errorMessage";
import { CONTACT_EMAIL, LEGAL_LINKS } from "@/lib/legal";
import { post } from "@/services/api";
import logo from "@/assets/blackbox-logo.svg";
import landing from "./Landing.module.css";
import styles from "./EarlyAccess.module.css";

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "joined">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setError("");
    try {
      await post("/waitlist", { email });
      setStatus("joined");
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that. Please try again."));
      setStatus("idle");
    }
  };

  if (status === "joined") {
    return (
      <p className={styles.done} role="status">
        <Check size={16} /> You&apos;re on the list. We&apos;ll email you once, when it&apos;s ready.
      </p>
    );
  }

  return (
    <>
      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button className={styles.button} type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Joining…" : "Get early access"}
        </button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </>
  );
}

export default function EarlyAccess() {
  return (
    <div className={`${landing.page} ${styles.page}`}>
      <header className={landing.nav}>
        <Link to="/"><img className={landing.brand} src={logo} alt="Blackbox" /></Link>
        <Link className={styles.back} to="/">
          <ArrowLeft size={15} /> Back
        </Link>
      </header>

      <main className={styles.hero}>
        <div className={styles.icon}>
          <Smartphone size={34} />
        </div>
        <p className={styles.kicker}>Early access</p>
        <h1>Take your black box with you.</h1>
        <p className={styles.subtitle}>
          The Blackbox mobile app is on its way. Leave your email and we&apos;ll tell you when it&apos;s ready.
        </p>
        <WaitlistForm />
        <p className={styles.note}>
          One email, when the app is ready. Nothing else.
          <br />
          See our <Link to="/privacy#what-we-collect">Privacy Policy</Link>.
        </p>
      </main>

      <footer className={landing.footer}>
        <span>blackbox — beta 0.4</span>
        <div>
          {LEGAL_LINKS.map(({ to, label }) => <Link key={to} to={to}>{label}</Link>)}
          <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
        </div>
      </footer>
    </div>
  );
}
