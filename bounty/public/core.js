/* Bounty core: every business rule lives here.
 *
 * The same file runs in two places:
 *   - on the server (server.js), with the data kept in a JSON file
 *   - in the browser, as a no-server demo with the data kept in localStorage
 *
 * It works on a plain object (`db`) and answers API-shaped requests through
 * `handle({ method, path, body, userId })`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BountyCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STAGES = [
    { key: 'lead', label: 'Lead' },
    { key: 'contacted', label: 'Contacted' },
    { key: 'meeting', label: 'Meeting' },
    { key: 'proposal', label: 'Proposal' },
    { key: 'won', label: 'Won' },
    { key: 'lost', label: 'Lost' },
  ];
  const STAGE_KEYS = STAGES.map((s) => s.key);
  const CATEGORIES = ['Software', 'Physical product', 'Services', 'Financial', 'Health & wellness', 'Other'];
  const MOTIONS = ['Cold outreach', 'Warm network', 'In person', 'Inbound follow-up', 'Social selling'];
  const CYCLES = ['Under a week', '1 to 4 weeks', '1 to 3 months', 'Over 3 months'];
  const PRICING = ['One-time', 'Monthly', 'Annual'];
  const EXPERIENCE = ['None yet', 'Under 1 year', '1 to 3 years', '3 to 5 years', 'Over 5 years'];
  const COMPANY_STAGES = ['Idea', 'Built, no revenue yet', 'Some revenue', 'Growing fast'];
  const SELLING_TODAY = ['Nobody is selling yet', 'The founders sell', 'An in-house team', 'Agencies or resellers'];
  const HOURS = ['Under 5 a week', '5 to 15 a week', '15 to 30 a week', 'Full time'];
  const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note'];

  function emptyDb() {
    return { seq: 1, users: [], products: [], engagements: [], deals: [], activities: [] };
  }

  // ---------- input cleaning ----------

  function fail(status, error) {
    const e = new Error(error);
    e.status = status;
    throw e;
  }
  const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
  function need(v, label) {
    if (!v) fail(400, label + ' is required.');
    return v;
  }
  function pick(v, options, label) {
    if (!options.includes(v)) fail(400, 'Choose an option for ' + label.toLowerCase() + '.');
    return v;
  }
  function picks(v, options) {
    const list = Array.isArray(v) ? v : v ? [v] : [];
    return options.filter((o) => list.includes(o));
  }
  function amount(v, label, max) {
    const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, ''));
    if (!isFinite(n) || n < 0) fail(400, label + ' needs to be a number.');
    if (n > (max || 1e9)) fail(400, label + ' is too large.');
    return Math.round(n * 100) / 100;
  }
  function link(v) {
    let s = clean(v, 300);
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    if (/\s|["'<>`]/.test(s) || !/^https?:\/\/[^/]+\.[^/]+/i.test(s)) fail(400, 'That link does not look right.');
    return s;
  }
  const normCompany = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/\b(inc|llc|ltd|co|corp|company)\b\.?/g, '')
      .replace(/[^a-z0-9]/g, '');

  function readProduct(b) {
    const commissionType = pick(b.commissionType, ['percent', 'flat'], 'Commission type');
    const commissionValue = amount(b.commissionValue, 'Commission');
    if (commissionValue <= 0) fail(400, 'Commission has to be more than zero.');
    if (commissionType === 'percent' && commissionValue > 100) fail(400, 'A percent commission cannot be over 100.');
    return {
      name: need(clean(b.name, 80), 'Product name'),
      pitch: need(clean(b.pitch, 160), 'One-line pitch'),
      description: clean(b.description, 2000),
      category: pick(b.category, CATEGORIES, 'Category'),
      customer: need(clean(b.customer, 300), 'Who buys it'),
      dealSize: amount(b.dealSize, 'Typical deal value'),
      pricing: pick(b.pricing, PRICING, 'Pricing'),
      commissionType,
      commissionValue,
      cycle: pick(b.cycle, CYCLES, 'Sales cycle'),
      motions: picks(b.motions, MOTIONS),
      territory: clean(b.territory, 120) || 'Anywhere',
      materialsUrl: link(b.materialsUrl),
      qualified: clean(b.qualified, 600),
      objections: clean(b.objections, 600),
    };
  }

  function commissionFor(product, value) {
    if (!product) return 0;
    const c = product.commissionType === 'percent' ? (Number(value) || 0) * (product.commissionValue / 100) : product.commissionValue;
    return Math.round(c * 100) / 100;
  }

  // How well a product suits a salesperson, from the two intake surveys.
  function matchFor(product, rep) {
    const s = rep && rep.survey;
    if (!s) return { score: 0, reasons: [] };
    const reasons = [];
    let score = 0;
    if ((s.categories || []).includes(product.category)) {
      score += 2;
      reasons.push('You have sold ' + product.category.toLowerCase() + ' before');
    }
    const shared = (product.motions || []).filter((m) => (s.motions || []).includes(m));
    if (shared.length) {
      score += shared.length;
      reasons.push('Sells the way you like: ' + shared.join(', ').toLowerCase());
    }
    return { score, reasons };
  }

  function createCore(opts) {
    const db = opts.db;
    const hash = opts.hash || (async (p) => 'plain:' + p);
    const verify = opts.verify || (async (p, h) => h === 'plain:' + p);
    const now = opts.now || (() => Date.now());
    const adminEmails = (opts.adminEmails || []).map((e) => e.toLowerCase());

    const id = () => db.seq++;
    const userById = (uid) => db.users.find((u) => u.id === uid);
    const productById = (pid) => db.products.find((p) => p.id === pid);
    const companyOf = (u) => (u && u.survey && u.survey.company) || (u && u.name) || '';

    function me(u) {
      return { id: u.id, name: u.name, email: u.email, role: u.role, survey: u.survey || null, createdAt: u.createdAt };
    }

    function productView(p, viewer) {
      const owner = userById(p.producerId);
      const reps = db.engagements.filter((e) => e.productId === p.id);
      const out = Object.assign({}, p, {
        company: companyOf(owner),
        companyAbout: (owner && owner.survey && owner.survey.about) || '',
        companyWebsite: (owner && owner.survey && owner.survey.website) || '',
        repCount: reps.length,
        estCommission: commissionFor(p, p.dealSize),
      });
      if (viewer && viewer.role === 'rep') {
        out.joined = reps.some((e) => e.repId === viewer.id);
        out.match = matchFor(p, viewer);
      }
      return out;
    }

    function dealView(d) {
      const p = productById(d.productId);
      const rep = userById(d.repId);
      const acts = db.activities.filter((a) => a.dealId === d.id);
      const last = acts.reduce((m, a) => Math.max(m, a.at), d.createdAt);
      return Object.assign({}, d, {
        productName: p ? p.name : 'Removed product',
        company_producer: p ? companyOf(userById(p.producerId)) : '',
        repName: rep ? rep.name : 'Former salesperson',
        estCommission: d.stage === 'won' ? d.commission : commissionFor(p, d.value),
        lastActivityAt: last,
        touches: acts.filter((a) => a.type !== 'stage').length,
      });
    }

    function canSeeDeal(u, d) {
      if (u.role === 'admin') return true;
      if (u.role === 'rep') return d.repId === u.id;
      const p = productById(d.productId);
      return !!p && p.producerId === u.id;
    }
    const visibleDeals = (u) => db.deals.filter((d) => canSeeDeal(u, d));

    function log(dealId, userId, type, note) {
      const a = { id: id(), dealId, userId, type, note: clean(note, 1000), at: now() };
      db.activities.push(a);
      return a;
    }

    function setStage(d, stage, u) {
      if (stage === d.stage) return;
      if (d.confirmedAt) fail(409, 'This sale is already confirmed, so its stage is locked.');
      const from = d.stage;
      d.stage = stage;
      if (stage === 'won') {
        d.wonAt = now();
        d.commission = commissionFor(productById(d.productId), d.value);
      } else {
        d.wonAt = null;
        d.commission = null;
      }
      const label = (k) => STAGES.find((s) => s.key === k).label;
      log(d.id, u.id, 'stage', label(from) + ' to ' + label(stage));
    }

    // ---------- routes ----------

    const routes = [];
    const on = (method, pattern, roles, fn) => {
      const keys = [];
      const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '(\\d+)')) + '$');
      routes.push({ method, re, keys, roles, fn });
    };
    const ANY = ['producer', 'rep', 'admin'];

    on('POST', '/signup', null, async ({ body }) => {
      const email = clean(body.email, 120).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Enter a valid email address.');
      const name = need(clean(body.name, 80), 'Your name');
      const password = String(body.password || '');
      if (password.length < 8) fail(400, 'Use a password of at least 8 characters.');
      let role = pick(body.role, ['producer', 'rep'], 'Account type');
      if (!body.agree) fail(400, 'You need to accept the pilot terms to join.');
      const pass = await hash(password);
      if (db.users.some((u) => u.email === email)) fail(409, 'That email already has an account. Log in instead.');
      if (adminEmails.includes(email)) role = 'admin';
      const u = { id: id(), email, name, role, pass, survey: role === 'admin' ? {} : null, agreedAt: now(), createdAt: now() };
      db.users.push(u);
      return { status: 201, body: { user: me(u) }, login: u.id };
    });

    on('POST', '/login', null, async ({ body }) => {
      const email = clean(body.email, 120).toLowerCase();
      const u = db.users.find((x) => x.email === email);
      const ok = u ? await verify(String(body.password || ''), u.pass) : false;
      if (!ok) fail(401, 'That email and password do not match.');
      return { body: { user: me(u) }, login: u.id };
    });

    on('POST', '/logout', null, async () => ({ body: { ok: true }, logout: true }));

    on('GET', '/me', null, async ({ user }) => ({ body: { user: user ? me(user) : null } }));

    // The intake survey. A producer's survey also lists their first product,
    // which goes straight onto the marketplace.
    on('POST', '/survey', ['producer', 'rep'], async ({ user, body }) => {
      if (user.role === 'producer') {
        const survey = {
          company: need(clean(body.company, 80), 'Company name'),
          website: link(body.website),
          about: need(clean(body.about, 300), 'What the company does'),
          stage: pick(body.stage, COMPANY_STAGES, 'Company stage'),
          sellingToday: pick(body.sellingToday, SELLING_TODAY, 'How you sell today'),
          goal: clean(body.goal, 400),
        };
        const first = !user.survey;
        const product = first ? readProduct(body) : null;
        user.survey = survey;
        if (product) db.products.push(Object.assign(product, { id: id(), producerId: user.id, status: 'active', createdAt: now() }));
      } else {
        user.survey = {
          location: need(clean(body.location, 80), 'Where you are based'),
          experience: pick(body.experience, EXPERIENCE, 'Sales experience'),
          categories: picks(body.categories, CATEGORIES),
          motions: picks(body.motions, MOTIONS),
          hours: pick(body.hours, HOURS, 'Hours you can put in'),
          network: clean(body.network, 400),
          linkedin: link(body.linkedin),
          why: clean(body.why, 400),
        };
      }
      return { body: { user: me(user) } };
    });

    on('GET', '/products', ANY, async ({ user }) => {
      let list = db.products;
      if (user.role === 'producer') list = list.filter((p) => p.producerId === user.id);
      if (user.role === 'rep') list = list.filter((p) => p.status === 'active' || db.engagements.some((e) => e.productId === p.id && e.repId === user.id));
      const out = list.map((p) => productView(p, user));
      if (user.role === 'rep') out.sort((a, b) => b.match.score - a.match.score || b.estCommission - a.estCommission);
      return { body: { products: out } };
    });

    function findProduct(params, user, ownOnly) {
      const p = productById(params.id);
      if (!p) fail(404, 'That product does not exist.');
      if ((ownOnly || user.role === 'producer') && user.role !== 'admin' && p.producerId !== user.id) fail(403, 'That product belongs to another company.');
      return p;
    }

    on('GET', '/products/:id', ANY, async ({ user, params }) => ({ body: { product: productView(findProduct(params, user), user) } }));

    on('POST', '/products', ['producer'], async ({ user, body }) => {
      if (!user.survey) fail(409, 'Finish your intake survey first.');
      const p = Object.assign(readProduct(body), { id: id(), producerId: user.id, status: 'active', createdAt: now() });
      db.products.push(p);
      return { status: 201, body: { product: productView(p, user) } };
    });

    on('PUT', '/products/:id', ['producer', 'admin'], async ({ user, params, body }) => {
      const p = findProduct(params, user, true);
      if (body.status && Object.keys(body).length === 1) p.status = pick(body.status, ['active', 'paused'], 'Status');
      else Object.assign(p, readProduct(body));
      return { body: { product: productView(p, user) } };
    });

    on('POST', '/products/:id/join', ['rep'], async ({ user, params }) => {
      const p = findProduct(params, user);
      if (!user.survey) fail(409, 'Finish your intake survey first.');
      if (p.status !== 'active') fail(409, 'This product is not taking new salespeople right now.');
      if (!db.engagements.some((e) => e.productId === p.id && e.repId === user.id)) {
        db.engagements.push({ id: id(), productId: p.id, repId: user.id, createdAt: now() });
      }
      return { body: { product: productView(p, user) } };
    });

    on('DELETE', '/products/:id/join', ['rep'], async ({ user, params }) => {
      const open = db.deals.some((d) => d.productId === params.id && d.repId === user.id && !['won', 'lost'].includes(d.stage));
      if (open) fail(409, 'Close or mark lost your open deals on this product first.');
      db.engagements = db.engagements.filter((e) => !(e.productId === params.id && e.repId === user.id));
      return { body: { ok: true } };
    });

    on('GET', '/deals', ANY, async ({ user }) => ({
      body: { deals: visibleDeals(user).map(dealView).sort((a, b) => b.lastActivityAt - a.lastActivityAt) },
    }));

    function readDeal(b) {
      return {
        company: need(clean(b.company, 100), 'Company or customer name'),
        contact: clean(b.contact, 80),
        email: clean(b.email, 120),
        phone: clean(b.phone, 40),
        value: amount(b.value, 'Deal value'),
        notes: clean(b.notes, 1000),
      };
    }

    // Registering a lead claims it: no second salesperson can work the same
    // customer for the same product while the first deal is still alive.
    function checkClaim(productId, company, repId, exceptId) {
      const key = normCompany(company);
      const taken = db.deals.some((d) => d.productId === productId && d.id !== exceptId && d.repId !== repId && d.stage !== 'lost' && normCompany(d.company) === key);
      if (taken) fail(409, 'Another salesperson has already registered this customer for this product.');
    }

    on('POST', '/deals', ['rep'], async ({ user, body }) => {
      const productId = Number(body.productId);
      if (!db.engagements.some((e) => e.productId === productId && e.repId === user.id)) fail(403, 'Start selling this product before adding leads for it.');
      const fields = readDeal(body);
      checkClaim(productId, fields.company, user.id);
      const d = Object.assign(fields, { id: id(), productId, repId: user.id, stage: 'lead', createdAt: now(), wonAt: null, commission: null, confirmedAt: null, paidAt: null });
      db.deals.push(d);
      return { status: 201, body: { deal: dealView(d) } };
    });

    function findDeal(params, user) {
      const d = db.deals.find((x) => x.id === params.id);
      if (!d || !canSeeDeal(user, d)) fail(404, 'That deal does not exist.');
      return d;
    }

    on('GET', '/deals/:id', ANY, async ({ user, params }) => {
      const d = findDeal(params, user);
      const activities = db.activities
        .filter((a) => a.dealId === d.id)
        .sort((a, b) => b.at - a.at)
        .map((a) => Object.assign({}, a, { userName: (userById(a.userId) || {}).name || '' }));
      return { body: { deal: dealView(d), activities } };
    });

    on('PUT', '/deals/:id', ['rep'], async ({ user, params, body }) => {
      const d = findDeal(params, user);
      if (body.company !== undefined) {
        if (d.confirmedAt) fail(409, 'This sale is already confirmed, so it can no longer be edited.');
        const fields = readDeal(body);
        checkClaim(d.productId, fields.company, user.id, d.id);
        Object.assign(d, fields);
        if (d.stage === 'won') d.commission = commissionFor(productById(d.productId), d.value);
      }
      if (body.stage !== undefined) setStage(d, pick(body.stage, STAGE_KEYS, 'Stage'), user);
      return { body: { deal: dealView(d) } };
    });

    on('POST', '/deals/:id/activities', ['rep', 'producer'], async ({ user, params, body }) => {
      const d = findDeal(params, user);
      const type = user.role === 'producer' ? 'note' : pick(body.type, ACTIVITY_TYPES, 'Activity type');
      const a = log(d.id, user.id, type, need(clean(body.note, 1000), 'A short note'));
      return { status: 201, body: { activity: a } };
    });

    // The producer signs off that the sale really happened, then that the
    // commission went out. Only confirmed sales count as commission owed.
    on('POST', '/deals/:id/confirm', ['producer', 'admin'], async ({ user, params }) => {
      const d = findDeal(params, user);
      if (d.stage !== 'won') fail(409, 'Only a won deal can be confirmed.');
      if (!d.confirmedAt) {
        d.confirmedAt = now();
        log(d.id, user.id, 'stage', 'Sale confirmed by ' + (companyOf(user) || 'the producer'));
      }
      return { body: { deal: dealView(d) } };
    });

    on('POST', '/deals/:id/paid', ['producer', 'admin'], async ({ user, params }) => {
      const d = findDeal(params, user);
      if (!d.confirmedAt) fail(409, 'Confirm the sale before marking the commission paid.');
      if (!d.paidAt) {
        d.paidAt = now();
        log(d.id, user.id, 'stage', 'Commission marked paid');
      }
      return { body: { deal: dealView(d) } };
    });

    on('GET', '/activity', ANY, async ({ user }) => {
      const mine = new Map(visibleDeals(user).map((d) => [d.id, d]));
      const items = db.activities
        .filter((a) => mine.has(a.dealId))
        .sort((a, b) => b.at - a.at)
        .slice(0, 40)
        .map((a) => {
          const d = mine.get(a.dealId);
          return Object.assign({}, a, { userName: (userById(a.userId) || {}).name || '', company: d.company, productName: (productById(d.productId) || {}).name || '' });
        });
      return { body: { activity: items } };
    });

    function repStats(rep, deals) {
      const mine = deals.filter((d) => d.repId === rep.id);
      const won = mine.filter((d) => d.stage === 'won');
      const weekAgo = now() - 7 * 864e5;
      return {
        id: rep.id,
        name: rep.name,
        email: rep.email,
        survey: rep.survey,
        open: mine.filter((d) => !['won', 'lost'].includes(d.stage)).length,
        won: won.length,
        wonValue: won.reduce((s, d) => s + d.value, 0),
        touchesThisWeek: db.activities.filter((a) => a.userId === rep.id && a.type !== 'stage' && a.at >= weekAgo && mine.some((d) => d.id === a.dealId)).length,
      };
    }

    on('GET', '/team', ['producer'], async ({ user }) => {
      const myProducts = db.products.filter((p) => p.producerId === user.id);
      const deals = visibleDeals(user);
      const team = [];
      for (const e of db.engagements) {
        const p = myProducts.find((x) => x.id === e.productId);
        const rep = p && userById(e.repId);
        if (!rep) continue;
        let row = team.find((t) => t.id === rep.id);
        if (!row) team.push((row = Object.assign(repStats(rep, deals), { products: [] })));
        row.products.push(p.name);
      }
      return { body: { team: team.sort((a, b) => b.wonValue - a.wonValue || b.open - a.open) } };
    });

    on('GET', '/admin', ['admin'], async ({ user }) => ({
      body: {
        users: db.users.map((u) => Object.assign(me(u), { company: u.role === 'producer' ? companyOf(u) : '' })),
        products: db.products.map((p) => productView(p, user)),
        deals: db.deals.map(dealView),
        reps: db.users.filter((u) => u.role === 'rep').map((r) => repStats(r, db.deals)).sort((a, b) => b.wonValue - a.wonValue),
      },
    }));

    async function handle(req) {
      try {
        const user = req.userId ? userById(req.userId) : null;
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = r.re.exec(req.path);
          if (!m) continue;
          if (r.roles) {
            if (!user) fail(401, 'Log in to continue.');
            if (!r.roles.includes(user.role)) fail(403, 'Your account cannot do that.');
          }
          const params = {};
          r.keys.forEach((k, i) => (params[k] = Number(m[i + 1])));
          const body = req.body && typeof req.body === 'object' ? req.body : {};
          const res = await r.fn({ user, body, params });
          return Object.assign({ status: 200 }, res);
        }
        fail(404, 'Not found.');
      } catch (e) {
        if (e.status) return { status: e.status, body: { error: e.message } };
        throw e;
      }
    }

    return { handle };
  }

  // ---------- demo data ----------

  async function seed(db, hash) {
    if (db.users.length) return false;
    const DAY = 864e5;
    const t0 = Date.now();
    const pass = await hash('demo1234');
    const ago = (days) => Math.round(t0 - days * DAY);
    const nid = () => db.seq++;
    const user = (name, email, role, survey, days) => {
      const u = { id: nid(), name, email, role, pass, survey, agreedAt: ago(days), createdAt: ago(days) };
      db.users.push(u);
      return u;
    };
    const product = (owner, days, f) => {
      const p = Object.assign({ id: nid(), producerId: owner.id, status: 'active', createdAt: ago(days), description: '', objections: '', materialsUrl: '', territory: 'Anywhere' }, f);
      db.products.push(p);
      return p;
    };

    user('Bounty Admin', 'admin@example.com', 'admin', {}, 40);
    const sam = user('Sam Whitaker', 'producer@example.com', 'producer', { company: 'Ledgerleaf', website: 'https://example.com', about: 'Bookkeeping software built for small contractors and trades.', stage: 'Some revenue', sellingToday: 'The founders sell', goal: 'Reach 200 paying crews without hiring a sales team.' }, 34);
    const ines = user('Ines Okafor', 'ines@example.com', 'producer', { company: 'Frontdesk AI', website: 'https://example.com', about: 'An AI receptionist that answers and books calls for dental offices.', stage: 'Growing fast', sellingToday: 'An in-house team', goal: 'Cover cities our two reps cannot reach.' }, 30);
    const cal = user('Cal Brandt', 'cal@example.com', 'producer', { company: 'Second Shot Coffee', website: 'https://example.com', about: 'Leases commercial espresso machines to offices, with beans on subscription.', stage: 'Some revenue', sellingToday: 'Nobody is selling yet', goal: 'Land the first 25 office accounts.' }, 21);

    const ledger = product(sam, 33, { name: 'Ledgerleaf Crew Plan', pitch: 'Bookkeeping that a five-person contracting crew can run from a phone.', description: 'Job costing, receipt capture and quarterly tax estimates in one app. Most crews are set up inside a week, and the first month is free so the owner can see their real numbers before paying.', category: 'Software', customer: 'Owners of contracting and trades businesses with 2 to 15 people who still do the books in a spreadsheet or a shoebox.', dealSize: 1800, pricing: 'Annual', commissionType: 'percent', commissionValue: 20, cycle: '1 to 4 weeks', motions: ['Warm network', 'Cold outreach', 'In person'], qualified: 'Owner-operator, at least two employees, no bookkeeper on staff.', objections: 'Most say their accountant handles it. Ask how long it takes to learn whether a job made money.', materialsUrl: 'https://example.com/ledgerleaf-deck' });
    const ledgerPay = product(sam, 12, { name: 'Ledgerleaf Payroll Add-on', pitch: 'Run payroll for hourly crews straight from the timesheets they already fill in.', category: 'Software', customer: 'Existing Ledgerleaf customers and crews with hourly staff.', dealSize: 900, pricing: 'Annual', commissionType: 'flat', commissionValue: 150, cycle: 'Under a week', motions: ['Inbound follow-up', 'Warm network'], qualified: 'Has hourly employees and pays them weekly or every two weeks.' });
    const front = product(ines, 29, { name: 'Frontdesk AI Receptionist', pitch: 'Answers every call to a dental office and books the appointment, day or night.', description: 'Plugs into the practice calendar. Offices typically recover 30 or more missed calls a month. Setup is done for them and there is a 60 day money-back guarantee.', category: 'Software', customer: 'Independent dental practices with one to three locations.', dealSize: 3600, pricing: 'Annual', commissionType: 'percent', commissionValue: 25, cycle: '1 to 4 weeks', motions: ['Cold outreach', 'In person', 'Social selling'], qualified: 'Practice owner or office manager, misses calls at lunch or after hours.', objections: 'Worry that patients dislike talking to AI. Offer the live demo line.', territory: 'United States' });
    const coffee = product(cal, 20, { name: 'Office Espresso Lease', pitch: 'A cafe-grade espresso machine for the office, serviced and stocked for a flat monthly fee.', description: 'We install, maintain and restock. The office gets a 12 month lease and never thinks about coffee again.', category: 'Physical product', customer: 'Offices of 20 to 150 people with a kitchen and an office manager.', dealSize: 6500, pricing: 'Monthly', commissionType: 'percent', commissionValue: 12, cycle: '1 to 3 months', motions: ['In person', 'Warm network'], qualified: 'At least 20 people in the office three days a week.', territory: 'Chicago area' });

    const maya = user('Maya Torres', 'rep@example.com', 'rep', { location: 'Chicago, IL', experience: '1 to 3 years', categories: ['Software', 'Services'], motions: ['Warm network', 'Cold outreach'], hours: '5 to 15 a week', network: 'Family runs a roofing company; I know a lot of trades owners.', linkedin: '', why: 'Side income while I finish school.' }, 28);
    const devon = user('Devon Park', 'devon@example.com', 'rep', { location: 'Austin, TX', experience: '3 to 5 years', categories: ['Software', 'Health & wellness'], motions: ['Cold outreach', 'Social selling'], hours: '15 to 30 a week', network: 'Former dental supply rep.', linkedin: '', why: 'Want to pick my own products.' }, 26);
    const priya = user('Priya Shah', 'priya@example.com', 'rep', { location: 'Chicago, IL', experience: 'Under 1 year', categories: ['Physical product'], motions: ['In person'], hours: 'Under 5 a week', network: 'Office managers from my last job.', linkedin: '', why: 'Trying sales out.' }, 15);

    const join = (rep, p, days) => db.engagements.push({ id: nid(), productId: p.id, repId: rep.id, createdAt: ago(days) });
    join(maya, ledger, 27); join(maya, front, 20); join(devon, front, 25); join(devon, ledger, 18); join(priya, coffee, 14);

    // [rep, product, company, contact, value, stage, ageDays, confirmed, paid, touches]
    const rows = [
      [maya, ledger, 'Torres Roofing', 'Luis Torres', 1800, 'won', 24, true, true, [['call', 'Walked Luis through job costing on his phone.', 23], ['meeting', 'Set up his first three jobs together.', 19]]],
      [maya, ledger, 'Hollis Plumbing', 'Dana Hollis', 1800, 'won', 16, true, false, [['email', 'Sent the deck and the free month link.', 15], ['call', 'Dana wants the payroll add-on later.', 9]]],
      [maya, ledger, 'Bright Spark Electric', 'Aiden Cole', 3600, 'proposal', 11, false, false, [['call', 'Two crews, wants both on one account.', 10], ['email', 'Sent pricing for two crews.', 3]]],
      [maya, ledger, 'Keystone Drywall', 'Marta Reyes', 1800, 'meeting', 8, false, false, [['call', 'Booked a demo for Thursday.', 2]]],
      [maya, ledger, 'Greenline Landscaping', 'Owen Park', 1800, 'contacted', 6, false, false, [['email', 'Intro through my uncle.', 5]]],
      [maya, front, 'Lakeview Dental', 'Dr. Amara Singh', 3600, 'contacted', 5, false, false, [['call', 'Left a voicemail with the office manager.', 4]]],
      [maya, front, 'Wicker Park Smiles', '', 3600, 'lead', 1, false, false, []],
      [maya, ledger, 'Northside Painting', 'Jo Lin', 1800, 'lost', 20, false, false, [['call', 'Happy with their bookkeeper for now.', 14]]],
      [devon, front, 'Barton Creek Dental', 'Dr. Lee Vance', 7200, 'won', 22, true, true, [['meeting', 'Demo with both locations.', 18]]],
      [devon, front, 'South Lamar Family Dentistry', 'Rae Kim', 3600, 'won', 12, false, false, [['call', 'Signed after the live demo line.', 2]]],
      [devon, front, 'Hill Country Orthodontics', 'Sam Ortiz', 3600, 'proposal', 9, false, false, [['email', 'Sent the 60 day guarantee terms.', 1]]],
      [devon, ledger, 'Lone Star Fencing', 'Beth Howe', 1800, 'meeting', 7, false, false, [['call', 'Demo booked for next week.', 3]]],
      [priya, coffee, 'Harbor Analytics', 'Nell Ford', 6500, 'meeting', 10, false, false, [['meeting', 'Tasting in their kitchen went well.', 4]]],
      [priya, coffee, 'Fulton Design Studio', 'Kai Brooks', 6500, 'contacted', 6, false, false, [['email', 'Sent the lease one-pager.', 6]]],
    ];
    const order = ['lead', 'contacted', 'meeting', 'proposal'];
    for (const [rep, p, company, contact, value, stage, age, confirmed, paid, touches] of rows) {
      const d = { id: nid(), productId: p.id, repId: rep.id, company, contact, email: '', phone: '', value, notes: '', stage, createdAt: ago(age), wonAt: null, commission: null, confirmedAt: null, paidAt: null };
      if (stage === 'won') {
        d.wonAt = ago(age * 0.4);
        d.commission = commissionFor(p, value);
        if (confirmed) d.confirmedAt = ago(age * 0.3);
        if (paid) d.paidAt = ago(age * 0.15);
      }
      db.deals.push(d);
      for (const [type, note, days] of touches) db.activities.push({ id: nid(), dealId: d.id, userId: rep.id, type, note, at: ago(days) });
      if (stage !== 'lead') {
        const to = STAGES.find((s) => s.key === stage).label;
        const prev = order.includes(stage) ? order[order.indexOf(stage) - 1] : 'proposal';
        const from = STAGES.find((s) => s.key === prev).label;
        db.activities.push({ id: nid(), dealId: d.id, userId: rep.id, type: 'stage', note: from + ' to ' + to, at: d.wonAt || ago(Math.max(age * 0.5, 0.5)) });
      }
    }
    void ledgerPay;
    return true;
  }

  return { createCore, seed, emptyDb, commissionFor, matchFor, STAGES, CATEGORIES, MOTIONS, CYCLES, PRICING, EXPERIENCE, COMPANY_STAGES, SELLING_TODAY, HOURS, ACTIVITY_TYPES };
});
