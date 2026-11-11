# Bounty

> Working name. A marketplace where companies ("producers") put a commission
> on their product and freelance salespeople pick it up and sell it.

## Run it

```
node server.js --demo     # sample data and one-tap demo logins
node server.js            # empty, real accounts
node --test               # tests for the business rules
```

Needs Node 18 or newer and nothing else. Open http://localhost:3000.

| Setting | What it does |
| --- | --- |
| `PORT` | Port to listen on (default 3000) |
| `DATA_FILE` | Where the data is kept (default `data/bounty.json`) |
| `ADMIN_EMAILS` | Comma-separated emails that become admins when they sign up |

## What is in it

**Producers** sign up, answer an intake survey about the company and their
first product, and the product goes straight onto the products page. They can
add more products, pause a listing, see every lead and every logged call from
the salespeople selling for them, confirm won sales and mark commission paid.

**Salespeople** sign up and answer their own intake survey. The products page
is sorted by how well each product fits their answers (categories they have
sold, how they like to sell). They start selling a product in one tap, register
leads, move them through a pipeline (lead, contacted, meeting, proposal, won,
lost), log calls, emails, meetings and notes, and see what they have earned.

**Admins** see every account, product and deal, plus a salesperson
leaderboard.

Rules worth knowing:

- **Lead registration.** Registering a lead reserves that customer for that
  salesperson on that product. A second salesperson is turned away until the
  first deal is marked lost.
- **Commission.** A percent of the deal value or a flat amount per sale, set by
  the producer. A sale counts as owed only after the producer confirms it, and
  a confirmed deal is locked against edits.
- **Pilot terms.** Signup has a checkbox for placeholder pilot terms. Real
  contracts are not in here yet.

## How it is put together

- `public/core.js` holds every rule (validation, permissions, matching,
  commission). It runs on the server and, unchanged, in the browser.
- `server.js` is a dependency-free Node server: scrypt password hashes, cookie
  sessions, login throttling, and the data in one JSON file.
- `public/app.js` and `public/styles.css` are the front end, with no build
  step. If the page is opened without the server (any static host), it runs
  `core.js` in the browser against localStorage as a self-contained demo.

## Not done yet

- Contracts and e-signature, and actually moving money (commission is tracked,
  not paid out).
- Email: no verification, password reset or notifications.
- A JSON file is fine for a pilot of a few dozen people. Move to Postgres
  before anything bigger.
- Producers approve nobody: any salesperson can start selling any live product.
