Day 7: Scaling Plan for SnapShare

1. Assumptions

SnapShare is a photo-sharing app where users can upload photos and view photos shared by people they follow. Before deciding how to build the system, I need to estimate the number of users, requests and the amount of storage required.

I will use the following assumptions:

Registered users: 10,000,000

10% of registered users are active each day

Each active user uploads 1 photo per day

Each active user views 50 feed pages per day

The average photo is 2 MB

Each photo also has a 50 KB thumbnail

One day is approximately 100,000 seconds for easier calculations

Peak traffic is 5 times the average traffic

Daily active users

10,000,000 × 10% = 1,000,000 daily active users.

This means SnapShare has 1 million users using the app each day, even though 10 million people have registered.

2. Load and storage estimates

Photo uploads per second

Each active user uploads one photo per day.

1,000,000 × 1 = 1,000,000 uploads per day.

1,000,000 ÷ 100,000 = approximately 10 uploads per second.

During peak hours, traffic may be five times higher:

10 × 5 = 50 uploads per second.

Feed views per second

Each active user views 50 feed pages per day.

1,000,000 × 50 = 50,000,000 feed views per day.

50,000,000 ÷ 100,000 = approximately 500 feed views per second.

During peak hours:

500 × 5 = 2,500 feed views per second.

MeasurementAveragePeakPhoto uploads10 per second50 per secondFeed views500 per second2,500 per second 

Storage per year

Each original photo takes up approximately 2 MB.

1,000,000 × 2 MB = 2,000,000 MB per day, or about 2 TB per day.

2 TB × 365 days = 730 TB per year.

Thumbnails also require storage:

1,000,000 × 50 KB = 50 GB per day.

50 GB × 365 days = 18.25 TB per year.

The total estimated storage per year is:

730 TB + 18.25 TB = approximately 748.25 TB.

These estimates assume that all photos are kept and use decimal storage units. They do not include extra space for backups, replicas or other data.

3. Is SnapShare read-heavy or write-heavy?

SnapShare is read-heavy because users view their feeds much more often than they upload photos. There are about 50 feed views for every photo uploaded.

This means I would focus on making the feed load quickly without putting too much pressure on the database. Caching frequently requested feed data, using read replicas and serving photos through a CDN would help with this.

Uploads also need to work reliably, but thumbnail generation can happen in the background so that users do not have to wait for the entire process to finish.

4. Why photos should not be stored inside the database

I would store the actual photos in object storage instead of putting them directly into the database. Photos take up a lot of space, and storing hundreds of terabytes of image files in a database would make storage management and backups more expensive and complicated.

The database would keep information about each photo, such as who uploaded it, its caption, upload time and the location of the file in object storage. The original photos and thumbnails would be stored separately.

This allows the database to focus on handling information and queries, while object storage handles the large image files. A CDN can then help users access those images faster.

5. Proposed architecture

┌──────────────┐ │ DNS │ └──────┬───────┘ │ v ┌─────────────────┐ ┌──────────────┐ │ Users / Clients │─────>│ CDN │ └────────┬────────┘ │ Photos and │ │ │ thumbnails │ │ └──────┬───────┘ │ │ Cache miss │ v │ ┌──────────────┐ │ │ Object │ │ │ Storage │ │ └──────────────┘ │ │ API requests v ┌───────────────┐ │ Load Balancer │ └───────┬───────┘ │ ┌───┴────┐ v v ┌─────────┐ ┌─────────┐ │ App │ │ App │ │ Server 1│ │ Server 2│ └────┬────┘ └────┬────┘ │ │ ├─────┬─────┤ │ │ │ v v v ┌────────┐ ┌────────────┐ ┌──────────────┐ │ Cache │ │ Primary DB │ │ Message Queue│ │ Redis │ │ │ │ │ └────────┘ └─────┬──────┘ └──────┬───────┘ │ │ v v ┌────────────┐ ┌─────────────┐ │ Read │ │ Thumbnail │ │ Replica │ │ Worker │ └────────────┘ └──────┬──────┘ │ v ┌──────────────┐ │ Object │ │ Storage │ └──────────────┘ 

The CDN serves photos and thumbnails from its cache when they are available. If an image is not cached, it can be fetched from object storage. API requests go through the load balancer to the app servers, which use Redis and the database to retrieve or update information.

6. What each component does

DNS: Converts SnapShare's domain name into the address needed to reach the service.

CDN: Delivers photos and thumbnails from servers closer to users, reducing loading times.

Load balancer: Distributes incoming requests across healthy app servers so that one server does not handle everything.

App servers: Handle tasks such as uploading photos, retrieving feeds, checking permissions and saving photo information.

Cache (Redis): Keeps frequently requested feed data in memory so it can be retrieved quickly without repeatedly querying the database.

Primary database: Stores the main copy of photo information, user details, captions and relationships between users.

Read replica: Handles read queries to reduce the amount of work done by the primary database.

Object storage: Stores the original photos and thumbnails separately from the database.

Message queue: Holds thumbnail-generation jobs until a worker is ready to process them.

Thumbnail worker: Creates smaller versions of uploaded photos and saves them to object storage.

7. Step-by-step photo upload flow

Step 1: A user selects a photo and uploads it through the SnapShare app.

Step 2: The request reaches the load balancer, which sends it to one of the healthy app servers.

Step 3: The app server checks that the user is logged in and that the uploaded file meets the app's size and format requirements.

Step 4: The original photo is saved in object storage, and its storage key is recorded.

Step 5: The app saves the photo's details in the primary database, including the uploader, caption, upload time and storage key.

Step 6: The app adds a thumbnail-generation job to the message queue.

Step 7: The app confirms the upload without waiting for the thumbnail to be created.

Step 8: A thumbnail worker picks up the job, creates a smaller version of the photo and saves it in object storage.

Step 9: The system marks the thumbnail as ready, allowing it to be served through the CDN when requested.

Step 10: When another user views a feed containing the photo, the app retrieves the feed information from the cache or database and provides the relevant photo URL. The CDN serves the image if it has a cached copy, or fetches it from object storage.

If thumbnail generation fails, the job can be retried without asking the user to upload the photo again.

8. Trade-offs

Speed versus freshness

Caching feed data and using read replicas makes the app faster and reduces database traffic. However, users might briefly see an older feed or fail to see a newly uploaded photo immediately. I would clear or update the relevant cached data when a photo is uploaded and use suitable cache expiry times.

Cost versus reliability

Using several app servers, read replicas and reliable object storage helps the app continue working when a component fails. However, running extra resources costs more money. I would start with enough capacity for the expected traffic and add more resources as usage increases.

Fast uploads versus immediate processing

Using a message queue and thumbnail worker allows users to upload photos without waiting for thumbnail generation to finish. The downside is that the thumbnail might not be ready immediately. The app can show the original photo or a placeholder until the thumbnail is available.

Simplicity versus scalability

A simple system is easier to build and maintain, but it might struggle as the number of users grows. I would keep the application as one organised service initially while using separate components for caching, object storage and background jobs. I would only introduce more complex services or database sharding when there is a clear need.

9. Conclusion

Based on my estimates, SnapShare would handle around 10 photo uploads and 500 feed views per second on average. During peak hours, these could increase to 50 uploads and 2,500 feed views per second. The app would also need approximately 748.25 TB of additional storage each year for original photos and thumbnails.

Since users view feeds much more often than they upload photos, caching, read replicas and a CDN would help keep the app responsive. Object storage would handle the image files, while the database would store their details. A message queue and thumbnail worker would also allow image processing to happen in the background.

I would monitor traffic, response times, errors, cache performance and storage growth to decide when the system needs more resources.

