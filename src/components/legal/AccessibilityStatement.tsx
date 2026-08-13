import { LegalPage, LegalH2 } from './LegalPage';

export function AccessibilityStatement() {
  return (
    <LegalPage title="Accessibility Statement" lastUpdated="12 August 2026">
      <p>
        <em>Barrierefreiheitserklärung.</em> Stampfix (operated by 17999658 Canada Inc.) is committed to
        making its digital loyalty service usable by as many people as possible, including people with
        disabilities. This statement describes how accessible our consumer-facing service is and how to
        contact us about barriers.
      </p>

      <LegalH2>1. Standard we aim for</LegalH2>
      <p>
        We work towards conformance with the <strong>Web Content Accessibility Guidelines (WCAG) 2.1,
        Level AA</strong> and the harmonised European standard <strong>EN 301 549</strong>, which
        underpin the German Accessibility Act (<em>Barrierefreiheitsstärkungsgesetz, BFSG</em>) and the
        European Accessibility Act.
      </p>

      <LegalH2>2. Conformance status</LegalH2>
      <p>
        The consumer-facing parts of Stampfix (signing up for a card, adding it to a mobile wallet, and
        viewing or recovering a card) are <strong>partially conformant</strong> with WCAG 2.1 AA:
        most content meets the standard, and we are actively improving the remaining areas. Some parts
        of the service &mdash; in particular the merchant dashboard used by businesses &mdash; have not
        yet been fully assessed.
      </p>

      <LegalH2>3. What we have done</LegalH2>
      <ul className="list-disc pl-6 space-y-1 text-gray-600">
        <li>Form fields on the sign-up and card screens have programmatically associated labels.</li>
        <li>Text and loyalty-card colours meet the AA contrast minimum (4.5:1 for text, 3:1 for graphics).</li>
        <li>Interactive controls (buttons, links, the phone field) have accessible names and visible focus.</li>
        <li>The service is operable with a keyboard, and decorative graphics are hidden from assistive technology.</li>
        <li>The page language is set, and we self-host our fonts (no reliance on third-party font services).</li>
      </ul>

      <LegalH2>4. Known limitations</LegalH2>
      <p>Despite our efforts, some content may not yet be fully accessible:</p>
      <ul className="list-disc pl-6 space-y-1 text-gray-600">
        <li>The merchant dashboard and some complex interactive components are still being reviewed.</li>
        <li>
          Mobile-wallet passes are rendered by <strong>Apple Wallet</strong> and <strong>Google
          Wallet</strong>; their accessibility is controlled by Apple and Google, not by Stampfix.
        </li>
        <li>Content supplied by individual merchants (e.g. business names, offer text) is outside our control.</li>
      </ul>
      <p>We are working to address these, and this statement will be updated as we make progress.</p>

      <LegalH2>5. Feedback &mdash; report a barrier</LegalH2>
      <p>
        If you encounter an accessibility barrier, or need information from Stampfix in an accessible
        format, please tell us &mdash; we want to fix it:
      </p>
      <ul className="list-disc pl-6 space-y-1 text-gray-600">
        <li>Email: <a href="mailto:hello@stampfix.app" className="underline">hello@stampfix.app</a></li>
        <li>Please describe the problem, the page or feature, and the device/browser you were using.</li>
      </ul>
      <p>
        We aim to acknowledge accessibility feedback within a few business days and to resolve valid
        issues as quickly as we reasonably can. Postal contact details are in our{' '}
        <a href="/impressum" className="underline">Impressum</a>.
      </p>

      <LegalH2>6. Enforcement (Germany)</LegalH2>
      <p>
        If you are not satisfied with our response, you can contact the market-surveillance authority
        responsible for the accessibility of products and services in Germany &mdash; the{' '}
        <strong>Marktüberwachungsstelle der Länder für die Barrierefreiheit von Produkten und
        Dienstleistungen (MLBF)</strong>.
      </p>

      <LegalH2>7. About this statement</LegalH2>
      <p>
        This statement was prepared on the date shown above based on a self-assessment and a review of
        our consumer-facing screens. It is reviewed periodically and whenever we make significant
        changes to the service.
      </p>
    </LegalPage>
  );
}
