/* Bounty front end: a small hash-routed app with no build step.
 * Talks to /api when the server is there; otherwise runs the same core logic
 * in the browser against localStorage (demo mode). */
(function () {
  'use strict';
  const C = window.BountyCore;
  const $app = document.getElementById('app');
  const state = { user: null, demo: false, local: false, toast: '', filter: 'All', editing: false };

  // ---------- small helpers ----------

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const stageLabel = (k) => (C.STAGES.find((s) => s.key === k) || {}).label || k;
  const isOpen = (d) => d.stage !== 'won' && d.stage !== 'lost';
  const NEXT = { lead: 'contacted', contacted: 'meeting', meeting: 'proposal', proposal: 'won' };
  function ago(t) {
    const d = Math.floor((Date.now() - t) / 864e5);
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 30) return d + ' days ago';
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const terms = (p) => (p.commissionType === 'percent' ? p.commissionValue + '% of each sale' : money(p.commissionValue) + ' flat per sale');
  const first = (name) => String(name || '').split(' ')[0];

  const mem = {};
  const store = {
    get(k) {
      try {
        const v = localStorage.getItem('bounty.' + k);
        return v == null ? mem[k] : JSON.parse(v);
      } catch (e) {
        return mem[k];
      }
    },
    set(k, v) {
      mem[k] = v;
      try {
        localStorage.setItem('bounty.' + k, JSON.stringify(v));
      } catch (e) {}
    },
    del(k) {
      delete mem[k];
      try {
        localStorage.removeItem('bounty.' + k);
      } catch (e) {}
    },
  };

  // ---------- api ----------

  let localCore = null;
  let localDb = null;

  async function startLocal(reset) {
    localDb = (!reset && store.get('db')) || C.emptyDb();
    if (!localDb.users || !localDb.users.length) {
      localDb = C.emptyDb();
      await C.seed(localDb, async (p) => 'plain:' + p);
      store.set('db', localDb);
    }
    localCore = C.createCore({ db: localDb });
  }

  async function api(method, path, body) {
    if (state.local) {
      const out = await localCore.handle({ method, path, body, userId: store.get('uid') || null });
      if (out.login) store.set('uid', out.login);
      if (out.logout) store.del('uid');
      if (method !== 'GET') store.set('db', localDb);
      if (out.status >= 400) throw Object.assign(new Error(out.body.error), { status: out.status });
      return JSON.parse(JSON.stringify(out.body));
    }
    let res;
    try {
      res = await fetch('api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    } catch (e) {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: res.status });
    return data;
  }

  // ---------- routing ----------

  function parseHash() {
    const m = /^([a-z-]+?)(?:-(\d+))?$/.exec(location.hash.slice(1));
    return m ? { name: m[1], id: m[2] ? Number(m[2]) : null } : { name: '', id: null };
  }
  function go(name) {
    state.editing = false;
    if (location.hash.slice(1) === name) render();
    else location.hash = name;
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    state.toast = msg;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => {
      state.toast = '';
      const el = document.querySelector('.toast');
      if (el) el.remove();
    }, 3500);
  }

  // ---------- forms ----------

  const opt = (o) => (Array.isArray(o) ? o : [o, o]);

  function field(f, values) {
    const v = values && values[f.name] != null ? values[f.name] : f.value != null ? f.value : '';
    const id = 'f-' + f.name;
    const req = f.required ? ' required' : '';
    const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
    const label = `<label for="${id}">${esc(f.label)}${f.required ? '' : ' <span class="optional">optional</span>'}</label>`;
    let control;
    if (f.type === 'textarea') {
      control = `<textarea id="${id}" name="${f.name}" rows="3" maxlength="${f.max || 600}"${req} placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
    } else if (f.type === 'select') {
      control = `<select id="${id}" name="${f.name}"${req}><option value="">Choose one</option>${f.options
        .map(opt)
        .map(([val, text]) => `<option value="${esc(val)}"${String(v) === String(val) ? ' selected' : ''}>${esc(text)}</option>`)
        .join('')}</select>`;
    } else if (f.type === 'multi') {
      const chosen = Array.isArray(v) ? v : [];
      return `<fieldset class="field wide"><legend>${esc(f.label)}</legend>${hint}<div class="chips">${f.options
        .map((o, i) => `<label class="chip"><input type="checkbox" id="${id}-${i}" name="${f.name}" value="${esc(o)}"${chosen.includes(o) ? ' checked' : ''}><span>${esc(o)}</span></label>`)
        .join('')}</div></fieldset>`;
    } else if (f.type === 'money') {
      control = `<div class="money"><span>$</span><input id="${id}" name="${f.name}" inputmode="decimal" value="${esc(v)}"${req} placeholder="${esc(f.placeholder || '')}"></div>`;
    } else {
      control = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}"${req} maxlength="${f.max || 200}" placeholder="${esc(f.placeholder || '')}"${f.auto ? ` autocomplete="${f.auto}"` : ''}>`;
    }
    return `<div class="field${f.wide || f.type === 'textarea' ? ' wide' : ''}">${label}${control}${hint}</div>`;
  }
  const fields = (list, values) => `<div class="fields">${list.map((f) => field(f, values)).join('')}</div>`;

  function formValues(form) {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || (el.type === 'radio' && !el.checked)) continue;
      if (el.type === 'checkbox') {
        if (el.dataset.single) out[el.name] = el.checked;
        else {
          out[el.name] = out[el.name] || [];
          if (el.checked) out[el.name].push(el.value);
        }
      } else out[el.name] = el.value;
    }
    return out;
  }

  const COMPANY_FIELDS = [
    { name: 'company', label: 'Company name', required: true, max: 80 },
    { name: 'website', label: 'Website', placeholder: 'yourcompany.com' },
    { name: 'about', label: 'What does the company do?', type: 'textarea', required: true, max: 300, hint: 'A sentence or two a salesperson could repeat to a customer.' },
    { name: 'stage', label: 'Where is the company today?', type: 'select', options: C.COMPANY_STAGES, required: true },
    { name: 'sellingToday', label: 'Who sells for you today?', type: 'select', options: C.SELLING_TODAY, required: true },
    { name: 'goal', label: 'What would make this a win in six months?', type: 'textarea', max: 400 },
  ];
  const PRODUCT_FIELDS = [
    { name: 'name', label: 'Product name', required: true, max: 80 },
    { name: 'category', label: 'Category', type: 'select', options: C.CATEGORIES, required: true },
    { name: 'pitch', label: 'One-line pitch', required: true, max: 160, wide: true, hint: 'This is the headline salespeople see on the products page.' },
    { name: 'description', label: 'More detail', type: 'textarea', max: 2000, placeholder: 'What it does, why customers pick it, any guarantee or trial.' },
    { name: 'customer', label: 'Who buys it?', type: 'textarea', required: true, max: 300, placeholder: 'For example: owners of dental practices with one to three locations.' },
    { name: 'dealSize', label: 'Typical deal value', type: 'money', required: true, hint: 'What one sale is worth to you. Use the first-year value for subscriptions.' },
    { name: 'pricing', label: 'How is it priced?', type: 'select', options: C.PRICING, required: true },
    { name: 'commissionType', label: 'Commission you will pay', type: 'select', required: true, options: [['percent', 'A percent of each sale'], ['flat', 'A flat amount per sale']] },
    { name: 'commissionValue', label: 'Commission amount', required: true, placeholder: '20', hint: 'Enter 20 for 20%, or the dollar amount if flat.' },
    { name: 'cycle', label: 'How long does a sale usually take?', type: 'select', options: C.CYCLES, required: true },
    { name: 'territory', label: 'Where can it be sold?', placeholder: 'Anywhere' },
    { name: 'motions', label: 'How does it usually get sold?', type: 'multi', options: C.MOTIONS, hint: 'We use this to match you with salespeople who work the same way.' },
    { name: 'qualified', label: 'What does a good lead look like?', type: 'textarea', max: 600 },
    { name: 'objections', label: 'Common objections and how to answer them', type: 'textarea', max: 600 },
    { name: 'materialsUrl', label: 'Link to a deck, demo or one-pager', placeholder: 'https://', wide: true, max: 300 },
  ];
  const REP_FIELDS = [
    { name: 'location', label: 'Where are you based?', required: true, placeholder: 'City, state', max: 80 },
    { name: 'experience', label: 'How much sales experience do you have?', type: 'select', options: C.EXPERIENCE, required: true },
    { name: 'categories', label: 'What have you sold, or want to sell?', type: 'multi', options: C.CATEGORIES, hint: 'Products in these categories show up first for you.' },
    { name: 'motions', label: 'How do you like to sell?', type: 'multi', options: C.MOTIONS },
    { name: 'hours', label: 'How much time can you put in?', type: 'select', options: C.HOURS, required: true },
    { name: 'linkedin', label: 'LinkedIn or personal site', placeholder: 'linkedin.com/in/you', max: 300 },
    { name: 'network', label: 'Who do you already know?', type: 'textarea', max: 400, placeholder: 'Industries, communities or kinds of business owners you can reach without a cold call.' },
    { name: 'why', label: 'What are you hoping to get out of this?', type: 'textarea', max: 400 },
  ];
  const dealFields = (products) => [
    ...(products ? [{ name: 'productId', label: 'Product', type: 'select', required: true, wide: true, options: products.map((p) => [p.id, p.name + ' (' + p.company + ')']) }] : []),
    { name: 'company', label: 'Company or customer', required: true, max: 100 },
    { name: 'value', label: 'Deal value', type: 'money', required: true },
    { name: 'contact', label: 'Contact name', max: 80 },
    { name: 'email', label: 'Contact email', type: 'email', max: 120 },
    { name: 'phone', label: 'Contact phone', type: 'tel', max: 40 },
    { name: 'notes', label: 'Notes', type: 'textarea', max: 1000 },
  ];

  // ---------- shared pieces ----------

  const stat = (label, value, sub) => `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div>${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ''}</div>`;
  const pill = (stage) => `<span class="pill pill-${esc(stage)}">${esc(stageLabel(stage))}</span>`;
  const empty = (title, text, link) => `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${link || ''}</div>`;

  function payState(d) {
    if (d.stage !== 'won') return '';
    if (d.paidAt) return `<span class="pay pay-paid">Commission paid ${esc(ago(d.paidAt))}</span>`;
    if (d.confirmedAt) return '<span class="pay pay-owed">Sale confirmed, commission owed</span>';
    return '<span class="pay pay-wait">Waiting for the producer to confirm</span>';
  }

  // The commission ticket: the one thing every salesperson looks at first.
  function ticket(p, link) {
    const fit = p.match && p.match.score >= 3 ? '<span class="badge badge-fit">Strong fit</span>' : p.match && p.match.score > 0 ? '<span class="badge badge-fit">Good fit</span>' : '';
    const selling = p.joined ? '<span class="badge badge-on">You sell this</span>' : '';
    const paused = p.status === 'paused' ? '<span class="badge">Paused</span>' : '';
    const head = `<div class="ticket-by">${esc(p.company)}</div><h3>${esc(p.name)}</h3>`;
    return `<article class="ticket">
      <div class="ticket-main">
        ${link ? `<a class="ticket-link" href="#product-${p.id}">${head}</a>` : head}
        <p>${esc(p.pitch)}</p>
        <div class="tags">${fit}${selling}${paused}<span class="tag">${esc(p.category)}</span><span class="tag">${esc(p.cycle)}</span><span class="tag">${esc(p.territory)}</span></div>
      </div>
      <div class="ticket-stub">
        <div class="stub-label">You earn about</div>
        <div class="stub-amount">${money(p.estCommission)}</div>
        <div class="stub-terms"><span>per sale</span><span>${esc(terms(p))}</span></div>
      </div>
    </article>`;
  }

  function feed(items) {
    if (!items.length) return '<p class="muted">Nothing logged yet.</p>';
    return `<ol class="feed">${items
      .map(
        (a) => `<li><span class="kind kind-${esc(a.type)}">${esc(a.type === 'stage' ? 'update' : a.type)}</span>
        <div><div>${esc(a.note)}</div><div class="muted small">${a.company ? `<a href="#deal-${a.dealId}">${esc(a.company)}</a> · ` : ''}${esc(a.userName)} · ${esc(ago(a.at))}</div></div></li>`
      )
      .join('')}</ol>`;
  }

  function dealTable(deals, cols) {
    if (!deals.length) return '<p class="muted">No deals yet.</p>';
    const has = (c) => cols.includes(c);
    return `<div class="table-wrap"><table>
      <thead><tr><th>Customer</th><th>Product</th>${has('rep') ? '<th>Salesperson</th>' : ''}<th>Stage</th><th class="num">Value</th><th class="num">Commission</th><th>Last touch</th></tr></thead>
      <tbody>${deals
        .map(
          (d) => `<tr><td><a href="#deal-${d.id}">${esc(d.company)}</a></td><td>${esc(d.productName)}</td>${has('rep') ? `<td>${esc(d.repName)}</td>` : ''}<td>${pill(d.stage)}</td><td class="num">${money(d.value)}</td><td class="num">${money(d.estCommission)}</td><td>${esc(ago(d.lastActivityAt))}</td></tr>`
        )
        .join('')}</tbody></table></div>`;
  }

  // ---------- public views ----------

  const SAMPLE = { company: 'Frontdesk AI', name: 'AI Receptionist for dental offices', pitch: 'Answers every call and books the appointment, day or night.', category: 'Software', cycle: '1 to 4 weeks', territory: 'United States', estCommission: 900, commissionType: 'percent', commissionValue: 25 };

  function landing() {
    const demo = state.demo
      ? `<section class="demo-box"><h2>Look around with sample data</h2><p>Each login opens a different side of the same marketplace.</p>
          <div class="row"><button class="btn" data-act="demo" data-email="rep@example.com">Open as a salesperson</button><button class="btn" data-act="demo" data-email="producer@example.com">Open as a producer</button><button class="btn" data-act="demo" data-email="admin@example.com">Open as the admin</button></div></section>`
      : '';
    return `<section class="hero">
        <div class="hero-copy">
          <h1>Put a bounty on your product. Let freelance salespeople close it.</h1>
          <p class="lede">Producers list what they sell and what they pay per sale. Salespeople pick the products they believe in, work their own leads and get paid on every deal they close.</p>
          <div class="row"><a class="btn btn-primary" href="#join-producer">I have a product to sell</a><a class="btn btn-primary" href="#join-rep">I want to sell</a></div>
          <p class="muted small">Already have an account? <a href="#login">Log in</a></p>
        </div>
        <div class="hero-ticket">${ticket(SAMPLE)}</div>
      </section>
      ${demo}
      <section class="how">
        <div><h2>For producers</h2><ol class="steps"><li><strong>Answer the intake survey.</strong> Tell us about the company, the product, who buys it and what you pay per sale.</li><li><strong>Your product goes on the board.</strong> Salespeople who match see it first, with your pitch, playbook and commission.</li><li><strong>Watch the pipeline.</strong> See every lead and every call your salespeople log, confirm the sales and pay commission.</li></ol></div>
        <div><h2>For salespeople</h2><ol class="steps"><li><strong>Answer the intake survey.</strong> What you have sold, how you like to sell and who you know.</li><li><strong>Pick your products.</strong> Browse the board, read the playbook and start selling in one tap.</li><li><strong>Work your pipeline.</strong> Register leads, log calls and meetings, and track what you have earned.</li></ol></div>
      </section>`;
  }

  function authView(kind) {
    const join = kind !== 'login';
    const rep = kind === 'join-rep';
    const title = !join ? 'Log in' : rep ? 'Join as a salesperson' : 'List your product';
    const sub = !join ? '' : rep ? 'Create your account, then tell us how you sell.' : 'Create your account, then tell us about your company and first product.';
    const list = [
      ...(join ? [{ name: 'name', label: 'Your name', required: true, auto: 'name', max: 80 }] : []),
      { name: 'email', label: 'Email', type: 'email', required: true, auto: 'email', max: 120 },
      { name: 'password', label: 'Password', type: 'password', required: true, auto: join ? 'new-password' : 'current-password', hint: join ? 'At least 8 characters.' : '' },
    ];
    return `<section class="narrow"><h1>${title}</h1>${sub ? `<p class="lede">${sub}</p>` : ''}
      <form data-form="${join ? 'signup' : 'login'}" class="card" novalidate>
        <div class="form-error" role="alert" hidden></div>
        ${join ? `<input type="hidden" name="role" value="${rep ? 'rep' : 'producer'}">` : ''}
        <div class="fields one">${list.map((f) => field(f)).join('')}</div>
        ${join ? `<label class="check"><input type="checkbox" id="f-agree" name="agree" data-single="1"><span>I agree to the pilot terms: this is an early test, the ${rep ? 'commission on each product is set by its producer' : 'commission I list is what I will pay on confirmed sales'}, and a full contract will follow before any money moves.</span></label>` : ''}
        <button class="btn btn-primary" type="submit">${join ? 'Create account' : 'Log in'}</button>
      </form>
      <p class="muted">${join ? `Already have an account? <a href="#login">Log in</a>. ${rep ? 'Selling a product instead? <a href="#join-producer">Join as a producer</a>.' : 'Here to sell? <a href="#join-rep">Join as a salesperson</a>.'}` : 'New here? <a href="#join-producer">List a product</a> or <a href="#join-rep">join as a salesperson</a>.'}</p>
    </section>`;
  }

  function surveyView() {
    const u = state.user;
    if (u.role === 'rep') {
      return `<section class="narrow wide-form"><h1>Welcome, ${esc(first(u.name))}. How do you sell?</h1><p class="lede">Eight questions. Your answers decide which products we show you first, and producers see them when you sell for them.</p>
        <form data-form="survey" class="card" novalidate><div class="form-error" role="alert" hidden></div>${fields(REP_FIELDS)}<button class="btn btn-primary" type="submit">Save and see products</button></form></section>`;
    }
    return `<section class="narrow wide-form"><h1>Welcome, ${esc(first(u.name))}. Tell us what you sell.</h1><p class="lede">Your answers become your listing on the products page, so write them for the salesperson who will read them.</p>
      <form data-form="survey" class="card" novalidate><div class="form-error" role="alert" hidden></div>
        <h2>Your company</h2>${fields(COMPANY_FIELDS)}
        <h2>Your first product</h2>${fields(PRODUCT_FIELDS)}
        <button class="btn btn-primary" type="submit">Save and list my product</button></form></section>`;
  }

  // ---------- salesperson views ----------

  async function repHome() {
    const [{ deals }, { products }, { activity }] = await Promise.all([api('GET', '/deals'), api('GET', '/products'), api('GET', '/activity')]);
    const mine = products.filter((p) => p.joined);
    const open = deals.filter(isOpen);
    const won = deals.filter((d) => d.stage === 'won');
    const wait = won.filter((d) => !d.confirmedAt);
    const owed = won.filter((d) => d.confirmedAt && !d.paidAt);
    const paid = won.filter((d) => d.paidAt);
    const c = (list) => money(sum(list, (d) => d.estCommission));
    return `<h1>Hi, ${esc(first(state.user.name))}</h1>
      <div class="stats">${stat('Open deals', open.length, money(sum(open, (d) => d.value)) + ' in play')}${stat('If they all close', c(open), 'commission on open deals')}${stat('Commission owed to you', c(owed), wait.length ? c(wait) + ' more awaiting confirmation' : 'confirmed, not yet paid')}${stat('Paid so far', c(paid), paid.length + (paid.length === 1 ? ' sale' : ' sales'))}</div>
      <div class="split">
        <section><div class="section-head"><h2>Products you sell</h2><a href="#market">Browse more</a></div>
          ${mine.length ? mine.map((p) => `<div class="line"><div><a href="#product-${p.id}"><strong>${esc(p.name)}</strong></a><div class="muted small">${esc(p.company)} · ${esc(terms(p))}</div></div><a class="btn btn-small" href="#lead-${p.id}">Add a lead</a></div>`).join('') : empty('Pick your first product', 'Browse the board, read a playbook and start selling.', '<a class="btn btn-primary" href="#market">See products</a>')}
          ${won.length ? `<h2 class="gap">Your sales</h2>${won.map((d) => `<div class="line"><div><a href="#deal-${d.id}"><strong>${esc(d.company)}</strong></a><div class="muted small">${esc(d.productName)} · ${money(d.estCommission)} commission</div></div>${payState(d)}</div>`).join('')}` : ''}
        </section>
        <section><h2>Recent activity</h2>${feed(activity.slice(0, 8))}</section>
      </div>`;
  }

  async function market() {
    const { products } = await api('GET', '/products');
    const cats = ['All', ...C.CATEGORIES.filter((c) => products.some((p) => p.category === c))];
    if (!cats.includes(state.filter)) state.filter = 'All';
    const shown = products.filter((p) => state.filter === 'All' || p.category === state.filter);
    return `<h1>Products</h1><p class="lede">Every product here is looking for salespeople. Best matches for your survey come first.</p>
      <div class="chips filter">${cats.map((c) => `<button class="chip-btn${c === state.filter ? ' on' : ''}" data-act="filter" data-value="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="tickets">${shown.length ? shown.map((p) => ticket(p, true)).join('') : empty('No products yet', 'Check back soon. New products are listed as producers join.')}</div>`;
  }

  const info = (label, text) => (text ? `<div class="info"><h3>${esc(label)}</h3><p>${esc(text)}</p></div>` : '');

  async function productPage(id) {
    const { product: p } = await api('GET', '/products/' + id);
    const rep = state.user.role === 'rep';
    const owner = state.user.role === 'producer';
    let side = '';
    if (rep && p.joined) {
      side = `<a class="btn btn-primary block" href="#lead-${p.id}">Add a lead</a><a class="btn block" href="#pipeline">Open my pipeline</a><button class="link-btn" data-act="leave" data-id="${p.id}">Stop selling this product</button>`;
    } else if (rep) {
      side = `<button class="btn btn-primary block" data-act="join" data-id="${p.id}">Start selling this</button>${p.match && p.match.reasons.length ? `<ul class="reasons">${p.match.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}`;
    } else if (owner) {
      side = `<a class="btn btn-primary block" href="#edit-${p.id}">Edit listing</a><button class="btn block" data-act="status" data-id="${p.id}" data-value="${p.status === 'active' ? 'paused' : 'active'}">${p.status === 'active' ? 'Pause listing' : 'Resume listing'}</button>`;
    }
    return `<p class="crumb"><a href="#${rep ? 'market' : owner ? 'products' : 'home'}">Products</a></p>
      ${ticket(p)}
      <div class="split split-side">
        <section>
          ${info('About ' + p.company, p.companyAbout)}${info('The product', p.description)}${info('Who buys it', p.customer)}${info('A good lead looks like', p.qualified)}${info('Objections you will hear', p.objections)}
          <div class="info"><h3>How it sells</h3><p>${esc(p.pricing)} pricing, typical deal ${money(p.dealSize)}. Sales usually take ${esc(p.cycle.toLowerCase())}.${p.motions.length ? ' Mostly sold through ' + esc(p.motions.join(', ').toLowerCase()) + '.' : ''}</p></div>
          ${p.materialsUrl ? `<p><a href="${esc(p.materialsUrl)}" target="_blank" rel="noopener noreferrer">Open the sales materials</a></p>` : ''}
        </section>
        <aside class="card side">${side}<p class="muted small">${p.repCount} ${p.repCount === 1 ? 'salesperson is' : 'salespeople are'} selling this.${rep ? ' Registering a lead reserves that customer for you.' : ''}</p></aside>
      </div>`;
  }

  async function leadForm(productId) {
    const { products } = await api('GET', '/products');
    const mine = products.filter((p) => p.joined);
    if (!mine.length) return empty('Pick a product first', 'You can add leads once you start selling a product.', '<a class="btn btn-primary" href="#market">See products</a>');
    const p = mine.find((x) => x.id === productId);
    return `<section class="narrow wide-form"><p class="crumb"><a href="#pipeline">Pipeline</a></p><h1>Add a lead</h1><p class="lede">Registering a lead reserves that customer for you on this product.</p>
      <form data-form="deal-new" class="card" novalidate><div class="form-error" role="alert" hidden></div>${fields(dealFields(mine), { productId: p ? p.id : mine.length === 1 ? mine[0].id : '', value: p ? p.dealSize : mine.length === 1 ? mine[0].dealSize : '' })}<button class="btn btn-primary" type="submit">Add lead</button></form></section>`;
  }

  async function pipeline() {
    const { deals } = await api('GET', '/deals');
    const col = (s) => {
      const list = deals.filter((d) => d.stage === s.key);
      return `<section class="col${list.length ? '' : ' col-empty'}"><header><h2>${esc(s.label)}</h2><span class="count">${list.length}${list.length ? ' · ' + money(sum(list, (d) => d.value)) : ''}</span></header>
        ${list
          .map(
            (d) => `<article class="deal-card"><a href="#deal-${d.id}"><strong>${esc(d.company)}</strong></a><div class="muted small">${esc(d.productName)}</div>
            <div class="deal-nums"><span>${money(d.value)}</span>${d.stage === 'lost' ? '' : `<span class="earn">${money(d.estCommission)} to you</span>`}</div>
            <div class="muted small">Last touch ${esc(ago(d.lastActivityAt))}</div>
            ${NEXT[d.stage] ? `<button class="btn btn-small" data-act="stage" data-id="${d.id}" data-value="${NEXT[d.stage]}">${NEXT[d.stage] === 'won' ? 'Mark won' : 'Move to ' + esc(stageLabel(NEXT[d.stage]).toLowerCase())}</button>` : payState(d)}</article>`
          )
          .join('')}</section>`;
    };
    return `<div class="section-head"><h1>Pipeline</h1><a class="btn btn-primary" href="#lead">Add a lead</a></div>
      ${deals.length ? `<div class="board">${C.STAGES.map(col).join('')}</div>` : empty('No leads yet', 'Add the first customer you plan to talk to and track every call and meeting here.', '<a class="btn btn-primary" href="#lead">Add a lead</a>')}`;
  }

  async function dealPage(id) {
    const { deal: d, activities } = await api('GET', '/deals/' + id);
    const rep = state.user.role === 'rep';
    const producer = state.user.role === 'producer' || state.user.role === 'admin';
    const locked = !!d.confirmedAt;
    const row = (k, v) => (v ? `<div class="kv"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>` : '');
    const stages = rep
      ? `<div class="stage-bar" role="group" aria-label="Deal stage">${C.STAGES.map((s) => `<button class="stage-btn${s.key === d.stage ? ' on' : ''} stage-${s.key}" data-act="stage" data-id="${d.id}" data-value="${s.key}"${locked || s.key === d.stage ? ' disabled' : ''}>${esc(s.label)}</button>`).join('')}</div>`
      : '';
    let action = '';
    if (producer && d.stage === 'won' && !d.confirmedAt) action = `<div class="callout"><p>${esc(d.repName)} marked this sale won. Confirm it once the customer has signed or paid.</p><button class="btn btn-primary" data-act="confirm" data-id="${d.id}">Confirm sale</button></div>`;
    else if (producer && d.confirmedAt && !d.paidAt) action = `<div class="callout"><p>You owe ${esc(d.repName)} ${money(d.commission)} for this sale.</p><button class="btn btn-primary" data-act="paid" data-id="${d.id}">Mark commission paid</button></div>`;
    const details = state.editing
      ? `<form data-form="deal-edit" data-id="${d.id}" class="card" novalidate><div class="form-error" role="alert" hidden></div>${fields(dealFields(null), d)}<div class="row"><button class="btn btn-primary" type="submit">Save</button><button class="btn" type="button" data-act="edit">Cancel</button></div></form>`
      : `<div class="card"><dl class="kvs">${row('Product', d.productName + ' (' + d.company_producer + ')')}${producer ? row('Salesperson', d.repName) : ''}${row('Deal value', money(d.value))}${row(d.stage === 'won' ? 'Commission' : 'Commission if won', money(d.estCommission))}${row('Contact', d.contact)}${row('Email', d.email)}${row('Phone', d.phone)}${row('Notes', d.notes)}${row('Registered', ago(d.createdAt))}</dl>${rep && !locked ? '<button class="btn btn-small" data-act="edit">Edit details</button>' : ''}</div>`;
    const logForm = `<form data-form="activity" data-id="${d.id}" class="card log" novalidate><div class="form-error" role="alert" hidden></div>
        ${rep ? `<div class="chips" role="radiogroup" aria-label="Type">${C.ACTIVITY_TYPES.map((t, i) => `<label class="chip"><input type="radio" id="f-type-${t}" name="type" value="${t}"${i === 0 ? ' checked' : ''}><span>${t[0].toUpperCase() + t.slice(1)}</span></label>`).join('')}</div>` : ''}
        <label class="sr" for="f-note">What happened?</label><textarea id="f-note" name="note" rows="2" maxlength="1000" required placeholder="${rep ? 'What happened? What is the next step?' : 'Leave a note for the salesperson'}"></textarea>
        <button class="btn btn-primary" type="submit">${rep ? 'Log it' : 'Add note'}</button></form>`;
    return `<p class="crumb"><a href="#${rep ? 'pipeline' : state.user.role === 'admin' ? 'home' : 'deals'}">${rep ? 'Pipeline' : 'Deals'}</a></p>
      <div class="section-head"><h1>${esc(d.company)}</h1><div>${pill(d.stage)} ${payState(d)}</div></div>
      ${stages}${action}
      <div class="split"><section><h2>Details</h2>${details}</section><section><h2>Activity</h2>${state.user.role === 'admin' ? '' : logForm}${feed(activities)}</section></div>`;
  }

  // ---------- producer views ----------

  async function producerHome() {
    const [{ deals }, { products }, { activity }, { team }] = await Promise.all([api('GET', '/deals'), api('GET', '/products'), api('GET', '/activity'), api('GET', '/team')]);
    const open = deals.filter(isOpen);
    const won = deals.filter((d) => d.stage === 'won');
    const toConfirm = won.filter((d) => !d.confirmedAt);
    const toPay = won.filter((d) => d.confirmedAt && !d.paidAt);
    const needs = [
      ...toConfirm.map((d) => `<div class="line"><div><a href="#deal-${d.id}"><strong>${esc(d.company)}</strong></a><div class="muted small">${esc(d.productName)} · sold by ${esc(d.repName)} · ${money(d.value)}</div></div><button class="btn btn-small btn-primary" data-act="confirm" data-id="${d.id}">Confirm sale</button></div>`),
      ...toPay.map((d) => `<div class="line"><div><a href="#deal-${d.id}"><strong>${esc(d.company)}</strong></a><div class="muted small">You owe ${esc(d.repName)} ${money(d.commission)}</div></div><button class="btn btn-small" data-act="paid" data-id="${d.id}">Mark paid</button></div>`),
    ];
    return `<h1>${esc(state.user.survey.company)}</h1>
      <div class="stats">${stat('Salespeople', team.length, products.length + (products.length === 1 ? ' product listed' : ' products listed'))}${stat('Open pipeline', money(sum(open, (d) => d.value)), open.length + ' deals in progress')}${stat('Sales won', money(sum(won, (d) => d.value)), won.length + (won.length === 1 ? ' deal' : ' deals'))}${stat('Commission owed', money(sum(toPay, (d) => d.commission)), toConfirm.length ? toConfirm.length + ' to confirm first' : 'on confirmed sales')}</div>
      <div class="split">
        <section><h2>Needs you</h2>${needs.length ? needs.join('') : '<p class="muted">Nothing to confirm or pay right now.</p>'}
          <div class="section-head gap"><h2>Your products</h2><a href="#products">Manage</a></div>
          ${products.map((p) => `<div class="line"><div><a href="#product-${p.id}"><strong>${esc(p.name)}</strong></a><div class="muted small">${p.repCount} selling · ${deals.filter((d) => d.productId === p.id && isOpen(d)).length} open deals · ${esc(terms(p))}</div></div>${p.status === 'paused' ? '<span class="badge">Paused</span>' : ''}</div>`).join('')}
        </section>
        <section><h2>What your salespeople are doing</h2>${feed(activity.slice(0, 10))}</section>
      </div>`;
  }

  async function producerProducts() {
    const { products } = await api('GET', '/products');
    return `<div class="section-head"><h1>Your products</h1><a class="btn btn-primary" href="#new-product">Add a product</a></div>
      <p class="lede">This is how each listing looks to salespeople.</p>
      <div class="tickets">${products.map((p) => ticket(p, true)).join('')}</div>`;
  }

  async function productForm(id) {
    const p = id ? (await api('GET', '/products/' + id)).product : null;
    return `<section class="narrow wide-form"><p class="crumb"><a href="#products">Products</a></p><h1>${p ? 'Edit ' + esc(p.name) : 'Add a product'}</h1>
      <form data-form="product" data-id="${p ? p.id : ''}" class="card" novalidate><div class="form-error" role="alert" hidden></div>${fields(PRODUCT_FIELDS, p || {})}<button class="btn btn-primary" type="submit">${p ? 'Save changes' : 'List product'}</button></form></section>`;
  }

  async function producerDeals() {
    const { deals } = await api('GET', '/deals');
    return `<h1>Deals</h1><p class="lede">Every lead your salespeople have registered, most recently touched first.</p>${dealTable(deals, ['rep'])}`;
  }

  function teamTable(team, withProducts) {
    if (!team.length) return '<p class="muted">No salespeople yet. They will show up here as soon as one starts selling a product.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>Salesperson</th><th>Based in</th><th>Experience</th>${withProducts ? '<th>Selling</th>' : ''}<th class="num">Open deals</th><th class="num">Won</th><th class="num">Sales</th><th class="num">Touches this week</th></tr></thead><tbody>
      ${team.map((t) => `<tr><td><strong>${esc(t.name)}</strong><div class="muted small">${esc(t.email)}</div></td><td>${esc((t.survey && t.survey.location) || '')}</td><td>${esc((t.survey && t.survey.experience) || '')}</td>${withProducts ? `<td>${esc(t.products.join(', '))}</td>` : ''}<td class="num">${t.open}</td><td class="num">${t.won}</td><td class="num">${money(t.wonValue)}</td><td class="num">${t.touchesThisWeek}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  async function producerReps() {
    const { team } = await api('GET', '/team');
    return `<h1>Salespeople</h1><p class="lede">Everyone selling your products and what they have done. Touches are calls, emails, meetings and notes logged in the last seven days.</p>${teamTable(team, true)}`;
  }

  // ---------- admin ----------

  async function adminHome() {
    const a = await api('GET', '/admin');
    const won = a.deals.filter((d) => d.stage === 'won');
    const count = (role) => a.users.filter((u) => u.role === role).length;
    return `<h1>Marketplace overview</h1>
      <div class="stats">${stat('Producers', count('producer'), a.products.length + ' products listed')}${stat('Salespeople', count('rep'), a.users.filter((u) => u.role === 'rep' && !u.survey).length + ' still in intake')}${stat('Open pipeline', money(sum(a.deals.filter(isOpen), (d) => d.value)), a.deals.filter(isOpen).length + ' deals')}${stat('Sales won', money(sum(won, (d) => d.value)), money(sum(won, (d) => d.commission)) + ' in commission')}</div>
      <h2>Salespeople</h2>${teamTable(a.reps, false)}
      <h2 class="gap">Products</h2><div class="table-wrap"><table><thead><tr><th>Product</th><th>Producer</th><th>Category</th><th>Commission</th><th class="num">Salespeople</th><th>Status</th></tr></thead><tbody>${a.products.map((p) => `<tr><td><a href="#product-${p.id}">${esc(p.name)}</a></td><td>${esc(p.company)}</td><td>${esc(p.category)}</td><td>${esc(terms(p))}</td><td class="num">${p.repCount}</td><td>${esc(p.status)}</td></tr>`).join('')}</tbody></table></div>
      <h2 class="gap">All deals</h2>${dealTable(a.deals.sort((x, y) => y.lastActivityAt - x.lastActivityAt), ['rep'])}
      <h2 class="gap">Accounts</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Company</th><th>Intake</th><th>Joined</th></tr></thead><tbody>${a.users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role === 'rep' ? 'salesperson' : u.role)}</td><td>${esc(u.company)}</td><td>${u.survey ? 'Done' : 'Not finished'}</td><td>${esc(ago(u.createdAt))}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- shell and render ----------

  const NAV = {
    rep: [['home', 'Home'], ['market', 'Products'], ['pipeline', 'Pipeline']],
    producer: [['home', 'Home'], ['products', 'Products'], ['deals', 'Deals'], ['reps', 'Salespeople']],
    admin: [['home', 'Overview']],
  };
  const SECTION = { product: { rep: 'market', producer: 'products' }, lead: { rep: 'pipeline' }, deal: { rep: 'pipeline', producer: 'deals' }, edit: { producer: 'products' }, 'new-product': { producer: 'products' } };

  function shell(content, name) {
    const u = state.user;
    const active = u ? (SECTION[name] && SECTION[name][u.role]) || name : '';
    const nav = u && u.survey ? `<nav class="nav" aria-label="Main">${NAV[u.role].map(([h, l]) => `<a href="#${h}"${h === active ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>` : '';
    const who = u ? `<div class="who"><span class="muted small">${esc(u.name)}</span><button class="link-btn" data-act="logout">Log out</button></div>` : '<div class="who"><a href="#login">Log in</a></div>';
    const demoBar = state.demo && u
      ? `<div class="demo-bar"><span>Sample data${state.local ? ', saved only in this browser' : ''}. View as:</span>${[['rep@example.com', 'Salesperson'], ['producer@example.com', 'Producer'], ['admin@example.com', 'Admin']].map(([e, l]) => `<button class="link-btn${u.email === e ? ' on' : ''}" data-act="demo" data-email="${e}">${l}</button>`).join('')}${state.local ? '<button class="link-btn" data-act="reset">Start over</button>' : ''}</div>`
      : '';
    return `${demoBar}<header class="top"><a class="brand" href="#${u ? 'home' : ''}">Bounty</a>${nav}${who}</header><main>${content}</main>${state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : ''}`;
  }

  let renderCount = 0;
  async function render() {
    const mine = ++renderCount;
    const { name, id } = parseHash();
    const u = state.user;
    let view;
    if (!u) view = name === 'login' || name === 'join-rep' || name === 'join-producer' ? () => authView(name) : landing;
    else if (!u.survey) view = surveyView;
    else if (name === 'product' && id) view = () => productPage(id);
    else if (name === 'deal' && id) view = () => dealPage(id);
    else if (u.role === 'rep') view = { market, pipeline, lead: () => leadForm(id) }[name] || repHome;
    else if (u.role === 'producer') view = { products: producerProducts, deals: producerDeals, reps: producerReps, 'new-product': () => productForm(null), edit: () => productForm(id) }[name] || producerHome;
    else view = adminHome;
    let html;
    try {
      html = await view();
    } catch (e) {
      if (e.status === 401) {
        state.user = null;
        return render();
      }
      html = empty('That did not load', e.message, '<a class="btn" href="#home">Back to home</a>');
    }
    if (mine !== renderCount) return;
    $app.innerHTML = shell(html, name);
  }

  // ---------- events ----------

  async function setUser(email) {
    const { user } = await api('POST', '/login', { email, password: 'demo1234' });
    state.user = user;
    go('home');
  }

  const actions = {
    async logout() {
      await api('POST', '/logout', {});
      state.user = null;
      go('');
    },
    demo: (el) => setUser(el.dataset.email),
    async reset() {
      store.del('uid');
      await startLocal(true);
      state.user = null;
      go('');
    },
    filter(el) {
      state.filter = el.dataset.value;
      render();
    },
    edit() {
      state.editing = !state.editing;
      render();
    },
    async join(el) {
      await api('POST', '/products/' + el.dataset.id + '/join', {});
      toast('You are selling this now. Add your first lead.');
      render();
    },
    async leave(el) {
      await api('DELETE', '/products/' + el.dataset.id + '/join', {});
      toast('You stopped selling this product.');
      render();
    },
    async status(el) {
      await api('PUT', '/products/' + el.dataset.id, { status: el.dataset.value });
      toast(el.dataset.value === 'paused' ? 'Listing paused. New salespeople cannot join.' : 'Listing is live again.');
      render();
    },
    async stage(el) {
      await api('PUT', '/deals/' + el.dataset.id, { stage: el.dataset.value });
      toast('Moved to ' + stageLabel(el.dataset.value).toLowerCase() + '.');
      render();
    },
    async confirm(el) {
      await api('POST', '/deals/' + el.dataset.id + '/confirm', {});
      toast('Sale confirmed.');
      render();
    },
    async paid(el) {
      await api('POST', '/deals/' + el.dataset.id + '/paid', {});
      toast('Commission marked paid.');
      render();
    },
  };

  const forms = {
    async signup(v) {
      state.user = (await api('POST', '/signup', v)).user;
      go('home');
    },
    async login(v) {
      state.user = (await api('POST', '/login', v)).user;
      go('home');
    },
    async survey(v) {
      const producer = state.user.role === 'producer';
      state.user = (await api('POST', '/survey', v)).user;
      toast(producer ? 'Your product is listed.' : 'You are in. Here are your best matches.');
      go(producer ? 'home' : 'market');
    },
    async product(v, form) {
      const id = form.dataset.id;
      const { product } = await api(id ? 'PUT' : 'POST', '/products' + (id ? '/' + id : ''), v);
      toast(id ? 'Listing saved.' : 'Product listed.');
      go('product-' + product.id);
    },
    async 'deal-new'(v) {
      const { deal } = await api('POST', '/deals', v);
      toast('Lead registered.');
      go('deal-' + deal.id);
    },
    async 'deal-edit'(v, form) {
      await api('PUT', '/deals/' + form.dataset.id, v);
      state.editing = false;
      toast('Saved.');
      render();
    },
    async activity(v, form) {
      await api('POST', '/deals/' + form.dataset.id + '/activities', v);
      render();
    },
  };

  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    ev.preventDefault();
    el.disabled = true;
    try {
      await actions[el.dataset.act](el);
    } catch (e) {
      el.disabled = false;
      toast(e.message);
      render();
    }
  });

  document.addEventListener('submit', async (ev) => {
    const form = ev.target.closest('form[data-form]');
    if (!form) return;
    ev.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const err = form.querySelector('.form-error');
    btn.disabled = true;
    err.hidden = true;
    try {
      await forms[form.dataset.form](formValues(form), form);
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      err.scrollIntoView({ block: 'nearest' });
      btn.disabled = false;
    }
  });

  // Picking a product on the lead form fills in its typical deal value.
  document.addEventListener('change', async (ev) => {
    if (ev.target.id !== 'f-productId' || !ev.target.value) return;
    const value = document.getElementById('f-value');
    try {
      const { product } = await api('GET', '/products/' + ev.target.value);
      if (value) value.value = product.dealSize;
    } catch (e) {}
  });

  window.addEventListener('hashchange', () => {
    state.editing = false;
    render();
    window.scrollTo(0, 0);
  });

  (async function boot() {
    let config = null;
    if (!window.BOUNTY_LOCAL) {
      try {
        const res = await fetch('api/config');
        const data = await res.json();
        if (data && data.ok) config = data;
      } catch (e) {}
    }
    if (config) state.demo = !!config.demo;
    else {
      state.local = true;
      state.demo = true;
      await startLocal(false);
    }
    try {
      state.user = (await api('GET', '/me')).user;
    } catch (e) {}
    render();
  })();
})();
