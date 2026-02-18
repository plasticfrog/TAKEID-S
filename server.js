const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const port = process.env.PORT || 3000;

app.use(express.static('public'));

// --- CONFIGURATION ---
// To switch to NBA later, just change this to "nba"
const LEAGUE = "mens-college-basketball"; 
// const LEAGUE = "nba"; 

// --- LOAD DATABASE ---
const dataPath = path.join(__dirname, 'public', 'data.json');
let TAKE_ID_DB = [];

try {
    const rawData = fs.readFileSync(dataPath);
    const json = JSON.parse(rawData);
    
    // Pre-process: Create "required" list for fast matching
    TAKE_ID_DB = json.map(item => {
        const parts = item.category.split('/').map(s => s.trim());
        const validKeys = ["PTS", "REBS", "ASSTS", "BLKS", "STLS", "FOULS", "FG", "FT", "3-PT FG", "TO", "MINS", "OFF REBS", "FGS", "TECHNICAL", "EJECTED", "BIO"];
        const required = parts.filter(p => validKeys.includes(p));
        return { ...item, required };
    });
    console.log(`Loaded ${TAKE_ID_DB.length} Take IDs.`);
} catch (err) {
    console.error("Error loading data.json:", err);
}

// --- THRESHOLDS ---
const THRESHOLDS = {
    "PTS": 8, "REBS": 5, "ASSTS": 4, 
    "BLKS": 2, "STLS": 2, "3-PT FG": 3, 
    "FG": 4, "FT": 4, "TO": 4, "MINS": 20
};

// --- HELPER FUNCTIONS ---
function findStatIndex(names, target) {
    return names.indexOf(target);
}

function getTopMatches(playerStats) {
    // 1. Identify Notable Stats
    const notable = new Set();
    for (const [key, val] of Object.entries(playerStats)) {
        const limit = THRESHOLDS[key] || 999;
        if (val >= limit) notable.add(key);
    }

    // 2. Score Database Items
    const matches = [];
    TAKE_ID_DB.forEach(item => {
        if (!item.required || item.required.length === 0) return;
        
        // Check if player has ALL required stats
        const hasAll = item.required.every(req => notable.has(req));
        
        if (hasAll) {
            matches.push({
                id: item.id,
                category: item.category,
                score: item.required.length // Priority to more specific matches
            });
        }
    });

    // 3. Sort by Score (Desc) and take top 3
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, 3);
}

function getDynamicStatString(stats) {
    // Returns a string of the most impressive stats, not just P/R/A
    let parts = [];
    // Always show points if significant
    if (stats.PTS > 0) parts.push(`${stats.PTS}pts`);
    
    // Check other categories against thresholds or if they are non-zero
    if (stats.REBS >= 3) parts.push(`${stats.REBS}reb`);
    if (stats.ASSTS >= 3) parts.push(`${stats.ASSTS}ast`);
    if (stats.BLKS >= 1) parts.push(`${stats.BLKS}blk`);
    if (stats.STLS >= 1) parts.push(`${stats.STLS}stl`);
    if (stats["3-PT FG"] >= 2) parts.push(`${stats["3-PT FG"]} 3pm`);
    
    // Fallback if low stats
    if (parts.length === 1 && stats.REBS > 0) parts.push(`${stats.REBS}reb`);
    
    return parts.join(' ');
}

// --- API ENDPOINTS ---

app.get('/api/games', async (req, res) => {
    try {
        const url = `http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/scoreboard`;
        const response = await fetch(url);
        const data = await response.json();
        
        const games = data.events.map(event => ({
            id: event.id,
            name: event.name,
            shortName: event.shortName,
            status: event.status.type.shortDetail
        }));
        
        res.json(games);
    } catch (error) {
        console.error("Error fetching scoreboard:", error);
        res.status(500).json({ error: "Failed to fetch games" });
    }
});

app.get('/api/game/:id', async (req, res) => {
    try {
        const gameId = req.params.id;
        const url = `http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/summary?event=${gameId}`;
        const response = await fetch(url);
        const data = await response.json();

        const processedTeams = [];
        const playerGroups = data.boxscore?.players || [];

        for (const teamGroup of playerGroups) {
            const teamName = teamGroup.team.displayName;
            const processedPlayers = [];

            const statsList = teamGroup.statistics || [];
            if (statsList.length > 0) {
                const statsData = statsList[0];
                const names = statsData.names; 
                const athletes = statsData.athletes;

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
                    const raw = ath.stats;

                    const getVal = (key) => {
                        const i = idx[key];
                        if (i === -1 || !raw[i]) return 0;
                        let val = raw[i];
                        if (val.includes('-')) val = val.split('-')[0];
                        return parseInt(val) || 0;
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

                    // Get top 3 matches instead of just 1
                    const topMatches = getTopMatches(pStats);
                    
                    // Only include player if they have at least one valid category match
                    // OR if they have significant stats (e.g. > 10 pts) even if no match found
                    if (topMatches.length > 0 || pStats.PTS >= 10) {
                        processedPlayers.push({
                            name: name,
                            statsSummary: getDynamicStatString(pStats),
                            matches: topMatches
                        });
                    }
                }
            }
            processedTeams.push({ team: teamName, players: processedPlayers });
        }

        res.json({ teams: processedTeams });

    } catch (error) {
        console.error("Error processing game:", error);
        res.status(500).json({ error: "Failed to process game" });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
