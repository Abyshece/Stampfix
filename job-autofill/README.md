# Job Autofill (Chrome extension)

Enter your details once on the extension's own profile page. Then fill any job
application with one click or a keyboard shortcut. It works on Greenhouse, Lever,
Workday, LinkedIn Easy Apply, Ashby, company career sites, and plain forms. It
doesn't depend on one site's layout. It reads each field's label ("First name",
"Are you authorized to work in the US?", "How many years of Python?"), works out
what the field is asking, and fills it from your profile.

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
| Name, email, phone, address | First / last / full / preferred name, phone + country code, city, state, ZIP, country, "Location (City)" search boxes |
| Links | LinkedIn, GitHub, portfolio, website, X |
| Work eligibility | Authorized to work? Need sponsorship? Over 18? Willing to relocate? "Are you a U.S. citizen?" "Are you located in the US?" Worked here before? |
| Current job & preferences | Current company/title, total years of experience, salary, notice period, start date, "How did you hear about us?" |
| Work experience (list) | Job title, company, location, start/end month+year, "I currently work here", description. Several job blocks are filled in order |
| Education (list) | School, degree (matches "Bachelor's Degree", "B.S.", "BS"…), field of study, GPA, start/graduation dates |
| Skills | "How many years of experience with Python?" (from your "Python: 5" list), "Do you have experience with SQL?" → Yes, spoken languages |
| Summary & cover letter | Cover-letter boxes, "Additional information". `{company}` and `{role}` are replaced with the company name and job title |
| Saved answers | Your own answers to recurring questions like "Why do you want to work here?". They don't need to match word for word |
| Voluntary self-identification | Gender, race, Hispanic/Latino, veteran, disability, or "decline to answer" |
| Files | Resume and cover-letter files go into the matching upload fields |

It handles normal inputs, dropdowns, radio buttons, checkboxes, custom dropdowns
(React-Select, Workday-style, MUI), search-as-you-type boxes (Lever and Greenhouse
location, school pickers), date fields in any format (MM/YYYY, separate month/year
boxes, date pickers), number ranges ("3-5 years"), forms inside iframes, and shadow DOM.

It deliberately leaves alone: consent and "I agree" checkboxes, signatures,
passwords, CAPTCHAs, open-ended questions you haven't saved an answer for, and
questions about skills that aren't in your list. Those are outlined amber.

## Limits

- Some sites use unusual widgets it can't operate. Those fields stay amber for you.
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
                       LinkedIn, React, shadow-DOM/iframe pages (174 checks)
  real-sites.cjs       Fills live public application pages (never submits)
  pages/               The mock pages
```

Run the tests (needs Node and Playwright with Chromium):

```bash
cd job-autofill/test && npm install && node run-tests.cjs
```
