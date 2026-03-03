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

// Op.gg region code → Riot platform
var OPGG_PLAT = {
  br:   "BR1",  na:  "NA1",  euw: "EUW1", eune: "EUN1",
  kr:   "KR",   jp:  "JP1",  lan: "LA1",  las:  "LA2",
  oce:  "OC1",  tr:  "TR1",  ru:  "RU",
  ph:   "PH2",  sg:  "SG2",  th:  "TH2",  tw:   "TW2", vn: "VN2",
};

// Parses user input: raw match ID or op.gg URL
function parse_input(input) {
  // Direct match ID: BR1_1234567890
  var m = input.match(/([A-Z]{2,4}\d?)_(\d+)/);
  if (m) {
    var region = REGIONS[m[1]];
    if (region) return { id: m[0], region: region };
  }
  // Op.gg URL: /summoners/{region}/{name-tag}/matches/{hash}/{timestamp}
  var og = input.match(
    /op\.gg\/lol\/summoners\/([a-z]+)\/([^/]+)\/matches\/[^/]+\/(\d+)/
  );
  if (og) {
    var plat   = OPGG_PLAT[og[1]];
    var region = plat ? REGIONS[plat] : null;
    if (!region) return null;
    // Decode double-encoded summoner name-tag
    var raw  = decodeURIComponent(decodeURIComponent(og[2]));
    var dash = raw.lastIndexOf("-");
    var name = raw.substring(0, dash);
    var tag  = raw.substring(dash + 1);
    var ts   = parseInt(og[3]);
    return { opgg: true, region: region, name: name, tag: tag, ts: ts };
  }
  return null;
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

// Resolves an op.gg parsed input to a match ID via Riot API
async function resolve_opgg(parsed, key, log) {
  // Look up PUUID from riot ID
  log.innerHTML = '<div class="ev">Looking up '
    + esc(parsed.name) + '#' + esc(parsed.tag) + '...</div>';
  var acct_url = "https://" + parsed.region
    + ".api.riotgames.com/riot/account/v1/accounts/by-riot-id/"
    + encodeURIComponent(parsed.name) + "/" + encodeURIComponent(parsed.tag);
  var acct  = await riot_get(acct_url, key);
  var puuid = acct.puuid;
  // Find matches around the timestamp (2h window covers game duration)
  var ts  = Math.floor(parsed.ts / 1000);
  var url = "https://" + parsed.region
    + ".api.riotgames.com/lol/match/v5/matches/by-puuid/" + puuid
    + "/ids?startTime=" + (ts - 7200) + "&endTime=" + (ts + 300) + "&count=5";
  log.innerHTML = '<div class="ev">Finding match...</div>';
  var ids = await riot_get(url, key);
  if (ids.length === 0) {
    throw new Error("No matches found near that timestamp");
  }
  return ids[0];
}

// Loads and renders a replay timeline
async function rp_load() {
  var input = $("#rp-input").value.trim();
  var key   = $("#rp-key").value.trim();
  if (!input) return alert("Enter a match ID or op.gg URL.");
  if (!key)   return alert("Enter your Riot API key.");
  localStorage.setItem("riot_key", key);
  var parsed = parse_input(input);
  if (!parsed) return alert("Paste a match ID (BR1_123...) or op.gg match URL.");
  var log    = $("#rp-log");
  var region = parsed.region;
  try {
    // Resolve match ID (direct or via op.gg lookup)
    var match_id = parsed.opgg
      ? await resolve_opgg(parsed, key, log)
      : parsed.id;
    log.innerHTML = '<div class="ev">Loading ' + esc(match_id) + '...</div>';
    var base  = "https://" + region
      + ".api.riotgames.com/lol/match/v5/matches";
    var match = await riot_get(base + "/" + match_id, key);
    var tl    = await riot_get(base + "/" + match_id + "/timeline", key);
    render_rp_log(match, tl);
  } catch (e) {
    var msg = String(e.message || e);
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed")) {
      msg = 'Network error \u2014 install "Allow CORS" browser extension, then retry.';
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

// Map Zones
// ---------

// Maps Summoner's Rift coordinates to a readable zone
function pos_zone(x, y) {
  if (!x && !y) return "";
  // Objective pits
  var dd = (x - 9866) * (x - 9866) + (y - 4414) * (y - 4414);
  var db = (x - 4960) * (x - 4960) + (y - 10440) * (y - 10440);
  if (dd < 4000000) return "Dragon";
  if (db < 4000000) return "Baron";
  // Bases
  if (x < 2000 && y < 2000)   return "Blue Base";
  if (x > 13000 && y > 13000) return "Red Base";
  // Lanes
  if ((x < 2800 && y > 4500) || (y > 12500 && x < 11000)) return "Top";
  if ((y < 2800 && x > 4500) || (x > 12500 && y < 11000)) return "Bot";
  if (Math.abs(x - y) < 2800 && x > 2500 && x < 12500)    return "Mid";
  // Jungle halves
  if (y > x) return "Top JG";
  return "Bot JG";
}

// Formats gold for display (1234 → "1.2k")
function fmt_gold(g) {
  if (g >= 1000) return (g / 1000).toFixed(1) + "k";
  return String(g);
}

// Readable ward type names
var WARD_NM = {
  YELLOW_TRINKET: "trinket",
  CONTROL_WARD:   "control ward",
  SIGHT_WARD:     "sight ward",
  BLUE_TRINKET:   "blue trinket",
  UNDEFINED:      "ward",
};

// Readable monster names
var MON_NM = {
  FIRE_DRAGON:     "Infernal Drake",
  WATER_DRAGON:    "Ocean Drake",
  EARTH_DRAGON:    "Mountain Drake",
  AIR_DRAGON:      "Cloud Drake",
  CHEMTECH_DRAGON: "Chemtech Drake",
  HEXTECH_DRAGON:  "Hextech Drake",
  ELDER_DRAGON:    "Elder Dragon",
  BARON_NASHOR:    "Baron Nashor",
  RIFTHERALD:      "Rift Herald",
  HORDE:           "Voidgrubs",
};

// Readable tower type names
var TOWER_NM = {
  OUTER_TURRET: "outer turret",
  INNER_TURRET: "inner turret",
  BASE_TURRET:  "base turret",
  NEXUS_TURRET: "nexus turret",
};

// Readable lane names
var LANE_NM = {
  TOP_LANE: "Top",
  MID_LANE: "Mid",
  BOT_LANE: "Bot",
};

// Replay Rendering
// ----------------

// Renders the full replay event log with periodic snapshots
function render_rp_log(match, tl) {
  var parts     = build_parts(match);
  var el        = $("#rp-log");
  var html      = "";
  var last_snap = -1;
  for (var frame of tl.info.frames) {
    // Emit snapshot every 5 minutes
    var snap = Math.floor(frame.timestamp / 300000);
    if (snap > last_snap && frame.participantFrames) {
      last_snap = snap;
      html += render_snap(frame, parts);
    }
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

// Renders a periodic snapshot of all players' state
function render_snap(frame, parts) {
  var t   = fmt_ms(frame.timestamp);
  var pf  = frame.participantFrames;
  var html = '<div class="ev ep snap-hdr">[' + t
    + '] \u2500\u2500 SNAPSHOT \u2500\u2500</div>';
  // Sort by team, then participant ID
  var ids = Object.keys(pf).sort(function(a, b) {
    var pa = parts[a] || {};
    var pb = parts[b] || {};
    if ((pa.team || 0) !== (pb.team || 0)) {
      return (pa.team || 0) - (pb.team || 0);
    }
    return parseInt(a) - parseInt(b);
  });
  for (var id of ids) {
    var f    = pf[id];
    var p    = parts[id];
    var name = p ? p.champ : "Player " + id;
    var gold = fmt_gold(f.totalGold || 0);
    var cs   = (f.minionsKilled || 0) + (f.jungleMinionsKilled || 0);
    var pos  = (f.position)
      ? pos_zone(f.position.x, f.position.y)
      : "";
    var loc  = pos ? " @ " + pos : "";
    html += '<div class="ev ep">[' + t + ']   '
      + esc(name) + ' Lv' + f.level
      + ' | ' + gold + ' gold'
      + ' | ' + cs + ' CS'
      + loc + '</div>';
  }
  return html;
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
      var zone   = e.position
        ? pos_zone(e.position.x, e.position.y)
        : "";
      var loc    = zone ? " @ " + zone : "";
      var msg    = killer + " killed " + victim + loc;
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
      var type = WARD_NM[e.wardType] || "ward";
      return pnm(e.creatorId, parts) + " placed " + type;
    }
    case "WARD_KILL": {
      if (!e.killerId) return null;
      var type = WARD_NM[e.wardType] || "ward";
      return pnm(e.killerId, parts) + " destroyed " + type;
    }
    case "BUILDING_KILL": {
      var owner  = e.teamId === 100 ? "Blue" : "Red";
      var killer = (e.killerId && e.killerId > 0)
        ? pnm(e.killerId, parts)
        : (e.teamId === 100 ? "Red" : "Blue") + " team";
      var bld = e.buildingType === "TOWER_BUILDING"
        ? (TOWER_NM[e.towerType] || "turret")
        : "inhibitor";
      var lane = LANE_NM[e.laneType] || "";
      var loc  = lane ? " (" + lane + ")" : "";
      return killer + " destroyed " + owner + " " + bld + loc;
    }
    case "ELITE_MONSTER_KILL": {
      var who  = e.killerId ? pnm(e.killerId, parts) : "Unknown";
      var name = MON_NM[e.monsterSubType]
              || MON_NM[e.monsterType]
              || (e.monsterSubType || e.monsterType || "monster")
                  .replace(/_/g, " ");
      var zone = e.position
        ? pos_zone(e.position.x, e.position.y)
        : "";
      var loc  = zone ? " @ " + zone : "";
      return who + " slew " + name + loc;
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
      var owner = e.teamId === 100 ? "Blue" : "Red";
      var lane  = LANE_NM[e.laneType] || "";
      var loc   = lane ? " (" + lane + ")" : "";
      return owner + " turret plate fell" + loc;
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
