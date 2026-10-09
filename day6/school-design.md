# School Database Design

## The tables

**students** stores one row for each student. It has an `id` (primary key), a `name` and an `email`. The email is `UNIQUE`, so two students can't register with the same one.

**courses** stores one row for each course. It has an `id` (primary key), a `title` and the `teacher`.

**enrolments** records that a student joined a course. It has the `student_id` and the `course_id` (both foreign keys) and the `grade`. The grade can be empty until the work is marked. The primary key is the pair `(student_id, course_id)`, which means the same student can't be enrolled on the same course twice.

## The relationships

- **One student has many enrolments**, and **one course has many enrolments**. Both of those are one-to-many.
- Put together, students and courses are **many-to-many**. A student can take many courses, and a course can have many students.
- A many-to-many relationship needs a **join table** because one column can't hold a list of ids cleanly. If the courses were stored as "1,2,3" in the students table, it would be hard to search and update. The `enrolments` table gives each pairing its own row, and it is also the right place for the grade, because the grade belongs to the student and the course together, not to either one alone.

## An index I would add

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

The primary key `(student_id, course_id)` already makes it fast to find all of one student's courses. But finding all the students on one course, or counting students per course, searches by `course_id`, and the database would have to check every row. An index on `course_id` makes those lookups fast, which matters once there are thousands of enrolments.

## SQL or NoSQL?

I would choose SQL for this system. The data is clearly structured, with students, courses and enrolments, and the relationships between them matter a lot. SQL is good at joining tables, so questions like "which students are on this course" are easy to answer. It also enforces rules in the database itself, like the unique email, the grade between 0 and 100, and the rule that a student can't enrol on the same course twice. That keeps the data correct even if the app code has a bug. A NoSQL document database could work for a very small version, but duplicating student details inside every course document would make changes harder, and school records are the kind of data where correctness matters most.