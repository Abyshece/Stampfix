/*
 * Job Autofill: the page filler.
 *
 * Injected on demand (toolbar button or keyboard shortcut) into every frame of
 * the current tab. It reads the saved profile from chrome.storage.local, finds
 * the form fields on the page, works out what each field is asking from its
 * label, and fills it. It never clicks submit and never sends data anywhere.
 */
(() => {
  'use strict';

  /* ───────────────────────── text helpers ───────────────────────── */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
  const norm = (s) =>
    clean(s)
      .replace(/ß/g, 'ss')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasWord = (text, phrase) =>
    !!phrase && new RegExp('(?:^| )' + escapeRe(phrase) + '(?: |$)').test(text);
  const pad2 = (n) => String(n).padStart(2, '0');
  const isYes = (v) => /^(y|yes|true)$/i.test(clean(v));
  const isNo = (v) => /^(n|no|false)$/i.test(clean(v));
  const uniq = (arr) => [...new Set(arr.filter((x) => x != null && clean(x) !== ''))];

  // "job_application[firstName]" -> "job application first name"
  const splitAttr = (s) =>
    clean(
      String(s || '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_\-[\].:/]+/g, ' ')
    )
      .split(' ')
      .filter((w) => w && (!/\d/.test(w) || /^\d{1,2}$/.test(w) || /^[a-z]+\d$/i.test(w)))
      .join(' ');

  /* ───────────────────────── reference data ───────────────────────── */

  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const MONTHS_DE = ['januar', 'februar', 'marz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
  const isMonthName = (t) => MONTHS.some((m) => t === m || t === m.slice(0, 3)) || MONTHS_DE.some((m) => t === m || t === m.slice(0, 3)) || t === 'maerz' || t === 'mrz';
  let GERMAN_PAGE = false;
  const pageLang = () => (GERMAN_PAGE ? 'de' : (document.documentElement.lang || '').slice(0, 2).toLowerCase());

  const US_STATES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
    DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
    NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
    RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
    VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  };

  // Each group lists names for one country, English and German, so either one matches.
  const COUNTRY_ALIASES = [
    ['united states', 'united states of america', 'usa', 'us', 'u s', 'u s a', 'america', 'vereinigte staaten', 'vereinigte staaten von amerika'],
    ['united kingdom', 'uk', 'great britain', 'britain', 'england', 'gb', 'vereinigtes konigreich', 'grossbritannien'],
    ['united arab emirates', 'uae', 'vereinigte arabische emirate'],
    ['india', 'bharat', 'indien'],
    ['germany', 'deutschland', 'de', 'federal republic of germany', 'bundesrepublik deutschland'],
    ['austria', 'osterreich', 'oesterreich', 'at'],
    ['switzerland', 'schweiz', 'suisse', 'svizzera', 'ch'],
    ['netherlands', 'the netherlands', 'holland', 'niederlande', 'nl'],
    ['belgium', 'belgien'], ['france', 'frankreich'], ['spain', 'spanien'], ['italy', 'italien'], ['poland', 'polen'],
    ['denmark', 'danemark', 'daenemark'], ['sweden', 'schweden'], ['norway', 'norwegen'], ['finland', 'finnland'],
    ['portugal'], ['greece', 'griechenland'], ['hungary', 'ungarn'], ['romania', 'rumanien', 'rumaenien'], ['bulgaria', 'bulgarien'],
    ['croatia', 'kroatien'], ['serbia', 'serbien'], ['ukraine'], ['luxembourg', 'luxemburg'], ['liechtenstein'],
    ['south korea', 'korea republic of', 'republic of korea', 'korea', 'sudkorea', 'suedkorea'],
    ['russia', 'russian federation', 'russland'],
    ['czech republic', 'czechia', 'tschechien', 'tschechische republik'],
    ['slovakia', 'slowakei'], ['slovenia', 'slowenien'],
    ['turkey', 'turkiye', 'turkei', 'tuerkei'],
    ['vietnam', 'viet nam'],
    ['ireland', 'republic of ireland', 'irland'],
    ['china', 'peoples republic of china', 'volksrepublik china'],
    ['japan'], ['brazil', 'brasilien'], ['mexico', 'mexiko'], ['canada', 'kanada'], ['australia', 'australien'],
    ['egypt', 'agypten', 'aegypten'], ['south africa', 'sudafrika', 'suedafrika'], ['saudi arabia', 'saudi arabien'],
    ['pakistan', 'islamic republic of pakistan'], ['bangladesch', 'bangladesh'], ['indonesia', 'indonesien'], ['philippines', 'philippinen'],
  ];

  const DECLINE = [
    'decline', 'prefer not', 'not to say', 'not to answer', 'not to disclose', 'wish to answer',
    'wish to disclose', 'wish to self identify', 'dont want to', 'do not want to', 'choose not', 'rather not',
    'keine angabe', 'nicht angeben', 'mochte ich nicht', 'mochte keine angabe',
  ];
  const isDecline = (v) => /decline|prefer not|rather not|wish to|choose not|not to (say|answer|disclose)|keine angabe|nicht angeben/i.test(v || '');

  const DEGREES = [
    [/\b(ph ?d|doctor|doctorate|doctoral|dphil|promotion|doktor\w*)\b/, ['phd', 'doctorate', 'doctor', 'doctoral', 'promotion', 'doktor']],
    [/\bmba\b|business administration/, ['mba', 'master of business administration', 'masters', 'master']],
    [/\b(masters?|m ?sc|m ?s|m ?a|m ?eng|m ?tech|postgrad\w*)\b/, ['masters', 'master', 'masters degree', 'ms', 'm s', 'msc', 'm sc', 'ma', 'm a', 'graduate', 'postgraduate']],
    [/\b(bachelors?|b ?sc|b ?s|b ?a|b ?eng|b ?e|b ?tech|undergrad\w*)\b/, ['bachelors', 'bachelor', 'bachelors degree', 'bs', 'b s', 'ba', 'b a', 'bsc', 'b sc', 'undergraduate']],
    [/\bassociates?\b/, ['associates', 'associate', 'associates degree']],
    [/\b(high school|secondary|ged|abitur|fachabitur|matura)\b/, ['high school', 'secondary', 'ged', 'abitur', 'matura']],
    [/\b(diplom\w*|diploma)\b/, ['diplom', 'diploma']],
    [/\b(ausbildung|apprenticeship|vocational)\b/, ['ausbildung', 'berufsausbildung', 'apprenticeship', 'vocational']],
  ];

  const EEO_ALIASES = {
    gender: [
      [/^(male|man)$/i, ['male', 'man', 'mannlich', 'maennlich', 'herr', 'm']],
      [/^(female|woman)$/i, ['female', 'woman', 'weiblich', 'frau', 'w', 'f']],
      [/non ?binary/i, ['non binary', 'nonbinary', 'divers', 'genderqueer', 'gender non conforming', 'd']],
    ],
    veteran: [
      [/not/i, ['i am not a protected veteran', 'not a protected veteran', 'i am not a veteran', 'not a veteran', 'no']],
      [/veteran/i, ['i identify as one or more of the classifications of protected veteran', 'protected veteran', 'i am a protected veteran', 'i am a veteran', 'yes']],
    ],
    disability: [
      [/^no/i, ['no i do not have a disability', 'no i dont have a disability', 'no', 'nein']],
      [/^yes/i, ['yes i have a disability', 'yes', 'ja']],
    ],
    race: [
      [/black/i, ['black or african american', 'black', 'african american']],
      [/hispanic|latin/i, ['hispanic or latino', 'hispanic', 'latino']],
      [/white/i, ['white']],
      [/asian/i, ['asian']],
      [/hawaiian|pacific/i, ['native hawaiian or other pacific islander', 'native hawaiian', 'pacific islander']],
      [/american indian|alaska/i, ['american indian or alaska native', 'american indian', 'alaska native', 'native american']],
      [/two or more/i, ['two or more races', 'two or more']],
      [/middle eastern|north african/i, ['middle eastern or north african', 'middle eastern', 'north african']],
    ],
  };

  const SALUTATIONS = [
    [/^(mr|mister|herr|monsieur)\.?$/i, ['herr', 'mr', 'mister', 'monsieur']],
    [/^(ms|mrs|miss|frau|madame)\.?$/i, ['frau', 'ms', 'mrs', 'miss', 'madame']],
    [/^(mx|divers|diverse)\.?$/i, ['divers', 'mx', 'keine anrede', 'ohne anrede', 'neutral', 'diverse']],
    [/^(none|keine)/i, ['keine anrede', 'ohne anrede', 'keine angabe', 'none', 'divers']],
  ];

  const LANG_LEVELS = [
    [/^native/i, ['native', 'muttersprache', 'mother tongue', 'first language', 'native speaker', 'c2']],
    [/^c2/i, ['c2', 'verhandlungssicher', 'proficient', 'business fluent', 'fluent', 'fliessend', 'sehr gut', 'expert']],
    [/^c1/i, ['c1', 'fliessend', 'fluent', 'verhandlungssicher', 'advanced', 'sehr gut', 'fortgeschritten']],
    [/^b2/i, ['b2', 'gut', 'good', 'upper intermediate', 'conversational', 'gute kenntnisse']],
    [/^b1/i, ['b1', 'intermediate', 'mittel', 'befriedigend', 'conversational']],
    [/^a2/i, ['a2', 'basic', 'grundkenntnisse', 'elementary', 'beginner', 'basis']],
    [/^a1/i, ['a1', 'basic', 'grundkenntnisse', 'beginner', 'anfanger', 'anfaenger']],
    [/^none/i, ['none', 'keine', 'no knowledge', 'keine kenntnisse']],
  ];
  const EMPLOYMENT_TYPES = [
    [/full/i, ['full time', 'full-time', 'fulltime', 'vollzeit', 'permanent', 'festanstellung']],
    [/part/i, ['part time', 'part-time', 'teilzeit']],
    [/student/i, ['working student', 'werkstudent', 'werkstudentin', 'student']],
    [/intern/i, ['internship', 'praktikum', 'intern', 'praktikant']],
    [/freelan|contract/i, ['freelance', 'freiberuflich', 'contractor', 'contract', 'freelancer', 'freier mitarbeiter']],
    [/apprentic/i, ['apprenticeship', 'ausbildung', 'azubi', 'trainee']],
  ];
  const MARITAL = [
    [/^single/i, ['single', 'ledig']], [/^married/i, ['married', 'verheiratet']], [/^divorced/i, ['divorced', 'geschieden']],
    [/^widow/i, ['widowed', 'verwitwet']], [/partnership/i, ['registered partnership', 'eingetragene lebenspartnerschaft', 'lebenspartnerschaft']],
    [/prefer|decline/i, ['prefer not to say', 'keine angabe', 'decline']],
  ];
  const HEARD = [
    [/^google/i, ['google', 'google search', 'google suche', 'google schlagwortsuche', 'google jobs', 'suchmaschine', 'search engine', 'internet', 'internetrecherche', 'online search']],
    [/linkedin/i, ['linkedin']], [/xing/i, ['xing']], [/indeed/i, ['indeed']], [/stepstone/i, ['stepstone']],
    [/referr|empfehl/i, ['empfehlung', 'mitarbeiterempfehlung', 'employee referral', 'referral', 'friend']],
    [/website|homepage|career/i, ['company website', 'career site', 'karriereseite', 'unternehmenswebseite', 'homepage', 'website']],
  ];
  const aliasCands = (table, v) => {
    if (!clean(v)) return [];
    const g = table.find(([re]) => re.test(clean(v)));
    return uniq([v, ...(g ? g[1] : [])]);
  };

  /* ───────────────────────── matching rules ─────────────────────────
   * Each rule is tested against a field's label (normalised: lower case,
   * punctuation removed). Rules are ordered from most to least specific and
   * the first hit wins. `kinds` limits a rule to certain field types.
   */

  const PEOPLE = /\b(emergency|reference|referr\w*|parent|guardian|spouse|manager|supervisor|recruiter|hiring|contact person|company|employer|school|university|college|institution|user ?name)\b/;
  const CHOICE_KINDS = ['select', 'radio', 'combo', 'checkbox', 'checkgroup'];

  const SKIP_RE = /\b(i agree|agree to|i accept|terms (and|of)|consent|privacy (policy|notice)|acknowledg\w*|i certify|certify that|attest\w*|captcha|password|verification code|security question|signature|sign here|datenschutz\w*|einwillig\w*|einverstanden|zustimm\w*|ich akzeptiere|akzeptiere|agb|bestatige|bestaetige|passwort|unterschrift)\b/;

  const RULES = [
    { key: 'howDidYouHear', re: /\bhow (did )?you (first |originally )?(hear|heard|find|found|learn|learned|come across|came across|discover|discovered)\b|\bwhere did you (hear|find|see|learn)\b|\b(referral|application|candidate|lead) source\b|^source$|\bhear(d)? about (us|this)\b/ },
    { key: 'referredBy', re: /\breferred by\b|\bwho referred\b|\breferrer\b|\breferral name\b|\bemployee referral\b|\bname of (the )?(person|employee) who referred\b/ },

    { key: 'placeOfBirth', re: /\bplace of birth\b|\bbirth ?place\b|\bcity of birth\b|\bgeburtsort\b/ },
    { key: 'dateOfBirth', re: /\bdate of birth\b|\bbirth ?date\b|\bdob\b|\bbirthday\b|\bgeburtsdatum\b/ },
    { key: 'ageBracket', re: /\bage (bracket|range|group|band|category)\b|\baltersgruppe\b|\baltersklasse\b|^age$|^alter$|\bhow old are you\b|\bwie alt sind sie\b/ },
    { key: 'maritalStatus', re: /\bmarital status\b|\bfamilienstand\b|\bcivil status\b/ },
    { key: 'speaksGerman', kinds: CHOICE_KINDS, re: /\b(a1|a2|b1|b2|c1|c2)\b.*\b(german|deutsch)\b|\b(german|deutsch)\b.*\b(a1|a2|b1|b2|c1|c2)\b|\b(do|can) you speak (fluent |good |business )?german\b|\bfluent (in )?german\b|\bgerman speaker\b|\bsprechen sie (fliessend |gut )?deutsch\b|\bsprichst du (fliessend |gut )?deutsch\b/ },
    { key: 'speaksEnglish', kinds: CHOICE_KINDS, re: /\b(a1|a2|b1|b2|c1|c2)\b.*\b(english|englisch)\b|\b(english|englisch)\b.*\b(a1|a2|b1|b2|c1|c2)\b|\b(do|can) you speak (fluent |good |business )?english\b|\bfluent (in )?english\b|\bsprechen sie (fliessend |gut )?englisch\b|\bsprichst du (fliessend |gut )?englisch\b/ },
    { key: 'germanLevel', re: /\bgerman\b.*\b(level|skills?|proficiency|knowledge|fluency)\b|\b(level|skills?|proficiency|knowledge|command) (of|in) german\b|\bdeutschkenntnisse\b|\bdeutsch\w* ?(sprach)?kenntnisse\b|\bniveau deutsch\b|^deutsch$|\bdo you speak german\b/ },
    { key: 'englishLevel', re: /\benglish\b.*\b(level|skills?|proficiency|knowledge|fluency)\b|\b(level|skills?|proficiency|knowledge|command) (of|in) english\b|\benglischkenntnisse\b|\benglisch\w* ?(sprach)?kenntnisse\b|\bniveau englisch\b|^englisch$|\bdo you speak english\b/ },
    { key: 'fullName', re: /\bname (first (and|&) last|first last)\b|\bfirst (and|&) last names?\b|\bfull name\b/, not: PEOPLE },
    { key: 'preferredName', re: /\b(preferred|nick) ?(first )?name\b|\bgo by\b|\bwhat should we call you\b|\bname you prefer\b/ },
    { key: 'firstName', re: /\b(first|given|fore) ?names?\b|\bfname\b/, not: PEOPLE },
    { key: 'middleName', re: /\bmiddle (name|initial)s?\b/, not: PEOPLE },
    { key: 'lastName', re: /\b(last|family|sur) ?names?\b|\bsurname\b|\blname\b/, not: PEOPLE },
    { key: '_none', re: /\bpronounc\w*|\bphonetic\b/ },
    { key: 'fullName', re: /^(your |full |legal |candidate |applicant )*name$|\bfull (legal )?name\b|\blegal name\b|\byour name\b/, not: PEOPLE },
    { key: 'pronouns', re: /\bpronouns?\b/ },

    { key: 'emailAndPhone', kinds: ['text'], re: /\be ?mail\b.*\b(phone|mobile|cell)\b|\b(phone|mobile|cell)\b.*\be ?mail\b/, not: /\b(reference|referr\w*|manager|emergency)\b/ },
    { key: 'email', re: /\be ?mail\b/, not: /\b(reference|referr\w*|manager|emergency|supervisor|receive|subscribe|updates|newsletter|future|contact you|opt in)\b/ },
    { key: 'phoneCountryCode', re: /\b(country|dial(ing)?|calling) code\b|\bphone (number )?(country|prefix|code)\b|^country phone\b|^country (mobile|cell)\b/ },
    { key: 'phone', re: /\b(phone|mobile|cell|telephone|tel|contact number|whatsapp)\b/, not: /\b(type|extension|ext|reference|emergency|manager|device|text you|sms)\b/ },

    { key: 'sponsorship', test: (t) => /\bsponsor/.test(t) && !/\bwithout\b/.test(t) },
    { key: 'workAuthorized', re: /\b(authori[sz]ed|eligible|permitted|entitled|legally (able|allowed)|right) to (work|be employed|accept employment)\b|\bwork (authori[sz]ation|permit|eligibility)\b|\beligib(le|ility) for employment\b|\bwithout .{0,40}sponsor/ },
    { key: 'citizenOf', kinds: CHOICE_KINDS, re: /\b(are you|r u) an? .{0,40}\bcitizen\b|\bcitizen of\b/ },
    { key: 'livesIn', kinds: CHOICE_KINDS, re: /\b(currently )?(located|based|living|residing|reside|live) in\b/, not: /\bwilling\b|\brelocat/ },
    { key: 'visaStatus', re: /\bvisa\b|\bimmigration status\b|\bwork status\b|\bresidency status\b/ },
    { key: 'over18', re: /\b(18|eighteen) (years|yrs)\b|\bover (the age of )?(18|eighteen)\b|\bat least (18|eighteen)\b|\blegal (working )?age\b/ },
    { key: 'relocate', re: /\brelocat\w*/ },
    { key: 'willingToTravel', re: /\b(willing|able|open) to travel\b|\btravel (requirement|willingness)\b|\bwillingness to travel\b|\breisebereit\w*\b|\breisetatigkeit\w*\b|\breisetaetigkeit\w*\b|\bcan you travel\b/ },
    { key: 'employmentType', re: /\b(employment|job|contract|position|work) type\b|\btype of (employment|contract|position|work)\b|\banstellungsart\b|\bbeschaftigungsart\b|\bbeschaeftigungsart\b|\barbeitszeitmodell\b|\bfull ?time or part ?time\b|\bvollzeit oder teilzeit\b|\bvollzeit\b.*\bteilzeit\b/ },
    { key: 'weeklyHours', re: /\bhours per week\b|\bweekly hours\b|\bwochenstunden\b|\bstunden pro woche\b|\bhow many hours\b|\bwochentliche arbeitszeit\b/ },
    { key: 'desiredLocation', re: /\b(preferred|desired|wish|target) (work )?(location|office|city)\b|\bwunschort\b|\bwunschstandort\b|\bbevorzugte\w* (standort|arbeitsort|einsatzort)\b|\bwhich (office|location) would you\b/ },
    { key: 'driversLicense', re: /\bdriv(er|ers|ing) licen[cs]e\b/ },
    { key: 'clearance', re: /\bsecurity clearance\b|\bclearance\b/ },
    { key: 'currentlyEmployed', re: /\bare you (currently |presently )?(employed|working)\b|\bcurrent employment status\b|\bemployment status\b/ },
    { key: 'previouslyEmployed', re: /\b(previously|ever|formerly) (been )?(employed|worked)\b|\bhave you (ever )?(been employed|worked) (by|for|at|with)\b|\bformer employee\b|\bworked (here|for us) before\b/ },

    { key: 'linkedin', re: /\blinked ?in\b/ },
    { key: 'github', re: /\bgit ?hub\b/ },
    { key: 'twitter', re: /\btwitter\b|\bx (com|handle|profile)\b|^x$|^x twitter$/ },
    { key: 'portfolio', re: /\bportfolio\b|\bdribbble\b|\bbehance\b|\bwork samples\b/ },
    { key: 'website', re: /\b(personal )?(web ?site|home ?page|blog)\b|\bother (links?|urls?|websites?|profiles?)\b|^urls?$|\bprofile url\b/, not: /\bcompany\b/ },

    { key: 'currentSalary', re: /\bcurrent (annual )?(salary|ctc|compensation|pay|base)\b/ },
    { key: 'desiredSalary', re: /\bsalary\b|\bcompensation\b|\bpay (range|expectations?)\b|\bctc\b|\bremuneration\b|\b(desired|expected) (pay|rate)\b|\bhourly rate\b/ },
    { key: 'noticePeriod', re: /\bnotice period\b|\bnotice\b/ },
    { key: 'availableStartDate', re: /\b(available|availability|earliest|when can you|when could you|desired|expected|anticipated|potential|preferred) .{0,25}\b(start|join|begin|commence)\b|\bstart(ing)? date\b|\bdate available\b|\bavailable (from|to start)\b|\bjoining date\b|\bwhen can you start\b/ },

    { key: 'currentCompany', re: /\b(current|present|most recent|latest|last) (company|employer|organi[sz]ation|workplace)( name)?\b|^(company|employer|organi[sz]ation)( name)?$/ },
    { key: 'currentTitle', re: /\b(current|present|most recent|latest|last) (job )?(title|role|position|designation)\b|^(job )?title$|^(position|role|designation)$/ },
    { key: 'yearsExperience', test: (t) => (/\b(years?|yrs)\b/.test(t) && /\b(experience|worked|working|using|professional)\b/.test(t)) || /\bhow (many|much) (years|experience)\b/.test(t) },
    { key: 'hasSkill', kinds: CHOICE_KINDS, test: (t, it, ctx) => /\b(do you have|have you|are you (familiar|proficient|comfortable|experienced)|experience (with|in|using)|familiar(ity)? with|proficien\w*|knowledge of)\b/.test(t) && !!findSkill(it.labelRaw, ctx.skills.names) },

    { key: 'transgender', re: /\btransgender\b/ },
    { key: 'sexualOrientation', re: /\bsexual orientation\b/ },
    { key: 'gender', re: /\bgender\b|\bsex\b/ },
    { key: 'hispanicLatino', re: /\bhispanic\b|\blatin[oax]\b/ },
    { key: 'race', re: /\brace\b|\bethnicit\w*/ },
    { key: 'veteran', re: /\bveteran\b|\bmilitary\b|\barmed forces\b/ },
    { key: 'disability', re: /\bdisabilit\w*|\bschwerbehinder\w*|\bbehinderung\b/ },

    { key: 'highestDegree', re: /\bhighest (level of )?(education|degree|qualification)\b|\b(education|degree) level\b|\blevel of (education|study)\b/ },

    { key: 'coverLetter', re: /\bcover ?letter\b|\bmotivation(al)? letter\b|\bnachricht an\b|\bpersonliche nachricht\b|\bmessage (to|for) (the )?(recruiter|hiring|team|us)\b/ },
    { key: 'anythingElse', kinds: ['text'], re: /\banything else\b|\bsomething (else )?(you want|you d like|you would like|youd like) to (tell|share with) us\b|\banything (you want|you d like|youd like|you would like) to (tell|share with) us\b|\bsonst noch (etwas|was)\b|\bnoch etwas mitteilen\b|\b(weitere|sonstige) (anmerkungen|hinweise|bemerkungen|mitteilungen|kommentare)\b|^(anmerkungen|bemerkungen|kommentar|kommentare)$|\badditional (comments|remarks|notes)\b|\bis there anything (else )?(you|we)\b/ },
    { key: 'summary', re: /\b(professional |profile |personal )?summary\b|\babout (yourself|you|me)\b|\btell us (a bit |a little )?about (yourself|you)\b|\bintroduce yourself\b|\bbio\b|\bpersonal statement\b/ },
    { key: 'languages', re: /\blanguages?\b/, not: /\bprogramming\b/ },
    { key: 'skills', re: /\bskills?\b|\btechnologies\b|\btech stack\b/, not: /\byears\b/ },

    { key: 'location', re: /\b(current )?location\b|\bcity (and )?(state|country)\b|\bwhere are you (currently )?(based|located)\b|\bwhere do you (currently )?live\b|\bcity of residence\b|\b(from )?where (do|will|would) you (intend|plan|expect|like)( on| to)? (work|working|be based)\b/, not: /\b(prefer\w*|willing|relocat\w*|desired|office|work location)\b/ },
    { key: 'address2', re: /\baddress (line )?2\b|\baddress2\b|\bapartment\b|\bapt\b|\bsuite\b/ },
    { key: 'address1', re: /\bstreet\b|\baddress (line )?1\b|\baddress1\b|\b(mailing|home|residential|postal|current|street) address\b|^address( line)?$/, not: /\b(e ?mail|ip|web|url)\b/ },
    { key: 'city', re: /\b(city|town)\b/, not: /\b(state|country|zip|postal)\b/ },
    { key: 'state', re: /\b(state|province|region|county)\b/, not: /\bstate (your|the|why|any|whether|how|if|of)\b|\bstatement\b/ },
    { key: 'postalCode', re: /\b(zip|postal|post code|postcode|pin ?code|zipcode)\b/ },
    { key: 'citizenship', re: /\bcitizenship\b|\bnationality\b/ },
    { key: 'country', re: /\bcountry\b/, not: /\b(code|countries|citizenship)\b/ },
    { key: 'workPreference', re: /\b(remote|hybrid|on ?site|in office|work (arrangement|model|setup|mode|location preference)|work from home)\b/ },
  ];

  // German labels (normalised: umlauts dropped, ß → ss).
  const DE_RULES = [
    { key: 'howDidYouHear', re: /\bvon uns erfahren\b|\bwie (hast|habt|haben) (du|ihr|sie) (von )?(uns|der stelle|dieser stelle|diesem job|der position)\b|\baufmerksam geworden\b|\bwie (sind|bist) (sie|du) auf\b|\bwo haben sie (von )?(uns|der stelle|dieser stelle)\b|\bquelle\b|\bwie haben sie (von )?(uns|der stelle)\b/ },
    { key: 'salutation', re: /\banrede\b|\bsalutation\b/ },
    { key: 'academicTitle', re: /\btitel\b|\bakademischer (grad|titel)\b/ },
    { key: 'firstName', re: /\bvornamen?\b/ },
    { key: 'lastName', re: /\bnachnamen?\b|\bfamiliennamen?\b|\bzunamen?\b/ },
    { key: 'fullName', re: /\bvor (und|&) nachname\b|\bvollstandiger name\b|\bvollstaendiger name\b|\bihr name\b/ },
    { key: 'dateOfBirth', re: /\bgeburtsdatum\b|\bgeburtstag\b/ },
    { key: 'phone', re: /\btelefon\w*\b|\bmobil\w*\b|\bhandy\w*\b|\brufnummer\b/ },
    { key: 'xing', re: /\bxing\b/ },
    { key: 'website', re: /\bwebseite\b|\binternetseite\b/ },
    { key: 'sponsorship', test: (t) => /\b(benotigen|brauchen)\b/.test(t) && /\b(visum|arbeitserlaubnis|aufenthalts\w*|arbeitsgenehmigung)\b/.test(t) },
    { key: 'workAuthorized', re: /\barbeitserlaubnis\b|\barbeitsgenehmigung\b|\baufenthaltstitel\b|\bberechtigt\b.*\barbeiten\b/ },
    { key: 'relocate', re: /\bumzug\w*\b|\bumziehen\b|\bumzugsbereit\w*\b/ },
    { key: 'driversLicense', re: /\bfuhrerschein\w*\b|\bfuehrerschein\w*\b/ },
    { key: 'currentSalary', re: /\b(aktuelles|derzeitiges|jetziges) (gehalt|jahresgehalt|bruttogehalt)\b/ },
    { key: 'desiredSalary', re: /\bgehalt\w*\b|\bjahresbrutto\w*\b|\bvergutung\w*\b|\bverguetung\w*\b|\bentgelt\w*\b|\bsalar\b/ },
    { key: 'noticePeriod', re: /\bkundigungsfrist\b|\bkuendigungsfrist\b/ },
    { key: 'availableStartDate', re: /\beintritt\w*\b|\bstarttermin\b|\barbeitsbeginn\b|\bab wann\b|\bverfugbar\w*\b|\bverfuegbar\w*\b|\bfruhest\w*\b|\bfruehest\w*\b/ },
    { key: 'currentCompany', re: /\b(aktueller|derzeitiger|jetziger|letzter) arbeitgeber\b/ },
    { key: 'currentTitle', re: /\b(aktuelle|derzeitige|jetzige|letzte) (position|stelle|tatigkeit|taetigkeit|berufsbezeichnung)\b|^berufsbezeichnung$/ },
    { key: 'yearsExperience', test: (t) => /\bjahre\w*\b/.test(t) && /\b(erfahrung|berufserfahrung)\b/.test(t) },
    { key: 'coverLetter', re: /\banschreiben\b|\bmotivationsschreiben\b|\bmotivation\b/ },
    { key: 'summary', re: /\buber mich\b|\bueber mich\b|\bkurzprofil\b|\bzusammenfassung\b/ },
    { key: 'languages', re: /\bsprach(en|kenntnisse)\b/ },
    { key: 'skills', re: /\bkenntnisse\b|\bfahigkeiten\b|\bfaehigkeiten\b|\bkompetenzen\b/ },
    { key: 'gender', re: /\bgeschlecht\b/ },
    { key: 'citizenship', re: /\bstaatsangehorigkeit\b|\bstaatsangehoerigkeit\b|\bnationalitat\b|\bnationalitaet\b|\bstaatsburgerschaft\b/ },
    { key: 'highestDegree', re: /\bhochster (abschluss|bildungsabschluss|schulabschluss)\b|\bhoechster (abschluss|bildungsabschluss)\b/ },
    { key: 'postalCity', re: /\bplz\b.*\b(ort|wohnort|stadt)\b|\bpostleitzahl\b.*\b(ort|stadt)\b/ },
    { key: 'postalCode', re: /\bplz\b|\bpostleitzahl\b/ },
    { key: 'address1', re: /\bstrasse\b|\bstr\b|\bhausnummer\b|\banschrift\b|^adresse$|\bwohnadresse\b/ },
    { key: 'city', re: /\b(ort|wohnort|stadt)\b/ },
    { key: 'state', re: /\bbundesland\b|\bkanton\b/ },
    { key: 'country', re: /\bland\b|\bwohnsitzland\b|\bherkunftsland\b/ },
  ];

  // Fields that sit inside a "Work experience" or "Education" block.
  const SECTION_RULES = {
    exp: [
      { key: 'current', kinds: ['checkbox'], re: /\b(currently|still) (work|working|employed)\b|\bcurrent (job|role|position|employer)\b|\bpresent\b|\bi work here\b|\bbis heute\b|\baktuell\b|\bderzeit\b/ },
      { key: 'title', re: /\b(job |position |role )?title\b|\bposition\b|\brole\b|\bdesignation\b|\bberufsbezeichnung\b|\bstellenbezeichnung\b|\bfunktion\b/, not: /\bdescription\b|\bbeschreibung\b/ },
      { key: 'company', re: /\bcompany\b|\bemployer\b|\borgani[sz]ation\b|\bfirm\b|\barbeitgeber\b|\bfirma\b|\bunternehmen\b/ },
      { key: 'location', re: /\blocation\b|\bcity\b|\bort\b|\bstandort\b/ },
      { key: 'description', re: /\b(description|responsibilit\w*|duties|achievements|accomplishments|details|beschreibung|tatigkeit\w*|taetigkeit\w*|aufgaben)\b/, not: /\b(experience summary|professional summary|summary of)\b/ },
    ],
    edu: [
      { key: 'school', re: /\b(school|university|college|institution|institute|academy|hochschule|universitat|universitaet|schule|bildungseinrichtung|institut)\b/ },
      { key: 'field', re: /\b(field of study|major|discipline|area of study|speciali[sz]ation|concentration|course of study|subject|studiengang|studienfach|fachrichtung|schwerpunkt)\b/ },
      { key: 'degree', re: /\bdegree\b|\bqualification\b|\bdiploma\b|\babschluss\b/ },
      { key: 'gpa', re: /\b(gpa|cgpa|grade point|grades?|marks|percentage|note|abschlussnote|durchschnitt)\b/ },
      { key: '_none', re: /\b(location|city|country|ort|land)\b/ },
    ],
  };

  // Education questions that are unambiguous even outside an Education block.
  const GLOBAL_EDU = [
    { key: 'school', re: /\b(school|university|college)( name)?$|^(hochschule|universitat|universitaet)$/ },
    { key: 'field', re: /\b(field of study|major|discipline|area of study|studiengang|studienfach|fachrichtung)\b/ },
    { key: 'degree', re: /^degree\b|\bdegree (type|obtained|earned)\b/ },
    { key: 'gpa', re: /\b(gpa|cgpa)\b/ },
    { key: 'end', date: true, re: /\bgraduat\w*\b/ },
  ];

  const SEC_EXP = /\b(work|employment|professional|job|career|relevant) (experience|history)\b|^experience\b|\bemployment\b|\bwork history\b|\bprevious (jobs?|employers?|positions?)\b|\bberufserfahrung\b|\bberuflicher werdegang\b|\bwerdegang\b|\bpraxiserfahrung\b/;
  const SEC_EDU = /\beducation\b|\bacademic\b|\bschools?\b|\buniversit(y|ies)\b|^degrees?\b|^qualifications?\b|\bausbildung\b|\bbildungsweg\b|\bschulbildung\b|\bstudium\b|\bbildung\b/;
  const SEC_REF = /\breferences?\b|\breferees?\b|\bemergency contacts?\b|\bemergency\b|\bnext of kin\b|\bguardian\b|\breferenz\w*\b|\bnotfallkontakt\w*\b/;

  /* ───────────────────────── DOM helpers ───────────────────────── */

  function allRoots() {
    const roots = [document];
    for (let i = 0; i < roots.length; i++) {
      for (const el of roots[i].querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot);
    }
    return roots;
  }
  const qa = (roots, sel) => roots.flatMap((r) => [...r.querySelectorAll(sel)]);
  const byId = (root, id) => (root && root.getElementById ? root.getElementById(id) : null) || document.getElementById(id);

  // Visible to a person: rendered, not faded out or hidden by an ancestor
  // (card-style forms keep later questions in the page, invisible), not
  // parked off-screen, not clipped away inside a sliding panel.
  function isVisible(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    if (el.checkVisibility) {
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    } else {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    }
    return onScreenish(el);
  }

  // Same, for form fields: a field may itself be transparent (a native
  // <select> or checkbox laid over a styled look-alike), its parents may not.
  function isFieldVisible(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    if (el.checkVisibility) {
      if (!el.checkVisibility({ visibilityProperty: true })) return false;
      const p = el.parentElement;
      if (p && p.checkVisibility && !p.checkVisibility({ opacityProperty: true })) return false;
      if (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|file)$/.test(el.type) && getComputedStyle(el).opacity === '0') return false;
    } else {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    }
    return onScreenish(el) && !clippedAway(el);
  }

  function onScreenish(el) {
    const r = el.getBoundingClientRect();
    if (r.right + window.scrollX < 0 || r.bottom + window.scrollY < 0) return false; // parked off-screen
    const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    if (r.left + window.scrollX > docW + 5) return false;
    return r.width > 0 || r.height > 0;
  }

  // Inside an overflow:hidden box (carousel, slide-in step) but outside its visible area.
  function clippedAway(el) {
    const r = el.getBoundingClientRect();
    let n = el.parentElement;
    for (let d = 0; n && d < 25 && n !== document.body && n !== document.documentElement; d++, n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!/hidden|clip/.test(cs.overflowX + ' ' + cs.overflowY)) continue;
      const b = n.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      if (r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom) return true;
    }
    return false;
  }

  // The text inside an element, leaving out form controls, buttons, scripts and
  // pop-up lists. Walks the page instead of copying it.
  const SKIP_TEXT_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'OPTION', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG']);
  function textWithoutControls(node, alsoSkip) {
    if (!node) return '';
    if (node.nodeType === 3) return clean(node.nodeValue);
    let out = '';
    const walk = (n) => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) out += c.nodeValue;
        else if (c.nodeType === 1) {
          const tag = c.tagName.toUpperCase();
          if (SKIP_TEXT_TAGS.has(tag) || (alsoSkip && alsoSkip.has(tag))) continue;
          const role = c.getAttribute('role');
          if (role === 'listbox' || role === 'option') continue;
          out += ' ';
          walk(c);
          out += ' ';
        }
      }
    };
    walk(node);
    return clean(out);
  }

  function labelsText(el) {
    const parts = [];
    const root = el.getRootNode();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) for (const id of lb.split(/\s+/)) {
      const n = byId(root, id);
      if (n && n !== el) parts.push(textWithoutControls(n));
    }
    if (el.labels && el.labels.length) for (const l of el.labels) parts.push(textWithoutControls(l));
    else if (el.id && root.querySelector) {
      const l = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) parts.push(textWithoutControls(l));
    }
    const al = el.getAttribute('aria-label');
    if (al) parts.push(al);
    const ps = uniq(parts.map(clean));
    return ps.filter((x, i) => !ps.some((y, j) => j !== i && norm(y).includes(norm(x)) && (norm(y) !== norm(x) || j < i))).join(' ');
  }

  function groupLabel(el, own) {
    const fs = el.closest('fieldset');
    const grp = el.closest('[role="radiogroup"],[role="group"],[role="list"][aria-labelledby],[role="list"][aria-label]');
    const g = fs && grp ? (fs.contains(grp) ? grp : fs) : fs || grp;
    if (!g) return '';
    // A whole section ("1. Personal Details", "3. Questions"), not this question's own group.
    const ownSet = new Set(own || [el]);
    const others = [...g.querySelectorAll(CONTROL_SEL)].filter((c) => !ownSet.has(c) && c.getAttribute('aria-hidden') !== 'true');
    if (others.length > 3 || g.querySelector('fieldset,[role="radiogroup"]')) return '';
    let t = '';
    if (g.tagName === 'FIELDSET') {
      const lg = g.querySelector('legend');
      if (lg) t = textWithoutControls(lg);
    }
    return t || labelsText(g);
  }

  const CONTROL_SEL = 'input:not([type="hidden"]),select,textarea,[role="combobox"],button[aria-haspopup="listbox"],[role="radio"],[role="checkbox"],[role="listbox"][aria-expanded]';

  // Text near the field when there is no proper <label>: the closest wrapper
  // that holds only this one question, e.g. Lever's
  // <li><div>Full name</div><div><input></div></li>.
  function contextLabel(el, own, optionTexts) {
    const ownSet = new Set(own);
    let node = el.parentElement;
    let text = '';
    for (let depth = 0; node && depth < 6 && node !== document.body && node.tagName !== 'FORM'; depth++, node = node.parentElement) {
      const others = [...node.querySelectorAll(CONTROL_SEL)].filter(
        (c) => !ownSet.has(c) && c.getAttribute('aria-hidden') !== 'true' && !c.disabled && !(c.closest('[role="combobox"]') && ownSet.has(c.closest('[role="combobox"]')))
      );
      if (others.length) break;
      let t = textWithoutControls(node);
      for (const o of optionTexts || []) if (o) t = t.replace(o, ' ');
      t = clean(t);
      if (t.length > 80) {
        // A big wrapper (a whole page section): the label is the text just above the field.
        const near = textJustBefore(el, node, optionTexts);
        if (near) { text = near; break; }
        if (t.length > 300) break;
      }
      if (t) { text = t; break; }
    }
    if (!text) {
      const prev = el.previousElementSibling || (el.parentElement && el.parentElement.previousElementSibling);
      const t = prev && !prev.matches(CONTROL_SEL) && !prev.querySelector(CONTROL_SEL) ? textWithoutControls(prev) : '';
      if (t && t.length <= 150) text = t;
    }
    return text;
  }

  // Walks backwards from the field (previous siblings, then the parents'
  // previous siblings) and returns the first bit of text it meets, stopping at
  // another form control.
  function textJustBefore(el, stopAt, optionTexts) {
    for (let n = el; n && n !== stopAt; n = n.parentElement) {
      for (let sib = n.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (sib.matches(CONTROL_SEL) || sib.querySelector(CONTROL_SEL)) return '';
        let t = textWithoutControls(sib);
        for (const o of optionTexts || []) if (o) t = t.replace(o, ' ');
        t = clean(t);
        if (t) return t.length <= 150 ? t : '';
      }
    }
    return '';
  }

  function attrText(el) {
    const bits = ['name', 'id', 'autocomplete', 'data-automation-id', 'data-qa', 'data-testid', 'data-test'].map((a) => el.getAttribute(a));
    const ff = el.closest('[data-automation-id^="formField"]');
    if (ff) bits.push(ff.getAttribute('data-automation-id'));
    return norm(bits.map(splitAttr).join(' '));
  }

  function optionLabel(el) {
    let t = '';
    if (el.labels && el.labels.length) t = [...el.labels].map(textWithoutControls).join(' ');
    if (!t) t = el.getAttribute('aria-label') || '';
    if (!t && el.getAttribute('aria-labelledby')) t = labelsText(el);
    if (!t && el.tagName !== 'INPUT') t = textWithoutControls(el);
    if (!t && el.nextSibling) t = clean(el.nextSibling.textContent);
    if (!t && el.parentElement && el.parentElement.querySelectorAll('input').length === 1) t = textWithoutControls(el.parentElement);
    if (!t) t = el.value || '';
    return clean(t);
  }

  const isChecked = (e) => (e.tagName === 'INPUT' ? e.checked : e.getAttribute('aria-checked') === 'true' || e.getAttribute('aria-pressed') === 'true');
  const isPlaceholderOpt = (o) =>
    (!o.value && !clean(o.text)) || (/^(select|choose|please|pick|--|—|none selected|-+$|bitte|auswahl|ausw[aä]hlen|w[aä]hlen|keine auswahl)/i.test(clean(o.text)) && (o.index === 0 || !o.value));
  const optText = (o) => clean(o.innerText || o.textContent || '');

  function isEnhancedSelect(sel) {
    // <select> hidden behind select2 / chosen widgets still drives the form.
    if (/select2-hidden-accessible|chosen-select|selectized/.test(sel.className)) return true;
    const sib = sel.nextElementSibling;
    return !!(sib && /select2|chosen-container|selectize/.test(sib.className || ''));
  }

  function visibleComboBox(el) {
    let n = el.parentElement;
    for (let d = 0; n && d < 5 && n !== document.body; d++, n = n.parentElement) {
      if (n.querySelectorAll(CONTROL_SEL).length > 1) return null;
      const r = n.getBoundingClientRect();
      if (r.width >= 40 && r.height >= 20 && isVisible(n) && !clippedAway(n)) return n;
    }
    return null;
  }

  function isComboEl(el) {
    const role = el.getAttribute('role');
    if (role === 'combobox') return true;
    if (el.tagName === 'BUTTON' && el.getAttribute('aria-haspopup') === 'listbox') return true;
    if (el.tagName === 'INPUT' && (el.getAttribute('aria-autocomplete') === 'list' || el.getAttribute('aria-haspopup') === 'listbox')) return true;
    if (role === 'listbox' && el.hasAttribute('aria-expanded') && el.getAttribute('aria-expanded') !== 'true') return true;
    return false;
  }

  // Cookie / consent pop-ups are not part of the application.
  const COOKIE_SEL = '#onetrust-consent-sdk,#onetrust-banner-sdk,#usercentrics-root,#CybotCookiebotDialog,#didomi-host,#cmpbox,#cmpwrapper,.cmpbox,#BorlabsCookieBox,#cookiescript_injected,#ccm19,.ccm-root,.ccm-modal,#iubenda-cs-banner,.cc-window,.cookie-banner,.cookie-consent,#cookie-banner,#cookie-consent,#cookieConsent,[aria-label*="cookie" i],[id^="ccm-"],[class*="cookie-notice"],[class*="CookieConsent"]';
  function inCookieBanner(el) {
    if (el.closest(COOKIE_SEL)) return true;
    const dlg = el.closest('[role="dialog"],[role="alertdialog"],[aria-modal="true"]');
    return !!(dlg && /\bcookies?\b/i.test((dlg.getAttribute('aria-label') || '') + ' ' + (dlg.textContent || '').slice(0, 600)) && !dlg.querySelector('input[type="email"],input[type="file"],textarea'));
  }

  // The list that opens under another dropdown (aria-controls / aria-labelledby point at each other).
  function isPopupOfAnother(el) {
    const root = el.getRootNode();
    if (el.id && root.querySelector && root.querySelector(`[aria-controls~="${CSS.escape(el.id)}"],[aria-owns~="${CSS.escape(el.id)}"]`)) return true;
    const lb = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return lb.some((id) => { const n = byId(root, id); return n && n !== el && (n.getAttribute('role') === 'combobox' || n.getAttribute('aria-haspopup') === 'listbox'); });
  }

  /* ───────────────────────── collect fields ───────────────────────── */

  const INPUT_SKIP = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password', 'range', 'color', 'search']);
  const HONEYPOT = /honeypot|hp_|^hp$|leave (this )?(field )?(blank|empty)|bot_?check|\bnospam\b/i;

  // An open pop-up window with form fields (LinkedIn Easy Apply, "Apply" modals):
  // fields behind it are not part of what you're filling in.
  function openModal(roots) {
    const vw = window.innerWidth * window.innerHeight;
    const cands = qa(roots, '[aria-modal="true"],[role="dialog"],dialog[open]').filter((d) => {
      if (!isVisible(d) || inCookieBanner(d)) return false;
      if (d.querySelectorAll(CONTROL_SEL).length < 2) return false;
      const r = d.getBoundingClientRect();
      return d.getAttribute('aria-modal') === 'true' || d.tagName === 'DIALOG' || r.width * r.height > vw * 0.15;
    });
    return cands.length ? cands[cands.length - 1] : null;
  }

  function collect(roots) {
    const items = [];
    const modal = openModal(roots);
    const radioGroups = new Map();
    const checkboxes = [];
    const ariaRadioGroups = new Map();
    let radioAnon = 0;

    const ariaChecks = new Map();
    for (const el of qa(roots, 'input,select,textarea,[role="combobox"],button[aria-haspopup="listbox"],[role="radio"],[role="checkbox"],[role="listbox"][aria-expanded]')) {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      const tag = el.tagName;
      const type = tag === 'INPUT' ? (el.type || 'text').toLowerCase() : '';
      if (tag === 'INPUT' && INPUT_SKIP.has(type)) continue;
      if (HONEYPOT.test((el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('aria-label') || ''))) continue;
      if (el.getAttribute('aria-hidden') === 'true' && type !== 'file') continue;
      if (modal && !modal.contains(el)) continue; // behind an open pop-up window
      if (el.closest('#__jaf_toast') || inCookieBanner(el)) continue;

      if (type === 'file') {
        let box = el;
        for (let d = 0; box && d < 4 && !isVisible(box); d++) box = box.parentElement;
        if (box && isVisible(box) && !clippedAway(box)) items.push({ kind: 'file', el });
        continue;
      }
      if (type === 'radio') {
        const scope = el.form || el.getRootNode();
        let key = el.name ? scope : el.closest('fieldset,[role="radiogroup"]') || el.parentElement;
        if (!radioGroups.has(key)) radioGroups.set(key, new Map());
        const byName = radioGroups.get(key);
        const name = el.name || '__anon' + (el.closest('fieldset,[role="radiogroup"]') ? '' : radioAnon++);
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(el);
        continue;
      }
      if (el.getAttribute('role') === 'radio' && tag !== 'INPUT') {
        const g = el.closest('[role="radiogroup"]') || el.parentElement;
        if (!ariaRadioGroups.has(g)) ariaRadioGroups.set(g, []);
        ariaRadioGroups.get(g).push(el);
        continue;
      }
      if (type === 'checkbox') {
        if (el.parentElement && el.parentElement.querySelectorAll(':scope > button[aria-pressed]').length >= 2) continue;
        checkboxes.push(el);
        continue;
      }
      if (el.getAttribute('role') === 'checkbox' && tag !== 'INPUT') {
        if (el.querySelector('input[type="checkbox"]')) continue; // the real input inside handles it
        const g = el.closest('[role="group"],[role="list"],fieldset') || el.parentElement;
        if (!ariaChecks.has(g)) ariaChecks.set(g, []);
        ariaChecks.get(g).push(el);
        continue;
      }
      if (el.getAttribute('role') === 'listbox' && (el.closest('[role="combobox"]') || isPopupOfAnother(el) || el.getBoundingClientRect().height < 4)) continue;
      if (el.readOnly && !isComboEl(el)) continue;

      if (tag === 'SELECT') {
        if (isFieldVisible(el) || (isEnhancedSelect(el) && el.parentElement && isVisible(el.parentElement))) items.push({ kind: 'select', el });
        continue;
      }
      if (!isFieldVisible(el) && !(isComboEl(el) && visibleComboBox(el))) continue;
      if (isComboEl(el)) {
        if (tag !== 'INPUT' && tag !== 'BUTTON' && el.querySelector('input')) continue; // the inner input is the real control
        items.push({ kind: 'combo', el });
        continue;
      }
      if (tag === 'TEXTAREA' || tag === 'INPUT') items.push({ kind: 'text', el });
    }

    // Toggle buttons standing in for radio buttons ("Yes" / "No" with aria-pressed).
    const btnGroups = new Map();
    for (const b of qa(roots, 'button[aria-pressed]')) {
      if (!isVisible(b) || clean(b.textContent).length > 40 || (modal && !modal.contains(b))) continue;
      const g = b.parentElement;
      if (!btnGroups.has(g)) btnGroups.set(g, []);
      btnGroups.get(g).push(b);
    }
    for (const [g, els] of btnGroups) if (els.length >= 2 && els.length <= 6) items.push({ kind: 'radio', el: els[0], els, buttonGroup: g });

    const groupVisible = (els) => els.some((r) => isFieldVisible(r) || (r.labels && [...r.labels].some(isVisible)));
    for (const byName of radioGroups.values())
      for (const els of byName.values()) if (groupVisible(els)) items.push({ kind: 'radio', el: els[0], els });
    for (const els of ariaRadioGroups.values()) if (els.some(isFieldVisible)) items.push({ kind: 'radio', el: els[0], els });
    for (const els of ariaChecks.values()) {
      if (!els.some(isFieldVisible)) continue;
      if (els.length > 1) items.push({ kind: 'checkgroup', el: els[0], els });
      else items.push({ kind: 'checkbox', el: els[0] });
    }

    // Checkboxes that share a name are one multi-choice question.
    const cbByName = new Map();
    for (const cb of checkboxes) {
      const k = cb.name ? (cb.form || cb.getRootNode()) : null;
      const key = k ? cb.name : cb;
      const mapKey = k ? k : cb;
      if (!cbByName.has(mapKey)) cbByName.set(mapKey, new Map());
      const m = cbByName.get(mapKey);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(cb);
    }
    for (const m of cbByName.values())
      for (const els of m.values()) {
        if (!groupVisible(els)) continue;
        if (els.length > 1) items.push({ kind: 'checkgroup', el: els[0], els });
        else items.push({ kind: 'checkbox', el: els[0] });
      }

    // Put everything back in on-page order.
    items.sort((a, b) => {
      if (a.el === b.el) return 0;
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
    });
    return items;
  }

  function describe(it) {
    const el = it.el;
    if (it.kind === 'radio' || it.kind === 'checkgroup') {
      it.options = it.els.map(optionLabel);
      const g = it.buttonGroup ? '' : groupLabel(el, it.els);
      const c = it.buttonGroup
        ? contextLabel(it.buttonGroup, [...it.els, ...it.buttonGroup.querySelectorAll('input')], it.options)
        : contextLabel(it.els[it.els.length - 1].closest('label') || it.els[it.els.length - 1], it.els, it.options);
      it.raw = clean(g || c).replace(/\s+(yes|no|ja|nein)$/i, '');
      it.primary = norm(g);
      it.context = norm(clean(c).replace(/\s+(yes|no|ja|nein)$/i, ''));
      it.group = '';
    } else {
      let p = labelsText(el);
      let c = contextLabel(el, [el], []);
      if (it.kind === 'checkbox' && /^(yes|ja|no|nein|i agree|agree|ok|accept|ich stimme zu|zustimmen)\W*$/i.test(clean(p))) {
        // The box only says "Yes": the question around it is the real label.
        const q = contextLabel(el.closest('label') || el, [el], [p]);
        if (q) { c = q; p = ''; }
      }
      it.raw = p || c;
      it.primary = norm(p);
      it.context = norm(c);
      it.group = norm(groupLabel(el));
    }
    it.attrs = attrText(el);
    it.ph = norm(el.getAttribute('placeholder') || el.getAttribute('title') || '');
    const attrName = el.name || el.id || '';
    const randomId = /[A-Za-z0-9]{14,}/.test(attrName.replace(/[a-z]+(?=[A-Z_-]|$)/g, (w) => (w.length > 3 ? '_' : w))) || /[a-z][A-Z][a-z]?[A-Z]/.test(attrName);
    it.labelRaw = clean(it.raw || el.getAttribute('placeholder') || (randomId ? '' : splitAttr(attrName))) || '(unlabelled question)';
    if (/^(month|year|day|mm|yyyy|dd)\W*$/i.test(it.labelRaw)) {
      const outer = groupLabel(el) || (el.parentElement && el.parentElement.previousElementSibling && textWithoutControls(el.parentElement.previousElementSibling)) || '';
      if (outer && outer.length < 60) it.labelRaw = clean(outer.replace(/[*✱]/g, '')) + ' · ' + it.labelRaw;
    }
    it.required = !!(el.required || el.getAttribute('aria-required') === 'true' || /\*|✱|required/i.test(it.raw));
    it.all = clean([it.primary, it.group, it.context, it.attrs, it.ph].join(' '));
  }

  /* ───────────────────────── sections (experience / education) ───────────────────────── */

  function annotateSections(items, roots) {
    const headings = qa(roots, 'h1,h2,h3,h4,h5,h6,[role="heading"]').filter(isVisible);
    const secOf = (t) => (SEC_REF.test(t) ? 'ref' : SEC_EDU.test(t) ? 'edu' : SEC_EXP.test(t) ? 'exp' : null);
    const idxOf = (t) => {
      const m = t.match(/\b(\d{1,2})$/);
      return m ? Math.max(0, parseInt(m[1], 10) - 1) : null;
    };
    for (const it of items) {
      it.section = null;
      it.secIndex = null;
      // 1) a wrapper that names the block (Workday: data-automation-id="workExperienceSection")
      let node = it.el.parentElement;
      for (let d = 0; node && d < 10 && node !== document.body && node.tagName !== 'FORM'; d++, node = node.parentElement) {
        const t = norm(
          [node.getAttribute('aria-label'), splitAttr(node.getAttribute('data-automation-id')), splitAttr(node.id), splitAttr(typeof node.className === 'string' ? node.className : '')].join(' ')
        );
        const s = t && secOf(t);
        if (s) {
          it.section = s;
          const lab = node.getAttribute('aria-label') || '';
          it.secIndex = idxOf(norm(lab));
          break;
        }
      }
      // 2) the nearest heading above the field
      let last = null;
      for (const h of headings) {
        const pos = h.compareDocumentPosition(it.el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING && !(pos & Node.DOCUMENT_POSITION_CONTAINED_BY)) last = h;
      }
      if (last) {
        const t = norm(last.textContent);
        const s = secOf(t);
        if (!it.section && s) it.section = s;
        if (s && s === it.section && it.secIndex == null) it.secIndex = idxOf(t);
      }
    }
    // A block that asks for a "Relationship" (to you) is about someone else:
    // a reference or an emergency contact. Mark the whole block.
    for (const it of items) {
      if (!/\brelationship\b/.test(it.primary || it.context) || /\bstatus\b/.test(it.primary || it.context)) continue;
      let box = it.el.parentElement;
      for (let d = 0; box && d < 8 && box !== document.body; d++, box = box.parentElement) {
        const inside = items.filter((o) => box.contains(o.el));
        if (inside.length >= 3) {
          if (inside.length <= 12) for (const o of inside) o.section = 'ref';
          break;
        }
      }
    }
  }

  /* ───────────────────────── profile helpers ───────────────────────── */

  function parseSkills(P) {
    const years = new Map();
    for (const line of String(P.skillYears || '').split(/\n|;/)) {
      const m = line.match(/^\s*(.+?)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(?:\+|years?|yrs?)?\s*$/i) || line.match(/^\s*(.+?)\s+-\s+(\d+(?:\.\d+)?)/);
      if (m) years.set(m[1].trim(), m[2]);
    }
    const names = uniq([...years.keys(), ...String(P.skills || '').split(/[,\n;]/).map((s) => s.trim())]).filter((s) => s.length > 0 && s.length < 40);
    return { years, names };
  }

  function findSkill(raw, names) {
    const low = String(raw || '').toLowerCase();
    let best = null;
    for (const n of names) {
      const re = new RegExp('(^|[^a-z0-9])' + escapeRe(n.toLowerCase()) + '($|[^a-z0-9])');
      if (re.test(low) && (!best || n.length > best.length)) best = n;
    }
    return best;
  }

  const GENERIC_TAIL = /^(total|overall|professional|relevant|work|industry|this|that|a similar|a related|similar|related|the (field|industry|role)|your|our|software|engineering|development|full time|paid)/;

  function yearsFor(it, ctx) {
    const sk = findSkill(it.labelRaw, [...ctx.skills.years.keys()]);
    if (sk) return ctx.skills.years.get(sk);
    const t = it.primary || it.context;
    const m = t.match(/\b(?:with|in|using|on|of working with)\s+(.+)$/);
    if (m && !/^experience\b/.test(m[1]) && !GENERIC_TAIL.test(m[1])) return null; // asks about a skill you haven't listed
    const mid = t.match(/\byears? of (.+?) (experience|exp)\b/); // "years of B2B SaaS experience"
    if (mid && !GENERIC_TAIL.test(mid[1]) && !/^(work|working|professional|relevant|total|overall|industry|full time|paid|related)$/.test(mid[1])) return null;
    return ctx.P.yearsExperience;
  }

  function parseYM(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    return m ? { y: +m[1], m: +m[2], d: m[3] ? +m[3] : 1 } : null;
  }

  function pageContext() {
    const title = document.title || '';
    let company = '';
    let role = '';
    let m = title.match(/job application for (.+?) at (.+?)(?:\s+[|–-]|$)/i);
    if (m) { role = m[1]; company = m[2]; }
    if (!company && /lever\.co$/.test(location.hostname)) {
      m = title.match(/^(.+?)\s+[-–]\s+(.+)$/);
      if (m) { company = m[1]; role = m[2]; }
    }
    if (!company) {
      const og = document.querySelector('meta[property="og:site_name"]');
      if (og && og.content && !/greenhouse|lever|workday|linkedin|indeed|ashby|smartrecruiters/i.test(og.content)) company = og.content;
    }
    if (!company) {
      m = location.hostname.match(/^([a-z0-9-]+)\.(?:wd\d+\.)?myworkdayjobs\.com$/) ||
        (location.hostname.match(/(greenhouse\.io|lever\.co|ashbyhq\.com)$/) && location.pathname.match(/^\/(?:embed\/job_app\?for=)?([a-z0-9-]+)/i));
      if (m) company = m[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    const h1 = document.querySelector('h1');
    const h1t = h1 ? clean(h1.textContent) : '';
    if (!role && h1t && h1t.length < 90) role = h1t;
    if (!company && role) {
      // "Company - Role" / "Role | Company": the half that isn't the job title.
      const parts = title.split(/\s+[|–—-]\s+/).map(clean).filter(Boolean);
      const other = parts.filter((x) => norm(x) !== norm(role) && !/careers?|jobs?|linkedin|apply|application|indeed|glassdoor|^\(\d+\)/i.test(x));
      if (parts.length >= 2 && parts.length - other.length >= 1 && other[0] && other[0].length < 50) company = other[0];
    }
    return { company: clean(company), role: clean(role) };
  }

  // "Why do you want to work at Discord?" -> "Discord"
  function companyFromLabel(raw) {
    const m = clean(raw).replace(/[*✱]+\s*$/, '').match(/\b(?:at|join|for|with)\s+([A-Z][A-Za-z0-9&.'’\- ]{1,40}?)\s*\??\s*$/);
    if (!m || /^(us|this|the|our|you|it|them|a|an)\b/i.test(m[1])) return '';
    return clean(m[1]);
  }

  function fillTemplate(text, ctx, it) {
    let unresolved = false;
    const company = (it && companyFromLabel(it.labelRaw)) || ctx.page.company;
    const out = String(text || '')
      .replace(/\{\s*company\s*\}/gi, () => company || ((unresolved = true), 'your company'))
      .replace(/\{\s*(role|position|job ?title|title)\s*\}/gi, () => ctx.page.role || ((unresolved = true), 'this role'));
    return { text: out, templated: /\{\s*(company|role|position|job ?title|title)\s*\}/i.test(text || ''), unresolved };
  }

  /* ───────────────────────── resolve: what does this field want? ───────────────────────── */

  // The field's own label first; its small group ("From" around Month/Year) next.
  function sources(it) {
    return uniq([it.primary, clean(it.primary + ' ' + (it.group || '')), it.context, clean(it.attrs + ' ' + it.ph)]);
  }

  function ruleHits(r, t, it, ctx) {
    if (r.kinds && !r.kinds.includes(it.kind)) return false;
    if (r.test) return r.test(t, it, ctx);
    return r.re.test(t) && !(r.not && r.not.test(t));
  }

  function isDateLike(it) {
    const el = it.el;
    if (el.type === 'date' || el.type === 'month') return true;
    if (it.kind === 'select') {
      const texts = [...el.options].map((o) => norm(o.text));
      if (texts.filter(isMonthName).length >= 12) return true;
      if (texts.filter((t) => /^(19|20)\d\d$/.test(t)).length >= 5) return true;
    }
    return /\b(date|dates|month|year|mm|yyyy|yy|period|datum|monat|jahr|zeitraum|jjjj|tt)\b/.test(it.all);
  }

  function datePart(it) {
    if (it.kind === 'select') {
      const texts = [...it.el.options].map((o) => norm(o.text));
      if (texts.filter(isMonthName).length >= 12) return 'month';
      if (texts.filter((t) => /^(19|20)\d\d$/.test(t)).length >= 5) return 'year';
    }
    const own = clean(it.primary + ' ' + it.attrs + ' ' + it.ph);
    const mo = /\b(month|mm|monat)\b/.test(own);
    const yr = /\b(year|yyyy|yy|jahr|jjjj)\b/.test(own);
    if (mo && !yr) return 'month';
    if (yr && !mo) return 'year';
    return 'full';
  }

  function matchCustom(it, list) {
    const label = it.primary || it.context;
    if (!label || !list || !list.length) return null;
    const STOP = new Set('a an the to of for in on at do you your are is be with and or this that we us our here there please i me my it as by what would will can could have has'.split(' '));
    const SYN = { position: 'role', job: 'role', opportunity: 'role', organization: 'company', organisation: 'company', firm: 'company', interested: 'interest', interests: 'interest', join: 'work', joining: 'work', working: 'work' };
    const canon = (w) => SYN[w] || w;
    const ltoks = new Set(label.split(' ').map(canon));
    let best = null;
    let bestScore = 0;
    for (const qa of list) {
      if (!qa || !clean(qa.answer)) continue;
      for (const alt of String(qa.question || '').split(/[|\n;]/)) {
        const q = norm(alt);
        if (!q) continue;
        let score = 0;
        if (label.includes(q)) score = 1 + q.length / 1000;
        else {
          const toks = q.split(' ').filter((w) => !STOP.has(w)).map(canon);
          if (toks.length) {
            const hit = toks.filter((w) => ltoks.has(w)).length;
            if (hit >= Math.min(2, toks.length) && hit / toks.length >= 0.75) score = hit / toks.length - 0.01;
          }
        }
        if (score > bestScore) { bestScore = score; best = qa.answer; }
      }
    }
    return best;
  }

  function resolve(it, ctx) {
    const label = it.primary || it.context;

    if (it.kind === 'file') {
      const kindOf = (h) =>
        /\bcover\b|\banschreiben\b|\bmotivationsschreiben\b/.test(h) ? 'coverLetterFile'
          : /\b(resume|cv|curriculum|lebenslauf)\b/.test(h) ? 'resume'
          : /\b(photo|foto|bewerbungsfoto|picture|portrait|bild|profilbild)\b/.test(h) ? 'photo'
          : /zeugnis|\bcertificates?\b|zertifikat|\btranscripts?\b|\bdiplomas?\b|nachweise?\b/.test(h) ? 'certificates'
          : /\b(portfolio|writing|sample|additional|supporting|other|image|avatar|weitere|sonstige|anlagen?)\b/.test(h) ? 'none'
          : null;
      const own = norm([it.primary, it.context, it.attrs].join(' '));
      if (/\b(auto ?fill|autofill|parse|import) (from|with|using)?\b/.test(own) && /\bresume|cv\b/.test(own) && ctx.fileCount > 1) { it.key = null; return; }
      let k = kindOf(own);
      for (const h of k ? [] : ancestorHints(it.el)) if ((k = kindOf(h))) break;
      it.key = k === 'none' ? null : k || (ctx.fileCount === 1 ? 'resume' : null);
      return;
    }

    if (it.kind === 'checkbox' && ctx.P.autoConsent !== false && isPrivacyConsent(label)) { it.key = 'privacyConsent'; return; }
    if (label && SKIP_RE.test(label)) { it.key = '_skip'; return; }

    const custom = matchCustom(it, ctx.P.customAnswers);
    if (custom) { it.key = 'custom'; it.custom = custom; return; }

    // Someone else's details (a reference, an emergency contact): never yours.
    if (it.section === 'ref') { it.key = null; return; }

    // Inside a Work experience / Education block
    if (it.section) {
      const sec = it.section;
      let hit = null;
      if (it.kind !== 'checkbox' && it.kind !== 'radio' && it.kind !== 'checkgroup' && isDateLike(it)) {
        if (/\b(start|from|begin|since|commenc\w*|von|beginn|seit|ab)\b/.test(it.all)) hit = 'start';
        else if (/\b(end|to|until|finish|graduat\w*|complet\w*|left|bis|ende|abschluss)\b/.test(it.all)) hit = 'end';
        if (hit) it.part = datePart(it);
      }
      if (!hit) {
        outer: for (const src of sources(it)) for (const r of SECTION_RULES[sec]) if (ruleHits(r, src, it, ctx)) { hit = r.key; break outer; }
      }
      if (hit === '_none') { it.key = null; return; }
      if (hit) { setSectionKey(it, sec, hit, ctx); return; }
    }

    for (const src of sources(it)) {
      for (const r of RULES) if (ruleHits(r, src, it, ctx)) { it.key = r.key; return; }
      for (const r of DE_RULES) if (ruleHits(r, src, it, ctx)) { it.key = r.key; it.germanLabel = true; return; }
    }

    for (const src of sources(it)) {
      for (const r of GLOBAL_EDU) {
        if (r.re.test(src)) {
          if (r.date) it.part = datePart(it);
          setSectionKey(it, 'edu', r.key, ctx);
          return;
        }
      }
    }

    if (it.el.type === 'email') it.key = 'email';
    else if (it.el.type === 'tel') it.key = 'phone';
    else it.key = null;
  }

  // "I have read the privacy notice" / "Datenschutzhinweise gelesen" - but not
  // newsletters, SMS, talent pools or contact about future jobs.
  function isPrivacyConsent(label) {
    if (!label) return false;
    if (!/datenschutz|privacy|data protection|datenverarbeitung|verarbeitung (meiner|der|von) (personenbezogenen )?daten|\bgdpr\b|\bdsgvo\b|personal (data|information|details)|personenbezogen|process\w* (of )?(my|your) (personal )?(data|information|details)/.test(label)) return false;
    return !/newsletter|marketing|\bsms\b|text messages?|whatsapp|future (vacancies|opportunities|jobs|roles|positions|openings)|talent ?pool|talentpool|weitere stellen|andere stellen|zukunftig|kunftig|contact me about|kontaktieren|aufbewahr\w* .{0,40}(monate|jahre|longer|langer)/.test(label);
  }

  function setSectionKey(it, sec, field, ctx) {
    const ck = sec + '.' + field + (it.part ? '.' + it.part : '');
    if (!(ck in ctx.counters)) ctx.counters[ck] = 0;
    it.idx = it.secIndex != null ? it.secIndex : ctx.counters[ck];
    ctx.counters[ck]++;
    it.key = sec + '.' + field;
  }

  // Nearest-first descriptions of the wrappers around a file input; stops once
  // a wrapper holds a second upload box (its text would describe both).
  function ancestorHints(el) {
    const out = [];
    let n = el.parentElement;
    for (let d = 0; n && d < 5 && n !== document.body; d++, n = n.parentElement) {
      const attrs = [n.id, n.getAttribute('data-automation-id'), n.getAttribute('aria-label'), typeof n.className === 'string' ? n.className : ''].map(splitAttr).join(' ');
      if (n.querySelectorAll('input[type="file"]').length > 1) { out.push(norm(attrs)); break; }
      out.push(norm(attrs + ' ' + textWithoutControls(n).slice(0, 160)));
    }
    return out;
  }

  /* ───────────────────────── values ───────────────────────── */

  const T = (value, extra = {}) => (clean(value) ? { type: 'text', value: String(value).trim(), ...extra } : null);
  const YN = (value) => (isYes(value) ? { type: 'yesno', value: 'Yes' } : isNo(value) ? { type: 'yesno', value: 'No' } : T(value));
  const D = (ym, part, extra = {}) => {
    const d = parseYM(ym);
    return d ? { type: 'date', date: d, part: part || 'full', ...extra } : null;
  };

  function valueFor(it, ctx) {
    const P = ctx.P;
    const k = it.key;
    if (!k || k === '_skip') return null;

    if (k === 'custom') {
      const f = fillTemplate(it.custom, ctx, it);
      return T(f.text, { review: f.unresolved });
    }

    if (k.startsWith('exp.') || k.startsWith('edu.')) {
      const list = k.startsWith('exp.') ? P.experience : P.education;
      const e = list && list[it.idx];
      if (!e) return null;
      const f = k.slice(4);
      switch (f) {
        case 'start': return D(e.start, it.part);
        case 'end': return e.current ? { type: 'none' } : D(e.end, it.part);
        case 'current': return { type: 'bool', value: !!e.current };
        case 'degree': return T(e.degree, { cands: degreeCands(e.degree) });
        case 'school': return T(e.school, { cands: uniq([e.school, e.school && e.school.replace(/^the /i, '')]) });
        default: return T(e[f]);
      }
    }

    switch (k) {
      case 'fullName': return T([P.firstName, P.lastName].filter(Boolean).join(' '));
      case 'salutation': {
        const g = SALUTATIONS.find(([re]) => re.test(clean(P.salutation)));
        return P.salutation ? T(P.salutation, { cands: uniq([P.salutation, ...(g ? g[1] : [])]) }) : null;
      }
      case 'dateOfBirth': return D(P.dateOfBirth, 'full');
      case 'privacyConsent': return { type: 'bool', value: true };
      case 'ageBracket': {
        const b = parseYM(P.dateOfBirth);
        if (!b) return null;
        const now = new Date();
        let age = now.getFullYear() - b.y;
        if (now.getMonth() + 1 < b.m || (now.getMonth() + 1 === b.m && now.getDate() < b.d)) age--;
        return T(String(age), { numeric: age });
      }
      case 'anythingElse': return YN(clean(P.anythingElse) || 'No');
      case 'howDidYouHear': {
        const v = clean(P.howDidYouHear) || 'Google';
        return T(v, { cands: aliasCands(HEARD, v) });
      }
      case 'maritalStatus': return T(P.maritalStatus, { cands: aliasCands(MARITAL, P.maritalStatus) });
      case 'employmentType': return T(P.employmentType, { cands: aliasCands(EMPLOYMENT_TYPES, P.employmentType) });
      case 'germanLevel':
      case 'englishLevel': return T(P[k], { cands: aliasCands(LANG_LEVELS, P[k]) });
      case 'willingToTravel': return YN(P.willingToTravel);
      case 'speaksGerman':
      case 'speaksEnglish': {
        const lvl = clean(P[k === 'speaksGerman' ? 'germanLevel' : 'englishLevel']).toUpperCase();
        if (!lvl) return null;
        const q = it.primary + ' ' + it.context;
        const RANK = { NONE: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6, NATIVE: 7 };
        const asked = (q.match(/\b(a1|a2|b1|b2|c1|c2)\b/) || [])[1];
        const fluentAsked = /\b(fluent|fliessend|business|verhandlungssicher)\b/.test(q);
        const mine = RANK[lvl] != null ? RANK[lvl] : null;
        if (mine == null) return null;
        const yes = asked ? mine >= RANK[asked.toUpperCase()] : mine >= 5 || (mine === 4 && !fluentAsked);
        return YN(yes ? 'Yes' : 'No');
      }
      case 'weeklyHours': return T(P.weeklyHours, { numeric: parseFloat(P.weeklyHours) });
      case 'postalCity': return T([P.postalCode, P.city].filter(Boolean).join(' '));
      case 'emailAndPhone': return T([P.email, [P.phoneCountryCode, P.phone].filter(Boolean).join(' ')].filter(Boolean).join(', '));
      case 'preferredName': return T(P.preferredName || P.firstName);
      case 'location': {
        const st = P.state && (US_STATES[P.state.toUpperCase()] || P.state);
        const main = [P.city, P.state || P.country].filter(Boolean).join(', ');
        return T(main, { cands: uniq([main, [P.city, st].filter(Boolean).join(', '), [P.city, P.country].filter(Boolean).join(', '), P.city]), search: P.city || main });
      }
      case 'phoneCountryCode': {
        const code = clean(P.phoneCountryCode);
        const digits = code.replace(/\D/g, '');
        const country = countryCands(P.country);
        return code ? T(code, { cands: uniq([...country.map((c) => c + ' ' + digits), ...country, '+' + digits, digits]), search: P.country || digits }) : null;
      }
      case 'country': return T(P.country, { cands: countryCands(P.country) });
      case 'citizenship': return T(P.citizenship, { cands: countryCands(P.citizenship) });
      case 'state': {
        const s = clean(P.state);
        const full = US_STATES[s.toUpperCase()];
        const abbr = Object.keys(US_STATES).find((a) => US_STATES[a].toLowerCase() === s.toLowerCase());
        return T(full || s, { cands: uniq([full || s, s, abbr]) });
      }
      case 'address1': {
        const lineOnly = /\b(street|line ?1|address ?1)\b/.test(it.primary + ' ' + it.context + ' ' + it.attrs);
        if (!lineOnly && !ctx.hasCityField) {
          const full = [P.address1, P.address2, P.city, [P.state, P.postalCode].filter(Boolean).join(' '), P.country].filter((x) => clean(x)).join(', ');
          return T(full);
        }
        return T(P.address1);
      }
      case 'website': return T(P.website || P.portfolio || P.github);
      case 'portfolio': return T(P.portfolio || P.website);
      case 'sponsorship': return YN(P.requiresSponsorship);
      case 'workAuthorized': return YN(P.workAuthorized);
      case 'over18': return YN(P.over18);
      case 'relocate': return YN(P.willingToRelocate);
      case 'driversLicense': return YN(P.driversLicense);
      case 'previouslyEmployed': return YN(P.previouslyEmployed);
      case 'clearance': return T(P.securityClearance);
      case 'currentlyEmployed': {
        const cur = (P.experience || []).find((e) => e && e.current && (e.company || e.title));
        if (!(P.experience || []).some((e) => e && (e.company || e.title))) return null;
        if (it.kind === 'text') return T(cur ? (/\bwhere\b|\bwhich company\b/.test(it.primary + ' ' + it.context) ? `Yes, at ${cur.company || cur.title}` : 'Yes') : 'No');
        return YN(cur ? 'Yes' : 'No');
      }
      case 'citizenOf': {
        const c = mentionedCountry(it.labelRaw);
        if (!c || !clean(P.citizenship)) return null;
        return YN(sameCountry(c, P.citizenship) ? 'Yes' : 'No');
      }
      case 'livesIn': {
        const low = ' ' + norm(it.labelRaw) + ' ';
        const places = uniq([P.city, P.state, US_STATES[(P.state || '').toUpperCase()]]).map(norm).filter((x) => x.length > 1);
        if (places.some((pl) => low.includes(' ' + pl + ' '))) return YN('Yes');
        const c = mentionedCountry(it.labelRaw);
        if (!c || !clean(P.country)) return null;
        return YN(sameCountry(c, P.country) ? 'Yes' : 'No');
      }
      case 'languages': return T(P.languages, { multi: splitList(P.languages) });
      case 'yearsExperience': {
        const y = yearsFor(it, ctx);
        return y != null && clean(y) !== '' ? T(y, { numeric: parseFloat(y) }) : null;
      }
      case 'hasSkill': return { type: 'yesno', value: 'Yes' };
      case 'availableStartDate': {
        const d = estimatedStart(P); // your setting; empty = left for you
        return d ? D(d, 'full') : null;
      }
      case 'highestDegree': {
        const d = P.education && P.education[0] && P.education[0].degree;
        return T(d, { cands: degreeCands(d) });
      }
      case 'coverLetter':
      case 'summary': {
        const f = fillTemplate(k === 'coverLetter' ? P.coverLetter : P.summary, ctx, it);
        return T(f.text, { review: f.unresolved || (k === 'coverLetter' && f.templated) });
      }
      case 'gender':
      case 'veteran':
      case 'disability':
      case 'race':
        return T(P[k], { cands: eeoCands(k, P[k]) });
      case 'hispanicLatino':
      case 'transgender': {
        const v = P[k];
        return isDecline(v) ? T(v, { cands: [v, ...DECLINE] }) : YN(v);
      }
      case 'sexualOrientation': return T(P[k], { cands: isDecline(P[k]) ? [P[k], ...DECLINE] : [P[k]] });
      case 'workPreference': return T(P.workPreference);
      default: return T(P[k]);
    }
  }

  const COUNTRY_WORDS = ['afghanistan', 'argentina', 'australia', 'austria', 'bangladesh', 'belgium', 'brazil', 'bulgaria', 'canada', 'chile', 'china', 'colombia', 'croatia', 'cyprus', 'czech republic', 'czechia', 'denmark', 'egypt', 'estonia', 'finland', 'france', 'germany', 'greece', 'hong kong', 'hungary', 'india', 'indonesia', 'ireland', 'israel', 'italy', 'japan', 'kenya', 'latvia', 'lithuania', 'luxembourg', 'malaysia', 'mexico', 'morocco', 'netherlands', 'new zealand', 'nigeria', 'norway', 'pakistan', 'peru', 'philippines', 'poland', 'portugal', 'romania', 'russia', 'saudi arabia', 'singapore', 'slovakia', 'slovenia', 'south africa', 'south korea', 'korea', 'spain', 'sri lanka', 'sweden', 'switzerland', 'taiwan', 'thailand', 'turkey', 'ukraine', 'united arab emirates', 'uae', 'united kingdom', 'uk', 'united states', 'usa', 'us', 'u s', 'america', 'vietnam'];
  function mentionedCountry(raw) {
    const t = ' ' + norm(raw) + ' ';
    let best = null;
    for (const c of COUNTRY_WORDS) if (t.includes(' ' + c + ' ') && (!best || c.length > best.length)) best = c;
    return best;
  }
  function sameCountry(a, b) {
    const ca = countryCands(a).map(norm);
    const cb = countryCands(b).map(norm);
    return ca.some((x) => cb.includes(x));
  }
  const splitList = (v) => uniq(String(v || '').split(/[,;\n]/).map((x) => clean(x.replace(/\(.*?\)/g, ''))));

  // Estimated start date: a fixed date (only while it's still in the future),
  // otherwise N weeks / months after today (months rounded up to the 1st).
  function estimatedStart(P) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const f = parseYM(P.startDate);
    if (f) {
      const d = new Date(f.y, f.m - 1, f.d);
      if (d >= today) return iso(d);
    }
    const m = String(P.startAfter || '').match(/(\d+)\s*(week|month)/i);
    if (!m) return null;
    if (/week/i.test(m[2])) return iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7 * +m[1]));
    return iso(new Date(today.getFullYear(), today.getMonth() + +m[1] + (today.getDate() > 1 ? 1 : 0), 1));
  }

  // A date picker, even when it's a plain text box (GWT DateBox, flatpickr, jQuery UI…).
  function looksLikeDateBox(it) {
    const el = it.el;
    if (el.type === 'date' || el.type === 'month') return true;
    const hints = [el.className, el.getAttribute('aria-roledescription'), el.getAttribute('data-provide'), el.getAttribute('placeholder'), it.attrs].join(' ');
    if (/date ?box|datepicker|date-picker|flatpickr|hasdatepicker|datumsfeld|\bdatum\b|\bdate\b|\b(mm|dd|tt)\W+(mm|dd|tt)\W+(yyyy|jjjj)\b/i.test(hints)) return true;
    const box = el.parentElement && el.parentElement.parentElement;
    return !!(box && box.querySelector('[class*="calendar" i],[class*="kalender" i],[class*="datepicker" i],[title*="kalender" i],[title*="calendar" i]'));
  }

  function countryCands(c) {
    const n = norm(c);
    if (!n) return [];
    const group = COUNTRY_ALIASES.find((g) => g.includes(n));
    return uniq([c, ...(group || [])]);
  }

  function degreeCands(d) {
    const n = norm(d);
    if (!n) return [];
    const g = DEGREES.find(([re]) => re.test(n));
    return uniq([d, ...(g ? g[1] : [])]);
  }

  function eeoCands(key, v) {
    if (!clean(v)) return [];
    if (isDecline(v)) return uniq([v, ...DECLINE]);
    const g = (EEO_ALIASES[key] || []).find(([re]) => re.test(v));
    return uniq([v, ...(g ? g[1] : [])]);
  }

  function candidates(val, it) {
    if (!val) return [];
    if (val.type === 'yesno') return val.value === 'Yes' ? ['Yes', 'yes', 'true', 'y', 'ja', 'oui', 'si'] : ['No', 'no', 'false', 'n', 'nein', 'non'];
    if (val.type === 'date') {
      const { y, m } = val.date;
      if (val.part === 'month') return [MONTHS[m - 1], MONTHS_DE[m - 1], MONTHS[m - 1].slice(0, 3), MONTHS_DE[m - 1].slice(0, 3), pad2(m), String(m)];
      if (val.part === 'year') return [String(y)];
      return [formatDate(it, val)];
    }
    if (val.type === 'bool') return val.value ? ['Yes', 'true', 'ja'] : ['No', 'false', 'nein'];
    return val.cands && val.cands.length ? val.cands : [val.value];
  }

  function formatDate(it, val) {
    const { y, m, d } = val.date;
    const el = it.el;
    if (val.part === 'month') return pad2(m);
    if (val.part === 'year') return String(y);
    if (el.type === 'date') return `${y}-${pad2(m)}-${pad2(d)}`;
    if (el.type === 'month') return `${y}-${pad2(m)}`;
    const hint = ((el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + it.labelRaw).replace(/tt/gi, 'dd').replace(/jjjj/gi, 'yyyy');
    let f;
    if ((f = hint.match(/dd([/.\- ])mm\1yyyy/i))) return `${pad2(d)}${f[1]}${pad2(m)}${f[1]}${y}`;
    if ((f = hint.match(/mm([/.\- ])dd\1yyyy/i))) return `${pad2(m)}${f[1]}${pad2(d)}${f[1]}${y}`;
    if ((f = hint.match(/yyyy([/.\- ])mm\1dd/i))) return `${y}${f[1]}${pad2(m)}${f[1]}${pad2(d)}`;
    if ((f = hint.match(/mm([/.\- ])yyyy/i))) return `${pad2(m)}${f[1]}${y}`;
    if ((f = hint.match(/yyyy([/.\- ])mm/i))) return `${y}${f[1]}${pad2(m)}`;
    if (/month\s*\/\s*year|monat\s*\/\s*jahr/i.test(hint)) return `${pad2(m)}/${y}`;
    const de = pageLang() === 'de';
    const monthOnly = it.key && /^(exp|edu)\./.test(it.key);
    if (de) return monthOnly ? `${pad2(m)}.${y}` : `${pad2(d)}.${pad2(m)}.${y}`;
    return monthOnly ? `${pad2(m)}/${y}` : `${pad2(m)}/${pad2(d)}/${y}`;
  }

  function textFor(val, it) {
    if (!val) return '';
    let s;
    const de = pageLang() === 'de';
    if (val.type === 'date') s = formatDate(it, val);
    else if (val.type === 'bool') s = val.value ? (de ? 'Ja' : 'Yes') : de ? 'Nein' : 'No';
    else if (val.type === 'yesno' && de) s = val.value === 'Yes' ? 'Ja' : 'Nein';
    else s = String(val.value);
    const el = it.el;
    if (el.type === 'number') {
      const n = s.replace(/[, ]/g, '').match(/-?\d+(\.\d+)?/);
      s = n ? n[0] : '';
    }
    if (el.type === 'url' && s && !/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    if (/^(linkedin|github|twitter|portfolio|website)$/.test(it.key || '') && s && !/^https?:\/\//i.test(s) && /\.[a-z]{2,}/i.test(s) && el.type !== 'url') s = 'https://' + s;
    const max = el.maxLength;
    if (max && max > 0 && s.length > max) s = s.slice(0, max);
    return s;
  }

  // Phone boxes that come pre-filled with a dialling code (react-phone-number-input,
  // intl-tel-input…): keep the code, add the number without its leading 0.
  function phoneText(it, val) {
    const typed = textFor(val, it);
    const existing = clean(it.el.value);
    if (!isDialCodeOnly(existing)) return typed;
    if (/^\s*(\+|00)/.test(typed)) return typed; // your number already has a country code
    const code = existing.replace(/\s+/g, '').replace(/^00/, '+');
    const own = clean(ctx_P_phoneCode).replace(/\s+/g, '').replace(/^00/, '+');
    if (own && own !== code) return own + ' ' + typed.replace(/^\s*0+/, ''); // the box defaulted to another country
    return code + ' ' + typed.replace(/^\s*0+/, '');
  }
  let ctx_P_phoneCode = '';

  /* ───────────────────────── option matching ───────────────────────── */

  function scoreText(o, c) {
    if (!o || !c) return 0;
    if (o === c) return 100;
    if (o.startsWith(c + ' ')) return 85;
    if (hasWord(o, c)) return 70;
    if (o.length >= 3 && c.startsWith(o + ' ')) return 60;
    if (o.length >= 4 && hasWord(c, o)) return 50;
    const ct = c.split(' ');
    if (ct.length >= 2) {
      const ot = new Set(o.split(' '));
      const hit = ct.filter((w) => ot.has(w)).length / ct.length;
      if (hit >= 0.6) return Math.round(35 + 20 * hit);
    }
    return 0;
  }

  function parseRange(text) {
    const t = String(text).toLowerCase();
    const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!nums.length) return /\b(none|no experience|zero)\b/.test(t) ? [0, 0.99] : null;
    if (nums.length === 1) {
      if (/\+|or more|or above|and above|more than|over|above|at least|plus/.test(t)) return [nums[0], Infinity];
      if (/less than|under|below|fewer than|up to|</.test(t)) return [0, nums[0] - 0.01];
      return [nums[0], nums[0]];
    }
    return [nums[0], nums[1]];
  }

  function bestIndex(texts, cands, numeric) {
    let best = -1;
    let bestScore = 0;
    const nc = cands.map(norm).filter(Boolean);
    texts.forEach((raw, i) => {
      const o = norm(raw);
      if (!o) return;
      let s = 0;
      nc.forEach((c, ci) => {
        const sc = scoreText(o, c);
        if (sc) s = Math.max(s, sc - Math.min(ci, 10) * 1.5);
      });
      if (numeric != null && !isNaN(numeric)) {
        const r = parseRange(raw);
        if (r && numeric >= r[0] && numeric <= r[1]) s = Math.max(s, r[0] === r[1] ? 95 : 90);
      }
      if (s > bestScore) { bestScore = s; best = i; }
    });
    return bestScore >= 40 ? best : -1;
  }

  /* ───────────────────────── writing values into the page ───────────────────────── */

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  function fire(el, type) {
    const ev = type === 'input' ? new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }) : new Event(type, { bubbles: true, composed: true });
    el.dispatchEvent(ev);
  }

  // Like a mouse click. `focus` is off for options in a pop-up list: moving
  // keyboard focus onto an option makes many dropdowns close before the click.
  function realClick(el, focus = true) {
    const r = el.getBoundingClientRect();
    const base = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerover', { ...base, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseover', base));
    el.dispatchEvent(new MouseEvent('mousemove', base));
    el.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
    if (focus && el.focus) el.focus({ preventScroll: true });
    el.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseup', base));
    el.dispatchEvent(new MouseEvent('click', base));
  }

  function setText(el, text) {
    if (!text) return false;
    el.focus({ preventScroll: true });
    setNativeValue(el, text);
    fire(el, 'input');
    fire(el, 'change');
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text.slice(-1) }));
    el.blur();
    return clean(el.value) !== '';
  }

  function setSelect(sel, cands, numeric) {
    const opts = [...sel.options].filter((o) => !o.disabled && !isPlaceholderOpt(o));
    let i = bestIndex(opts.map((o) => o.text), cands, numeric);
    if (i < 0) i = bestIndex(opts.map((o) => o.value), cands, null);
    if (i < 0) return false;
    sel.focus({ preventScroll: true });
    setNativeValue(sel, opts[i].value);
    opts[i].selected = true;
    fire(sel, 'input');
    fire(sel, 'change');
    sel.blur();
    return true;
  }

  async function setGroup(it, cands, numeric) {
    const i = bestIndex(it.options, cands, numeric);
    if (i < 0) return false;
    const target = it.els[i];
    if (!isChecked(target)) {
      if (target.tagName === 'INPUT') target.click();
      else realClick(target);
      await sleep(30);
    }
    return true;
  }

  function setCheckbox(el, on) {
    if (isChecked(el) !== on) el.tagName === 'INPUT' ? el.click() : realClick(el);
    return true;
  }

  function visibleOptions(el) {
    const ids = (el.getAttribute('aria-controls') || el.getAttribute('aria-owns') || '').split(/\s+/).filter(Boolean);
    let opts = [];
    for (const id of ids) {
      const s = byId(el.getRootNode(), id);
      if (s) opts.push(...s.querySelectorAll('[role="option"]'));
    }
    if (!opts.length) opts = qa(allRoots(), '[role="option"]');
    return opts.filter((o) => isVisible(o) && o.getAttribute('aria-disabled') !== 'true' && !/^(loading|no (options|results|items|matches))/i.test(optText(o)));
  }

  const OPTIONISH_SEL = '[role="option"],[class*="option" i],[class*="item" i],[class*="choice" i],[class*="suggest" i],li';
  function optionish(roots) {
    return qa(roots, OPTIONISH_SEL).filter((o) => {
      if (o.matches('select,option,input,textarea') || o.querySelector('input,select,textarea')) return false;
      const t = optText(o);
      if (!t || t.length > 120) return false;
      if (o.children.length && [...o.children].some((c) => optText(c) === t)) return false; // innermost only
      return isVisible(o);
    });
  }

  async function pollOptions(el, cands, numeric, wait, before) {
    const end = Date.now() + wait;
    let firstSeen = 0;
    let seen = false;
    while (Date.now() < end) {
      await sleep(120);
      let opts = visibleOptions(el);
      if (!opts.length && before) opts = optionish(allRoots()).filter((o) => !before.has(o));
      if (!opts.length) continue;
      seen = true;
      const i = bestIndex(opts.map(optText), cands, numeric);
      if (i >= 0) return { pick: opts[i], seen };
      if (!firstSeen) firstSeen = Date.now();
      else if (Date.now() - firstSeen > 700) break; // the list is showing and nothing fits
    }
    return { pick: null, seen };
  }

  function typeInto(el, text) {
    el.focus({ preventScroll: true });
    const key = text.slice(-1) || 'Backspace';
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
    setNativeValue(el, text);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key }));
  }

  /* Plain text boxes that pop up their own suggestion list (Lever location,
   * Google Places address boxes, school search…). */
  const SUGGEST_SEL = '[role="option"],.pac-item,[class*="dropdown-location"],[class*="suggestion" i],[class*="autocomplete" i] li,[class*="typeahead" i] li,[class*="dropdown-item"],[class*="result-item" i]';
  const TYPEAHEAD_HINT = /location|autocomplete|typeahead|suggest|places|geo|city/i;

  function looksLikeTypeahead(it) {
    const el = it.el;
    if (!/^(location|city|edu\.school|exp\.location|currentCompany|exp\.company)$/.test(it.key || '')) return false;
    const attrs = [el.className, el.id, el.name, el.getAttribute('data-qa'), el.getAttribute('data-testid')].join(' ');
    if (TYPEAHEAD_HINT.test(attrs) || el.getAttribute('aria-autocomplete')) return true;
    const box = el.parentElement && el.parentElement.parentElement;
    return !!(box && box.querySelector('[class*="dropdown" i],[class*="results" i],[class*="suggest" i],[class*="autocomplete" i]'));
  }

  function suggestions(el) {
    const near = [];
    let box = el.parentElement;
    for (let d = 0; box && d < 3; d++, box = box.parentElement) {
      near.push(...box.querySelectorAll('[class*="dropdown" i] *,[class*="results" i] *,[class*="suggest" i] *,[class*="listbox" i] *'));
      if (near.length) break;
    }
    const all = [...qa(allRoots(), SUGGEST_SEL), ...near];
    return uniq(all).filter((o) => {
      if (o === el || o.contains(el) || o.querySelector('input,select,textarea')) return false;
      const t = optText(o);
      if (!t || t.length > 150 || /^(loading|no (location|results|options|matches)|searching)/i.test(t)) return false;
      if (o.children.length && [...o.children].some((c) => optText(c) === t)) return false; // use the innermost
      return isVisible(o);
    });
  }

  async function setTypeahead(it, val, cands) {
    const el = it.el;
    const before = new Set(suggestions(el));
    const terms = uniq([val.search, val.value]).slice(0, 2);
    for (const term of terms) {
      typeInto(el, term);
      const end = Date.now() + 2600;
      let seenAt = 0;
      while (Date.now() < end) {
        await sleep(150);
        const opts = suggestions(el).filter((o) => !before.has(o));
        if (!opts.length) continue;
        const i = bestIndex(opts.map(optText), cands, null);
        if (i >= 0) {
          realClick(opts[i], false);
          await sleep(200);
          el.blur();
          return clean(el.value) !== '';
        }
        if (!seenAt) seenAt = Date.now();
        else if (Date.now() - seenAt > 800) break;
      }
    }
    // No list showed up: keep the plain text.
    typeInto(el, val.value);
    fire(el, 'change');
    el.blur();
    await sleep(50);
    return clean(el.value) !== '';
  }

  const pressKey = (el, key) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, code: key }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key, code: key }));
  };

  // Custom dropdowns (React-Select, Workday, MUI…): open, find the matching
  // option in the list that pops up, click it.
  async function setCombo(it, cands, numeric, search) {
    const el = it.el;
    const isInput = el.tagName === 'INPUT';
    const before = new Set(optionish(allRoots()));
    realClick(el);
    if (isInput) pressKey(el, 'ArrowDown');
    let r = await pollOptions(el, cands, numeric, 900, before);
    if (!r.pick && !r.seen) {
      // Some dropdowns open from the arrow button next to the box.
      const arrow = el.parentElement && el.parentElement.parentElement && el.parentElement.parentElement.querySelector('[class*="arrow" i],[class*="down" i],[class*="toggle" i],[class*="action-icon" i],button');
      if (arrow && arrow !== el && isVisible(arrow)) { realClick(arrow); r = await pollOptions(el, cands, numeric, 900, before); }
    }
    if (DEBUG) console.log('[jaf] combo open', JSON.stringify(it.labelRaw), 'options:', visibleOptions(el).length, 'pick:', r.pick && optText(r.pick));
    let sawAny = r.seen;
    if (!r.pick && isInput) {
      const first = clean(cands[0] || search || '');
      const longest = first.split(/[\s,()\-–]+/).filter((w) => w.length > 3).sort((a, b) => b.length - a.length)[0];
      for (const term of uniq([search, cands[0], first.split(/[,(]/)[0], longest, cands[1]]).slice(0, 4)) {
        typeInto(el, term);
        r = await pollOptions(el, cands, numeric, 3000, before);
        if (DEBUG) console.log('[jaf] combo typed', JSON.stringify(term), 'options:', visibleOptions(el).map(optText).slice(0, 6), 'pick:', r.pick && optText(r.pick));
        sawAny = sawAny || r.seen;
        if (r.pick) break;
      }
    }
    if (r.pick) {
      realClick(r.pick, false);
      await sleep(150);
      if (isInput) el.blur();
      return true;
    }
    if (isInput) {
      if (!sawAny && !el.getAttribute('aria-controls')) {
        // A plain type-ahead with no list: keep the typed text.
        fire(el, 'change');
        el.blur();
        return clean(el.value) !== '';
      }
      typeInto(el, '');
    }
    pressKey(el, 'Escape');
    if (isInput) el.blur();
    return false;
  }

  function comboHasValue(el, it) {
    if (el.tagName === 'INPUT') {
      if (clean(el.value)) return true;
      const labelBits = uniq([it && it.raw, labelsText(el), ...(el.labels ? [...el.labels].map(textWithoutControls) : [])]);
      let n = el.parentElement;
      for (let d = 0; n && d < 3; d++, n = n.parentElement) {
        if (n.querySelectorAll(CONTROL_SEL).length > 1) break;
        let t = textWithoutControls(n, new Set(['LABEL']));
        for (const b of labelBits) if (b) t = clean(t.replace(b, ''));
        t = t.replace(/^[*✱\s]+|[*✱\s]+$/g, '');
        if (t) return !/^(select|choose|please|search|start typing|type|--|—|none|bitte|ausw[aä]hlen|w[aä]hlen|suchen)\b/i.test(t);
      }
      return false;
    }
    const t = clean(el.innerText || el.textContent);
    return !!t && !/^(select|choose|please|search|start typing|type|--|—|none|bitte|ausw[aä]hlen|w[aä]hlen|suchen)\b/i.test(t);
  }

  function base64ToBytes(dataUrl) {
    const b64 = String(dataUrl).split(',')[1] || '';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function setFile(input, rec) {
    if (!rec || !rec.dataUrl) return false;
    const file = new File([base64ToBytes(rec.dataUrl)], rec.name || 'resume.pdf', { type: rec.type || 'application/pdf', lastModified: Date.now() });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    fire(input, 'input');
    fire(input, 'change');
    return input.files.length > 0;
  }

  const isDialCodeOnly = (v) => /^\s*(\+|00)\s*\d{1,4}\s*$/.test(String(v || ''));

  function hasValue(it) {
    const el = it.el;
    switch (it.kind) {
      case 'text': return clean(el.value) !== '' && !(it.key === 'phone' && isDialCodeOnly(el.value));
      case 'select': {
        const o = el.options[el.selectedIndex];
        return !!o && !isPlaceholderOpt(o);
      }
      case 'radio':
      case 'checkgroup': return it.els.some(isChecked);
      case 'checkbox': return isChecked(el);
      case 'file': return !!(el.files && el.files.length);
      case 'combo': return comboHasValue(el, it);
      default: return false;
    }
  }

  /* ───────────────────────── highlight ───────────────────────── */

  const COLORS = { filled: '#16a34a', review: '#f59e0b' };

  function markTarget(it) {
    let el = it.el;
    if (it.kind === 'radio' || it.kind === 'checkgroup') {
      const g = el.closest('fieldset,[role="radiogroup"],[role="group"]');
      if (g && isVisible(g) && g.getBoundingClientRect().height < 400) return g;
      let common = el.parentElement;
      for (let d = 0; common && d < 4 && !it.els.every((x) => common.contains(x)); d++) common = common.parentElement;
      if (common && it.els.every((x) => common.contains(x)) && isVisible(common) && common.getBoundingClientRect().height < 500) return common;
      el = it.els.find(isChecked) || it.els[0];
    }
    if (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox')) {
      const l = el.labels && el.labels[0];
      if (l && isVisible(l)) return l;
    }
    let n = el;
    const minH = it.kind === 'combo' && el.tagName === 'INPUT' ? 28 : 18;
    for (let d = 0; n && d < 5; d++, n = n.parentElement) {
      if (isVisible(n)) {
        const r = n.getBoundingClientRect();
        if (r.width >= 40 && r.height >= minH && !(it.kind === 'combo' && n.querySelector('label'))) return n;
      }
    }
    return isVisible(el) ? el : null;
  }

  // Triple attribute selector: specific enough to beat sites that force
  // `outline: 0 !important` on their own widgets (React-Select does).
  const MARK_CSS = `[data-jaf="filled"][data-jaf="filled"][data-jaf="filled"]{outline:2px solid ${COLORS.filled}!important;outline-offset:2px!important}` +
    `[data-jaf="review"][data-jaf="review"][data-jaf="review"]{outline:2px solid ${COLORS.review}!important;outline-offset:2px!important}`;

  function ensureStyle(root) {
    const host = root === document ? document.head || document.documentElement : root;
    if (!host || (root.getElementById ? root.getElementById('__jaf_style') : host.querySelector('#__jaf_style'))) return;
    const st = document.createElement('style');
    st.id = '__jaf_style';
    st.textContent = MARK_CSS;
    host.append(st);
  }

  function mark(it, state) {
    const t = markTarget(it);
    if (!t) return;
    ensureStyle(t.getRootNode());
    t.setAttribute('data-jaf', state);
  }

  function clearMarks(roots) {
    for (const e of qa(roots, '[data-jaf]')) e.removeAttribute('data-jaf');
  }

  /* ───────────────────────── main ───────────────────────── */

  const DEFAULTS = { experience: [], education: [], customAnswers: [] };

  async function fillOne(it, ctx, out) {
    const val = valueFor(it, ctx);
    if (val && val.type === 'none') return; // intentionally left blank
    const empty = !hasValue(it);
    const name = it.labelRaw.slice(0, 90) || '(unlabelled field)';

    if (!val) {
      if (ctx.opts.debug) console.log('[jaf] no value', it.kind, it.el.tagName, JSON.stringify(name), '→', it.key, 'empty:', empty);
      if (empty && (it.labelRaw || it.required) && it.kind !== 'file') {
        out.review.push({ label: name, required: it.required });
        mark(it, 'review');
      } else if (empty && it.kind === 'file' && it.key) {
        out.review.push({ label: name + (it.key === 'resume' ? ' (no resume saved)' : ''), required: it.required });
        mark(it, 'review');
      }
      return;
    }
    if (!empty && !ctx.opts.overwrite) { out.kept++; return; }

    const cands = candidates(val, it);
    const numeric = val.numeric != null ? val.numeric : null;
    let ok = false;
    switch (it.kind) {
      case 'text':
        ok = val.type === 'text' && looksLikeTypeahead(it) ? await setTypeahead(it, val, cands) : setText(it.el, it.key === 'phone' ? phoneText(it, val) : textFor(val, it));
        break;
      case 'select': ok = setSelect(it.el, cands, numeric); break;
      case 'radio': ok = await setGroup(it, cands, numeric); break;
      case 'checkgroup':
        if (val.multi && val.multi.length > 1) {
          ok = false;
          for (const one of val.multi) ok = (await setGroup(it, [one], null)) || ok;
        } else ok = await setGroup(it, cands, numeric);
        break;
      case 'checkbox': {
        const on = val.type === 'bool' ? val.value : val.type === 'yesno' ? val.value === 'Yes' : null;
        if (on === null) ok = false;
        else if (!on && !isChecked(it.el)) return; // nothing to do
        else ok = setCheckbox(it.el, on);
        break;
      }
      case 'combo': ok = await setCombo(it, cands, numeric, val.search || (val.type === 'text' ? val.value : cands[0])); break;
    }
    if (ctx.opts.debug) console.log('[jaf]', it.kind, JSON.stringify(name), '→', it.key, it.idx != null ? '#' + it.idx : '', JSON.stringify(cands.slice(0, 4)), ok ? 'OK' : 'FAILED');
    if (ok) {
      out.filled.push(name);
      mark(it, val.review ? 'review' : 'filled');
      if (val.review) out.review.push({ label: name + ' (check the wording)', required: false });
    } else {
      out.review.push({ label: name, required: it.required });
      mark(it, 'review');
    }
  }

  let DEBUG = false;
  async function run(opts = {}) {
    DEBUG = !!opts.debug;
    let store;
    try {
      store = await chrome.storage.local.get(['profile', 'file_photo']);
    } catch (e) {
      return { error: 'The extension was updated. Reload this page and try again.' };
    }
    const out = { url: location.href, fields: 0, filled: [], review: [], kept: 0, noProfile: false };
    if (!store.profile) { out.noProfile = true; return out; }
    const P = Object.assign({}, DEFAULTS, store.profile);
    const roots = allRoots();
    clearMarks(roots);

    const items = collect(roots);
    out.fields = items.length;
    if (!items.length) return out;

    ctx_P_phoneCode = P.phoneCountryCode || '';
    const ctx = {
      P,
      opts,
      counters: {},
      skills: parseSkills(P),
      page: pageContext(),
      files: { photo: store.file_photo },
      fileCount: items.filter((i) => i.kind === 'file').length,
    };

    for (const it of items) describe(it);
    annotateSections(items, roots);
    for (const it of items) {
      try { resolve(it, ctx); } catch (e) { it.key = null; }
    }
    ctx.hasCityField = items.some((i) => i.key === 'city' || i.key === 'postalCode' || i.key === 'postalCity');
    GERMAN_PAGE = /^de/i.test(document.documentElement.lang || '') || items.filter((i) => i.germanLabel).length >= 2;
    if (items.some((i) => i.key === 'firstName') && !items.some((i) => i.key === 'lastName')) {
      for (const i of items) if (i.key === 'fullName' && /^(name|surname)$/.test(i.primary || i.context)) i.key = 'lastName';
    }

    // Files go last: some sites parse an uploaded resume and rewrite fields.
    const ordered = [...items.filter((i) => i.kind !== 'file'), ...items.filter((i) => i.kind === 'file')];
    for (const it of ordered) {
      try {
        if (it.kind === 'file') await fillFileItem(it, ctx, out);
        else await fillOne(it, ctx, out);
      } catch (e) {
        out.review.push({ label: (it.labelRaw || '(field)').slice(0, 90), required: it.required });
      }
    }
    return out;
  }

  async function fillFileItem(it, ctx, out) {
    let name = it.labelRaw.slice(0, 90) || 'File upload';
    const nice = { resume: 'Resume/CV', coverLetterFile: 'Cover letter', certificates: 'Certificates', photo: 'Photo' };
    if (/^(attach|upload|choose|browse|select|add|drop)\b/i.test(name) || name.length > 60) name = nice[it.key] || name.slice(0, 40);
    const empty = !hasValue(it);
    const rec = it.key === 'photo' ? ctx.files.photo : null; // resume, cover letter, certificates: you attach those per company
    if (!rec) {
      if (empty && (it.required || /^(resume|coverLetterFile|certificates)$/.test(it.key || ''))) {
        out.review.push({ label: name + ' (attach your file)', required: it.required });
        mark(it, 'review');
      }
      return;
    }
    if (!empty && !ctx.opts.overwrite) { out.kept++; return; }
    if (setFile(it.el, rec)) {
      out.filled.push(name + ' → ' + rec.name);
      mark(it, 'filled');
    } else {
      out.review.push({ label: name, required: it.required });
      mark(it, 'review');
    }
  }

  window.__jobAutofill = { run, version: 1 };
})();
