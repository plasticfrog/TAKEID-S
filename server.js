const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const port = process.env.PORT || 3000;

app.use(express.static('public'));

// --- CONFIGURATION ---
const LEAGUE = "mens-college-basketball"; 
// const LEAGUE = "nba"; 

// --- LOAD DATABASE ---
const dataPath = path.join(__dirname, 'public', 'data.json');
let TAKE_ID_DB = [];

try {
    const rawData = fs.readFileSync(dataPath);
    const json = JSON.parse(rawData);
    
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
    const notable = new Set();
    for (const [key, val] of Object.entries(playerStats)) {
        const limit = THRESHOLDS[key] || 999;
        if (val >= limit) notable.add(key);
    }

    const matches = [];
    TAKE_ID_DB.forEach(item => {
        if (!item.required || item.required.length === 0) return;
        const hasAll = item.required.every(req => notable.has(req));
        if (hasAll) {
            matches.push({
                id: item.id,
                category: item.category,
                score: item.required.length, 
                required: item.required // Save this to use for display later
            });
        }
    });

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, 3);
}

function getDynamicStatString(stats, bestMatch) {
    let parts = [];
    
    // 1. If we have a match, showing ITS stats is priority #1
    if (bestMatch && bestMatch.required) {
        bestMatch.required.forEach(reqKey => {
            let label = reqKey.toLowerCase();
            if(reqKey === "3-PT FG") label = "3pm";
            if(reqKey === "REBS") label = "reb";
            if(reqKey === "ASSTS") label = "ast";
            if(reqKey === "BLKS") label = "blk";
            if(reqKey === "STLS") label = "stl";
            
            // Format stats like "4-6" for FG/FT, or just value for others
            let val = stats[reqKey];
            
            // Handle FG/FT/3PT specifically (if stored as raw numbers in stats obj)
            // Note: In our main loop, we parse specific "raw strings" for display below.
            // For simplicity here, we assume 'stats' object holds clean ints. 
            // We'll pass a "displayStats" object to this function to handle "4-6" strings better.
            
            parts.push(`${val} ${label}`);
        });
    }

    // 2. If no match, or list is short, add generic high stats
    if (parts.length === 0) {
        if (stats.PTS > 0) parts.push(`${stats.PTS} pts`);
        if (stats.REBS >= 5) parts.push(`${stats.REBS} reb`);
        if (stats.ASSTS >= 4) parts.push(`${stats.ASSTS} ast`);
    }

    // Deduplicate strings just in case
    return [...new Set(parts)].join(', ');
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

        // Get Home/Away info
        const competitors = data.header?.competitions?.[0]?.competitors || [];
        const homeTeamId = competitors.find(c => c.homeAway === 'home')?.id;

        const processedTeams = [];
        const playerGroups = data.boxscore?.players || [];

        for (const teamGroup of playerGroups) {
            const teamId = teamGroup.team.id;
            const teamName = teamGroup.team.displayName;
            const teamColor = teamGroup.team.color || "333333"; // Default dark grey
            const isHome = teamId === homeTeamId;
            
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
                    const jersey = ath.athlete.jersey || "00";
                    const raw = ath.stats;

                    // Helper for integers
                    const getVal = (key) => {
                        const i = idx[key];
                        if (i === -1 || !raw[i]) return 0;
                        let val = raw[i];
                        if (val.includes('-')) val = val.split('-')[0];
                        return parseInt(val) || 0;
                    };

                    // Helper for Strings (like "4-6")
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
                    
                    // Specific Display Object (Keeps "4-6" formats)
                    const displayStats = {
                        ...pStats,
                        "FG": getStr("FG"),
                        "FT": getStr("FT"),
                        "3-PT FG": getStr("3-PT FG")
                    };

                    const topMatches = getTopMatches(pStats);
                    
                    if (topMatches.length > 0 || pStats.PTS >= 10) {
                        processedPlayers.push({
                            name: name,
                            jersey: jersey,
                            // Pass the 'displayStats' which has strings like "4-6", and the best match
                            statsSummary: getDynamicStatString(displayStats, topMatches[0]),
                            matches: topMatches
                        });
                    }
                }
            }
            processedTeams.push({ 
                team: teamName, 
                color: teamColor, 
                isHome: isHome,
                players: processedPlayers 
            });
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
