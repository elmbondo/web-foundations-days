# Library API Design

This is a REST API for the `books` resource of a library. The resource name is a plural noun, the HTTP method says what to do, and the id in the path says which book.

## Endpoints

### 1. List all books

- **Method and path:** `GET /books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book

- **Method and path:** `GET /books/{id}`
- **Description:** Returns the book with this id, for example `GET /books/7`.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book

- **Method and path:** `POST /books`
- **Description:** Adds a new book to the library.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "year": 1958,
  "isbn": "9780385474542"
}
```

- **Success status:** `201 Created`

### 4. Replace a book

- **Method and path:** `PUT /books/{id}`
- **Description:** Replaces the whole book with a new version. Every field must be sent.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "year": 1958,
  "isbn": "9780385474542"
}
```

- **Success status:** `200 OK`

### 5. Update part of a book

- **Method and path:** `PATCH /books/{id}`
- **Description:** Changes only the fields that are sent, for example `PATCH /books/7`.
- **Example request body:**

```json
{
  "year": 1959
}
```

- **Success status:** `200 OK`

### 6. Delete a book

- **Method and path:** `DELETE /books/{id}`
- **Description:** Removes the book with this id.
- **Request body:** none
- **Success status:** `204 No Content`

### 7. List books by an author

- **Method and path:** `GET /books?author={name}`
- **Description:** Returns only the books written by this author, for example `GET /books?author=Chinua%20Achebe`. The author name is a query parameter.
- **Request body:** none
- **Success status:** `200 OK`

## Error codes

### 400 Bad Request

- **Meaning:** The request is invalid, so the server cannot use it.
- **Example:** A user sends `POST /books` with an empty title, or with `"year": "last year"` instead of a number.

### 404 Not Found

- **Meaning:** The book or the URL does not exist.
- **Example:** A user sends `GET /books/9999` but there is no book with id 9999.