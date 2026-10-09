-- School database: students, courses and enrolments

-- turn on foreign key checks (SQLite needs this)
PRAGMA foreign_keys = ON;

-- delete old tables first so I can run the file again and again
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ---------- tables ----------

CREATE TABLE students (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  email  TEXT NOT NULL UNIQUE   -- no two students can share an email
);

CREATE TABLE courses (
  id       INTEGER PRIMARY KEY,
  title    TEXT NOT NULL,
  teacher  TEXT NOT NULL
);

-- links a student to a course and keeps the grade
CREATE TABLE enrolments (
  student_id  INTEGER NOT NULL,
  course_id   INTEGER NOT NULL,
  grade       INTEGER CHECK (grade BETWEEN 0 AND 100),  -- empty until marked
  PRIMARY KEY (student_id, course_id),  -- same student can't join the same course twice
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- ---------- sample data ----------

INSERT INTO students (name, email) VALUES
  ('Wanjiku Kimani', 'wanjiku@example.com'),
  ('Brian Mutiso', 'brian@example.com'),
  ('Amina Abdi', 'amina@example.com'),
  ('Elias Njoroge', 'elias@example.com');

INSERT INTO courses (title, teacher) VALUES
  ('Web Development', 'Ms Achieng'),
  ('Databases', 'Mr Kamau'),
  ('Data Science', 'Dr Rotich');

-- Elias is not enrolled on anything, on purpose (for query 4)
INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 85),
  (1, 2, 78),
  (2, 1, 72),
  (2, 3, NULL),
  (3, 1, 90),
  (3, 2, 66);

-- ---------- queries ----------

-- 1. all courses for one student, by name
SELECT courses.title, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.id
JOIN courses ON courses.id = enrolments.course_id
WHERE students.name = 'Wanjiku Kimani';

-- 2. all students on one course
SELECT students.name, students.email
FROM courses
JOIN enrolments ON enrolments.course_id = courses.id
JOIN students ON students.id = enrolments.student_id
WHERE courses.title = 'Web Development';

-- 3. number of students per course
-- LEFT JOIN so a course with nobody in it still shows up with 0
SELECT courses.title, COUNT(enrolments.student_id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.id
GROUP BY courses.id;

-- 4. students who have no enrolments
SELECT students.name
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.id
WHERE enrolments.student_id IS NULL;

-- 5. update one grade (Wanjiku, Web Development)
UPDATE enrolments
SET grade = 92
WHERE student_id = 1 AND course_id = 1;