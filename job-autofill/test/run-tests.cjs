/*
 * End-to-end tests: loads the unpacked extension into Chromium, stores a test
 * profile, opens mock application pages (Greenhouse, Lever, Workday, LinkedIn
 * Easy Apply, a React app, and a generic form with shadow DOM + a cross-origin
 * iframe), runs the same fill the toolbar button runs, and checks each field.
 *
 *   cd job-autofill/test && npm install && node run-tests.cjs
 *
 * Set SHOTS=dir to save screenshots.
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT = path.resolve(__dirname, '../extension');
const PAGES = path.join(__dirname, 'pages');
const SHOTS = process.env.SHOTS;
const VENDOR = {
  '/vendor/react.js': 'node_modules/react/umd/react.production.min.js',
  '/vendor/react-dom.js': 'node_modules/react-dom/umd/react-dom.production.min.js',
};

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

const PROFILE = {
  salutation: 'Mr', academicTitle: '', dateOfBirth: '1994-04-12', xing: 'https://www.xing.com/profile/Alex_Rivera',
  placeOfBirth: 'Boston', maritalStatus: 'Single', germanLevel: 'B2', englishLevel: 'Native', employmentType: 'Full-time', willingToTravel: 'Yes', weeklyHours: '40',
  firstName: 'Alex', lastName: 'Rivera', middleName: '', preferredName: '', pronouns: '',
  email: 'alex.rivera@example.com', phoneCountryCode: '+1', phone: '415-555-0134',
  address1: '500 Market St', address2: 'Apt 4', city: 'San Francisco', state: 'CA', postalCode: '94105', country: 'United States',
  linkedin: 'linkedin.com/in/alexrivera-test', github: 'https://github.com/alexrivera-test', portfolio: 'https://alexrivera.dev', website: '', twitter: '',
  currentTitle: 'Data Engineer', currentCompany: 'Initech', yearsExperience: '7', howDidYouHear: 'LinkedIn',
  desiredSalary: '150000', currentSalary: '', noticePeriod: '2 weeks', availability: 'Two weeks after an offer', availableStartDate: '2027-01-11',
  workPreference: 'Hybrid', willingToRelocate: 'Yes',
  workAuthorized: 'Yes', requiresSponsorship: 'No', visaStatus: 'US Citizen', citizenship: 'United States', over18: 'Yes',
  driversLicense: 'Yes', securityClearance: 'None', previouslyEmployed: 'No',
  experience: [
    { title: 'Data Engineer', company: 'Initech', location: 'San Francisco, CA', start: '2021-03', end: '', current: true, description: 'Built the batch and streaming data platform.' },
    { title: 'Analytics Engineer', company: 'Hooli', location: 'Palo Alto, CA', start: '2018-06', end: '2021-02', current: false, description: 'Owned dbt models and dashboards.' },
  ],
  education: [{ school: 'University of California, Berkeley', degree: 'Bachelor of Science', field: 'Computer Science', start: '2014-08', end: '2018-05', gpa: '3.7' }],
  skills: 'Python, SQL, dbt, Airflow, React', skillYears: 'Python: 6\nSQL: 4\nReact: 3', languages: 'English (native), Spanish (conversational)',
  summary: 'Data engineer with 7 years of experience.',
  coverLetter: 'Dear {company} team,\n\nI am excited to apply for the {role} position.',
  customAnswers: [{ question: 'Why do you want to work here? | Why are you interested in this role?', answer: 'I love what {company} is building.' }],
  gender: 'Decline to answer', transgender: '', sexualOrientation: '', hispanicLatino: 'No', race: 'Asian',
  veteran: 'I am not a protected veteran', disability: "No, I don't have a disability",
};

const RESUME = { name: 'Alex_Rivera_Resume.pdf', type: 'application/pdf', size: PDF.length, dataUrl: 'data:application/pdf;base64,' + PDF.toString('base64') };

/* ---------- tiny static server ---------- */
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const f = VENDOR[u.pathname] ? path.join(__dirname, VENDOR[u.pathname]) : path.join(PAGES, path.normalize(u.pathname));
      if (!f.startsWith(__dirname) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, () => resolve(srv));
  });
}

/* ---------- reading values back ---------- */
async function val(target, sel) {
  return target.evaluate((sel) => {
    let el;
    if (sel.includes('>>>')) {
      const [host, inner] = sel.split('>>>').map((s) => s.trim());
      el = document.querySelector(host).shadowRoot.querySelector(inner);
    } else el = document.querySelector(sel);
    if (!el) return '<missing>';
    if (el.tagName === 'SELECT') return el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : '';
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    if (el.type === 'file') return el.files[0] ? el.files[0].name : '';
    if (el.tagName === 'BUTTON' || el.tagName === 'SPAN' || el.tagName === 'PRE') return el.textContent;
    return el.value;
  }, sel);
}

let failures = 0;
let passes = 0;
function check(page, label, got, want) {
  const ok = typeof want === 'function' ? want(got) : got === want;
  if (ok) passes++;
  else { failures++; console.log(`  ✗ [${page}] ${label}: got ${JSON.stringify(got)}, want ${typeof want === 'function' ? want.toString() : JSON.stringify(want)}`); }
}
async function expectAll(name, target, table) {
  for (const [sel, want] of table) check(name, sel, await val(target, sel), want);
}

/* ---------- main ---------- */
(async () => {
  const srv = await serve();
  const port = srv.address().port;
  const base = `http://localhost:${port}`;
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaf-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    headless: true,
    channel: 'chromium',
    viewport: { width: 1200, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];

  await sw.evaluate(async ({ p, r, c }) => { await chrome.storage.local.clear(); await chrome.storage.local.set({ profile: p, file_resume: r, file_certificates: c }); },
    { p: PROFILE, r: RESUME, c: { ...RESUME, name: 'Zeugnisse.pdf' } });

  const page = await ctx.newPage();
  async function open(file) {
    await page.goto(`${base}/${file}`);
    await page.waitForLoadState('load');
    await page.waitForTimeout(150);
  }
  async function fill(opts = {}) {
    await page.bringToFront();
    return sw.evaluate(async ({ url, opts }) => {
      const tabs = await chrome.tabs.query({});
      const t = tabs.find((x) => x.url === url);
      return self.fillTab(t.id, opts);
    }, { url: page.url(), opts });
  }
  function report(name, r) {
    console.log(`\n${name}: ${r.filled.length} filled, ${r.kept} kept, ${r.review.length} for review (${r.fields} fields)`);
    for (const x of r.review) console.log(`    · review: ${x.label}${x.required ? ' (required)' : ''}`);
  }
  const shot = async (name) => SHOTS && page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true });

  /* Greenhouse (classic) */
  await open('greenhouse.html');
  let r = await fill();
  report('Greenhouse', r);
  await expectAll('greenhouse', page, [
    ['#first_name', 'Alex'], ['#last_name', 'Rivera'], ['#email', 'alex.rivera@example.com'], ['#phone', '415-555-0134'],
    ['#job_application_location', 'San Francisco, CA'], ['#resume_file', ''], ['#cover_file', ''],
    ['#education_school_name_0', 'University of California, Berkeley'], ['#education_degree_0', "Bachelor's Degree"],
    ['#education_discipline_0', 'Computer Science'], ['#edu_start_month', '08'], ['#edu_start_year', '2014'],
    ['#edu_end_month', '05'], ['#edu_end_year', '2018'],
    ['#q_linkedin', 'https://linkedin.com/in/alexrivera-test'], ['#q_website', 'https://alexrivera.dev'],
    ['#q_auth', 'Yes'], ['#q_sponsor', 'No'], ['#q_why', 'I love what Acme Robotics is building.'], ['#q_robot', ''],
    ['#q_hear', 'LinkedIn'], ['#gender', 'Decline To Self Identify'], ['#hispanic', 'No'], ['#race', 'Asian'],
    ['#veteran', 'I am not a protected veteran'], ['#disability', 'No, I do not have a disability and have not had one in the past'],
    ['#consent', true],
  ]);
  check('greenhouse', 'review lists favourite robot', r.review.some((x) => /robot/i.test(x.label)), true);
  check('greenhouse', 'privacy box ticked, not listed', r.review.some((x) => /privacy/i.test(x.label)), false);
  check('greenhouse', 'resume left for you to attach', r.review.some((x) => /resume/i.test(x.label) && /attach your file/.test(x.label)), true);
  await shot('greenhouse');

  /* Lever */
  await open('lever.html');
  r = await fill();
  report('Lever', r);
  await expectAll('lever', page, [
    ['#resume-upload-input', ''], ['#lv_name', 'Alex Rivera'], ['#lv_email', 'alex.rivera@example.com'],
    ['#lv_phone', '415-555-0134'], ['#lv_location', 'San Francisco, CA'], ['#lv_org', 'Initech'],
    ['#lv_li', 'https://linkedin.com/in/alexrivera-test'], ['#lv_gh', 'https://github.com/alexrivera-test'], ['#lv_pf', 'https://alexrivera.dev'],
    ['#lv_rel_yes', true], ['#lv_sql', '2-4'], ['#lv_py_yes', true],
    ['#lv_comments', (v) => v.startsWith('Dear ') && v.includes('position')],
    ['#lv_gender', 'Decline to self-identify'], ['#lv_race', 'Asian (Not Hispanic or Latino)'], ['#lv_vet', 'I am not a veteran'],
  ]);

  /* Workday */
  await open('workday.html');
  r = await fill();
  report('Workday', r);
  await expectAll('workday', page, [
    ['#src', 'LinkedIn'], ['#pw-no', true], ['#country', 'United States of America'],
    ['#wd-fn', 'Alex'], ['#wd-ln', 'Rivera'], ['#wd-a1', '500 Market St'], ['#wd-city', 'San Francisco'], ['#wd-state', 'California'],
    ['#wd-zip', '94105'], ['#wd-email', 'alex.rivera@example.com'], ['#wd-ptype', 'Select One'],
    ['#wd-pcc-chosen', 'United States of America (+1)'], ['#wd-phone', '415-555-0134'],
    ['#we1-title', 'Data Engineer'], ['#we1-co', 'Initech'], ['#we1-loc', 'San Francisco, CA'], ['#we1-cur', true],
    ['#we1-sm', '03'], ['#we1-sy', '2021'], ['#we1-em', ''], ['#we1-ey', ''], ['#we1-desc', 'Built the batch and streaming data platform.'],
    ['#we2-title', 'Analytics Engineer'], ['#we2-co', 'Hooli'], ['#we2-loc', 'Palo Alto, CA'], ['#we2-cur', false],
    ['#we2-sm', '06'], ['#we2-sy', '2018'], ['#we2-em', '02'], ['#we2-ey', '2021'],
    ['#ed-school', 'University of California, Berkeley'], ['#ed-degree', "Bachelor's Degree"], ['#ed-field', 'Computer Science'],
    ['#ed-gpa', '3.7'], ['#ed-from', '2014'], ['#ed-to', '2018'], ['#wd-li', 'https://linkedin.com/in/alexrivera-test'],
    ['#q1y', true], ['#q2', 'No'], ['#q3', ''],
    ['#vd-gender', 'I do not wish to answer'], ['#vd-eth', 'Asian (United States of America)'], ['#vd-vet', 'I am not a veteran'],
    ['#vd-terms', false],
  ]);
  await shot('workday');

  /* LinkedIn Easy Apply */
  await open('linkedin.html');
  r = await fill();
  report('LinkedIn', r);
  await expectAll('linkedin', page, [
    ['#bg-search', ''], ['#single-line-text-form-component-formElement-urn-li-jsonMember-firstName-123', 'Alexander'], ['#ln-input', 'Rivera'],
    ['#text-entity-list-form-component-email', 'alex.rivera@example.com'], ['#text-entity-list-form-component-phoneCountryCode', 'United States (+1)'],
    ['#single-line-text-form-component-phoneNumber-nationalNumber', '415-555-0134'], ['#li-city-chosen', 'San Francisco, California, United States'],
    ['#jobs-document-upload-file-input-upload-resume', ''],
    ['#y-python', '6'], ['#y-k8s', ''], ['#y-total', '7'], ['#sql-y', true], ['#auth-y', true], ['#sp', 'No'],
    ['#cm-y', false], ['#cm-n', false], ['#sal', '150000'],
  ]);
  check('linkedin', 'kept the pre-filled first name', r.kept >= 1, true);
  check('linkedin', 'Kubernetes question left for review', r.review.some((x) => /kubernetes/i.test(x.label)), true);
  await shot('linkedin');

  /* React */
  await open('react.html');
  r = await fill();
  report('React', r);
  const st = JSON.parse(await val(page, '#state'));
  const wantState = {
    first_name: 'Alex', last_name: 'Rivera', email: 'alex.rivera@example.com', phone: '415-555-0134',
    linkedin: 'https://linkedin.com/in/alexrivera-test', country: 'United States', sponsorship: 'No', years: '6-9', relocate: 'Yes',
    school: 'University of California, Berkeley', degree: "Bachelor's Degree", gender: 'Decline To Self Identify',
  };
  for (const [k, v] of Object.entries(wantState)) check('react', 'state.' + k, st[k], v);

  /* Generic + shadow DOM + cross-origin iframe */
  await open('generic.html');
  await page.waitForTimeout(400);
  r = await fill();
  report('Generic', r);
  await expectAll('generic', page, [
    ['#shadow-email >>> #inner', 'alex.rivera@example.com'], ['#g-phone', '000-000'], ['#g-zip', '94105'],
    ['#g-country', 'United States of America'], ['#g-state', 'CA'], ['#g-start', ''], ['#g-salary', '150000'],
    ['#g-years', '6-10 years'], ['#adult-y', true], ['#g-why', 'I love what Northwind Labs is building.'],
    ['#g-cover', 'Dear Northwind Labs team,\n\nI am excited to apply for the Product Analyst position.'], ['#g-odd', ''],
    ['#j0-emp', 'Initech'], ['#j0-title', 'Data Engineer'], ['#j0-start', '03/2021'], ['#j0-end', ''],
    ['#j1-emp', 'Hooli'], ['#j1-title', 'Analytics Engineer'], ['#j1-start', '06/2018'], ['#j1-end', '02/2021'],
    ['#e-uni', 'University of California, Berkeley'], ['#e-deg', 'B.S.'], ['#e-grad', '2018-05'],
    ['#hp1', ''], ['#hp2', ''], ['#g-terms', false],
  ]);
  const frame = page.frames().find((f) => f.url().includes('frame.html'));
  await expectAll('generic-iframe', frame, [['#f-first', 'Alex'], ['#f-last', 'Rivera'], ['#f-mail', 'alex.rivera@example.com']]);
  check('generic', 'toast shown', await page.evaluate(() => !!document.getElementById('__jaf_toast')), true);
  await shot('generic');

  // Overwrite mode replaces the pre-filled phone.
  r = await fill({ overwrite: true });
  check('generic', 'overwrite replaces phone', await val(page, '#g-phone'), '415-555-0134');

  /* Search-style location box, citizenship / location questions, multi-select checkboxes */
  await open('extras.html');
  r = await fill();
  report('Extras', r);
  await expectAll('extras', page, [
    ['#x-loc', 'San Francisco, CA, USA'], ['#sg-n', true], ['#sg-y', false], ['#usc-y', true], ['#x-inus', 'Yes'],
    ['#l-en', true], ['#l-es', true], ['#l-fr', false], ['#x-pron', ''], ['#x-heard', 'LinkedIn'],
    ['#x-where', 'San Francisco, CA'], ['#x-join', 'I love what Northwind is building.'],
  ]);
  check('extras', 'location picked from the list', await page.evaluate(() => document.getElementById('x-loc').dataset.picked), '1');

  /* Google Forms-style ARIA widgets */
  await open('gforms.html');
  r = await fill();
  report('Google Forms style', r);
  const aria = (id) => page.evaluate((id) => { const el = document.getElementById(id); return el.getAttribute('role') === 'listbox' ? el.dataset.value || '' : el.getAttribute('aria-checked') === 'true'; }, id);
  check('gforms', 'full name', await val(page, '#gf-name'), 'Alex Rivera');
  check('gforms', 'email and phone', await val(page, '#gf-contact'), 'alex.rivera@example.com, +1 415-555-0134');
  check('gforms', 'country dropdown', await aria('gf-country'), 'United States');
  check('gforms', 'authorized radio', await aria('gf-auth-y'), true);
  check('gforms', 'english checked', await aria('gf-l-en'), true);
  check('gforms', 'spanish checked', await aria('gf-l-es'), true);
  check('gforms', 'german not checked', await aria('gf-l-de'), false);
  check('gforms', 'days left alone', (await aria('gf-mon')) || (await aria('gf-tue')), false);
  check('gforms', 'education dropdown', await aria('gf-edu'), "Bachelor's degree");
  check('gforms', 'terms left alone', await aria('gf-terms'), false);

  /* German form (Personio / softgarden style) */
  await open('de-form.html');
  r = await fill();
  report('German form', r);
  await expectAll('german', page, [
    ['#d-anrede', 'Herr'], ['#d-titel', ''], ['#d-vorname', 'Alex'], ['#d-nachname', 'Rivera'], ['#d-mail', 'alex.rivera@example.com'],
    ['#d-tel', '415-555-0134'], ['#d-geb', '12.04.1994'], ['#d-str', '500 Market St'], ['#d-plzort', '94105 San Francisco'],
    ['#d-land', 'Vereinigte Staaten'], ['#d-staat', 'United States'], ['#d-xing', 'https://www.xing.com/profile/Alex_Rivera'],
    ['#d-li', 'https://linkedin.com/in/alexrivera-test'], ['#d-gehalt', '150000'], ['#d-kf', '2 weeks'], ['#d-eintritt', ''],
    ['#d-quelle', 'LinkedIn'], ['#d-visum-nein', true], ['#d-fs-ja', true], ['#d-sprachen', 'English (native), Spanish (conversational)'],
    ['#d-jahre', '7'], ['#d-ag', 'Initech'], ['#d-pos', 'Data Engineer'], ['#d-von', '03.2021'], ['#d-bis', ''],
    ['#d-hs', 'University of California, Berkeley'], ['#d-abschluss', 'Bachelor'], ['#d-studiengang', 'Computer Science'],
    ['#d-cv', ''], ['#d-anschreiben', ''], ['#d-zeugnisse', ''], ['#d-foto', ''], ['#d-dsgvo', true], ['#d-pool', false], ['#d-news', false], ['#d-sonst', 'Nein'],
    ['#d-gebort', 'Boston'], ['#d-fam', 'ledig'], ['#d-de', 'Gut (B1/B2)'], ['#d-en', 'Muttersprache'], ['#d-art', 'Vollzeit'], ['#d-reise-ja', true],
  ]);

  /* Card-style form: questions on hidden cards are not touched; a references block is never filled with your details */
  await open('cards.html');
  r = await fill();
  report('Card form', r);
  await expectAll('cards', page, [['#c-first', 'Alex'], ['#c-email-hidden', ''], ['#c-city', 'San Francisco'], ['#c-slid', ''], ['#r-name', ''], ['#r-email', ''], ['#r-phone', '']]);

  /* P&I LOGA style (Helios): aria-hidden app, div options, text-box date picker */
  await open('loga.html');
  await sw.evaluate(async () => { const { profile } = await chrome.storage.local.get('profile'); profile.howDidYouHear = ''; await chrome.storage.local.set({ profile }); });
  r = await fill();
  await sw.evaluate(async () => { const { profile } = await chrome.storage.local.get('profile'); profile.howDidYouHear = 'LinkedIn'; await chrome.storage.local.set({ profile }); });
  report('LOGA style', r);
  await expectAll('loga', page, [['#l-anrede', 'Herr'], ['#l-vorname', 'Alex'], ['#l-nachname', 'Rivera'], ['#l-mail2', 'alex.rivera@example.com'],
    ['#l-start', ''], ['#l-zeugnis', ''], ['#l-quelle', 'Google-Schlagwortsuche'], ['#l-sonst', 'Nein'], ['#l-dsgvo', true]]);
  check('loga', 'start date left for you', r.review.some((x) => /arbeitsbeginn/i.test(x.label)), true);

  /* Running again is harmless: nothing is changed. */
  await open('greenhouse.html');
  await fill();
  const second = await fill();
  check('greenhouse', 'second run keeps everything', second.filled.length, 0);

  /* Profile page: edits save to storage */
  const opt = await ctx.newPage();
  const pageErrors = [];
  opt.on('pageerror', (e) => pageErrors.push(e.message));
  await opt.goto(`chrome-extension://${extId}/options/options.html`);
  await opt.waitForSelector('#basics-firstName');
  check('options', 'completeness meter shows', /Profile \d+% complete/.test(await opt.textContent('#meterText')), true);
  check('options', 'loads saved first name', await opt.inputValue('#basics-firstName'), 'Alex');
  await opt.fill('#basics-firstName', 'Alexandra');
  await opt.click('#experience button.add');
  await opt.fill('#experience-2-title', 'Intern');
  await opt.waitForTimeout(700);
  const saved = await sw.evaluate(() => chrome.storage.local.get('profile'));
  check('options', 'saves first name', saved.profile.firstName, 'Alexandra');
  check('options', 'adds a job', saved.profile.experience.length === 3 && saved.profile.experience[2].title === 'Intern', true);
  const gone = await sw.evaluate(() => chrome.storage.local.get(['file_resume', 'file_certificates']));
  check('options', 'old resume / certificate files cleared', !gone.file_resume && !gone.file_certificates, true);
  check('options', 'no resume / start date fields', await opt.evaluate(() => !document.getElementById('file-resume') && !document.getElementById('job-availableStartDate')), true);
  await opt.setInputFiles('#file-photo', { name: 'Photo.png', mimeType: 'image/png', buffer: PDF });
  await opt.waitForSelector('#files .file-card.has');
  const files = await sw.evaluate(() => chrome.storage.local.get('file_photo'));
  check('options', 'stores photo', files.file_photo && files.file_photo.name, 'Photo.png');
  if (SHOTS) {
    await opt.setViewportSize({ width: 1200, height: 900 });
    await opt.screenshot({ path: path.join(SHOTS, 'options.png'), fullPage: false });
  }

  check('options', 'no script errors', pageErrors.join(' | '), '');

  /* Popup renders a result */
  const pop = await ctx.newPage();
  pop.on('pageerror', (e) => pageErrors.push(e.message));
  await pop.goto(`chrome-extension://${extId}/popup/popup.html`);
  await pop.waitForFunction(() => document.getElementById('who').textContent !== 'Loading…');
  check('popup', 'shows who', await pop.textContent('#who'), 'Alexandra Rivera');
  await pop.evaluate(() => showResult({ fields: 10, filled: ['a', 'b'], review: [{ label: 'Why us?', required: true }], kept: 1 }));
  check('popup', 'result headline', await pop.textContent('.headline'), 'Filled 2 fields');
  check('popup', 'no script errors', pageErrors.join(' | '), '');

  console.log(`\n${passes} checks passed, ${failures} failed`);
  await ctx.close();
  srv.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
