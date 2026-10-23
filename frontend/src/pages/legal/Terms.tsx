import { Link } from 'react-router-dom';
import { ContactLink, LegalPage } from './LegalPage';
import styles from './Legal.module.css';
import { MIN_AGE_YEARS } from '@/lib/agePolicy';

// Accepted by checkbox at sign-up (and by TermsAcceptanceGate for older
// accounts) — the server records the version. Bump CURRENT_TERMS_VERSION in
// both lib/legal.ts and backend/services/legal.js for any material change.
// When the iOS/macOS app ships, add the App Store terms Apple requires of a
// custom licence agreement before relying on these there.

const SECTIONS = [
  ['agreement', 'Agreeing to these terms'],
  ['eligibility', 'Who can use Blackbox'],
  ['early-access', 'Early access'],
  ['account', 'Your account'],
  ['your-content', 'Your entries'],
  ['recording-others', 'Recording other people'],
  ['acceptable-use', 'Acceptable use'],
  ['not-yet-available', 'Features that aren’t available yet'],
  ['our-service', 'Blackbox itself'],
  ['fees', 'Fees'],
  ['ending', 'Ending your use of Blackbox'],
  ['not-a-health-service', 'Not a health or emergency service'],
  ['disclaimers', 'Disclaimers'],
  ['liability', 'Limitation of liability'],
  ['indemnity', 'Indemnity'],
  ['disputes', 'Governing law and disputes'],
  ['changes', 'Changes to these terms'],
  ['general', 'General'],
  ['contact', 'Contact'],
] as const;

export default function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms are an agreement between you and Mike Mutaki, the developer who runs Blackbox (&ldquo;we&rdquo; or
        &ldquo;us&rdquo;). They cover your use of the Blackbox website and web app (together, &ldquo;Blackbox&rdquo;).
        Please read them, along with our <Link to="/privacy">Privacy Policy</Link>, which explains how we handle your
        information.
      </p>

      <nav aria-label="Contents">
        <ol className={styles.toc}>
          {SECTIONS.map(([id, label], index) => (
            <li key={id}><a href={`#${id}`}>{index + 1}. {label}</a></li>
          ))}
        </ol>
      </nav>

      <h2 id="agreement">1. Agreeing to these terms</h2>
      <p>
        You accept these terms by checking the box when you create your account, or when we ask you to agree to an
        updated version. If you don&apos;t agree, don&apos;t use Blackbox. You can delete your account at any time.
      </p>

      <h2 id="eligibility">2. Who can use Blackbox</h2>
      <ul>
        <li>You must be at least {MIN_AGE_YEARS} years old.</li>
        <li>
          If you&apos;re under 18, or under the age of majority where you live, a parent or legal guardian must read
          these terms and agree to them on your behalf. They&apos;re responsible for your use of Blackbox.
        </li>
        <li>The information you give us when you sign up, including your date of birth, must be true.</li>
        <li>An account is for one person. Don&apos;t share it or create one for someone else.</li>
        <li>You can&apos;t use Blackbox if the law where you live prohibits it.</li>
      </ul>

      <h2 id="early-access">3. Early access</h2>
      <p>
        Blackbox is an early-access product run by one person. Features may change, break or be removed, and the service
        may be unavailable at times. We work to keep your entries safe, but we can&apos;t guarantee nothing will ever be
        lost, and Blackbox doesn&apos;t yet have a way to download your entries. Please don&apos;t keep anything in
        Blackbox that would be your only copy of something you can&apos;t afford to lose.
      </p>

      <h2 id="account">4. Your account</h2>
      <p>
        Keep your password secure, and don&apos;t reuse it from other sites. You&apos;re responsible for what happens
        in your account. If you think someone else has accessed it, change your password and tell us at{' '}
        <ContactLink />.
      </p>

      <h2 id="your-content">5. Your entries</h2>
      <p>
        <strong>You own your entries.</strong> We don&apos;t claim any ownership of the videos you record, their titles,
        or anything in them.
      </p>
      <p>
        To run Blackbox, you give us a limited permission to store, encrypt, copy (for example in backups), transmit and
        play back your entries, only to provide Blackbox to you. This permission is non-exclusive, worldwide and
        royalty-free, and it ends when you delete the entry or your account, apart from backup copies that remain until
        they expire. We won&apos;t use your entries for advertising or to train AI, or show them to anyone else. See{' '}
        <Link to="/privacy#who-can-see-entries">who can see your entries</Link>.
      </p>
      <p>You&apos;re responsible for what you record, and you must have the right to record and store it.</p>

      <h2 id="recording-others">6. Recording other people</h2>
      <p>
        If anyone else appears or can be heard in your entries, getting their permission is your responsibility.
        Washington and several other US states require the consent of everyone taking part before a private
        conversation is recorded, and many places protect people&apos;s privacy in their homes and other private spaces.
        Don&apos;t use Blackbox to record anyone secretly or without the consent the law requires.
      </p>

      <h2 id="acceptable-use">7. Acceptable use</h2>
      <p>Don&apos;t use Blackbox to:</p>
      <ul>
        <li>store or record anything illegal, including any content that sexually exploits or endangers children. We report it to the authorities as the law requires;</li>
        <li>store content that infringes someone else&apos;s copyright, privacy or other rights;</li>
        <li>harass, threaten or harm anyone;</li>
        <li>break, probe or get around Blackbox&apos;s security, rate limits or encryption, or access anyone else&apos;s account or entries;</li>
        <li>upload malware, or overload or disrupt the service;</li>
        <li>create accounts automatically, scrape the service, or resell access to it.</li>
      </ul>
      <p>
        Because entries are private and we don&apos;t review them, we usually won&apos;t know what you store. If we receive
        a credible report or a legal demand, or see activity that threatens the service, we may act under{' '}
        <a href="#ending">section 11</a>.
      </p>

      <h2 id="not-yet-available">8. Features that aren&apos;t available yet</h2>
      <p>
        Our website describes plans that don&apos;t exist yet, such as passing entries on to people you choose, and a
        mobile app. These are plans, not promises. They may change or never arrive. Blackbox is not a will or an
        estate-planning tool, and you shouldn&apos;t rely on it to deliver anything to anyone. If we add these features,
        they&apos;ll come with updated terms.
      </p>

      <h2 id="our-service">9. Blackbox itself</h2>
      <p>
        Blackbox&apos;s software, design and name belong to us. We give you a personal, non-transferable, revocable
        permission to use Blackbox for your own non-commercial use under these terms. If you send us feedback or ideas,
        we may use them without owing you anything.
      </p>

      <h2 id="fees">10. Fees</h2>
      <p>
        Blackbox is free during early access. If we introduce paid features, we&apos;ll tell you in advance, and you
        won&apos;t be charged unless you choose to pay.
      </p>

      <h2 id="ending">11. Ending your use of Blackbox</h2>
      <p>
        You can stop using Blackbox and delete your account at any time in Settings → Profile. Deleting removes your
        account and every entry permanently.
      </p>
      <p>
        We may suspend or close your account if you seriously or repeatedly break these terms, if the law requires it,
        or if your use puts the service or other people at risk. Where it&apos;s reasonable and lawful, we&apos;ll warn you
        first and explain why. If we decide to shut Blackbox down, we&apos;ll give you as much notice as we can, and at
        least 30 days where possible.
      </p>
      <p>Sections 5 (your entries), 9 and 12 to 18 continue to apply after your account ends.</p>

      <h2 id="not-a-health-service">12. Not a health or emergency service</h2>
      <p>
        Blackbox is a journal. It doesn&apos;t give medical, mental-health or emergency help, and nobody watches entries
        as they&apos;re recorded. If you&apos;re in crisis or thinking about harming yourself, call or text{' '}
        <strong>988</strong> (the Suicide &amp; Crisis Lifeline in the US) or your local emergency number.
      </p>

      <h2 id="disclaimers">13. Disclaimers</h2>
      <p>
        Blackbox is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest extent the law allows, we
        make no warranties, express or implied, including that Blackbox will be uninterrupted, error-free or secure, that
        it will never lose data, or that it is fit for a particular purpose. Some places don&apos;t allow these
        disclaimers, so some of them may not apply to you.
      </p>

      <h2 id="liability">14. Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, we aren&apos;t liable for any indirect, incidental, special, consequential
        or punitive damages, or for lost data, profits or goodwill, arising from your use of Blackbox. Our total
        liability for any claim about Blackbox is limited to the greater of US$50 or the amount you paid us in the 12
        months before the claim. Nothing in these terms limits liability that can&apos;t be limited by law, such as for
        fraud or gross negligence.
      </p>

      <h2 id="indemnity">15. Indemnity</h2>
      <p>
        If someone makes a claim against us because of content you stored in Blackbox or your breach of these terms or the
        law, you agree to cover our reasonable losses and costs from that claim, to the extent the law allows.
      </p>

      <h2 id="disputes">16. Governing law and disputes</h2>
      <p>
        These terms are governed by the laws of the State of Washington, USA, without regard to its conflict-of-law
        rules. If you have a problem, please email us first, and we&apos;ll try to resolve it informally within 30 days.
        Any dispute that can&apos;t be resolved that way goes to the state or federal courts in Washington, and you and we
        both agree to their jurisdiction. If you live outside the US, this doesn&apos;t take away any right your local
        consumer law gives you to bring a claim where you live.
      </p>

      <h2 id="changes">17. Changes to these terms</h2>
      <p>
        We may update these terms. We&apos;ll post every change here with a new effective date. If a change is material,
        we&apos;ll tell you inside Blackbox before it takes effect and ask you to agree again before you can keep
        recording. If you don&apos;t agree, you can delete your account instead.
      </p>

      <h2 id="general">18. General</h2>
      <p>
        These terms and the Privacy Policy are the whole agreement between you and us about Blackbox. If any part turns
        out to be unenforceable, the rest still applies. If we don&apos;t enforce a part straight away, we haven&apos;t
        given up the right to enforce it later. You can&apos;t transfer these terms to anyone else. We may transfer them
        if Blackbox moves to a new operator, as described in the Privacy Policy.
      </p>

      <h2 id="contact">19. Contact</h2>
      <p>Questions about these terms: <ContactLink />.</p>
    </LegalPage>
  );
}
