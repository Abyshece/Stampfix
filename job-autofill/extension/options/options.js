/* Job Autofill: profile editor. Everything is saved to chrome.storage.local. */
'use strict';

const YESNO = ['', 'Yes', 'No'];
const DECLINE = 'Decline to answer';

const SECTIONS = [
  {
    id: 'basics', title: 'Name & contact',
    fields: [
      { k: 'salutation', l: 'Salutation (Anrede)', t: 'select', o: ['', 'Mr', 'Ms', 'Mx', 'None'], h: 'Matched to Herr / Frau / Divers on German forms.' },
      { k: 'academicTitle', l: 'Academic title (Titel)', ph: 'e.g. Dr.' },
      { k: 'firstName', l: 'First name', key: true },
      { k: 'lastName', l: 'Last name', key: true },
      { k: 'middleName', l: 'Middle name' },
      { k: 'preferredName', l: 'Preferred name', h: 'Leave empty to use your first name.' },
      { k: 'email', l: 'Email', t: 'email', key: true },
      { k: 'pronouns', l: 'Pronouns', ph: 'e.g. she/her' },
      { k: 'phoneCountryCode', l: 'Phone country code', ph: '+1' },
      { k: 'phone', l: 'Phone number', t: 'tel', key: true, h: 'Without the country code.' },
      { k: 'dateOfBirth', l: 'Date of birth', t: 'date', h: 'Optional. Many German forms ask (Geburtsdatum). Leave empty to type it yourself.' },
      { k: 'placeOfBirth', l: 'Place of birth (Geburtsort)', h: 'Optional.' },
      { k: 'maritalStatus', l: 'Marital status (Familienstand)', t: 'select', o: ['', 'Single', 'Married', 'Registered partnership', 'Divorced', 'Widowed', 'Prefer not to say'], h: 'Optional. Some German forms still ask.' },
    ],
  },
  {
    id: 'address', title: 'Address',
    fields: [
      { k: 'address1', l: 'Street address', w: 'full' },
      { k: 'address2', l: 'Apartment, suite, etc.', w: 'full' },
      { k: 'city', l: 'City', key: true },
      { k: 'state', l: 'State / province', ph: 'e.g. California or CA' },
      { k: 'postalCode', l: 'ZIP / postal code' },
      { k: 'country', l: 'Country', ph: 'e.g. United States', key: true },
    ],
  },
  {
    id: 'links', title: 'Links',
    fields: [
      { k: 'linkedin', l: 'LinkedIn', t: 'url', ph: 'https://linkedin.com/in/…', key: true },
      { k: 'github', l: 'GitHub', t: 'url', ph: 'https://github.com/…' },
      { k: 'portfolio', l: 'Portfolio', t: 'url' },
      { k: 'website', l: 'Personal website', t: 'url' },
      { k: 'xing', l: 'XING', t: 'url', ph: 'https://www.xing.com/profile/…' },
      { k: 'twitter', l: 'X / Twitter', t: 'url' },
    ],
  },
  {
    id: 'job', title: 'Current job & preferences',
    fields: [
      { k: 'currentTitle', l: 'Current job title' },
      { k: 'currentCompany', l: 'Current company' },
      { k: 'yearsExperience', l: 'Total years of experience', t: 'number', key: true },
      { k: 'howDidYouHear', l: '"How did you hear about us?"', ph: 'Google', h: 'Used for every "How did you hear…" / "aufmerksam geworden durch" question.' },
      { k: 'anythingElse', l: '"Anything else you\'d like to tell us?"', ph: 'No', h: 'Typed as "Nein" on German forms, "No" on English ones. Write a sentence here to use that instead.' },
      { k: 'autoConsent', l: 'Tick privacy-policy / Datenschutz checkboxes for me', t: 'checkbox', w: 'full', h: 'Only the "I have read the privacy notice" box. Newsletter, SMS, talent-pool and future-job boxes stay unticked.' },
      { k: 'desiredSalary', l: 'Desired salary', ph: 'e.g. 120000', h: 'Plain numbers work best.' },
      { k: 'currentSalary', l: 'Current salary' },
      { k: 'noticePeriod', l: 'Notice period', ph: 'e.g. 2 weeks' },
      { k: 'startDate', l: 'Estimated start date', t: 'date', h: 'A fixed date. Once it has passed it is no longer filled in.' },
      { k: 'startAfter', l: '…or this long after the day you apply', t: 'select', o: ['', '2 weeks', '4 weeks', '1 month', '2 months', '3 months', '4 months', '6 months'], h: 'Used when no fixed date is set (or it has passed). Months are rounded up to the 1st.' },
      { k: 'employmentType', l: 'Employment type', t: 'select', o: ['', 'Full-time', 'Part-time', 'Working student', 'Internship', 'Freelance', 'Apprenticeship'], h: 'Vollzeit / Teilzeit / Werkstudent…' },
      { k: 'weeklyHours', l: 'Hours per week', t: 'number', ph: 'e.g. 40' },
      { k: 'workPreference', l: 'Work arrangement', t: 'select', o: ['', 'Remote', 'Hybrid', 'On-site', 'Flexible'] },
      { k: 'desiredLocation', l: 'Preferred work location', ph: 'e.g. Berlin' },
      { k: 'willingToRelocate', l: 'Willing to relocate?', t: 'select', o: YESNO },
      { k: 'willingToTravel', l: 'Willing to travel? (Reisebereitschaft)', t: 'select', o: YESNO },
      { k: 'referredBy', l: 'Referred by', ph: 'Name, if someone referred you', h: 'Leave empty unless you have a referral.' },
    ],
  },
  {
    id: 'eligibility', title: 'Work eligibility',
    desc: 'Answers for the country you usually apply in.',
    fields: [
      { k: 'workAuthorized', l: 'Legally authorized to work there?', t: 'select', o: YESNO, key: true },
      { k: 'requiresSponsorship', l: 'Need visa sponsorship now or later?', t: 'select', o: YESNO, key: true },
      { k: 'visaStatus', l: 'Visa / work status', ph: 'e.g. US Citizen, Green Card, H-1B' },
      { k: 'citizenship', l: 'Citizenship', ph: 'e.g. United States' },
      { k: 'over18', l: 'Are you 18 or older?', t: 'select', o: YESNO },
      { k: 'driversLicense', l: "Driver's license?", t: 'select', o: YESNO },
      { k: 'securityClearance', l: 'Security clearance', ph: 'e.g. None' },
      { k: 'previouslyEmployed', l: 'Worked for the company before?', t: 'select', o: YESNO, h: 'Usually No. Change it on the form when it isn\'t.' },
    ],
  },
  {
    id: 'experience', title: 'Work experience', list: 'experience', item: 'Job', add: 'Add a job',
    desc: 'Most recent first. Forms with several job blocks get them in this order.',
    fields: [
      { k: 'title', l: 'Job title' },
      { k: 'company', l: 'Company' },
      { k: 'location', l: 'Location', ph: 'City, State' },
      { k: 'current', l: 'I currently work here', t: 'checkbox' },
      { k: 'start', l: 'Start', t: 'month' },
      { k: 'end', l: 'End', t: 'month' },
      { k: 'description', l: 'What you did', t: 'textarea', w: 'full', rows: 4 },
    ],
  },
  {
    id: 'education', title: 'Education', list: 'education', item: 'School', add: 'Add a school',
    desc: 'Highest or most recent first.',
    fields: [
      { k: 'school', l: 'School / university', w: 'full' },
      { k: 'degree', l: 'Degree', ph: "e.g. Bachelor's, Master's" },
      { k: 'field', l: 'Field of study', ph: 'e.g. Computer Science' },
      { k: 'start', l: 'Start', t: 'month' },
      { k: 'end', l: 'End (or expected)', t: 'month' },
      { k: 'gpa', l: 'GPA / grade', ph: 'optional' },
    ],
  },
  {
    id: 'skills', title: 'Skills & languages',
    fields: [
      { k: 'skills', l: 'Skills', t: 'textarea', w: 'full', rows: 2, ph: 'Python, SQL, React, Project management' },
      { k: 'skillYears', l: 'Years per skill', t: 'textarea', w: 'full', rows: 4, ph: 'Python: 5\nSQL: 4\nReact: 3', h: 'One per line. Answers questions like "How many years of experience do you have with Python?"' },
      { k: 'germanLevel', l: 'German level (Deutschkenntnisse)', t: 'select', o: ['', 'Native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1', 'None'], h: 'Matched to "Muttersprache", "verhandlungssicher", "fließend", "gut"…' },
      { k: 'englishLevel', l: 'English level', t: 'select', o: ['', 'Native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1', 'None'] },
      { k: 'languages', l: 'Languages (all)', w: 'full', ph: 'e.g. German (native), English (C1), Spanish (B1)' },
    ],
  },
  {
    id: 'writing', title: 'Summary & cover letter',
    fields: [
      { k: 'summary', l: 'Short professional summary', t: 'textarea', w: 'full', rows: 4 },
      { k: 'coverLetter', l: 'Cover letter', t: 'textarea', w: 'full', rows: 10, h: 'Write {company} and {role} where the company name and job title go. They\'re filled in from the job page, and the field is outlined amber so you can check it.' },
    ],
  },
  {
    id: 'answers', title: 'Saved answers', list: 'customAnswers', item: 'Answer', add: 'Add an answer',
    desc: 'For questions that keep coming up. The question doesn\'t have to match word for word. Put other wordings after a |. These take priority over everything else.',
    fields: [
      { k: 'question', l: 'Question', w: 'full', ph: 'Why do you want to work here? | Why are you interested in this role?' },
      { k: 'answer', l: 'Your answer', t: 'textarea', w: 'full', rows: 4, h: '{company} and {role} work here too.' },
    ],
  },
  {
    id: 'eeo', title: 'Voluntary self-identification',
    desc: 'Optional, mostly asked by US employers. Leave blank to answer these yourself each time.',
    fields: [
      { k: 'gender', l: 'Gender', t: 'select', o: ['', 'Male', 'Female', 'Non-binary', DECLINE] },
      { k: 'transgender', l: 'Transgender?', t: 'select', o: ['', 'No', 'Yes', DECLINE] },
      { k: 'sexualOrientation', l: 'Sexual orientation', t: 'select', o: ['', 'Heterosexual', 'Gay', 'Lesbian', 'Bisexual', 'Asexual', 'Queer', DECLINE] },
      { k: 'hispanicLatino', l: 'Hispanic or Latino?', t: 'select', o: ['', 'No', 'Yes', DECLINE] },
      { k: 'race', l: 'Race', t: 'select', o: ['', 'American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'Middle Eastern or North African', 'Native Hawaiian or Other Pacific Islander', 'White', 'Two or More Races', DECLINE] },
      { k: 'veteran', l: 'Veteran status', t: 'select', o: ['', 'I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', DECLINE] },
      { k: 'disability', l: 'Disability status', t: 'select', o: ['', "No, I don't have a disability", 'Yes, I have a disability', DECLINE] },
    ],
  },
  { id: 'files', title: 'Photo', custom: renderFiles },
  { id: 'backup', title: 'Backup & reset', custom: renderBackup },
];

const BLANK_ENTRY = {
  experience: { title: '', company: '', location: '', start: '', end: '', current: false, description: '' },
  education: { school: '', degree: '', field: '', start: '', end: '', gpa: '' },
  customAnswers: { question: '', answer: '' },
};

let state = {};
let files = { photo: null };
let saveTimer = null;

const clean = (v) => String(v == null ? '' : v).trim();

/* ───────── tiny DOM helper ───────── */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

/* ───────── saving ───────── */
function setSaveState(text, cls) {
  const s = document.getElementById('saveState');
  s.textContent = text;
  s.className = 'save ' + (cls || '');
}

function scheduleSave() {
  setSaveState('Saving…', 'pending');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await chrome.storage.local.set({ profile: state });
      setSaveState('Saved', '');
    } catch (e) {
      setSaveState("Couldn't save", 'err');
    }
    updateMeter();
  }, 350);
}

// Same rule the filler uses (content/filler.js: estimatedStart).
function estimatedStart(p) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const f = String(p.startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (f) {
    const d = new Date(+f[1], +f[2] - 1, +f[3]);
    if (d >= today) return d;
  }
  const m = String(p.startAfter || '').match(/(\d+)\s*(week|month)/i);
  if (!m) return null;
  if (/week/i.test(m[2])) return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7 * +m[1]);
  return new Date(today.getFullYear(), today.getMonth() + +m[1] + (today.getDate() > 1 ? 1 : 0), 1);
}

function updateStartPreview() {
  const el = document.getElementById('startPreview');
  if (!el) return;
  const d = estimatedStart(state);
  el.textContent = d
    ? `Start-date questions get: ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} (if you applied today).`
    : 'Start-date questions are left for you to fill in.';
}

function updateMeter() {
  updateStartPreview();
  const keys = SECTIONS.flatMap((s) => (s.list || !s.fields ? [] : s.fields.filter((f) => f.key).map((f) => f.k)));
  let total = keys.length + 2;
  let done = keys.filter((k) => String(state[k] || '').trim()).length;
  if ((state.experience || []).some((e) => e.title || e.company)) done++;
  if ((state.education || []).some((e) => e.school)) done++;
  const pct = Math.round((done / total) * 100);
  document.getElementById('meterBar').style.width = pct + '%';
  document.getElementById('meterText').textContent = `Profile ${pct}% complete`;
}

/* ───────── field rendering ───────── */
function fieldControl(f, value, onValue, idBase) {
  const id = idBase + '-' + f.k;
  if (f.t === 'checkbox') {
    const input = h('input', { type: 'checkbox', id });
    input.checked = !!value;
    input.addEventListener('change', () => onValue(input.checked));
    return h('div', { class: 'field check ' + (f.w || '') }, h('label', { for: id }, input, h('span', { text: f.l })), f.h ? h('p', { class: 'hint', text: f.h }) : null);
  }
  let input;
  if (f.t === 'select') {
    input = h('select', { id });
    for (const o of f.o) input.append(h('option', { value: o, text: o || '— not set —' }));
    input.value = value || '';
    input.addEventListener('change', () => onValue(input.value));
  } else if (f.t === 'textarea') {
    input = h('textarea', { id, rows: f.rows || 3, placeholder: f.ph || '' });
    input.value = value || '';
    input.addEventListener('input', () => onValue(input.value));
  } else {
    input = h('input', { id, type: f.t || 'text', placeholder: f.ph || '', autocomplete: 'off', spellcheck: f.t ? 'false' : null });
    input.value = value || '';
    input.addEventListener('input', () => onValue(input.value));
  }
  return h(
    'div',
    { class: 'field ' + (f.w || '') },
    h('label', { for: id, text: f.l }),
    input,
    f.h ? h('p', { class: 'hint', text: f.h }) : null
  );
}

function renderSimple(sec) {
  const grid = h('div', { class: 'grid' });
  for (const f of sec.fields) {
    grid.append(fieldControl(f, state[f.k], (v) => { state[f.k] = v; scheduleSave(); updateStartPreview(); }, sec.id));
    if (f.k === 'startAfter') grid.append(h('p', { class: 'hint full preview', id: 'startPreview', role: 'status' }));
  }
  return grid;
}

function renderList(sec, body) {
  body.textContent = '';
  const list = state[sec.list] || (state[sec.list] = []);
  list.forEach((entry, i) => {
    const card = h('div', { class: 'entry' });
    const title = h('h3', { text: entryTitle(sec, entry, i) });
    const actions = h('div', { class: 'entry-actions' },
      i > 0 ? h('button', { type: 'button', class: 'ghost', title: 'Move up', 'aria-label': `Move ${sec.item.toLowerCase()} ${i + 1} up`, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; scheduleSave(); renderList(sec, body); } }, '↑ Move up') : null,
      h('button', { type: 'button', class: 'ghost danger', 'aria-label': `Remove ${sec.item.toLowerCase()} ${i + 1}`, onclick: () => { list.splice(i, 1); scheduleSave(); renderList(sec, body); } }, 'Remove')
    );
    card.append(h('div', { class: 'entry-head' }, title, actions));
    const grid = h('div', { class: 'grid' });
    for (const f of sec.fields) {
      const ctl = fieldControl(f, entry[f.k], (v) => {
        entry[f.k] = v;
        title.textContent = entryTitle(sec, entry, i);
        if (f.k === 'current') toggleEnd();
        scheduleSave();
      }, `${sec.id}-${i}`);
      grid.append(ctl);
    }
    card.append(grid);
    const endInput = grid.querySelector(`#${sec.id}-${i}-end`);
    const toggleEnd = () => {
      if (!endInput || sec.list !== 'experience') return;
      endInput.disabled = !!entry.current;
      endInput.closest('.field').classList.toggle('muted', !!entry.current);
    };
    toggleEnd();
    body.append(card);
  });
  body.append(
    h('button', { type: 'button', class: 'add', onclick: () => { list.push({ ...BLANK_ENTRY[sec.list] }); scheduleSave(); renderList(sec, body); const cards = body.querySelectorAll('.entry'); const last = cards[cards.length - 1]; if (last) last.querySelector('input,textarea').focus(); } }, '+ ' + sec.add)
  );
}

function entryTitle(sec, e, i) {
  if (sec.list === 'experience') return [e.title, e.company].filter(Boolean).join(' at ') || `${sec.item} ${i + 1}`;
  if (sec.list === 'education') return e.school || `${sec.item} ${i + 1}`;
  return (e.question || '').split('|')[0].trim() || `${sec.item} ${i + 1}`;
}

/* ───────── files ───────── */
const MAX_FILE = 10 * 1024 * 1024;
const fmtSize = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

function renderFiles(body) {
  body.textContent = '';
  body.append(h('p', { class: 'desc', text: 'Optional. Goes into photo uploads (Bewerbungsfoto). Your resume, cover letter and certificates differ per company, so you attach those yourself: the extension outlines those upload fields in amber.' }));
  const row = h('div', { class: 'files' });
  for (const [key, label, accept] of [['photo', 'Photo (optional)', 'image/*']]) {
    const rec = files[key];
    const input = h('input', { type: 'file', accept: accept || '.pdf,.doc,.docx,.txt,.rtf,.odt', id: 'file-' + key, class: 'visually-hidden' });
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      if (f.size > MAX_FILE) { alert('That file is over 10 MB. Most application forms reject files that large.'); return; }
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      files[key] = { name: f.name, type: f.type || 'application/pdf', size: f.size, dataUrl, savedAt: Date.now() };
      await chrome.storage.local.set({ ['file_' + key]: files[key] });
      renderFiles(body);
      updateMeter();
    });
    const card = h('div', { class: 'file-card' + (rec ? ' has' : '') },
      h('div', { class: 'file-label', text: label }),
      rec
        ? h('div', { class: 'file-name' }, h('span', { class: 'doc', 'aria-hidden': 'true', text: '📄' }), h('span', { text: rec.name }), h('span', { class: 'size', text: fmtSize(rec.size) }))
        : h('div', { class: 'file-empty', text: 'No file yet' }),
      h('div', { class: 'file-actions' },
        h('label', { for: 'file-' + key, class: 'btn' }, rec ? 'Replace' : 'Choose file'),
        rec ? h('button', { type: 'button', class: 'ghost danger', onclick: async () => { files[key] = null; await chrome.storage.local.remove('file_' + key); renderFiles(body); updateMeter(); } }, 'Remove') : null
      ),
      input
    );
    row.append(card);
  }
  body.append(row);
}

/* ───────── backup ───────── */
function renderBackup(body) {
  body.textContent = '';
  const importInput = h('input', { type: 'file', accept: 'application/json,.json', id: 'importFile', class: 'visually-hidden' });
  importInput.addEventListener('change', async () => {
    const f = importInput.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const profile = data.profile || data;
      if (typeof profile !== 'object' || Array.isArray(profile)) throw new Error('bad');
      state = normalize(profile);
      for (const k of Object.keys(files)) files[k] = (data.files && data.files[k]) || files[k];
      await chrome.storage.local.set({ profile: state, ...Object.fromEntries(Object.entries(files).map(([k, v]) => ['file_' + k, v])) });
      renderAll();
      document.getElementById('importBanner')?.remove();
      setSaveState('Imported', '');
    } catch (e) {
      alert("That file isn't a Job Autofill backup.");
    }
  });
  body.append(
    h('p', { class: 'desc', text: 'Your profile lives only in this Chrome profile. Export a copy to move it to another computer or to keep it safe.' }),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', onclick: exportProfile }, 'Export backup'),
      h('label', { for: 'importFile', class: 'btn secondary' }, 'Import backup'),
      importInput,
      h('button', { type: 'button', class: 'ghost danger', onclick: clearAll }, 'Delete everything')
    )
  );
}

function exportProfile() {
  const blob = new Blob([JSON.stringify({ app: 'job-autofill', version: 1, exportedAt: new Date().toISOString(), profile: state, files }, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'job-autofill-profile.json' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function clearAll() {
  if (!confirm('Delete your whole profile and files from this browser? This can\'t be undone.')) return;
  await chrome.storage.local.clear();
  state = normalize({});
  files = { photo: null };
  renderAll();
}

/* ───────── page ───────── */
function normalize(p) {
  const out = { ...p };
  out.experience = Array.isArray(p.experience) ? p.experience : [];
  out.education = Array.isArray(p.education) ? p.education : [];
  out.customAnswers = Array.isArray(p.customAnswers) ? p.customAnswers : [];
  if (!out.experience.length) out.experience.push({ ...BLANK_ENTRY.experience });
  if (!out.education.length) out.education.push({ ...BLANK_ENTRY.education });
  if (!clean(out.howDidYouHear)) out.howDidYouHear = 'Google';
  if (!clean(out.anythingElse)) out.anythingElse = 'No';
  if (out.autoConsent === undefined) out.autoConsent = true;
  if (!out.customAnswers.length) out.customAnswers.push({ question: 'Why do you want to work here? | Why are you interested in this role?', answer: '' });
  return out;
}

function renderAll() {
  const main = document.getElementById('main');
  const nav = document.getElementById('nav');
  main.querySelectorAll('section.card').forEach((s) => s.remove());
  nav.textContent = '';
  for (const sec of SECTIONS) {
    const body = h('div', { class: 'card-body' });
    const card = h('section', { class: 'card', id: sec.id, 'aria-labelledby': sec.id + '-h' },
      h('h2', { id: sec.id + '-h', text: sec.title }),
      sec.desc ? h('p', { class: 'desc', text: sec.desc }) : null,
      body
    );
    if (sec.custom) sec.custom(body);
    else if (sec.list) renderList(sec, body);
    else body.append(renderSimple(sec));
    main.append(card);
    nav.append(h('a', { href: '#' + sec.id, text: sec.title }));
  }
  updateMeter();
}

// Resume, cover letter, certificates and start date differ per company: the
// user attaches / enters them on each form. Drop anything saved earlier.
async function forgetPerCompanyData() {
  await chrome.storage.local.remove(['file_resume', 'file_coverLetter', 'file_certificates']);
  const { profile } = await chrome.storage.local.get('profile');
  if (profile && ('availableStartDate' in profile || 'availability' in profile)) {
    delete profile.availableStartDate;
    delete profile.availability;
    await chrome.storage.local.set({ profile });
  }
}

// Empty profile: offer to bring back a backup (e.g. from an older version).
function showImportBanner() {
  const howto = document.querySelector('.howto');
  const banner = h('section', { class: 'card banner', id: 'importBanner' },
    h('h2', { text: 'Have a backup of your details?' }),
    h('p', { class: 'desc', text: 'If you exported your profile from an earlier version (Backup & reset → Export backup), import it here to get everything back.' }),
    h('div', { class: 'row' }, h('label', { for: 'importFile', class: 'btn' }, 'Import backup'), h('button', { type: 'button', class: 'ghost', onclick: () => banner.remove() }, 'Start fresh'))
  );
  howto.after(banner);
}

async function init() {
  await forgetPerCompanyData();
  const store = await chrome.storage.local.get(['profile', 'file_photo']);
  state = normalize(store.profile || {});
  files = { photo: store.file_photo || null };
  renderAll();
  try {
    const cmds = await chrome.commands.getAll();
    const c = cmds.find((x) => x.name === 'fill-page');
    if (c && c.shortcut) document.getElementById('shortcut').textContent = c.shortcut;
  } catch (e) { /* ignore */ }
  if (!store.profile) showImportBanner();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

init();
