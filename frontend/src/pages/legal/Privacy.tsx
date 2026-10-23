import { Link } from 'react-router-dom';
import { ContactLink, LegalPage, LegalTable } from './LegalPage';
import styles from './Legal.module.css';

// Every factual statement here has to stay true of the code (CLAUDE.md,
// non-negotiable 6). In particular: the provider list (section 5), the
// retention table (section 6), cookie names and lifetimes (section 10), and
// the key-custody wording (section 4) all describe the current
// implementation. Change the code, change this; a material change also
// means bumping CURRENT_TERMS_VERSION so everyone is asked again.

const SECTIONS = [
  ['who-we-are', 'Who we are'],
  ['what-we-collect', 'Information we collect'],
  ['how-we-use-it', 'How we use it'],
  ['who-can-see-entries', 'Who can see your entries'],
  ['providers', 'Service providers'],
  ['retention', 'How long we keep it'],
  ['security', 'Security'],
  ['your-rights', 'Your rights and choices'],
  ['children', 'Children'],
  ['cookies', 'Cookies and browser storage'],
  ['international', 'International users'],
  ['health-data', 'Washington consumer health data'],
  ['changes', 'Changes to this policy'],
  ['contact', 'Contact'],
] as const;

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Blackbox is a private video diary. This policy explains what information Blackbox collects, why, who else
        handles it, how long it&apos;s kept, and the choices you have. It applies to the Blackbox website and web app
        (together, &ldquo;Blackbox&rdquo;).
      </p>

      <section className={styles.summary} aria-labelledby="short-version">
        <h2 id="short-version">The short version</h2>
        <ul>
          <li>Your entries are private. There&apos;s no feed, no public profile, and no way to share an entry with anyone.</li>
          <li>We don&apos;t sell your information, use it for advertising, or use your recordings to train AI.</li>
          <li>
            Videos are encrypted in your browser before they&apos;re uploaded. Today Blackbox also stores the key for each
            video, so we are <strong>technically able</strong> to decrypt your entries. We don&apos;t, unless you ask us to
            or the law requires it. End-to-end encryption, where only you hold the key, is planned but not built.
          </li>
          <li>You can delete any entry, or your whole account, at any time.</li>
          <li>Blackbox is for people 13 and older.</li>
        </ul>
      </section>

      <nav aria-label="Contents">
        <ol className={styles.toc}>
          {SECTIONS.map(([id, label], index) => (
            <li key={id}><a href={`#${id}`}>{index + 1}. {label}</a></li>
          ))}
        </ol>
      </nav>

      <h2 id="who-we-are">1. Who we are</h2>
      <p>
        Blackbox is an independent personal project run by Mike Mutaki, a developer based in the State of Washington,
        USA (&ldquo;we&rdquo; or &ldquo;us&rdquo;). We decide how your information is used, which makes us responsible for it
        (its &ldquo;controller&rdquo;, under laws that use that term). For any question or request about your
        information, email <ContactLink />.
      </p>

      <h2 id="what-we-collect">2. Information we collect</h2>
      <h3>Information you give us</h3>
      <ul>
        <li>
          <strong>Account details:</strong> your email address, the first name you enter when you sign up, your date of
          birth, and the username you choose. We use your date of birth to confirm you meet our minimum age.
        </li>
        <li>
          <strong>Your password,</strong> which we never store in readable form. We keep only a salted, one-way bcrypt
          hash of it. When you set a password, we also check that it hasn&apos;t appeared in a known data breach (see
          Have I Been Pwned in <a href="#providers">section 5</a>).
        </li>
        <li>
          <strong>If you sign in with Google:</strong> Google tells us your email address, whether Google has verified it,
          your name, and an identifier for your Google account. We don&apos;t receive your Google password, contacts, or
          anything else in your Google account.
        </li>
        <li>
          <strong>Your entries:</strong> the video and audio you record, which is encrypted in your browser before it
          leaves your device; the titles you give your entries; and the details we attach to each one (when it was
          recorded, its entry number, and the encryption key and initialization vector needed to play it back).
        </li>
        <li><strong>Settings,</strong> such as how long Blackbox waits before signing you out automatically.</li>
        <li><strong>Your agreement to our terms:</strong> which version you agreed to, and when.</li>
        <li><strong>Anything you send us</strong> by email.</li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li><strong>Sign-in cookies.</strong> Two cookies keep you signed in. See <a href="#cookies">section 10</a>.</li>
        <li>
          <strong>IP address and request details.</strong> Like any website, our servers see your IP address and basic
          details of each request, such as its time and what was requested. We use your IP address to limit repeated
          sign-in and upload attempts, and our hosting providers keep standard server logs.
        </li>
        <li>
          <strong>Security events.</strong> We record sign-ins, failed sign-in attempts, password changes, linking a
          Google account, signs that a sign-in token was stolen and reused, agreeing to our terms, and account
          deletion. Each record holds your account ID, a partly hidden
          form of your email address (such as j***@example.com), the IP address involved, and the time. These records
          never contain your entries, your password, or encryption keys.
        </li>
      </ul>

      <h3>What we don&apos;t collect</h3>
      <ul>
        <li>No analytics, advertising identifiers or tracking pixels, and no tracking across other websites or apps.</li>
        <li>No precise location. Your IP address can reveal your approximate area, as it does on any website.</li>
        <li>No contacts, photos or other files from your device.</li>
        <li>
          We don&apos;t analyze your recordings. We don&apos;t run face recognition, voice recognition or transcription on
          them, and we don&apos;t create biometric identifiers or templates from them.
        </li>
        <li>
          Blackbox uses your camera and microphone only while you&apos;re recording, and only after you allow it in your
          browser. You can withdraw that permission in your browser settings at any time.
        </li>
      </ul>

      <h2 id="how-we-use-it">3. How we use your information</h2>
      <p>We use your information only to:</p>
      <ul>
        <li><strong>Provide Blackbox:</strong> create and secure your account, sign you in, store your entries, and play them back to you.</li>
        <li><strong>Keep Blackbox secure:</strong> prevent abuse such as password guessing, investigate security incidents, and protect your account.</li>
        <li>
          <strong>Contact you about your account or Blackbox itself,</strong> for example to verify your email address,
          reset your password, or tell you about changes to these documents. We don&apos;t send marketing email. Email
          delivery isn&apos;t switched on yet; until it is, we&apos;ll tell you about changes inside Blackbox.
        </li>
        <li><strong>Comply with the law</strong> and enforce our <Link to="/terms">Terms of Service</Link>.</li>
      </ul>
      <p>
        We don&apos;t use your information for advertising, sell it, build profiles of you, or use your recordings, or
        anything in them, to train artificial intelligence or machine-learning models.
      </p>
      <p>
        <strong>If you&apos;re in the European Economic Area, the UK or Switzerland,</strong> our legal bases are: providing
        the service you asked for (performance of a contract); our legitimate interest in keeping Blackbox secure and
        preventing abuse; complying with legal obligations; and, where we ask for it, your consent, such as camera and
        microphone access, which you can withdraw at any time.
      </p>

      <h2 id="who-can-see-entries">4. Who can see your entries</h2>
      <p>
        <strong>No one else, by default.</strong> Blackbox has no feed, no public profiles and no sharing. Passing entries
        on to other people, described on our homepage as coming soon, is not available. If we build it, we&apos;ll update
        this policy first, and nothing will ever be passed on unless you set it up.
      </p>
      <div className={styles.callout}>
        <p>
          <strong>About our own access.</strong> Blackbox currently stores each video&apos;s encryption key on our servers,
          so you can play your entries back on any device. That means we are technically able to decrypt your entries.
          We will not access, watch or listen to them except:
        </p>
        <ul>
          <li>when you ask us to, for example to help fix a problem, and then only as much as needed; or</li>
          <li>when the law requires it, as described below.</li>
        </ul>
        <p>
          We don&apos;t screen or moderate private entries. End-to-end encryption, where only you hold the key and we
          couldn&apos;t decrypt your entries even if asked, is on our roadmap but not built. We&apos;ll update this policy
          when it is.
        </p>
      </div>
      <p>
        <strong>Legal requests.</strong> We disclose information only in response to valid legal process, such as a
        subpoena, court order or search warrant, or when we believe in good faith that it&apos;s necessary to prevent
        imminent death or serious physical harm. We disclose only what&apos;s required, and we tell you first unless the
        law or the emergency prevents it. If we become aware of apparent child sexual abuse material, US law requires us
        to report it to the National Center for Missing &amp; Exploited Children.
      </p>

      <h2 id="providers">5. Service providers we rely on</h2>
      <p>
        We don&apos;t sell your personal information or share it with anyone for advertising. We use a small number of
        service providers to run Blackbox. They handle information only on our behalf, to provide their service to us,
        and we choose providers whose terms require them to keep it secure and not use it for their own purposes.
      </p>
      <LegalTable
        head={['Provider', 'What they do for us', 'What they handle']}
        rows={[
          ['Amazon Web Services (S3)', 'Stores your video files', 'Your video files, already encrypted. The keys are stored separately, in our database.'],
          ['MongoDB Atlas', 'Our database', 'Account details, entry details including encryption keys, and security event records'],
          ['Render', 'Runs our server', 'Every request to our server, including your IP address, and server logs'],
          ['GitHub Pages', 'Hosts the Blackbox website', 'Your IP address and standard request details when you load the site'],
          [
            'Google',
            'Google Sign-In (only if you use it), and the fonts our website loads',
            'For sign-in, the exchange that confirms your Google identity. For fonts, your browser requests them from Google, which sees your IP address. Google handles this under its own privacy policy.',
          ],
          [
            'Have I Been Pwned',
            'Checks new passwords against known data breaches',
            'Only the first 5 characters of a one-way (SHA-1) hash of your password: never the password itself. The request comes from our server, so it doesn’t see your IP address or email.',
          ],
        ]}
      />
      <p>We may also disclose information:</p>
      <ul>
        <li>to comply with the law, as described in <a href="#who-can-see-entries">section 4</a>;</li>
        <li>to protect the rights, safety or security of you, other people, or Blackbox; or</li>
        <li>
          if Blackbox moves to a new operator, for example if it becomes a company. We&apos;ll tell you in advance, the new
          operator will be bound by this policy, and you can delete your account before the move.
        </li>
      </ul>

      <h2 id="retention">6. How long we keep information</h2>
      <LegalTable
        head={['Information', 'How long we keep it']}
        rows={[
          ['Account details', 'Until you delete your account'],
          [
            'Entries (video files, titles and keys)',
            'Until you delete the entry or your account. Deleting removes the video file and its record, including its key, straight away.',
          ],
          ['Sign-in sessions', 'Up to 30 days, or until you sign out'],
          ['Email verification and password reset links', '24 hours and 1 hour'],
          ['IP addresses used to limit repeated attempts', 'Up to 15 minutes, in memory only'],
          [
            'Security event records',
            '12 months, then deleted automatically. They’re kept even if you delete your account sooner, as the record that the deletion happened and to help investigate abuse. They never contain your entries.',
          ],
          ['Server logs', 'Kept by our hosting providers for a limited period, under their own retention settings'],
          ['Emails you send us', 'As long as needed to handle your request'],
        ]}
      />
      <p>
        Deleted information can remain in our providers&apos; backup systems for a limited period until those backups
        expire. We don&apos;t delete accounts for inactivity; if we ever start, we&apos;ll tell you well in advance. If
        Blackbox shuts down, we&apos;ll give you as much notice as we can, then delete all user data.
      </p>

      <h2 id="security">7. Security</h2>
      <ul>
        <li>Every connection to Blackbox uses HTTPS.</li>
        <li>Videos are encrypted in your browser with AES-256-GCM before upload, with a separate key for every video.</li>
        <li>Passwords are stored only as bcrypt hashes, and new passwords are checked against known breaches.</li>
        <li>Sign-in cookies can&apos;t be read by scripts on the page, and signing out ends the session on our server.</li>
        <li>Repeated sign-in and upload attempts are limited.</li>
      </ul>
      <p>
        No system is perfectly secure. Because we hold the keys (<a href="#who-can-see-entries">section 4</a>), someone
        who broke into both our database and our file storage could decrypt entries. If a breach affects your personal
        information, we&apos;ll notify you and the relevant authorities as the law requires.
      </p>

      <h2 id="your-rights">8. Your rights and choices</h2>
      <p>Wherever you live, you can:</p>
      <ul>
        <li>
          <strong>Get a copy</strong> of the information we hold about you, including your entries. Blackbox doesn&apos;t
          have a download button yet, so email us.
        </li>
        <li><strong>Correct it.</strong> Change your username and date of birth in Settings → Profile, or email us about anything else.</li>
        <li>
          <strong>Delete it.</strong> Delete individual entries in the app, or your whole account in Settings → Profile.
          Account deletion is immediate and permanent, and removes every entry.
        </li>
        <li>
          <strong>Withdraw permissions.</strong> Turn off camera and microphone access in your browser settings. If you
          signed up with Google, you can remove Blackbox&apos;s access in your Google Account settings. That doesn&apos;t
          delete your Blackbox account.
        </li>
      </ul>
      <p>
        If you&apos;re in the European Economic Area, the UK or Switzerland, you can also object to or restrict how we use
        your information, receive it in a portable format, and complain to your local data protection authority.
      </p>
      <p>
        <strong>How to make a request:</strong> email <ContactLink /> from the address on your account, with
        &ldquo;Privacy request&rdquo; in the subject. We confirm it&apos;s you, usually by replying to that address. We
        respond within 30 days. If we need longer, we&apos;ll tell you why, and never take longer than the law allows.
        It&apos;s free, and exercising your rights will never affect how Blackbox works for you.
      </p>
      <p>
        <strong>Appeals:</strong> if we turn down a request, you can appeal by replying with &ldquo;Appeal&rdquo; in the
        subject. We&apos;ll answer within 45 days and explain our decision. If you&apos;re still not satisfied, you can
        contact your state attorney general (in Washington, <a href="https://www.atg.wa.gov/file-complaint" target="_blank" rel="noopener noreferrer">atg.wa.gov</a>)
        or your local data protection authority.
      </p>
      <p>
        <strong>Do Not Track and Global Privacy Control:</strong> we don&apos;t track you across sites or sell or share
        your information for advertising, so there&apos;s nothing for these signals to switch off. We honour them anyway.
      </p>

      <h2 id="children">9. Children</h2>
      <p>
        Blackbox isn&apos;t for children under 13, and we don&apos;t knowingly collect personal information from them. We
        ask for your date of birth before an account is created, and we don&apos;t create accounts for anyone under 13.
        If we learn that we&apos;ve collected information from a child under 13, we&apos;ll delete it. If you&apos;re a
        parent or guardian and think your child has an account, contact us. People aged 13 to 17 need a parent or
        guardian&apos;s agreement to use Blackbox (see the <Link to="/terms">Terms of Service</Link>).
      </p>

      <h2 id="cookies">10. Cookies and browser storage</h2>
      <LegalTable
        head={['Cookie', 'Purpose', 'Lasts']}
        rows={[
          ['accessToken', 'Keeps you signed in', '15 minutes'],
          ['refreshToken', 'Renews your sign-in without asking for your password again', 'Up to 30 days'],
        ]}
      />
      <p>
        Both cookies are set by our own server, are strictly necessary for signing in, can&apos;t be read by scripts on
        the page, are sent only over secure connections, and are cleared when you sign out. We don&apos;t use advertising
        or analytics cookies, and Blackbox doesn&apos;t keep anything else in your browser&apos;s storage. If you use the
        Google sign-in button, Google may set its own cookies under Google&apos;s policies. Because everything we use is
        strictly necessary, we don&apos;t show a cookie banner.
      </p>

      <h2 id="international">11. International users</h2>
      <p>
        Blackbox is run from the United States, and our providers store and process information in the United States and
        possibly other countries. If you use Blackbox from outside the US, your information is transferred to and
        processed there, where data protection laws may differ from those where you live.
      </p>

      <h2 id="health-data">12. Washington consumer health data</h2>
      <p>
        What you say or show in your entries could reveal information about your health. Our{' '}
        <Link to="/health-data">Consumer Health Data Privacy Policy</Link> explains how we handle that and the rights
        Washington&apos;s My Health My Data Act gives you. It applies to everyone, not only Washington residents.
      </p>

      <h2 id="changes">13. Changes to this policy</h2>
      <p>
        We post every change here with a new effective date. If a change is material, for example a new use of your
        information or a new kind of provider that handles your entries, we&apos;ll tell you inside Blackbox before it
        takes effect and ask you to agree again before you can keep recording. Earlier versions are available on request.
      </p>

      <h2 id="contact">14. Contact</h2>
      <p>Questions, requests or complaints: <ContactLink />.</p>
    </LegalPage>
  );
}
