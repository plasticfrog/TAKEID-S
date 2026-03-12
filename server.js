const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const port = process.env.PORT || 3000;

app.use(express.static('public'));

const LEAGUE = "nba"; 

// --- DATABASE LOAD (For Live Tracker 5100s) ---
const dataPath = path.join(__dirname, 'public', 'data.json');
let TAKE_ID_DB = [];
try {
    const rawData = fs.readFileSync(dataPath);
    TAKE_ID_DB = JSON.parse(rawData).map(item => {
        const parts = item.category.split('/').map(s => s.trim());
        const validKeys = ["PTS", "REBS", "ASSTS", "BLKS", "STLS", "FOULS", "FG", "FT", "3-PT FG", "TO", "MINS", "OFF REBS", "FGS", "TECHNICAL", "EJECTED", "BIO"];
        return { ...item, required: parts.filter(p => validKeys.includes(p)) };
    });
    console.log(`Loaded ${TAKE_ID_DB.length} Take IDs.`);
} catch (err) { console.error("Error loading data.json:", err); }

// --- LIVE TRACKER THRESHOLDS & HELPERS ---
const THRESHOLDS = { "PTS": 8, "REBS": 5, "ASSTS": 4, "BLKS": 2, "STLS": 2, "3-PT FG": 3, "FG": 4, "FT": 4, "TO": 4, "MINS": 20 };

function findStatIndex(names, target) { return names.indexOf(target); }

function getTopMatches(playerStats) {
    const notable = new Set();
    for (const [key, val] of Object.entries(playerStats)) {
        if (val >= (THRESHOLDS[key] || 999)) notable.add(key);
    }
    const matches = [];
    TAKE_ID_DB.forEach(item => {
        if (!item.required || item.required.length === 0) return;
        const catUpper = item.category.toUpperCase();
        if (catUpper.includes("QTR") || catUpper.includes("HALF") || catUpper.includes("SINCE") || catUpper.includes("SEASON")) return;
        
        if (item.required.every(req => notable.has(req))) {
            matches.push({ id: item.id, category: item.category, score: item.required.length, required: item.required });
        }
    });
    return matches.sort((a, b) => b.score - a.score).slice(0, 3);
}

function getDynamicStatString(stats, topMatches) {
    const statsToShow = new Set();
    if (topMatches && topMatches.length > 0) {
        topMatches.forEach(m => { if(m.required) m.required.forEach(r => statsToShow.add(r)); });
    }
    if (stats.PTS > 0) statsToShow.add("PTS");
    
    const sortedKeys = Array.from(statsToShow).sort((a, b) => {
        const order = ["PTS", "REBS", "ASSTS", "FG", "3-PT FG", "FT", "BLKS", "STLS"];
        return order.indexOf(a) - order.indexOf(b);
    });
    
    return sortedKeys.map(key => {
        let val = stats[key];
        if (val == 0 && key !== "PTS") return null;
        let label = key.toLowerCase();
        if(key === "3-PT FG") label = "3pm"; 
        if(key === "REBS") label = "reb"; 
        if(key === "ASSTS") label = "ast";
        if(key === "BLKS") label = "blk"; 
        if(key === "STLS") label = "stl";
        return `${val} ${label}`;
    }).filter(Boolean).join(', ');
}

// --- PREGAME RULES ENGINE (THE "POP" LOGIC) ---
function generatePregameStorylines(player, isHome) {
    const storylines = [];
    const teamPrefix = isHome ? "2" : "1"; 
    let jerseyStr = player.jersey || "00";
    if (jerseyStr.length === 1) jerseyStr = "0" + jerseyStr; 
    const prefix = `${teamPrefix}00${jerseyStr}`; 

    // --- MOCK HISTORICAL DATA ENGINE ---
    const archetypes = ['scorer', 'playmaker', 'bigman', 'shooter'];
    const type = archetypes[Math.floor(Math.random() * archetypes.length)];

    let pts = 0, reb = 0, ast = 0, stl = 0, blk = 0, fg3 = 0;
    if (type === 'scorer') { pts = 24; reb = 5; ast = 4; fg3 = 35; }
    if (type === 'playmaker') { pts = 14; reb = 4; ast = 9; stl = 2; fg3 = 33; }
    if (type === 'bigman') { pts = 16; reb = 11; ast = 2; blk = 2; fg3 = 10; }
    if (type === 'shooter') { pts = 17; reb = 3; ast = 2; stl = 1; fg3 = 43; }

    pts += Math.floor(Math.random() * 6) - 3;
    reb += Math.floor(Math.random() * 4) - 2;
    ast += Math.floor(Math.random() * 4) - 2;

    const l5_pts = pts + (Math.floor(Math.random() * 12) - 4); 
    const l5_ast = ast + (Math.floor(Math.random() * 6) - 2);
    const l5_reb = reb + (Math.floor(Math.random() * 6) - 2);

    const opp_games = Math.floor(Math.random() * 10);
    const opp_pts = pts + (Math.floor(Math.random() * 10) - 3);
    const opp_ast = ast + (Math.floor(Math.random() * 5) - 1);

    const last_pts = pts + Math.floor(Math.random() * 15) - 5;
    const last_stl = stl + Math.floor(Math.random() * 3);

    // 1. LAST 5 GAMES ANOMALIES
    if (l5_pts > pts + 5) {
        storylines.push({ code: `${prefix}20`, title: "Scoring Tear (L5)", desc: `Averaging ${l5_pts} pts over L5 (Season: ${pts})` });
    } else if (l5_ast > ast + 3) {
        storylines.push({ code: `${prefix}22`, title: "Elite Facilitator (L5)", desc: `Averaging ${l5_ast} ast over L5 (Season: ${ast})` });
    } else if (l5_reb > reb + 3) {
        storylines.push({ code: `${prefix}24`, title: "Cleaning the Glass (L5)", desc: `Averaging ${l5_reb} reb & ${l5_pts} pts over L5` });
    } else if (type === 'shooter' && l5_pts > pts + 2) {
        storylines.push({ code: `${prefix}23`, title: "Shooting Clinic (L5)", desc: `Hot from outside, hitting ${fg3+5}% of 3s over L5` });
    }

    // 2. CAREER VS OPPONENT
    if (opp_games >= 5) {
        if (opp_pts > pts + 6) {
            storylines.push({ code: `${prefix}30`, title: `Team Killer (${opp_games} Gms)`, desc: `Averages ${opp_pts} pts vs Opp (Season: ${pts})` });
        } else if (type === 'playmaker' && opp_ast > ast + 2) {
            storylines.push({ code: `${prefix}32`, title: `Court Vision vs Opp`, desc: `Averages ${opp_ast} ast vs this matchup.` });
        } else if (type === 'bigman' && opp_pts > pts + 3) {
            storylines.push({ code: `${prefix}31`, title: `Dominant Inside vs Opp`, desc: `Averages double-double vs this matchup.` });
        }
    }

    // 3. LAST GAME MONSTER
    if (last_pts >= 30) {
        storylines.push({ code: `${prefix}50`, title: "Monster Last Game", desc: `Coming off a massive ${last_pts}-point performance.` });
    } else if (last_pts >= 20 && last_stl >= 3) {
        storylines.push({ code: `${prefix}52`, title: "Two-Way Threat (Last Gm)", desc: `Dropped ${last_pts} pts with ${last_stl} steals.` });
    }

    if (storylines.length === 0) return [];

    // 4. FALLBACK BACKUPS
    if (storylines.length < 3) {
        if (type === 'playmaker') storylines.push({ code: `${prefix}02`, title: "Season Averages", desc: `Standard pts/ast/stl (${pts}p/${ast}a)` });
        else if (type === 'bigman') storylines.push({ code: `${prefix}01`, title: "Season Averages", desc: `Standard pts/rbs/fg% (${pts}p/${reb}r)` });
        else storylines.push({ code: `${prefix}00`, title: "Season Averages", desc: `Standard pts/rbs/ast (${pts}p/${reb}r/${ast}a)` });
    }

    if (storylines.length < 3) {
        storylines.push({ code: `${prefix}77`, title: "Bio Info", desc: `Age/Ht/Wt/College/Years Pro` });
    }

    return storylines.slice(0, 3);
}

// --- API ENDPOINTS ---

// Fetch 30 Teams for Pregame Dropdowns
app.get('/api/teams', async (req, res) => {
    try {
        const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/teams?limit=30`);
        const data = await response.json();
        const teams = data.sports[0].leagues[0].teams.map(t => ({ id: t.team.id, name: t.team.displayName, abbrev: t.team.abbreviation }));
        teams.sort((a, b) => a.name.localeCompare(b.name));
        res.json(teams);
    } catch (err) { res.status(500).json({ error: "Failed to fetch teams" }); }
});

// Fetch Live Scoreboard
app.get('/api/games', async (req, res) => {
    try {
        const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/scoreboard`);
        const data = await response.json();
        const games = data.events.map(event => ({ id: event.id, name: event.name, shortName: event.shortName, status: event.status.type.shortDetail }));
        res.json(games);
    } catch (err) { res.status(500).json({ error: "Failed to fetch games" }); }
});

// --- PREGAME MATCHUP ENDPOINT ---
app.get('/api/pregame', async (req, res) => {
    try {
        const { away, home } = req.query;
        if (!away || !home) return res.status(400).json({ error: "Missing teams" });

        const processedTeams = [];

        const processTeam = async (teamId, isHome) => {
            const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/teams/${teamId}?enable=roster`);
            const data = await response.json();
            const teamInfo = data.team;
            
            const processedPlayers = [];
            const athletes = teamInfo.athletes || [];

            for (const ath of athletes) {
                let isOut = false;
                if (ath.injuries && ath.injuries.length > 0) {
                    isOut = ath.injuries.some(i => ['out', 'injured reserve', 'day-to-day'].includes(i.status.toLowerCase()));
                }
                if (isOut) continue;

                const storylines = generatePregameStorylines({ jersey: ath.jersey }, isHome);
                
                if (storylines.length > 0) {
                    processedPlayers.push({ name: ath.fullName, jersey: ath.jersey || "00", storylines: storylines });
                }
            }
            return { team: teamInfo.displayName, color: teamInfo.color || "333333", isHome: isHome, players: processedPlayers };
        };

        const [awayTeam, homeTeam] = await Promise.all([processTeam(away, false), processTeam(home, true)]);
        processedTeams.push(awayTeam, homeTeam);

        res.json({ teams: processedTeams });
    } catch (error) { res.status(500).json({ error: "Failed to process pregame" }); }
});

// --- LIVE TRACKER ENDPOINT ---
app.get('/api/game/:id', async (req, res) => {
    try {
        const gameId = req.params.id;
        const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/summary?event=${gameId}`);
        const data = await response.json();

        const competition = data.header?.competitions?.[0];
        const competitors = competition?.competitors || [];
        const statusDetail = competition?.status?.type?.shortDetail || "Unknown Status";
        const homeTeamObj = competitors.find(c => c.homeAway === 'home');
        const awayTeamObj = competitors.find(c => c.homeAway === 'away');
        
        const gameInfo = { 
            status: statusDetail, 
            homeScore: homeTeamObj?.score || "0", 
            awayScore: awayTeamObj?.score || "0", 
            homeAbbrev: homeTeamObj?.team?.abbreviation || "HOME", 
            awayAbbrev: awayTeamObj?.team?.abbreviation || "AWAY" 
        };
        const homeTeamId = homeTeamObj?.id;
        
        const processedTeams = [];
        const playerGroups = data.boxscore?.players || [];

        for (const teamGroup of playerGroups) {
            const teamId = teamGroup.team.id;
            const teamName = teamGroup.team.displayName;
            const teamColor = teamGroup.team.color || "333333";
            const isHome = teamId === homeTeamId;
            
            const processedPlayers = [];
            const statsList = teamGroup.statistics || [];
            
            if (statsList.length > 0) {
                const names = statsList[0].names; 
                const athletes = statsList[0].athletes;
                const idx = { 
                    PTS: findStatIndex(names, "PTS"), 
                    REBS: findStatIndex(names, "REB"), 
                    ASSTS: findStatIndex(names, "AST"), 
                    BLKS: findStatIndex(names, "BLK"), 
                    STLS: findStatIndex(names, "STL"), 
                    TO: findStatIndex(names, "TO"), 
                    "3-PT FG": findStatIndex(names, "3PT"), 
                    FG: findStatIndex(names, "FG"), 
                    FT: findStatIndex(names, "FT"), 
                    MINS: findStatIndex(names, "MIN") 
                };

                for (const ath of athletes) {
                    const name = ath.athlete.displayName;
                    const jersey = ath.athlete.jersey || "00";
                    const raw = ath.stats;
                    
                    let jNum = parseInt(jersey); 
                    if (isNaN(jNum)) jNum = 0; 
                    const playerCode = (isHome ? 200 : 100) + jNum;

                    const getVal = (key) => { 
                        const i = idx[key]; 
                        if (i === -1 || !raw[i]) return 0; 
                        let val = raw[i]; 
                        if (val.includes('-')) val = val.split('-')[0]; 
                        return parseInt(val) || 0; 
                    };
                    const getStr = (key) => { 
                        const i = idx[key]; 
                        return (i !== -1 && raw[i]) ? raw[i] : "0"; 
                    };

                    const pStats = { 
                        PTS: getVal("PTS"), 
                        REBS: getVal("REBS"), 
                        ASSTS: getVal("ASSTS"), 
                        BLKS: getVal("BLKS"), 
                        STLS: getVal("STLS"), 
                        TO: getVal("TO"), 
                        "3-PT FG": getVal("3-PT FG"), 
                        FG: getVal("FG"), 
                        FT: getVal("FT"), 
                        MINS: getVal("MIN") 
                    };
                    
                    const displayStats = { ...pStats, "FG": getStr("FG"), "FT": getStr("FT"), "3-PT FG": getStr("3-PT FG") };
                    
                    const topMatches = getTopMatches(pStats);
                    
                    if (topMatches.length > 0 || pStats.PTS >= 10) {
                        processedPlayers.push({ 
                            name: name, 
                            jersey: jersey, 
                            playerCode: playerCode, 
                            statsSummary: getDynamicStatString(displayStats, topMatches), 
                            matches: topMatches 
                        });
                    }
                }
            }
            processedTeams.push({ team: teamName, color: teamColor, isHome: isHome, players: processedPlayers });
        }
        res.json({ gameInfo: gameInfo, teams: processedTeams });
    } catch (error) { res.status(500).json({ error: "Failed to process game" }); }
});

app.listen(port, () => { console.log(`Server running on port ${port}`); });
