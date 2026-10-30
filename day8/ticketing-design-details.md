# TicketHub Design Document (full details)

This is the long version of `ticketing-design.md`. It adds the full SQL, the JSON examples, the complete list of error codes and a longer architecture discussion.

TicketHub is a website that sells tickets for concerts and events. This document follows the six-step design framework: requirements, estimates, API, data model, architecture and trade-offs. The hardest part of the problem is the big sale, when a popular concert goes on sale and 200,000 people try to buy 20,000 seats in the first 10 minutes. So the design focuses on two things: never selling the same seat twice, and staying up during that rush.

## 1. Requirements

### Functional requirements

- A user can sign up and log in.
- A user can browse and search events by name, city and date.
- A user can open an event and see its seat map, showing which seats are free.
- A user can pick seats (up to 4) and hold them for 5 minutes while they pay.
- A user can pay for the held seats and get their tickets.
- A user can see their tickets afterwards.
- Seats that are held but not paid for go back on sale when the hold runs out.

### Non-functional requirements

- **Speed:** the event page and seat map should load in under 1 second, and holding a seat should answer in under 300 ms, even during a big sale.
- **Correctness:** a seat must never be sold to two people, and nobody should be charged without getting their seat.
- **Fairness:** buyers get seats roughly in the order they arrived, and one person cannot grab hundreds of seats.
- **Availability:** the site should be up 99.9% of the time, and it must not crash when a big sale starts.
- **Scalability:** it must handle about 575 times its normal traffic for a short time.
- **Security:** all traffic uses HTTPS, passwords are stored as hashes, and card details never touch our servers because a payment provider handles them.
- **Durability:** once an order is confirmed it must never be lost, even if a server crashes.

### Non-goals

To keep the design focused, it does not cover ticket resale, refunds, seat recommendations or more than one currency.

## 2. Estimates

### Assumptions

- 2,000,000 registered users
- On a normal day, 50,000 people visit and each views 10 pages
- On a normal day, 5,000 tickets are sold
- In a big sale, 200,000 people try to buy 20,000 seats in the first 10 minutes (600 seconds)
- During a big sale, each person makes about 10 requests (open the page, reload the seat map a few times, try to hold seats, pay) and tries to hold seats about 3 times
- One day has 86,400 seconds, and peak traffic is 5 times the average
- One order takes about 1 KB of storage

### Normal day

| What | Per day | Average per second | Peak per second (5x) |
|------|---------|--------------------|----------------------|
| Page views | 50,000 x 10 = 500,000 | about 6 | about 29 |
| Tickets sold | 5,000 | about 0.06 (one every 17 seconds) | about 0.3 (one every 3.5 seconds) |

### Big sale (first 10 minutes)

| What | Total | Average per second | Peak per second (5x) |
|------|-------|--------------------|----------------------|
| All requests | 200,000 x 10 = 2,000,000 | about 3,333 | about 16,700 |
| Seat hold attempts | 200,000 x 3 = 600,000 | about 1,000 | about 5,000 |
| Seats sold | 20,000 | about 33 | about 167 |

### Comparing the two

- The big sale brings about 575 times more requests per second than a normal day (3,333 against 5.8), and ticket sales per second are about 575 times higher too (33 against 0.06).
- Only 1 in 10 people can win a seat, because there are 200,000 people and 20,000 seats. So most hold attempts will fail with "seat taken" or "sold out", and the system must handle that failure quickly and politely.
- The spike is short. It lasts minutes, and the start time is known in advance, so I can add servers before the sale and remove them afterwards.
- A normal day is easy. One or two servers could cope, and I would still run three so one can fail. The big sale is the real design problem.
- **Storage is small:** 5,000 orders a day x 1 KB is about 5 MB a day, or about 1.8 GB a year. The traffic is the challenge, not the storage.

**Server count:** if one app server handles about 500 requests per second (an assumption), the big sale peak of 16,700 requests needs about 34 servers. I would run 40 to leave some room.

## 3. API

- **Base URL:** `https://api.tickethub.com/v1`
- **Authentication:** every endpoint except login needs `Authorization: Bearer <token>`.
- **Format:** JSON over HTTPS. Prices are whole shillings.

### Endpoints

| Method | Path | Description | Success status |
|--------|------|-------------|----------------|
| POST | `/auth/login` | Log in and get a token | 200 OK |
| GET | `/events` | List events. Filters: `?city=Nairobi&date=2026-12-20&q=concert&page=1` | 200 OK |
| GET | `/events/{id}` | Get the details of one event | 200 OK |
| GET | `/events/{id}/seats` | Get the seat map with the status of every seat | 200 OK |
| POST | `/events/{id}/holds` | Hold chosen seats for 5 minutes | 201 Created |
| DELETE | `/events/{id}/holds` | Release the seats I am holding for this event | 204 No Content |
| POST | `/orders` | Pay for the seats I am holding and create the order | 201 Created |
| GET | `/me/tickets` | List my tickets | 200 OK |

### Example: view the seats

```http
GET /v1/events/7/seats
```

Response (200 OK):

```json
{
  "eventId": 7,
  "updatedAt": "2026-11-20T10:00:02Z",
  "seats": [
    { "id": 1201, "section": "A", "row": "1", "number": 1, "price": 5000, "status": "available" },
    { "id": 1202, "section": "A", "row": "1", "number": 2, "price": 5000, "status": "held" },
    { "id": 1203, "section": "A", "row": "1", "number": 3, "price": 5000, "status": "sold" }
  ]
}
```

### Example: hold seats

A hold is all or nothing. If any one of the seats is taken, none of them are held. A user can hold at most 4 seats.

```http
POST /v1/events/7/holds
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

```json
{
  "seatIds": [1201, 1204]
}
```

Response (201 Created):

```json
{
  "eventId": 7,
  "seatIds": [1201, 1204],
  "expiresAt": "2026-11-20T10:05:00Z"
}
```

### Example: pay for the seats

The `Idempotency-Key` header makes sure a double click or a retry cannot charge the user twice.

```http
POST /v1/orders
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Idempotency-Key: 5d1f2c7e-91a4-4c1b-8a0e-3f6b7d2c9a10
Content-Type: application/json
```

```json
{
  "eventId": 7,
  "paymentToken": "tok_12345"
}
```

Response (201 Created):

```json
{
  "orderId": 88,
  "status": "paid",
  "totalPrice": 10000,
  "tickets": [
    { "seatId": 1201, "section": "A", "row": "1", "number": 1, "code": "TH-7-1201-9F3K" },
    { "seatId": 1204, "section": "A", "row": "1", "number": 4, "code": "TH-7-1204-2QXM" }
  ]
}
```

### Error codes

| Status | Name | When it happens |
|--------|------|-----------------|
| 400 | Bad Request | The request is invalid, for example asking to hold 6 seats when the limit is 4. |
| 401 | Unauthorized | The user is not logged in or the token has expired. |
| 402 | Payment Required | The payment was declined. The seats stay held until the hold runs out, so the user can try again. |
| 403 | Forbidden | The user is not allowed to do this, for example viewing someone else's tickets. |
| 404 | Not Found | The event or the seat does not exist. |
| 409 | Conflict | A seat is already held or sold by someone else. |
| 410 | Gone | The hold has expired, so the seats are no longer reserved for this user. |
| 429 | Too Many Requests | The user is sending requests too fast, or the waiting room is not letting them in yet. |
| 500 | Internal Server Error | Something broke on our side. |
| 503 | Service Unavailable | The system is overloaded or down for maintenance. |

Example 409 body:

```json
{
  "error": {
    "status": 409,
    "code": "SEAT_TAKEN",
    "message": "Seat 1201 is no longer available. Please pick another seat.",
    "seatIds": [1201]
  }
}
```

Example 429 body:

```json
{
  "error": {
    "status": 429,
    "code": "WAITING_ROOM",
    "message": "There are a lot of people here right now. You are in the queue and will be let in soon.",
    "queuePosition": 4821
  }
}
```

## 4. Data model

I chose a relational (SQL) database. The data is structured and full of relationships, and correctness matters more than anything else, because a mistake means two people turn up with a ticket for one seat. SQL gives me transactions and constraints that enforce the rules inside the database itself. A document database would be a worse fit, because the one thing I cannot get wrong is a seat being sold exactly once.

### Tables

**users:** `id` (primary key), `name`, `email` (unique), `password_hash`, `created_at`

**events:** `id` (primary key), `title`, `venue`, `starts_at`, `on_sale_at`, `total_seats`

**seats:** `id` (primary key), `event_id` (foreign key to events), `section`, `row_label`, `seat_number`, `price`, `status` (available, held or sold), `held_by` (foreign key to users, empty if not held), `hold_expires_at`. Each seat of each event is one row. The combination of event, section, row and number is unique.

**orders:** `id` (primary key), `user_id` (foreign key to users), `event_id` (foreign key to events), `total_price`, `status` (paid or refunded), `payment_ref` (unique), `created_at`

**order_items:** `order_id` (foreign key to orders), `seat_id` (foreign key to seats, unique). The primary key is the pair (`order_id`, `seat_id`). This table links orders to seats, and the ticket for a seat is simply the seat's row in this table.

### Relationships

- **users to orders is one-to-many.** One user can place many orders, but each order belongs to one user.
- **events to seats is one-to-many.** One event has thousands of seats, and each seat belongs to one event.
- **orders to seats is many-to-many in theory but one-to-one in practice.** An order can contain several seats, so I use the join table `order_items`. The unique rule on `order_items.seat_id` means each seat can appear in only one order, so a seat belongs to at most one order.
- **users to seats (holds):** a seat that is being held points to the user holding it through `held_by`. A user can hold up to 4 seats at once.

### CREATE TABLE statements

```sql
-- turn on foreign key checks (SQLite needs this)
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  created_at     TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  venue        TEXT NOT NULL,
  starts_at    TEXT NOT NULL,
  on_sale_at   TEXT NOT NULL,
  total_seats  INTEGER NOT NULL CHECK (total_seats > 0)
);

CREATE TABLE seats (
  id               INTEGER PRIMARY KEY,
  event_id         INTEGER NOT NULL,
  section          TEXT NOT NULL,
  row_label        TEXT NOT NULL,
  seat_number      INTEGER NOT NULL,
  price            INTEGER NOT NULL CHECK (price >= 0),
  status           TEXT NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available', 'held', 'sold')),
  held_by          INTEGER,
  hold_expires_at  TEXT,
  UNIQUE (event_id, section, row_label, seat_number),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (held_by) REFERENCES users(id)
);

CREATE TABLE orders (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  event_id     INTEGER NOT NULL,
  total_price  INTEGER NOT NULL CHECK (total_price >= 0),
  status       TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded')),
  payment_ref  TEXT NOT NULL UNIQUE,   -- the same payment can only make one order
  created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE order_items (
  order_id  INTEGER NOT NULL,
  seat_id   INTEGER NOT NULL UNIQUE,   -- a seat can only be in one order
  PRIMARY KEY (order_id, seat_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (seat_id) REFERENCES seats(id)
);
```

### Indexes

```sql
CREATE INDEX idx_seats_event_status ON seats(event_id, status);
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

- **`idx_seats_event_status`:** the seat map and the "how many seats are left" question always ask about one event, usually by status. Without this index the database would have to check the seats of every event, and there are thousands of seats per event.
- **`idx_orders_user_id`:** "show me my tickets" searches orders by user, and this index jumps straight to that user's orders.

### Example queries

```sql
-- 1. the seat map for one event
SELECT id, section, row_label, seat_number, price, status
FROM seats
WHERE event_id = 7
ORDER BY section, row_label, seat_number;

-- 2. my tickets, newest first (uses JOINs)
SELECT events.title, seats.section, seats.row_label, seats.seat_number
FROM orders
JOIN order_items ON order_items.order_id = orders.id
JOIN seats ON seats.id = order_items.seat_id
JOIN events ON events.id = orders.event_id
WHERE orders.user_id = 1
ORDER BY orders.created_at DESC;

-- 3. how many seats are available, held and sold for an event
SELECT status, COUNT(*) AS total
FROM seats
WHERE event_id = 7
GROUP BY status;
```

In the real server, values like the user id are passed as placeholders (`?`), never joined into the SQL text, to prevent SQL injection.

## 5. How the design prevents two people buying the same seat

This is the most important rule in the system, so it is protected in several layers.

### The wrong way, and why it fails

The obvious approach is to read the seat, check it is free, and then update it:

```
1. SELECT status FROM seats WHERE id = 1201;    (both people see "available")
2. UPDATE seats SET status = 'held' WHERE id = 1201;    (both people update it)
```

If two requests arrive at the same moment, both can run step 1 before either runs step 2. Both see "available", and both think they got the seat. The check and the update are two separate steps, and the gap between them is where the bug lives.

### Layer 1: an atomic conditional update to hold a seat

The check and the change happen in one single statement, so there is no gap:

```sql
UPDATE seats
SET status = 'held',
    held_by = ?,
    hold_expires_at = datetime('now', '+5 minutes')
WHERE id = ?
  AND event_id = ?
  AND (status = 'available'
       OR (status = 'held' AND hold_expires_at < datetime('now')));
```

The database locks the seat's row while it runs this. If two requests arrive together, one runs first and changes the row. The second then looks at the row, sees it is no longer available, matches zero rows and changes nothing. The server checks how many rows changed: if it is 1, the hold worked, and if it is 0, the server replies 409 Conflict. The part `status = 'held' AND hold_expires_at < now` lets someone take a seat whose hold has run out.

For several seats, the holds run inside one transaction. If any seat changes zero rows, the whole transaction is rolled back, so the user holds all the seats or none of them.

### Layer 2: a transaction to buy the seats

After the payment provider confirms the payment, the server runs this as one transaction:

```sql
BEGIN;

INSERT INTO orders (user_id, event_id, total_price, payment_ref)
VALUES (?, ?, ?, ?);

-- for each seat in the hold:
UPDATE seats
SET status = 'sold', held_by = NULL, hold_expires_at = NULL
WHERE id = ?
  AND status = 'held'
  AND held_by = ?
  AND hold_expires_at >= datetime('now');

-- if any seat changed 0 rows, run ROLLBACK and refund the payment
INSERT INTO order_items (order_id, seat_id) VALUES (?, ?);

COMMIT;
```

The seat only becomes sold if it is still held by this same user and the hold has not expired. Because it is a transaction, the order, the seat changes and the order items all happen together, or none of them do. This is the "atomic" part of ACID. If the server crashes in the middle, the database undoes the half-finished work. Once COMMIT succeeds, the sale is durable and survives a crash.

### Layer 3: unique constraints as a safety net

Even if a bug in the code tried to sell a seat twice, the database would refuse:

- `order_items.seat_id` is `UNIQUE`, so a seat can only be in one order. A second insert for the same seat fails with a constraint error.
- `orders.payment_ref` is `UNIQUE`, so one payment can only create one order. This stops a double click or a retried payment message from creating two orders.
- `seats` has a `UNIQUE` rule on event, section, row and seat number, so the same seat cannot be created twice.

### Why the cache and the waiting room do not decide this

The cache shows the seat map quickly, but it can be a second or two out of date, so it can show a seat as free when it was just taken. That is fine, because it only decides what the user sees. The database decides who really gets the seat, and a user who clicks a taken seat just gets a polite 409 and picks another. The waiting room only controls how many people reach the system at once. Neither one can sell a seat.

### Expired holds

A hold that is not paid for within 5 minutes stops counting, because the update in Layer 1 treats an expired hold as available. A worker also runs every minute to set expired holds back to `available`, so the seat map stays tidy.

## 6. Architecture

### Diagram

```
        Users (phones and browsers)
          |                      |
          | pages and            | browse and buy
          | images               | requests
          v                      v
     +---------+        +-----------------+
     |   CDN   |        |  Waiting room   |
     +---------+        +-----------------+
          |                      |
          | on a miss            v
          |             +-----------------+
          |             |  Load balancer  |
          |             +-----------------+
          |                      |
          |                      v
          |             +-----------------+
          |             |  App servers    |
          |             |  (many copies)  |
          |             +-----------------+
          |                      |
          |                      +--- browse events      ---> [ Cache ] --(on a miss)--> [ Read replica ]
          |                      |
          |                      +--- hold and buy seats ---> [ Primary database ] --(copies every change)--> [ Read replica ]
          |                      |
          |                      +--- take payment       ---> [ Payment provider ]
          |                      |
          |                      +--- after a sale       ---> [ Queue ] --> [ Workers ] --(email tickets, clean up expired holds)
          |
          v
     +---------------------------------+
     |  Object storage (event images)  |
     +---------------------------------+
```

The read replica appears twice so the lines stay short, but it is one component.

### What each component does

- **CDN:** it serves the pages, scripts and event images from servers close to the user, so only real API calls reach our servers.
- **Waiting room:** it lets people into the buying pages at a speed the system can handle and keeps everyone else in a fair queue, which protects the database from a stampede.
- **Load balancer:** it spreads requests across the app servers, skips any that are down, and limits how many requests one user can send.
- **App servers:** they run the TicketHub code (login, events, holds, orders), and because they keep no data themselves, I can add more copies before a sale.
- **Cache:** it keeps event details and the latest seat map in fast memory for a second or two, so thousands of people looking at the same event cause only a few database reads.
- **Primary database:** it is the only place where seats, holds and orders are written, so it is the single source of truth and it enforces the double-booking rules.
- **Read replica:** it is a live copy of the primary that answers event browsing and seat map reads, which takes load off the primary.
- **Payment provider:** it is an outside service that takes the card or mobile money payment, so we never store card details ourselves.
- **Queue:** it holds jobs such as "email the tickets" so the buying request can reply without waiting for them.
- **Workers:** they take jobs from the queue and do the slow work in the background, such as creating ticket codes and emails, and cleaning up expired holds.
- **Object storage:** it stores event images and poster files cheaply, and the CDN reads from it.

### How the design survives the big sale

1. **Scale up ahead of time.** The sale start time is known, so I add servers before it (about 40) and remove them afterwards.
2. **Waiting room.** It lets in a limited number of people at a time (for example about 2,000), so the database never receives all 5,000 hold attempts per second at once. People in the queue see their position, which feels fairer than an error page.
3. **CDN for everything static.** The page, scripts and images never reach the app servers.
4. **Cache the seat map.** The seat map is the most requested thing, and it can be a second old. One cached copy answers thousands of requests.
5. **Keep the buying path small.** Holding a seat is one small update and buying is one short transaction. Emails and ticket codes are done later by workers.
6. **Limits per user.** A maximum of 4 seats per hold and a request limit per user stop bots and one person taking too many seats.
7. **Fast "sold out".** When the last seat is sold, the event is marked as sold out in the cache, so the remaining visitors get an instant answer without touching the database.

### Flow of buying tickets

1. The user opens the event page. The CDN serves the page, and the waiting room lets them in when it is their turn.
2. The app server returns the seat map from the cache (or from the read replica if the cache is empty).
3. The user picks seats and sends `POST /events/7/holds`.
4. The app server runs the atomic conditional update on the primary database. If any seat is taken, it replies 409. Otherwise it replies 201 with an expiry time.
5. The user pays. The app server sends the payment to the payment provider.
6. When the payment succeeds, the app server runs the buy transaction. If a seat is no longer held by this user, it rolls back and refunds the payment.
7. The app server puts an "email the tickets" job on the queue and replies 201 with the tickets.
8. A worker sends the email, and the cache for that event is cleared so the seat map is fresh.

### Avoiding single points of failure

- **App servers:** there are many identical copies, so the load balancer sends traffic to the others if one fails.
- **Load balancer and waiting room:** I use managed services that run on several machines, so one failing does not stop them.
- **Primary database:** the read replica keeps a copy and can be promoted to primary if the primary fails, and there are nightly backups that I would test by restoring them.
- **Cache:** it runs as a group of nodes. If it fails, requests fall back to the read replica, which is slower but still works.
- **Queue and workers:** the queue is replicated, there are several workers, and a failed job goes back on the queue to be tried again.
- **Payment provider:** if it is down, users get a clear message and can try again, and their seats stay held until the hold runs out.
- **A whole data center:** I would spread the servers and databases across at least two availability zones.

## 7. Trade-offs

1. **Correctness against speed (one primary database for holds).** All holds and sales go through the primary database. That is slower and has a limit on how many writes it can take, but it is the only way to be sure a seat is sold once. I accept that and protect the primary with the waiting room. If it ever becomes too slow, I can split the seats of different events across several databases, so a popular event does not slow the others.
2. **Database locking against a cache lock (alternatives considered).** I could lock seats in a fast cache like Redis instead of the database. It would be faster, but if the cache lost its data or two copies disagreed, two people could be given the same seat. I chose the database because a wrong ticket is much worse than a slightly slower one.
3. **Cached seat map: speed against fresh data.** The seat map is cached for a second or two, which takes huge load off the database. The cost is that someone may click a seat that was just taken, and they get a 409 and choose another. That is a small annoyance compared with a crash.
4. **Waiting room: protection and fairness against user patience.** It keeps the system alive and gives people a fair place in line, but some people have to wait, and some will leave. I think a visible queue is much better than a broken site.
5. **Length of the hold: fairness to the buyer against fairness to everyone else.** A 5-minute hold gives people enough time to pay, but it keeps seats away from others in that time. A shorter hold frees seats faster but rushes people and causes failed payments. Five minutes is a middle choice, and it can be changed per event.
6. **Payment after the hold: a rare refund against a smoother experience.** If a payment goes through but the hold has expired and someone else took the seat, I have to refund the money automatically. This is rare, because the payment must finish within the hold, but it is the cost of not charging people before they have chosen seats.

## 8. Summary

TicketHub is easy on a normal day, with about 6 page views and one ticket sale every 17 seconds on average. The big sale is about 575 times busier for a short time, and only 1 in 10 people can get a seat. The design handles it by serving static content from a CDN, putting a waiting room in front of the system, caching the seat map, adding servers before the sale, and moving slow work to a queue. Double booking is prevented where it matters most, in the database: an atomic conditional update to hold a seat, a transaction to buy it, and unique constraints as a safety net.

End of document.