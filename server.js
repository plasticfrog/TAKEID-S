const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const port = process.env.PORT || 3000;

app.use(express.static('public'));

const LEAGUE = "nba"; 

// --- DATABASE LOAD ---
const dataPath = path.join(__dirname, 'public', 'data.json');
let TAKE_ID_DB = [];
try {
    const rawData = fs.readFileSync(dataPath);
    TAKE_ID_DB = JSON.parse(rawData).map(item => {
        const parts = item.category.split('/').map(s => s.trim());
        const validKeys = ["PTS", "REBS", "ASSTS", "BLKS", "STLS", "FOULS", "FG", "FT", "3-PT FG", "TO", "MINS", "OFF REBS", "FGS", "TECHNICAL", "EJECTED", "BIO"];
        return { ...item, required: parts.filter(p => validKeys.includes(p)) };
    });
} catch (err) { console.error("Error loading data.json:", err); }

// --- LIVE THRESHOLDS ---
const THRESHOLDS = { "PTS": 8, "REBS": 5, "ASSTS": 4, "BLKS": 2, "STLS": 2, "3-PT FG": 3, "FG": 4, "FT": 4, "TO": 4, "MINS": 20 };

function findStatIndex(names, target) { return names.indexOf(target); }

// --- LIVE TRACKER LOGIC ---
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
    if (topMatches && topMatches.length > 0) topMatches.forEach(m => { if(m.required) m.required.forEach(r => statsToShow.add(r)); });
    if (stats.PTS > 0) statsToShow.add("PTS");
    const sortedKeys = Array.from(statsToShow).sort((a, b) => ["PTS", "REBS", "ASSTS", "FG", "3-PT FG", "FT", "BLKS", "STLS"].indexOf(a) - ["PTS", "REBS", "ASSTS", "FG", "3-PT FG", "FT", "BLKS", "STLS"].indexOf(b));
    return sortedKeys.map(key => {
        let val = stats[key];
        if (val == 0 && key !== "PTS") return null;
        let label = key.toLowerCase();
        if(key === "3-PT FG") label = "3pm"; if(key === "REBS") label = "reb"; if(key === "ASSTS") label = "ast";
        if(key === "BLKS") label = "blk"; if(key === "STLS") label = "stl";
        return `${val} ${label}`;
    }).filter(Boolean).join(', ');
}

// --- PREGAME RULES ENGINE (THE "POP" LOGIC) ---
function generatePregameStorylines(player, isHome) {
    const storylines = [];
    const teamPrefix = isHome ? "2" : "1"; // 1 = Away, 2 = Home
    let jerseyStr = player.jersey || "00";
    if (jerseyStr.length === 1) jerseyStr = "0" + jerseyStr; // pad single digits to 05
    
    // Base player code prefix: e.g., 200 + jersey = 20030
    const prefix = `${teamPrefix}00${jerseyStr}`; 

    // MOCK ANOMALY CHECKER (In reality, we fetch historical APIs here)
    // We simulate hitting the thresholds to show how the string builder works.
    
    // Rule 1: The "On Fire" Rule (Simulated)
    if (player.seasonPts > 20) {
        storylines.push({
            code: `${prefix}20`, // x00__20
            title: "Hot Streak (Last 5 Games)",
            desc: `Averaging ${player.seasonPts + 6.2} pts over last 5 games (Season Avg: ${player.seasonPts})`
        });
    }

    // Rule 2: Career vs Opponent (Simulated for veterans)
    if (player.experience > 3) {
        storylines.push({
            code: `${prefix}30`, // x00__30
            title: "Career vs. Opponent",
            desc: `Elevated stats historically against this matchup.`
        });
    }

    // Rule 3: The Fallback (Season Averages & Bio)
    storylines.push({
        code: `${prefix}00`, // x00__00
        title: "Season Averages",
        desc: `Standard Season - pts/rbs/ast graphic`
    });

    storylines.push({
        code: `${prefix}77`, // x00__77
        title: "Biographical Info",
        desc: `Bio - Age/Ht/Wt/College/Years Pro`
    });

    // Return the top 2-3 most compelling storylines
    return storylines.slice(0, 3);
}

// --- API ENDPOINTS ---

app.get('/api/games', async (req, res) => {
    try {
        const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/scoreboard`);
        const data = await response.json();
        const games = data.events.map(event => ({ id: event.id, name: event.name, shortName: event.shortName, status: event.status.type.shortDetail }));
        res.json(games);
    } catch (error) { res.status(500).json({ error: "Failed to fetch games" }); }
});

// PREGAME ENDPOINT
app.get('/api/pregame/:id', async (req, res) => {
    try {
        const gameId = req.params.id;
        const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/summary?event=${gameId}`);
        const data = await response.json();

        const competition = data.header?.competitions?.[0];
        const homeTeamId = competition?.competitors.find(c => c.homeAway === 'home')?.id;
        
        const processedTeams = [];
        const playerGroups = data.boxscore?.players || [];

        for (const teamGroup of playerGroups) {
            const isHome = teamGroup.team.id === homeTeamId;
            const processedPlayers = [];
            const athletes = teamGroup.statistics?.[0]?.athletes || [];

            for (const ath of athletes) {
                // Determine if player is a regular rotation player to filter out bench warmers
                const minString = ath.stats[0] || "0";
                if (parseInt(minString) < 10) continue; // Ignore guys who don't play

                const playerObj = {
                    name: ath.athlete.displayName,
                    jersey: ath.athlete.jersey,
                    experience: 5, // Mock data for now
                    seasonPts: Math.floor(Math.random() * 15) + 10 // Mock data for now
                };

                const storylines = generatePregameStorylines(playerObj, isHome);
                
                processedPlayers.push({
                    name: playerObj.name,
                    jersey: playerObj.jersey,
                    storylines: storylines
                });
            }
            processedTeams.push({ team: teamGroup.team.displayName, color: teamGroup.team.color, isHome: isHome, players: processedPlayers });
        }
        res.json({ teams: processedTeams });
    } catch (error) { res.status(500).json({ error: "Failed to process pregame" }); }
});

// LIVE TRACKER ENDPOINT (Unchanged)
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
        
        const gameInfo = { status: statusDetail, homeScore: homeTeamObj?.score || "0", awayScore: awayTeamObj?.score || "0", homeAbbrev: homeTeamObj?.team?.abbreviation || "HOME", awayAbbrev: awayTeamObj?.team?.abbreviation || "AWAY" };
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
                const idx = { PTS: findStatIndex(names, "PTS"), REBS: findStatIndex(names, "REB"), ASSTS: findStatIndex(names, "AST"), BLKS: findStatIndex(names, "BLK"), STLS: findStatIndex(names, "STL"), TO: findStatIndex(names, "TO"), "3-PT FG": findStatIndex(names, "3PT"), FG: findStatIndex(names, "FG"), FT: findStatIndex(names, "FT"), MINS: findStatIndex(names, "MIN") };

                for (const ath of athletes) {
                    const name = ath.athlete.displayName;
                    const jersey = ath.athlete.jersey || "00";
                    const raw = ath.stats;
                    let jNum = parseInt(jersey); if (isNaN(jNum)) jNum = 0; 
                    const playerCode = (isHome ? 200 : 100) + jNum;

                    const getVal = (key) => { const i = idx[key]; if (i === -1 || !raw[i]) return 0; let val = raw[i]; if (val.includes('-')) val = val.split('-')[0]; return parseInt(val) || 0; };
                    const getStr = (key) => { const i = idx[key]; return (i !== -1 && raw[i]) ? raw[i] : "0"; };

                    const pStats = { PTS: getVal("PTS"), REBS: getVal("REBS"), ASSTS: getVal("ASSTS"), BLKS: getVal("BLKS"), STLS: getVal("STLS"), TO: getVal("TO"), "3-PT FG": getVal("3-PT FG"), FG: getVal("FG"), FT: getVal("FT"), MINS: getVal("MIN") };
                    const displayStats = { ...pStats, "FG": getStr("FG"), "FT": getStr("FT"), "3-PT FG": getStr("3-PT FG") };
                    const topMatches = getTopMatches(pStats);
                    
                    if (topMatches.length > 0 || pStats.PTS >= 10) {
                        processedPlayers.push({ name: name, jersey: jersey, playerCode: playerCode, statsSummary: getDynamicStatString(displayStats, topMatches), matches: topMatches });
                    }
                }
            }
            processedTeams.push({ team: teamName, color: teamColor, isHome: isHome, players: processedPlayers });
        }
        res.json({ gameInfo: gameInfo, teams: processedTeams });
    } catch (error) { res.status(500).json({ error: "Failed to process game" }); }
});

app.listen(port, () => { console.log(`Server running on port ${port}`); });
