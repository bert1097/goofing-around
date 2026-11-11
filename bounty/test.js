// Run with: node --test
const test = require('node:test');
const assert = require('node:assert');
const core = require('./public/core.js');

function setup() {
  const db = core.emptyDb();
  const app = core.createCore({ db, adminEmails: ['boss@x.co'] });
  const call = async (userId, method, path, body) => app.handle({ method, path, body, userId });
  return { db, call };
}
const PRODUCT = { name: 'Widget', pitch: 'A widget', category: 'Software', customer: 'Anyone', dealSize: '1,000', pricing: 'Annual', commissionType: 'percent', commissionValue: 20, cycle: 'Under a week', motions: ['Cold outreach'] };
const COMPANY = { company: 'Acme', about: 'Makes widgets', stage: 'Idea', sellingToday: 'The founders sell' };
const REP = { location: 'Chicago', experience: 'None yet', categories: ['Software'], motions: ['Cold outreach'], hours: 'Full time' };

async function world() {
  const w = setup();
  const signup = async (name, role) => (await w.call(null, 'POST', '/signup', { name, email: name + '@x.co', password: 'password1', role, agree: true })).body.user.id;
  w.producer = await signup('pat', 'producer');
  w.rep = await signup('rae', 'rep');
  w.rep2 = await signup('rob', 'rep');
  await w.call(w.producer, 'POST', '/survey', Object.assign({}, COMPANY, PRODUCT));
  await w.call(w.rep, 'POST', '/survey', REP);
  await w.call(w.rep2, 'POST', '/survey', REP);
  w.productId = w.db.products[0].id;
  return w;
}

test('signup validates and logs in; admin emails become admins', async () => {
  const { call } = setup();
  assert.equal((await call(null, 'POST', '/signup', { name: 'A', email: 'bad', password: 'password1', role: 'rep', agree: true })).status, 400);
  assert.equal((await call(null, 'POST', '/signup', { name: 'A', email: 'a@x.co', password: 'short', role: 'rep', agree: true })).status, 400);
  assert.equal((await call(null, 'POST', '/signup', { name: 'A', email: 'a@x.co', password: 'password1', role: 'rep' })).status, 400);
  assert.equal((await call(null, 'POST', '/signup', { name: 'A', email: 'a@x.co', password: 'password1', role: 'admin', agree: true })).status, 400);
  const ok = await call(null, 'POST', '/signup', { name: 'A', email: 'A@x.co', password: 'password1', role: 'rep', agree: true });
  assert.equal(ok.status, 201);
  assert.equal(ok.login, ok.body.user.id);
  assert.equal(ok.body.user.pass, undefined);
  assert.equal((await call(null, 'POST', '/signup', { name: 'A', email: 'a@x.co', password: 'password1', role: 'rep', agree: true })).status, 409);
  assert.equal((await call(null, 'POST', '/login', { email: 'a@x.co', password: 'nope' })).status, 401);
  assert.equal((await call(null, 'POST', '/login', { email: 'a@x.co', password: 'password1' })).status, 200);
  const boss = await call(null, 'POST', '/signup', { name: 'B', email: 'boss@x.co', password: 'password1', role: 'rep', agree: true });
  assert.equal(boss.body.user.role, 'admin');
});

test('producer survey lists a product that matched reps see first', async () => {
  const w = await world();
  const list = (await w.call(w.rep, 'GET', '/products')).body.products;
  assert.equal(list.length, 1);
  assert.equal(list[0].company, 'Acme');
  assert.equal(list[0].estCommission, 200);
  assert.equal(list[0].match.score, 3);
  assert.equal(list[0].joined, false);
});

test('roles are enforced', async () => {
  const w = await world();
  assert.equal((await w.call(null, 'GET', '/products')).status, 401);
  assert.equal((await w.call(w.rep, 'POST', '/products', PRODUCT)).status, 403);
  assert.equal((await w.call(w.rep, 'GET', '/admin')).status, 403);
  assert.equal((await w.call(w.producer, 'POST', '/deals', { productId: w.productId, company: 'X', value: 1 })).status, 403);
  // a second producer cannot see or edit the first one's product
  const other = (await w.call(null, 'POST', '/signup', { name: 'o', email: 'o@x.co', password: 'password1', role: 'producer', agree: true })).body.user.id;
  await w.call(other, 'POST', '/survey', Object.assign({}, COMPANY, PRODUCT, { company: 'Other' }));
  assert.equal((await w.call(other, 'PUT', '/products/' + w.productId, PRODUCT)).status, 403);
  assert.equal((await w.call(other, 'GET', '/products/' + w.productId)).status, 403);
  assert.equal((await w.call(other, 'GET', '/deals')).body.deals.length, 0);
});

test('a deal runs from lead to paid commission', async () => {
  const w = await world();
  assert.equal((await w.call(w.rep, 'POST', '/deals', { productId: w.productId, company: 'Bolt Inc', value: 2000 })).status, 403, 'must join first');
  await w.call(w.rep, 'POST', '/products/' + w.productId + '/join');
  const made = await w.call(w.rep, 'POST', '/deals', { productId: w.productId, company: 'Bolt Inc', value: '2000' });
  assert.equal(made.status, 201);
  const id = made.body.deal.id;
  assert.equal(made.body.deal.estCommission, 400);

  // lead registration: another rep cannot claim the same customer
  await w.call(w.rep2, 'POST', '/products/' + w.productId + '/join');
  assert.equal((await w.call(w.rep2, 'POST', '/deals', { productId: w.productId, company: 'bolt, inc.', value: 1 })).status, 409);
  assert.equal((await w.call(w.rep2, 'GET', '/deals/' + id)).status, 404);

  await w.call(w.rep, 'POST', '/deals/' + id + '/activities', { type: 'call', note: 'Spoke to the owner' });
  assert.equal((await w.call(w.producer, 'POST', '/deals/' + id + '/confirm')).status, 409, 'not won yet');
  await w.call(w.rep, 'PUT', '/deals/' + id, { stage: 'won' });
  assert.equal((await w.call(w.producer, 'POST', '/deals/' + id + '/paid')).status, 409, 'confirm first');
  assert.equal((await w.call(w.rep, 'POST', '/deals/' + id + '/confirm')).status, 403);
  assert.equal((await w.call(w.producer, 'POST', '/deals/' + id + '/confirm')).status, 200);
  assert.equal((await w.call(w.rep, 'PUT', '/deals/' + id, { stage: 'lead' })).status, 409, 'locked once confirmed');
  assert.equal((await w.call(w.rep, 'PUT', '/deals/' + id, { company: 'Bolt', value: 9 })).status, 409);
  const paid = await w.call(w.producer, 'POST', '/deals/' + id + '/paid');
  assert.equal(paid.body.deal.commission, 400);
  assert.ok(paid.body.deal.paidAt);

  const detail = (await w.call(w.producer, 'GET', '/deals/' + id)).body;
  assert.equal(detail.activities.length, 4);
  const team = (await w.call(w.producer, 'GET', '/team')).body.team;
  assert.equal(team.length, 2);
  assert.equal(team[0].wonValue, 2000);
  assert.equal(team[0].touchesThisWeek, 1);
});

test('a lost deal frees the customer for another salesperson', async () => {
  const w = await world();
  await w.call(w.rep, 'POST', '/products/' + w.productId + '/join');
  await w.call(w.rep2, 'POST', '/products/' + w.productId + '/join');
  const id = (await w.call(w.rep, 'POST', '/deals', { productId: w.productId, company: 'Bolt', value: 5 })).body.deal.id;
  assert.equal((await w.call(w.rep, 'DELETE', '/products/' + w.productId + '/join')).status, 409);
  await w.call(w.rep, 'PUT', '/deals/' + id, { stage: 'lost' });
  assert.equal((await w.call(w.rep2, 'POST', '/deals', { productId: w.productId, company: 'Bolt', value: 5 })).status, 201);
  assert.equal((await w.call(w.rep, 'DELETE', '/products/' + w.productId + '/join')).status, 200);
});

test('paused products are closed to new salespeople; bad links are rejected', async () => {
  const w = await world();
  await w.call(w.producer, 'PUT', '/products/' + w.productId, { status: 'paused' });
  assert.equal((await w.call(w.rep, 'GET', '/products')).body.products.length, 0);
  assert.equal((await w.call(w.rep, 'POST', '/products/' + w.productId + '/join')).status, 409);
  assert.equal((await w.call(w.producer, 'POST', '/products', Object.assign({}, PRODUCT, { materialsUrl: 'javascript:alert(1)' }))).status, 400);
  assert.equal((await w.call(w.producer, 'POST', '/products', Object.assign({}, PRODUCT, { commissionValue: 140 }))).status, 400);
});

test('demo data seeds once', async () => {
  const db = core.emptyDb();
  assert.equal(await core.seed(db, async (p) => 'plain:' + p), true);
  assert.equal(await core.seed(db, async (p) => 'plain:' + p), false);
  const app = core.createCore({ db });
  const rep = db.users.find((u) => u.email === 'rep@example.com');
  const deals = (await app.handle({ method: 'GET', path: '/deals', userId: rep.id })).body.deals;
  assert.equal(deals.length, 8);
  const admin = db.users.find((u) => u.role === 'admin');
  assert.equal((await app.handle({ method: 'GET', path: '/admin', userId: admin.id })).status, 200);
});
