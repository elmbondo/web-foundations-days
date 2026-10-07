// ---------- 1. Find the elements ----------
const noteText = document.querySelector("#note-text");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearBtn = document.querySelector("#clear-btn");
const themeBtn = document.querySelector("#theme-toggle");

// names used to save things in localStorage
const DRAFT_KEY = "day4-draft";
const THEME_KEY = "day4-theme";

// ---------- 2. Update the counters ----------
function updateCounts() {
  const text = noteText.value;
  const length = text.length;

  // count words: trim the spaces, then split on any gap between words
  const trimmed = text.trim();
  let words = 0;
  if (trimmed !== "") {
    words = trimmed.split(/\s+/).length;
  }

  charCount.textContent = `${length} / 200 characters`;
  wordCount.textContent = `${words} words`;

  // start clean, then add the classes that fit
  charCount.classList.remove("warning", "over");
  if (length > 180) {
    charCount.classList.add("warning");
  }
  if (length > 200) {
    charCount.classList.add("over");
  }
}

// ---------- 3. Typing ----------
noteText.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem(DRAFT_KEY, noteText.value); // save the draft
});

// ---------- 4. Clearing ----------
function clearNote() {
  noteText.value = "";
  localStorage.removeItem(DRAFT_KEY);
  updateCounts();
  noteText.focus();
}

clearBtn.addEventListener("click", clearNote);

// Escape clears it too, but only when typing in the box
noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearNote();
  }
});

// ---------- 5. Dark mode ----------
// the button shows the mode you would switch TO
function updateThemeLabel() {
  if (document.body.classList.contains("dark")) {
    themeBtn.textContent = "Light mode";
  } else {
    themeBtn.textContent = "Dark mode";
  }
}

themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  if (document.body.classList.contains("dark")) {
    localStorage.setItem(THEME_KEY, "dark");
  } else {
    localStorage.setItem(THEME_KEY, "light");
  }

  updateThemeLabel();
});

// ---------- 6. When the page loads ----------
// bring back the saved draft
const savedDraft = localStorage.getItem(DRAFT_KEY);
if (savedDraft) {
  noteText.value = savedDraft;
}

// bring back the saved theme
if (localStorage.getItem(THEME_KEY) === "dark") {
  document.body.classList.add("dark");
}

updateThemeLabel();
updateCounts();