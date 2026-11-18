/*
 * Fills real, public job application pages with a fake profile and reports
 * what was filled and what was left. It never submits anything, and no resume
 * is stored, so no file is uploaded.
 *
 *   node real-sites.cjs <url> [<url> ...]      (SHOTS=dir to save screenshots)
 *   node real-sites.cjs '<url>@@Apply now'     (click a button first to open the form)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT = path.resolve(__dirname, '../extension');
const SHOTS = process.env.SHOTS;
const urls = process.argv.slice(2);

const PROFILE = {
  firstName: 'Alex', lastName: 'Rivera', email: 'alex.rivera@example.com', phoneCountryCode: '+1', phone: '415-555-0134',
  address1: '500 Market St', city: 'San Francisco', state: 'CA', postalCode: '94105', country: 'United States',
  linkedin: 'https://linkedin.com/in/alexrivera-test', github: 'https://github.com/alexrivera-test', portfolio: 'https://alexrivera.dev',
  currentTitle: 'Data Engineer', currentCompany: 'Initech', yearsExperience: '7', howDidYouHear: 'LinkedIn', desiredSalary: '150000',
  availability: 'Two weeks after an offer', availableStartDate: '2027-01-11', willingToRelocate: 'Yes', workPreference: 'Hybrid',
  workAuthorized: 'Yes', requiresSponsorship: 'No', visaStatus: 'US Citizen', citizenship: 'United States', over18: 'Yes', previouslyEmployed: 'No',
  experience: [{ title: 'Data Engineer', company: 'Initech', location: 'San Francisco, CA', start: '2021-03', end: '', current: true, description: 'Built the data platform.' }],
  education: [{ school: 'University of California, Berkeley', degree: 'Bachelor of Science', field: 'Computer Science', start: '2014-08', end: '2018-05', gpa: '3.7' }],
  skills: 'Python, SQL, dbt, Airflow', skillYears: 'Python: 6\nSQL: 4',
  coverLetter: 'Dear {company} team, I am excited to apply for the {role} position.',
  customAnswers: [{ question: 'Why do you want to work here? | Why are you interested in this role?', answer: 'I love what {company} is building.' }],
  gender: 'Decline to answer', hispanicLatino: 'Decline to answer', race: 'Decline to answer', veteran: 'I am not a protected veteran', disability: 'Decline to answer',
};

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'jaf-real-')), {
    headless: true, channel: 'chromium', proxy, viewport: { width: 1280, height: 1000 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await sw.evaluate(async (p) => { await chrome.storage.local.clear(); await chrome.storage.local.set({ profile: p }); }, PROFILE);
  const page = await ctx.newPage();

  for (const [i, arg] of urls.entries()) {
    // "url@@Apply now" = click the "Apply now" button first (like you would) to open the form.
    const [url, clickText] = arg.split('@@');
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      if (clickText) {
        await page.getByRole('button', { name: /accept all|allow all|alle akzeptieren|alles akzeptieren|alle zulassen|akzeptieren|zustimmen|accept|agree|reject non-essential/i }).first().click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(500);
        const re = new RegExp(clickText, 'i');
        const target = page.getByRole('button', { name: re }).or(page.getByRole('link', { name: re })).first();
        await target.click({ timeout: 8000 }).catch(() => target.click({ timeout: 4000, force: true })).catch((e) => console.log('could not click', clickText, e.message.split('\n')[0]));
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
      await page.bringToFront();
      const t0 = Date.now();
      const r = await sw.evaluate(async (u) => {
        const tabs = await chrome.tabs.query({});
        const t = tabs.find((x) => x.url === u) || tabs.find((x) => x.active);
        return self.fillTab(t.id, {});
      }, page.url());
      console.log(`\n=== ${url}\n${r.fields} fields · ${r.filled.length} filled · ${r.kept} kept · ${r.review.length} left · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      for (const f of r.filled) console.log('  ✓ ' + f);
      for (const f of r.review) console.log('  · ' + f.label + (f.required ? '  (required)' : ''));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `real-${i + 1}.png`), fullPage: true });
    } catch (e) {
      console.log(`\n=== ${url}\nERROR ${e.message}`);
    }
  }
  await ctx.close();
})();
