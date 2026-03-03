// app.js
// ======
// Event log viewer for League of Legends.
// Live game streaming and replay timeline display.

// Constants
// ---------

var CLIENT  = "https://127.0.0.1:2999";
var DD_BASE = "https://ddragon.leagueoflegends.com";

// Platform → regional routing for Riot Match-v5 API
var REGIONS = {
  BR1:  "americas", LA1: "americas", LA2: "americas",
  NA1:  "americas", OC1: "americas",
  EUW1: "europe",   EUN1: "europe",  TR1: "europe", RU: "europe",
  KR:   "asia",     JP1:  "asia",
  PH2:  "sea",      SG2:  "sea",     TH2: "sea",
  TW2:  "sea",      VN2:  "sea",
};

// State
// -----

var dd_ver   = null;
var dd_items = {};
var live_tmr = null;
var live_eid = -1;
var live_evs = [];

// Helpers
// -------

var $  = function(s) { return document.querySelector(s); };
var $$ = function(s) { return document.querySelectorAll(s); };

// Formats seconds to MM:SS
function fmt(secs) {
  var m = Math.floor(secs / 60);
  var s = Math.floor(secs % 60);
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

// Formats milliseconds to MM:SS
function fmt_ms(ms) {
  return fmt(ms / 1000);
}

// Escapes HTML special characters
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Data Dragon
// -----------

// Loads latest version and item data from Data Dragon
async function init_dd() {
  try {
    var res  = await fetch(DD_BASE + "/api/versions.json");
    var vers = await res.json();
    dd_ver   = vers[0];
    var res  = await fetch(DD_BASE + "/cdn/" + dd_ver + "/data/en_US/item.json");
    var data = await res.json();
    dd_items = data.data;
  } catch (e) {
    console.error("Data Dragon init failed:", e);
  }
}

// Returns item display name by ID
function item_nm(id) {
  var it = dd_items[String(id)];
  return it ? it.name : "Item " + id;
}

// Returns item icon URL
function item_img(id) {
  if (!dd_ver) return "";
  return DD_BASE + "/cdn/" + dd_ver + "/img/item/" + id + ".png";
}

// Returns champion icon URL
function champ_img(name) {
  if (!dd_ver) return "";
  return DD_BASE + "/cdn/" + dd_ver + "/img/champion/" + name + ".png";
}

// Live Mode
// ---------

// Fetches a Live Client API endpoint
async function live_get(path) {
  var res = await fetch(CLIENT + path);
  return res.json();
}

// Polls the live client for events and player data
async function live_poll() {
  try {
    var evts = await live_get("/liveclientdata/eventdata");
    var plrs = await live_get("/liveclientdata/playerlist");
    var stat = await live_get("/liveclientdata/gamestats");
    // Update status bar
    $("#live-status").textContent = "\u25CF Connected";
    $("#live-status").className   = "on";
    $("#live-time").textContent   = fmt(stat.gameTime);
    $("#live-help").classList.add("hidden");
    // Accumulate new events
    for (var e of evts.Events) {
      if (e.EventID > live_eid) {
        live_eid = e.EventID;
        live_evs.push(e);
      }
    }
    render_live_log();
    render_live_side(plrs);
  } catch (e) {
    $("#live-status").textContent = "\u25CF Disconnected";
    $("#live-status").className   = "off";
    $("#live-time").textContent   = "";
  }
}

// Starts live polling
function live_start() {
  if (live_tmr) return;
  live_eid = -1;
  live_evs = [];
  live_poll();
  live_tmr = setInterval(live_poll, 1500);
  $("#live-btn").textContent = "Disconnect";
}

// Stops live polling
function live_stop() {
  if (!live_tmr) return;
  clearInterval(live_tmr);
  live_tmr = null;
  $("#live-btn").textContent = "Connect";
  $("#live-status").textContent = "\u25CF Disconnected";
  $("#live-status").className   = "off";
}

// Renders the live event log
function render_live_log() {
  var el   = $("#live-log");
  var html = "";
  for (var e of live_evs) {
    var t   = fmt(e.EventTime);
    var msg = fmt_live_evt(e);
    var cls = CLS_LIVE[e.EventName] || "";
    html += '<div class="ev ' + cls + '">[' + t + '] ' + esc(msg) + '</div>';
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

// Live event class mapping
var CLS_LIVE = {
  ChampionKill: "ek", FirstBlood: "ek", Multikill: "ek", Ace: "ek",
  DragonKill:   "eo", BaronKill:  "eo", HeraldKill: "eo",
  TurretKilled: "es", InhibKilled: "es", FirstBrick: "es",
  GameStart:    "eg", GameEnd: "eg",
};

// Formats a live client event to readable text
function fmt_live_evt(e) {
  switch (e.EventName) {
    case "GameStart": {
      return "Game started";
    }
    case "MinionsSpawning": {
      return "Minions have spawned";
    }
    case "FirstBrick": {
      return e.KillerName + " destroyed first turret";
    }
    case "TurretKilled": {
      return e.KillerName + " destroyed a turret";
    }
    case "InhibKilled": {
      return e.KillerName + " destroyed an inhibitor";
    }
    case "InhibRespawningSoon": {
      return "An inhibitor will respawn soon";
    }
    case "InhibRespawned": {
      return "An inhibitor has respawned";
    }
    case "HeraldKill": {
      return e.KillerName + " slew the Rift Herald";
    }
    case "BaronKill": {
      return e.KillerName + " slew Baron Nashor";
    }
    case "DragonKill": {
      var type = e.DragonType ? e.DragonType + " " : "";
      return e.KillerName + " slew " + type + "Dragon";
    }
    case "ChampionKill": {
      var msg = e.KillerName + " killed " + e.VictimName;
      if (e.Assisters && e.Assisters.length > 0) {
        msg += " (" + e.Assisters.join(", ") + ")";
      }
      return msg;
    }
    case "Multikill": {
      var n = e.KillStreak;
      var w = n === 2 ? "Double"
            : n === 3 ? "Triple"
            : n === 4 ? "Quadra"
            : "Penta";
      return e.KillerName + ": " + w + " Kill!";
    }
    case "Ace": {
      return e.Acer + " aced the enemy team";
    }
    case "FirstBlood": {
      return "First Blood!";
    }
    case "GameEnd": {
      return "Game Over";
    }
    default: {
      return e.EventName;
    }
  }
}

// Renders the player side panel
function render_live_side(players) {
  var el   = $("#live-side");
  var blue = players.filter(function(p) { return p.team === "ORDER"; });
  var red  = players.filter(function(p) { return p.team === "CHAOS"; });
  el.innerHTML = render_team("Blue", blue) + render_team("Red", red);
}

// Renders one team's player list
function render_team(label, players) {
  var html = '<div class="team"><h3>' + esc(label) + '</h3>';
  for (var p of players) {
    var k   = p.scores.kills;
    var d   = p.scores.deaths;
    var a   = p.scores.assists;
    var cs  = p.scores.creepScore;
    var pos = p.position ? " \u2014 " + p.position : "";
    // Extract DD-compatible champion name from raw name
    var raw = (p.rawChampionName || "")
      .replace("game_character_displayname_", "");
    var ico = raw ? champ_img(raw) : "";
    // Build item icons
    var items = "";
    for (var it of p.items) {
      if (it.itemID === 0) continue;
      var src = item_img(it.itemID);
      var nm  = esc(item_nm(it.itemID));
      items += '<img class="it-ico" src="' + src + '" title="' + nm + '">';
    }
    html += '<div class="plr">';
    html += '<img class="ch-ico" src="' + ico + '" alt="' + esc(p.championName) + '">';
    html += '<div class="plr-info">';
    html += '<div class="plr-nm">' + esc(p.championName) + esc(pos) + '</div>';
    html += '<div class="plr-st">' + esc(p.summonerName);
    html += ' | Lv' + p.level;
    html += ' | ' + k + '/' + d + '/' + a;
    html += ' | ' + cs + ' CS</div>';
    html += '<div class="plr-it">' + items + '</div>';
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

// Replay Mode
// -----------

// Extracts match ID and platform from user input
function parse_match(input) {
  var m = input.match(/([A-Z]{2,4}\d?)_(\d+)/);
  if (!m) return null;
  var platform = m[1];
  var id       = m[0];
  var region   = REGIONS[platform];
  if (!region) return null;
  return { id: id, platform: platform, region: region };
}

// Checks a Riot API response for common errors
async function riot_res(res) {
  if (res.status === 403) throw new Error("Invalid or expired API key");
  if (res.status === 404) throw new Error("Match not found");
  if (res.status === 429) throw new Error("Rate limit — wait a moment");
  if (!res.ok) throw new Error("API error: " + res.status);
  return res.json();
}

// Fetches JSON from Riot API; falls back to CORS proxy
async function riot_get(url, key) {
  var sep  = url.includes("?") ? "&" : "?";
  var full = url + sep + "api_key=" + key;
  try {
    var res = await fetch(full);
    return await riot_res(res);
  } catch (e) {
    // If network/CORS error, try corsproxy fallback
    if (e.message && !e.message.match(/^(Invalid|Match|Rate|API)/)) {
      var proxy = "https://corsproxy.io/?" + encodeURIComponent(full);
      var res   = await fetch(proxy);
      return await riot_res(res);
    }
    throw e;
  }
}

// Loads and renders a replay timeline
async function rp_load() {
  var input = $("#rp-input").value.trim();
  var key   = $("#rp-key").value.trim();
  if (!input) return alert("Enter a match ID or op.gg URL.");
  if (!key)   return alert("Enter your Riot API key.");
  localStorage.setItem("riot_key", key);
  var parsed = parse_match(input);
  if (!parsed) return alert("Could not parse match ID. Expected: BR1_1234567890");
  var log = $("#rp-log");
  log.innerHTML = '<div class="ev">Loading ' + esc(parsed.id) + '...</div>';
  try {
    var base = "https://" + parsed.region
      + ".api.riotgames.com/lol/match/v5/matches";
    var match = await riot_get(base + "/" + parsed.id, key);
    var tl    = await riot_get(base + "/" + parsed.id + "/timeline", key);
    render_rp_log(match, tl);
  } catch (e) {
    var msg = String(e.message || e);
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed")) {
      msg = 'Network error — install "Allow CORS" browser extension, then retry.';
    }
    log.innerHTML = '<div class="ev ek">Error: ' + esc(msg) + '</div>';
  }
}

// Builds participant map from match data: id → { name, champ, team }
function build_parts(match) {
  var map = {};
  for (var p of match.info.participants) {
    map[p.participantId] = {
      name  : p.riotIdGameName || p.summonerName || ("Player " + p.participantId),
      champ : p.championName,
      team  : p.teamId,
    };
  }
  return map;
}

// Returns readable participant label
function pnm(id, parts) {
  var p = parts[id];
  return p ? p.name + " (" + p.champ + ")" : "Player " + id;
}

// Renders the full replay event log
function render_rp_log(match, tl) {
  var parts = build_parts(match);
  var el    = $("#rp-log");
  var html  = "";
  for (var frame of tl.info.frames) {
    for (var e of frame.events) {
      var msg = fmt_rp_evt(e, parts);
      if (!msg) continue;
      var t   = fmt_ms(e.timestamp);
      var cls = CLS_RP[e.type] || "";
      html += '<div class="ev ' + cls + '">[' + t + '] ' + esc(msg) + '</div>';
    }
  }
  if (!html) {
    html = '<div class="ev">No events found.</div>';
  }
  el.innerHTML = html;
}

// Replay event class mapping
var CLS_RP = {
  CHAMPION_KILL:          "ek",
  ELITE_MONSTER_KILL:     "eo",
  BUILDING_KILL:          "es",
  TURRET_PLATE_DESTROYED: "es",
  ITEM_PURCHASED:         "ei",
  ITEM_SOLD:              "ei",
  ITEM_UNDO:              "ei",
  WARD_PLACED:            "ew",
  WARD_KILL:              "ew",
  LEVEL_UP:               "el",
  SKILL_LEVEL_UP:         "el",
  GAME_END:               "eg",
};

// Formats a single replay timeline event
function fmt_rp_evt(e, parts) {
  switch (e.type) {
    case "CHAMPION_KILL": {
      var killer = e.killerId === 0
        ? "Minions/Tower"
        : pnm(e.killerId, parts);
      var victim = pnm(e.victimId, parts);
      var msg    = killer + " killed " + victim;
      if (e.assistingParticipantIds && e.assistingParticipantIds.length > 0) {
        var asts = e.assistingParticipantIds.map(function(id) {
          return pnm(id, parts);
        });
        msg += " [" + asts.join(", ") + "]";
      }
      return msg;
    }
    case "WARD_PLACED": {
      if (!e.creatorId) return null;
      var type = (e.wardType || "ward").replace(/_/g, " ");
      return pnm(e.creatorId, parts) + " placed " + type;
    }
    case "WARD_KILL": {
      if (!e.killerId) return null;
      var type = (e.wardType || "ward").replace(/_/g, " ");
      return pnm(e.killerId, parts) + " killed " + type;
    }
    case "BUILDING_KILL": {
      var team = e.teamId === 100 ? "Red" : "Blue";
      var bld  = e.buildingType === "TOWER_BUILDING" ? "turret" : "inhibitor";
      var lane = e.laneType ? " (" + e.laneType + ")" : "";
      return team + " destroyed " + bld + lane;
    }
    case "ELITE_MONSTER_KILL": {
      var who = e.killerId ? pnm(e.killerId, parts) : "A team";
      var mon = (e.monsterSubType || e.monsterType || "monster")
        .replace(/_/g, " ");
      return who + " slew " + mon;
    }
    case "ITEM_PURCHASED": {
      return pnm(e.participantId, parts) + " bought " + item_nm(e.itemId);
    }
    case "ITEM_SOLD": {
      return pnm(e.participantId, parts) + " sold " + item_nm(e.itemId);
    }
    case "ITEM_UNDO": {
      var what = e.beforeId ? item_nm(e.beforeId) : "item";
      return pnm(e.participantId, parts) + " undid " + what;
    }
    case "ITEM_DESTROYED": {
      return null;
    }
    case "SKILL_LEVEL_UP": {
      var slot = e.skillSlot;
      var key  = slot === 1 ? "Q"
               : slot === 2 ? "W"
               : slot === 3 ? "E"
               : "R";
      return pnm(e.participantId, parts) + " leveled " + key;
    }
    case "LEVEL_UP": {
      return pnm(e.participantId, parts) + " reached level " + e.level;
    }
    case "TURRET_PLATE_DESTROYED": {
      var lane = e.laneType ? " (" + e.laneType + ")" : "";
      return "Turret plate destroyed" + lane;
    }
    case "GAME_END": {
      return "Game Over";
    }
    default: {
      return null;
    }
  }
}

// UI
// --

// Switches between live and replay tabs
function switch_tab(tab) {
  var tabs   = $$(".tab");
  var panels = $$(".panel");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle("active", tabs[i].dataset.tab === tab);
  }
  for (var i = 0; i < panels.length; i++) {
    panels[i].classList.toggle("hidden", panels[i].id !== "panel-" + tab);
  }
}

// Init
// ----

// Sets up event listeners and loads saved state
function init() {
  // Restore saved API key
  var saved = localStorage.getItem("riot_key");
  if (saved) {
    $("#rp-key").value = saved;
  }
  // Tab switching
  var tabs = $$(".tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener("click", function() {
      switch_tab(this.dataset.tab);
    });
  }
  // Live connect/disconnect
  $("#live-btn").addEventListener("click", function() {
    if (live_tmr) {
      live_stop();
    } else {
      live_start();
    }
  });
  // Replay load
  $("#rp-btn").addEventListener("click", rp_load);
  $("#rp-input").addEventListener("keydown", function(e) {
    if (e.key === "Enter") rp_load();
  });
  // Replay filters (CSS-based show/hide)
  var flts = $$(".flt");
  for (var i = 0; i < flts.length; i++) {
    flts[i].addEventListener("click", function() {
      var active = this.classList.toggle("on");
      var cls    = "hide-" + this.dataset.f;
      if (active) {
        $("#rp-log").classList.remove(cls);
      } else {
        $("#rp-log").classList.add(cls);
      }
    });
  }
  // Load Data Dragon
  init_dd();
}

init();
