# SnapShare Scaling Plan

SnapShare is a photo-sharing app. Users upload photos and scroll a feed of photos from the people they follow. This plan works out how much traffic and storage the app needs, and shows an architecture that can handle it.

## 1. Assumptions

- 10,000,000 registered users
- 10% of them are active each day
- Each active user uploads 1 photo per day
- Each active user views 50 feed pages per day
- An average photo is 2 MB
- Each photo also gets a 50 KB thumbnail
- One day has 86,400 seconds and one year has 365 days
- Peak traffic is 5 times the average
- One "feed view" means one request to load a page of the feed. The photos on that page are loaded separately from the CDN.
- I ignore user growth to keep the numbers simple, and I use decimal units (1 TB = 1,000,000 MB).

**Daily active users:** 10,000,000 x 10% = **1,000,000 users per day**

## 2. Estimates

| What | Per day | Average per second | Peak per second (5x) |
|------|---------|--------------------|----------------------|
| Photo uploads | 1,000,000 | about 12 | about 58 |
| Feed views | 50,000,000 | about 579 | about 2,900 |

The peak numbers are worked out from the unrounded average.

**How I got them**

- Uploads per day: 1,000,000 users x 1 photo = 1,000,000
- Uploads per second: 1,000,000 / 86,400 = about 11.6, so about 12
- Feed views per day: 1,000,000 users x 50 = 50,000,000
- Feed views per second: 50,000,000 / 86,400 = about 579

**Upload bandwidth:** 11.6 uploads per second x 2 MB is about 23 MB per second on average. At peak that is about 116 MB per second.

**Storage per year**

| What | Per day | Per year |
|------|---------|----------|
| Original photos | 1,000,000 x 2 MB = 2 TB | 2 TB x 365 = 730 TB |
| Thumbnails | 1,000,000 x 50 KB = 50 GB | 50 GB x 365 = 18.25 TB |
| **Total** | about 2.05 TB | **about 748 TB, so roughly 750 TB** |

That is a bit under one petabyte of new files every year.

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. For every 1 upload there are 50 feed views, so reads are about 50 times more common than writes. Each feed view also loads many photos.

What this means for the design:

- Reads must be cheap and fast, so I use a **CDN** and a **cache**, and a **read replica** so feed reads don't load the main database.
- Writes are rare (about 12 per second on average, 58 at peak), so one primary database should cope with them.
- Peak feed traffic is about 2,900 requests per second. If one app server can handle about 500 requests per second (this is an assumption), I need about 6 servers at peak. I would run 8 to leave some room.

## 4. Why photos should not go in the database

The files add up to about 750 TB every year. A database is built for small structured rows, not huge files. Keeping photos in it would make the database very big and very expensive, and backups and restores would take forever. Every photo download would also use a database connection that other queries need.

Instead, photos go in **object storage** (like Amazon S3). It is cheap, built for large files, grows almost without limit, and works well with a CDN. The database only keeps a small row for each photo: the id, the user, the storage key (the file's location), the caption and the time it was created.

## 5. Architecture diagram

```
        Users (phones and browsers)
          |                      |
          | photos and           | feed and upload
          | thumbnails           | requests
          v                      v
     +---------+        +-----------------+
     |   CDN   |        |  Load balancer  |
     +---------+        +-----------------+
          |                      |
          | on a cache miss      v
          |             +-----------------+
          |             |  App servers    |
          |             |  (many copies)  |
          |             +-----------------+
          |                      |
          |                      +--- reads ----------> [ Cache ] --(on a miss)--> [ Read replica ]
          |                      |
          |                      +--- writes ---------> [ Primary database ] --(copies every change)--> [ Read replica ]
          |                      |
          |                      +--- original photo -> [ Object storage ]
          |                      |
          |                      +--- new job --------> [ Queue ] --> [ Worker ] --(saves thumbnail)--> [ Object storage ]
          v
     +---------------------------+
     |  Object storage (photos)  |
     +---------------------------+
```

The read replica and the object storage each appear more than once so the lines stay short, but each one is a single component.

## 6. What each component does

- **CDN:** It keeps copies of photos and thumbnails on servers close to the user, so photos load fast and the storage doesn't get hit for every view.
- **Load balancer:** It spreads incoming requests across the app servers so no single server is overloaded, and it skips any server that is down.
- **App servers:** They run the SnapShare code (login, feed, upload), and because they store no data themselves I can add more copies whenever traffic grows.
- **Cache:** It keeps recent feed results in fast memory so the database doesn't have to rebuild the same feed again and again.
- **Primary database:** It stores users, follows, and photo details, and it is the only place where changes are written.
- **Read replica:** It is a live copy of the primary that answers feed reads, which takes load off the primary.
- **Object storage:** It stores the actual photo and thumbnail files cheaply and safely at any size.
- **Queue:** It holds jobs such as "make a thumbnail" so the app server can reply to the user straight away.
- **Worker:** It takes jobs from the queue one by one and does the slow work, like making thumbnails, in the background.

## 7. Upload flow, step by step

1. The user picks a photo and taps Upload. The request travels through the load balancer to one of the app servers, together with the user's login token.
2. The app server checks the token to find out who the user is, then checks the file. It must be an image, and it must not be too big. If the file is bad, the app server replies with 400 Bad Request and nothing is saved.
3. The app server writes the original photo to object storage and gets back its storage key (the file's location).
4. The app server stores the metadata in the primary database: a new row with the photo id, the user id, the storage key, the caption and the time. The status is set to "processing", and the thumbnail key is empty for now.
5. The app server pushes a "make thumbnail" job onto the queue. The job holds the photo id and the storage key.
6. The app server replies to the user with 201 Created right away. The user does not wait for the thumbnail.
7. A worker takes the job from the queue. It downloads the original photo from object storage and creates a 50 KB thumbnail.
8. The worker saves the thumbnail in object storage and gets back its storage key.
9. The worker updates the photo's row in the primary database with the thumbnail key and changes the status to "ready".
10. If the worker fails at any point, the job goes back on the queue and is tried again a few times. Until it succeeds, the photo shows a placeholder.
11. When followers open their feed, the thumbnails load through the CDN. The feed cache expires after about a minute, so the new photo shows up soon.

## 8. Trade-offs

1. **Thumbnails made later (asynchronous) against made during the upload (synchronous).** If the app server made the thumbnail before replying, the thumbnail would be ready straight away, but the user would wait longer and a traffic spike would tie up the app servers with slow image work. I chose to use a queue and a worker, so the upload replies fast and the work happens in the background. The cost is that the thumbnail appears a few seconds after the upload, so I need a placeholder, retries, and a way to watch the queue.
2. **Immediate consistency against low latency (read replica).** The read replica takes the feed traffic off the primary, but it can lag a moment behind, so a new photo may not show for a second or two. Reading everything from the primary would always be up to date, but it would be slower and would overload the primary. I would use the replica for feeds, and read from the primary for a short time after a user uploads, so they always see their own photo.
3. **Cache: speed against fresh data.** The cache makes feeds fast and protects the database, but a cached feed can be a little out of date. I use a short expiry (about a minute), so new photos still show up quickly. It is also one more thing to run and watch.
4. **Object storage: cheap and huge against two places to keep in sync.** Files are cheap to keep and the storage grows easily, but the file and its database row can get out of step. For example, the file may be saved but the database write fails. I would run a cleanup job to remove files that have no row.
5. **CDN: speed against cost.** Photos load much faster, but I pay for the data it delivers, and a deleted photo can stay on the CDN until the cache is cleared.

## 9. Summary

SnapShare is a read-heavy system with about 12 uploads per second and about 579 feed views per second on average, and it adds roughly 750 TB of photos every year. To handle that, photos live in object storage behind a CDN, feeds are served from a cache and a read replica, and slow work like thumbnails is done in the background by workers reading from a queue. The main trade-offs are speed against freshness of data, and fast uploads against thumbnails that appear a few seconds later.

End of plan.