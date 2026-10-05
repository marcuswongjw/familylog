/* Wong's Nest front door. Clothes render on the figure; cottage upgrades spend the shared jar. */
(function () {
  const MEMBERS = [
    { id: "Marcus", color: "#7dbe8a" },
    { id: "Eleanor", color: "#f3a48a" },
    { id: "Mikaela", color: "#f2d56b" },
    { id: "Meaghan", color: "#7eb8c9" }
  ];
  const CLOTHES = [
    { id: "hat", slot: "hat", name: "Sunny rain hat", price: 12, icon: "\ud83d\udc52" },
    { id: "scarf", slot: "scarf", name: "Striped scarf", price: 12, icon: "\ud83e\udde3" },
    { id: "bag", slot: "bag", name: "Tiny backpack", price: 12, icon: "\ud83c\udf92" }
  ];
  const PETS = [
    { id: "bird", name: "Bird", price: 20, icon: "\ud83d\udc26" },
    { id: "cat", name: "Cat", price: 40, icon: "\ud83d\udc31" },
    { id: "pup", name: "Puppy", price: 80, icon: "\ud83d\udc36" }
  ];
  const HOUSES = [
    { id: "tent", name: "Tent", cost: 0, icon: "\u26fa" },
    { id: "cabin", name: "Cabin", cost: 20, icon: "\ud83c\udfe1" },
    { id: "tree", name: "Treehouse", cost: 40, icon: "\ud83c\udf33" }
  ];
  const QUESTS = ["School bag packed", "Read together", "Water the plants"];
  const key = "wongs-nest-v1";
  const state = Object.assign({ pocket: 12, jar: 0, house: "tent", worn: {}, pet: {}, done: {} }, JSON.parse(localStorage.getItem(key) || "{}"));
  function save() { localStorage.setItem(key, JSON.stringify(state)); }
  function me() {
    const name = (document.getElementById("hname") || {}).textContent || "Mikaela";
    return MEMBERS.some(m => m.id === name.trim()) ? name.trim() : "Mikaela";
  }
  function paint(hop) {
    const root = document.getElementById("nest-root");
    if (!root) return;
    const who = me();
    const house = HOUSES.find(h => h.id === state.house) || HOUSES[0];
    root.innerHTML = '<div class="nest-stage"><div style="font-size:42px">' + house.icon + '</div><strong>Wong\'s Nest \u00b7 ' + house.name + '</strong><div class="nest-jar"><div style="width:' + Math.min(100, state.jar / 20 * 100) + '%"></div></div><div>' + state.jar + ' of 20 cottage berries</div><div class="nest-family">' + MEMBERS.map(m => { const worn = state.worn[m.id] || {}; return '<button class="nest-kid"><div class="nest-fig ' + (hop && m.id === who ? "hop" : "") + '" style="background:' + m.color + '">' + (worn.hat ? '<span class="nest-hat">\ud83d\udc52</span>' : "") + '<div class="nest-face">\u273f</div>' + (worn.scarf ? '<span class="nest-scarf">\ud83e\udde3</span>' : "") + (worn.bag ? '<span class="nest-bag">\ud83c\udf92</span>' : "") + '</div><div>' + m.id + '</div><div>' + ((PETS.find(p => p.id === state.pet[m.id]) || {}).icon || "") + '</div></button>'; }).join("") + '</div><div>Pocket berries: <strong>' + state.pocket + '</strong></div></div><div class="card" style="margin-top:12px"><div class="card-hdr"><span class="card-title">Today</span></div><div class="card-body">' + QUESTS.map((q, i) => '<button class="nest-check" data-quest="' + i + '">' + (state.done[who + i] ? "\u2713" : "\u25cb") + " " + q + "</button>").join("") + '</div></div><div class="nest-shop">' + CLOTHES.map(c => '<button data-cloth="' + c.id + '">' + c.icon + " " + c.name + "</button>").join("") + PETS.map(p => '<button data-pet="' + p.id + '">' + p.icon + " " + p.name + "</button>").join("") + HOUSES.filter(h => h.cost).map(h => '<button data-house="' + h.id + '">' + h.icon + " " + h.name + "</button>").join("") + '</div><div class="nest-actions"><button onclick="goTo(\'tasks\')">Tasks</button><button onclick="goTo(\'habits\')">Habits</button><button onclick="goTo(\'calendar\')">Week</button><button onclick="goTo(\'home\')">Household today</button></div>';
    root.querySelectorAll("[data-quest]").forEach(btn => btn.onclick = () => { const id = who + btn.dataset.quest; state.done[id] = !state.done[id]; state.pocket += state.done[id] ? 1 : -1; state.jar += state.done[id] ? 1 : -1; save(); paint(true); });
    root.querySelectorAll("[data-cloth]").forEach(btn => btn.onclick = () => { const item = CLOTHES.find(c => c.id === btn.dataset.cloth); state.worn[who] = state.worn[who] || {}; if (!state.worn[who][item.slot] && state.pocket < item.price) return alert("Not enough pocket berries"); if (!state.worn[who][item.slot]) state.pocket -= item.price; state.worn[who][item.slot] = !state.worn[who][item.slot]; save(); paint(); });
    root.querySelectorAll("[data-pet]").forEach(btn => btn.onclick = () => { const item = PETS.find(p => p.id === btn.dataset.pet); if (state.pet[who] !== item.id && state.pocket < item.price) return alert("Not enough pocket berries"); if (state.pet[who] !== item.id) state.pocket -= item.price; state.pet[who] = item.id; save(); paint(); });
    root.querySelectorAll("[data-house]").forEach(btn => btn.onclick = () => { const item = HOUSES.find(h => h.id === btn.dataset.house); if (state.jar < item.cost) return alert("The cottage jar is not full enough yet"); state.house = item.id; save(); paint(); });
  }
  function ensure() {
    if (!document.getElementById("s-nest")) {
      const home = document.getElementById("s-home");
      const section = document.createElement("div");
      section.className = "section";
      section.id = "s-nest";
      section.innerHTML = '<div class="sec-body" id="nest-root"></div>';
      home.parentNode.insertBefore(section, home);
    }
    const nav = document.getElementById("nav-home");
    if (nav) { nav.id = "nav-nest"; nav.onclick = () => goTo("nest"); const label = nav.querySelector("div"); if (label) label.textContent = "Nest"; }
    paint();
  }
  window.addEventListener("load", () => {
    ensure();
    if (typeof goTo === "function") {
      const original = goTo;
      window.goTo = function (id) { original(id); if (id === "nest") paint(); };
      if (document.getElementById("app-screen") && document.getElementById("app-screen").classList.contains("active")) original("nest");
    }
  });
})();
