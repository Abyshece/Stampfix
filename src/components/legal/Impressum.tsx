import { LegalPage, LegalH2, Placeholder } from './LegalPage';

/**
 * Impressum / Legal Notice — legally required under § 5 DDG (German Digital
 * Services Act, successor to § 5 TMG) for a service made available to users in
 * Germany. Stampfix is operated by a Canadian company; the mandatory provider
 * details are disclosed here.
 *
 * PLACEHOLDERS to fill before launch:
 *  - Authorized representative (full legal name of the director representing
 *    the company)
 *  - Telephone number
 *  - Company register / registering authority
 *  - VAT identification number (USt-IdNr), if registered for EU VAT
 *  - Responsible-for-content person (§ 18 Abs. 2 MStV), if different
 *
 * Not legal advice — have counsel review before public launch.
 */
export function Impressum() {
  return (
    <LegalPage title="Impressum / Legal Notice" lastUpdated="24 June 2026">
      <p>
        Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz). / Information pursuant to § 5 of the
        German Digital Services Act (DDG).
      </p>

      <LegalH2>Diensteanbieter / Service provider</LegalH2>
      <p>
        17999658 Canada Inc., handelnd als (d/b/a) „Stampfix“<br />
        Rechtsform / Legal form: Corporation (Kanada / Canada)<br />
        28-16223 23A Ave<br />
        Surrey, BC V3Z 6P4<br />
        Kanada / Canada
      </p>

      <LegalH2>Vertreten durch / Represented by</LegalH2>
      <p>
        Abhishek Abhishek (Vertreter / Representative)<br />
        28-16223 23A Ave<br />
        Surrey, BC V3Z 6P4<br />
        Kanada / Canada<br />
        E-Mail: abyshece@gmail.com
      </p>

      <LegalH2>Kontakt / Contact</LegalH2>
      <p>
        E-Mail: hello@stampfix.app<br />
        Telefon / Phone: <Placeholder>phone number</Placeholder>
      </p>

      <LegalH2>Registereintrag / Company register</LegalH2>
      <p>
        Registernummer / Corporation number: 17999658<br />
        Registergericht / Registering authority:{' '}
        <Placeholder>e.g. Corporations Canada / BC Registries — confirm</Placeholder>
      </p>

      <LegalH2>Umsatzsteuer-ID / VAT ID</LegalH2>
      <p>
        Umsatzsteuer-Identifikationsnummer gemäß § 27 a UStG / VAT identification number:{' '}
        <Placeholder>USt-IdNr if registered — otherwise state “not VAT-registered”</Placeholder>
      </p>

      <LegalH2>Vertretung in der EU / EU representative (Art. 27 GDPR)</LegalH2>
      <p>
        Als außerhalb der EU ansässiges Unternehmen benennt Stampfix einen Vertreter in der Union
        gemäß Art. 27 DSGVO. / As a company established outside the EU, Stampfix appoints a
        representative in the Union under Article 27 GDPR. Details and contact are set out in our{' '}
        <a href="/privacy" className="underline">Privacy Policy</a>.
      </p>

      <LegalH2>Verantwortlich für den Inhalt / Responsible for content (§ 18 Abs. 2 MStV)</LegalH2>
      <p>
        <Placeholder>Responsible person — name &amp; address (may be the same as above)</Placeholder>
      </p>

      <LegalH2>EU-Streitschlichtung / EU dispute resolution</LegalH2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
        <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noreferrer" className="underline">
          https://ec.europa.eu/consumers/odr/
        </a>
        . Unsere E-Mail-Adresse finden Sie oben. Stampfix richtet sich primär an Unternehmen (B2B);
        wir sind weder verpflichtet noch bereit, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <LegalH2>Haftung für Inhalte / Liability for content</LegalH2>
      <p>
        Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach
        den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir jedoch nicht
        verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen. Bei
        Bekanntwerden von Rechtsverletzungen entfernen wir die betreffenden Inhalte umgehend.
      </p>

      <LegalH2>Haftung für Links / Liability for links</LegalH2>
      <p>
        Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
        Einfluss haben. Für diese fremden Inhalte ist stets der jeweilige Anbieter verantwortlich.
        Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.
      </p>

      <LegalH2>Urheberrecht / Copyright</LegalH2>
      <p>
        Die durch Stampfix erstellten Inhalte und Werke auf diesen Seiten unterliegen dem
        kanadischen und internationalen Urheberrecht. Beiträge Dritter sind als solche
        gekennzeichnet. Vervielfältigung, Bearbeitung oder Verbreitung außerhalb der Grenzen des
        Urheberrechts bedürfen unserer schriftlichen Zustimmung.
      </p>

      <p className="text-xs text-gray-400 pt-8 border-t notion-border mt-8">
        This document is a template provided for convenience and does not constitute legal advice.
        Have it reviewed by qualified counsel before relying on it.
      </p>
    </LegalPage>
  );
}
