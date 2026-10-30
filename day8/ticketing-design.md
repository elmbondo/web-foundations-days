# TicketHub Design

TicketHub sells tickets for concerts and events. The hard part is the big sale: 200,000 people try to buy 20,000 seats in 10 minutes. The long version with full SQL and JSON examples is in `ticketing-design-details.md`.

## 1. Requirements

**Functional:** log in, browse events, see the seat map, hold up to 4 seats for 5 minutes, pay, and view my tickets. Unpaid holds expire and free the seats.

**Non-functional:**
- Speed: seat map under 1 s and a hold under 300 ms, even in a big sale
- Correctness: a seat is never sold twice, and nobody pays without getting a seat
- Fairness: first come, first served, with a limit of 4 seats per person
- Availability: 99.9%, and no crash when a sale starts
- Security: HTTPS, password hashes, and card details handled only by a payment provider

## 2. Estimates

Assumptions: peak is 5x the average, a day has 86,400 seconds, and in a big sale each person makes about 10 requests.

| What | Total | Average per second | Peak per second |
|------|-------|--------------------|-----------------|
| Normal day, page views | 500,000 | 6 | 29 |
| Normal day, tickets sold | 5,000 | 0.06 | 0.3 |
| Big sale, requests | 2,000,000 | 3,333 | 16,700 |
| Big sale, seats sold | 20,000 | 33 | 167 |

The big sale is about 575 times busier than a normal day, and only 1 in 10 people can get a seat. At about 500 requests per second per server (an assumption), I need about 40 app servers at peak and 3 on a normal day.

## 3. API

| Method | Path | Purpose | Success |
|--------|------|---------|---------|
| GET | /events | list and search events | 200 |
| GET | /events/{id}/seats | seat map | 200 |
| POST | /events/{id}/holds | hold seats for 5 minutes | 201 |
| DELETE | /events/{id}/holds | release my held seats | 204 |
| POST | /orders | pay for held seats | 201 |
| GET | /me/tickets | my tickets | 200 |

Errors: 400 bad request, 401 not logged in, 404 not found, 409 seat taken, 410 hold expired, 429 too many requests.

## 4. Data model

- **users:** id (PK), name, email (unique), password_hash
- **events:** id (PK), title, venue, starts_at, total_seats
- **seats:** id (PK), event_id (FK), section, row_label, seat_number, price, status, held_by (FK), hold_expires_at
- **orders:** id (PK), user_id (FK), event_id (FK), total_price, payment_ref (unique)
- **order_items:** order_id (FK), seat_id (FK, unique)

A user has many orders and an event has many seats (one-to-many). Orders and seats are linked through order_items, and its unique seat_id means a seat is in at most one order. I chose SQL because correctness matters most and SQL has transactions and constraints.

## 5. Preventing double booking

1. **Hold:** one atomic statement checks and changes the seat together:
`UPDATE seats SET status='held', held_by=?, hold_expires_at=? WHERE id=? AND (status='available' OR hold_expires_at < datetime('now'))`
If it changes 0 rows, someone else got there first and the server replies 409. Reading the seat and then updating it would be a race, so I never do that.
2. **Buy:** after payment, one transaction marks the seats sold (only if still held by this user and not expired) and creates the order and order items. If any seat fails, it rolls back and refunds.
3. **Safety net:** the unique seat_id in order_items and the unique payment_ref make the database refuse a second sale of a seat or a repeated payment.

The cache can show an old seat map, but only the database decides who gets a seat.

## 6. Architecture

```
Users --> CDN --> Object storage (event images)
Users --> Waiting room --> Load balancer --> App servers (many copies)
                                               |
                                               +--> Cache --> Read replica
                                               +--> Primary database --> Read replica
                                               +--> Payment provider
                                               +--> Queue --> Workers
```

- **CDN:** serves pages and images from servers close to the user.
- **Waiting room:** lets people in at a pace the database can handle, in a fair queue.
- **Load balancer:** spreads requests over the app servers and skips broken ones.
- **App servers:** run the code and keep no data, so I can add more before a sale.
- **Cache:** keeps the seat map for a second or two, so thousands of viewers cause few database reads.
- **Primary database:** the only place that writes seats and orders, and it enforces the double-booking rules.
- **Read replica:** a live copy that answers browsing reads.
- **Payment provider:** takes payments so we never store card details.
- **Queue and workers:** send emails and free expired holds outside the buying request.
- **Object storage:** stores event images.

No single point of failure: many app servers, a replica that can become the primary, a cache that falls back to the replica, and a replicated queue.

## 7. Trade-offs

1. **Correctness against speed:** all holds and sales go through one primary database. It is slower and has a limit, but it is the only way to be sure a seat is sold once, and the waiting room protects it.
2. **Cached seat map:** it is fast, but it can be 1 or 2 seconds old, so someone may click a taken seat and get a 409. That is better than a crash.
3. **Waiting room:** it keeps the system alive and the queue fair, but some people have to wait.

End of document.