// find the parts of the page I need
const loadButton = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

const USERS_URL = "https://jsonplaceholder.typicode.com/users";

// names and cities I show instead of the ones from the API
// names and cities are swapped for display only, the API data is the same
const kenyanNames = [
  "Wanjiku Kimani",
  "Brian Mutiso",
  "Amina Abdi",
  "Elias Njoroge",
  "Rodney Odhiambo",
  "Jane Rotich",
  "Faith Wambui",
  "Elvis Kioko",
  "June Wekesa",
  "Juma Barasa",
];

const kenyanCities = [
  "Nairobi",
  "Mombasa",
  "Kisumu",
  "Nakuru",
  "Eldoret",
  "Thika",
  "Nyeri",
  "Machakos",
  "Kakamega",
  "Kitale",
];

// every user I have loaded goes in this array
let allUsers = [];

// draws whatever list of users I give it
function renderUsers(list) {
  usersList.replaceChildren(); // empty the list first

  // users were loaded, but none match the filter
  if (list.length === 0 && allUsers.length > 0) {
    const message = document.createElement("li");
    message.textContent = "No users match your filter.";
    usersList.appendChild(message);
    return;
  }

  list.forEach((user) => {
    const li = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = user.name;

    const email = document.createElement("div");
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("div");
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("div");
    company.textContent = `Company: ${user.company.name}`;

    li.appendChild(name);
    li.appendChild(email);
    li.appendChild(city);
    li.appendChild(company);
    usersList.appendChild(li);
  });
}

// shows only the users whose name includes the typed text
function applyFilter() {
  const search = filterInput.value.trim().toLowerCase();

  const matches = allUsers.filter((user) =>
    user.name.toLowerCase().includes(search)
  );

  renderUsers(matches);
}

// gets the users from the server
async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadButton.disabled = true; // stop double clicks

  try {
    const response = await fetch(USERS_URL);

    // fetch does not throw on 404 or 500, so I check it myself
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    allUsers = await response.json();

    allUsers.forEach((user, index) => {
      user.name = kenyanNames[index] || user.name;
      user.address.city = kenyanCities[index] || user.address.city;
    });

    applyFilter();
    statusText.textContent = `Loaded ${allUsers.length} users.`;
  } catch (error) {
    statusText.textContent = "Could not load users. Please try again.";
    console.error(error);
  } finally {
    loadButton.disabled = false; // runs whether it worked or not
  }
}

loadButton.addEventListener("click", loadUsers);

// filter while typing, no new request needed
filterInput.addEventListener("input", applyFilter);