# Job Autofill (Chrome extension)

Enter your details once on the extension's own profile page. Then fill any job
application with one click or a keyboard shortcut. There's no per-site code: it
reads each field's label ("First name", "Vorname", "Are you authorized to work in
the US?", "Wie hast Du von uns erfahren?", "How many years of Python?"), works out
what the field is asking, and fills it from your profile. It understands
**English and German** forms.

It **never submits** anything. Fields it fills get a green outline, fields it
leaves for you get an amber outline, and you review before you send.

Your data stays in your browser (`chrome.storage.local`). The extension makes no
network requests of its own.

## Install (Chrome on Mac or Windows)

1. Download this `extension` folder, or unzip `job-autofill-extension.zip`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `extension` folder (the one containing `manifest.json`).
5. Your profile page opens. Fill it in; it saves as you type.
6. Pin the extension: click the puzzle-piece icon in the toolbar, then the pin next to **Job Autofill**.

To change the shortcut, open `chrome://extensions/shortcuts`. The default is **Alt+Shift+F** (Option+Shift+F on a Mac).

## Use it

1. Open a job application form. On LinkedIn, click **Easy Apply** first.
2. Click the Job Autofill icon, then **Autofill this page**, or press the shortcut.
3. Check the form. **Green** = filled. **Amber** = left for you. The popup lists the amber fields.
4. Multi-page forms (Workday, LinkedIn Easy Apply): press it again on each page. On Workday, click
   **Add** under Work Experience / Education once per job or school first, then press it again.

Running it twice is safe. It only fills empty fields, unless you tick **Replace answers already in the form**.

## What it fills

| From your profile | Examples of what it answers |
|---|---|
| Name, email, phone, address | Salutation (Herr/Frau/Divers), academic title, first / last / full / preferred name, date and place of birth, marital status, phone + country code, street, "PLZ / Ort", city, state, ZIP, country, nationality, "Location (City)" search boxes |
| Links | LinkedIn, XING, GitHub, portfolio, website, X |
| Work eligibility | Authorized to work? Need sponsorship? Over 18? Willing to relocate? "Are you a U.S. citizen?" "Are you located in the US?" Worked here before? |
| Current job & preferences | Current company/title, total years of experience, salary (Gehaltsvorstellung), notice period (Kündigungsfrist), employment type (Vollzeit/Teilzeit/Werkstudent), hours per week, preferred location, willingness to travel (Reisebereitschaft), "How did you hear about us?", "Referred by" |
| Work experience (list) | Job title, company, location, start/end month+year, "I currently work here", description. Several job blocks are filled in order |
| Education (list) | School, degree (matches "Bachelor's Degree", "B.S.", "BS"…), field of study, GPA, start/graduation dates |
| Skills & languages | "How many years of experience with Python?" (from your "Python: 5" list), "Do you have experience with SQL?" → Yes, German / English level (matched to "Muttersprache", "verhandlungssicher", "C1"…), spoken languages |
| Summary & cover letter | Cover-letter boxes, "Additional information". `{company}` and `{role}` are replaced with the company name and job title |
| Saved answers | Your own answers to recurring questions like "Why do you want to work here?". They don't need to match word for word |
| Voluntary self-identification | Gender, race, Hispanic/Latino, veteran, disability, or "decline to answer" |
| Files | Only an optional photo (Bewerbungsfoto). Resume, cover letter and certificates differ per company, so you attach them yourself; their upload fields are outlined amber and listed in the popup |

It handles normal inputs, dropdowns, radio buttons, checkboxes, custom dropdowns
(React-Select, Workday-style, MUI), search-as-you-type boxes (Lever and Greenhouse
location, school pickers), date fields in any format (MM/YYYY, separate month/year
boxes, date pickers), number ranges ("3-5 years"), forms inside iframes, and shadow DOM.

Standard answers (all changeable on the profile page):

- "How did you hear about us?" / "aufmerksam geworden durch" → **Google** (picks the closest option, e.g. "Google-Schlagwortsuche").
- "Anything else you'd like to tell us?" / "Möchten Sie uns sonst noch etwas mitteilen?" → **"Nein"** on German forms, "No" on English ones.
- Privacy-notice / Datenschutz checkboxes → **ticked**. Newsletter, SMS, talent-pool and future-job boxes stay unticked.
- Start date (Frühester Arbeitsbeginn, Eintrittstermin, "When can you start?") → your **estimated start date**: a fixed
  date while it's still in the future, otherwise N weeks / months after the day you apply (months rounded up to the 1st).
  Leave both empty to fill start dates yourself.

It deliberately leaves for you (outlined amber): resume / cover letter / certificate
uploads (these change per company), "I agree to the terms" and "I certify" boxes, cookie banners,
signatures, passwords, CAPTCHAs, open-ended questions you haven't saved an answer
for, questions about skills that aren't in your list, **reference and emergency-contact
sections** (those are someone else's details), and questions on steps or cards you
can't see yet. Those are outlined amber or left for the next press.

## Tested on live application forms

Filled with a fake profile, never submitted, no files uploaded:

| Platform | Result |
|---|---|
| Greenhouse (Discord, Figma) | 16–22 fields filled per form; left: consent, optional identity questions, resume |
| Lever (Palantir) | 15 filled, incl. location search box, citizenship and language checkboxes |
| Ashby (Linear, Ramp) | Name, email, links, country filled; the rest are essay questions |
| Personio (ottonova EN, thermondo DE) | 8 of 10 and 5 of 6 filled; German labels understood |
| P&I LOGA (Helios) | 11 filled: Anrede, names, both e-mails, phone, city, salary, source (Google), "Nein", Datenschutz ticked; left for you: uploads, start date, title |
| Recruitee (bunq) | Personal fields, salary, "worked here before"; rest are essay questions |
| Teamtailor | 7 filled |
| Rippling | 11 filled incl. EEO dropdowns |
| Jobvite | 8 filled incl. full address |
| Breezy HR | Name, email, phone, summary, cover letter |
| Gem | 6 filled |
| Manatal | 4 filled |
| Homerun (Dutch form) | 6 filled |
| softgarden, JOIN | First step of their multi-step forms filled |
| Google Forms, Jotform | Personal fields, combined "Email and Phone", address, employment questions |

Could not be tested from a cloud server: SmartRecruiters, Workable and Odoo block
automated browsers; Workday, SuccessFactors, Taleo, iCIMS, Oracle, Avature and other
enterprise systems need an account before the form appears. They use the same kinds
of fields, so they should work in your own browser once you're on the form.

## Limits

- Some sites use unusual widgets it can't operate. Those fields stay amber for you.
- Labels in languages other than English and German are only partly understood.
- Several platforms on recruiter-side tools (Metaview, hireEZ, SeekOut, Beamery…) have no candidate form at all.
- Workday's date boxes and "Add" buttons can need a manual touch.
- It can't log in for you or click Next/Submit. That's intentional.

## Files

```
extension/
  manifest.json        Chrome extension manifest (MV3)
  background.js        Runs the filler in every frame of the tab, shows the summary
  content/filler.js    Finds fields, works out what they ask, fills them
  options/             The profile page (your form)
  popup/               The toolbar popup with the Autofill button
  icons/
test/
  run-tests.cjs        End-to-end tests against mock Greenhouse, Lever, Workday,
                       LinkedIn, React, Google Forms, German, card-style and
                       shadow-DOM/iframe and P&I LOGA-style pages (249 checks)
  real-sites.cjs       Fills live public application pages (never submits)
  pages/               The mock pages
```

Run the tests (needs Node and Playwright with Chromium):

```bash
cd job-autofill/test && npm install && node run-tests.cjs
```
