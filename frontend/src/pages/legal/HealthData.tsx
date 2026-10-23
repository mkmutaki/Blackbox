import { Link } from 'react-router-dom';
import { ContactLink, LegalPage, LegalTable } from './LegalPage';

// Washington's My Health My Data Act (RCW 19.373) requires a separate
// consumer health data privacy policy, linked prominently from the
// homepage. Video diaries can contain health information, and the Act's
// "biometric data" definition can reach face and voice recordings, so this
// is published even though Blackbox never asks for health data. The deletion
// commitment below includes backups; the operator has to be able to honour it.

export default function HealthData() {
  return (
    <LegalPage title="Consumer Health Data Privacy Policy">
      <p>
        Washington&apos;s My Health My Data Act gives people specific rights over &ldquo;consumer health data&rdquo;:
        information that is linked to you and identifies your past, present or future physical or mental health. This
        policy explains how that applies to Blackbox. It adds to our <Link to="/privacy">Privacy Policy</Link>, and we
        apply it to everyone, not only Washington residents.
      </p>

      <h2>Consumer health data we may collect</h2>
      <p>Blackbox never asks you for health information. But because it&apos;s a video diary, we may hold:</p>
      <ul>
        <li>
          <strong>Whatever you choose to say or show in an entry,</strong> which can include your physical or mental
          health, mood, conditions, medications or treatment.
        </li>
        <li><strong>The titles you give your entries,</strong> if they mention your health.</li>
        <li>
          <strong>Your video and voice recordings themselves,</strong> which Washington law may treat as biometric data.
          We don&apos;t extract face or voice identifiers or templates from them, and we don&apos;t analyze them in any way.
        </li>
      </ul>

      <h2>Where it comes from</h2>
      <p>Only from you, when you record or name an entry. We don&apos;t get health data from anyone else, and we don&apos;t infer it.</p>

      <h2>Why we collect it and how we use it</h2>
      <p>
        Only to store your entries and play them back to you, which is the service you asked for. We don&apos;t use it to
        infer anything about your health, for advertising, to train AI, or for anything else. We don&apos;t look at your
        entries except in the limited cases described in{' '}
        <Link to="/privacy#who-can-see-entries">section 4 of our Privacy Policy</Link>.
      </p>
      <p>
        If we ever want to collect or share consumer health data for any other purpose, we&apos;ll ask for your separate,
        explicit consent first. We don&apos;t sell consumer health data.
      </p>

      <h2>Sharing</h2>
      <p>
        We don&apos;t share consumer health data with third parties, and Blackbox has no affiliates. These service
        providers (&ldquo;processors&rdquo;) handle it only on our behalf and under contract, to run Blackbox:
      </p>
      <LegalTable
        head={['Processor', 'What they handle']}
        rows={[
          ['Amazon Web Services (S3)', 'Your encrypted video files'],
          ['MongoDB Atlas', 'Entry titles and the keys needed to decrypt your videos'],
          ['Render', 'Runs our server, which your entries pass through on their way to and from storage'],
        ]}
      />
      <p>
        We would disclose it to anyone else only if the law required it, as described in our{' '}
        <Link to="/privacy#who-can-see-entries">Privacy Policy</Link>.
      </p>

      <h2>Your rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li><strong>Confirm</strong> whether we collect, share or sell your consumer health data. (We collect it as described above. We don&apos;t share it except with our processors, and we never sell it.)</li>
        <li><strong>Access</strong> it, along with a list of every third party and processor we&apos;ve shared it with and how to contact them.</li>
        <li><strong>Withdraw consent</strong> you&apos;ve given us to collect or share it.</li>
        <li>
          <strong>Delete it.</strong> Delete entries in the app, or your whole account in Settings → Profile, or ask us by
          email. We delete it from our systems, including backups, and tell our processors to do the same.
        </li>
      </ul>
      <p>
        <strong>To make a request,</strong> email <ContactLink /> from the address on your account, with &ldquo;Health
        data request&rdquo; in the subject. We confirm it&apos;s you, then respond within 45 days. If we reasonably need
        longer, we can extend that once by up to 45 more days, and we&apos;ll tell you why.
      </p>
      <p>
        <strong>To appeal</strong> a decision, reply with &ldquo;Appeal&rdquo; in the subject. We&apos;ll respond in writing
        within 45 days, explaining what we did and why. If we deny your appeal, you can complain to the Washington State
        Attorney General at{' '}
        <a href="https://www.atg.wa.gov/file-complaint" target="_blank" rel="noopener noreferrer">atg.wa.gov/file-complaint</a>.
      </p>

      <h2>Contact</h2>
      <p>Questions about this policy: <ContactLink />.</p>
    </LegalPage>
  );
}
