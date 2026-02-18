const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const port = process.env.PORT || 3000;

app.use(express.static('public'));

// --- LOAD DATABASE ---
const dataPath = path.join(__dirname, 'public', 'data.json');
let TAKE_ID_DB = [];

try {
    const rawData = fs.readFileSync(dataPath);
    const json = JSON.parse(rawData);
    
    // Pre-process: Create a "required" list for each item to make matching faster
    // This logic mimics what we did in Python
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

// --- THRESHOLDS (Matches your Python script) ---
const THRESHOLDS = {
    "PTS": 8, "REBS": 5, "ASSTS": 4, 
    "BLKS": 2, "STLS": 2, "3-PT FG": 3, 
    "FG": 4, "FT": 4, "TO": 4, "MINS": 20
};

// --- HELPER FUNCTIONS ---
function findStatIndex(names, target) {
    return names.indexOf(target);
}

function getBestMatch(playerStats) {
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
        
        // Check if player has ALL required stats for this category
        const hasAll = item.required.every(req => notable.has(req));
        
        if (hasAll) {
            matches.push({
                id: item.id,
                category: item.category,
                score: item.required.length // More specific matches = higher score
            });
        }
    });

    // 3. Sort by Score (Desc)
    matches.sort((a, b) => b.score - a.score);
    return matches.length > 0 ? matches[0] : null;
}

// --- API ENDPOINTS ---

// 1. Get List of Live Games
app.get('/api/games', async (req, res) => {
    try {
        const response = await fetch('http://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard');
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

// 2. Get Processed Stats for a Specific Game
app.get('/api/game/:id', async (req, res) => {
    try {
        const gameId = req.params.id;
        const url = `http://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${gameId}`;
        const response = await fetch(url);
        const data = await response.json();

        const processedTeams = [];
        
        // ESPN Structure: boxscore -> players (list of teams)
        const playerGroups = data.boxscore?.players || [];

        for (const teamGroup of playerGroups) {
            const teamName = teamGroup.team.displayName;
            const teamLogo = teamGroup.team.logo;
            const processedPlayers = [];

            const statsList = teamGroup.statistics || [];
            if (statsList.length > 0) {
                const statsData = statsList[0];
                const names = statsData.names; // ["MIN", "PTS", ...]
                const athletes = statsData.athletes;

                // Index Map
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

                    // Helper to safely get value
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

                    const bestMatch = getBestMatch(pStats);

                    if (bestMatch) {
                        processedPlayers.push({
                            name: name,
                            statsSummary: `${pStats.PTS}pts ${pStats.REBS}reb ${pStats.ASSTS}ast`,
                            match: bestMatch
                        });
                    }
                }
            }
            processedTeams.push({ team: teamName, logo: teamLogo, players: processedPlayers });
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
