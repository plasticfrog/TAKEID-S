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
        
        // FILTER: Ignore Time-Based categories for now since we only have Game Totals
        const catUpper = item.category.toUpperCase();
        if (catUpper.includes("QTR") || catUpper.includes("HALF") || catUpper.includes("SINCE") || catUpper.includes("SEASON")) {
            return;
        }

        const hasAll = item.required.every(req => notable.has(req));
        if (hasAll) {
            matches.push({
                id: item.id,
                category: item.category,
                score: item.required.length, 
                required: item.required
            });
        }
    });

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, 3);
}

function getDynamicStatString(stats, topMatches) {
    // Collect ALL required stats from ALL top matches
    const statsToShow = new Set();
    
    if (topMatches && topMatches.length > 0) {
        topMatches.forEach(match => {
            if(match.required) {
                match.required.forEach(r => statsToShow.add(r));
            }
        });
    }

    // Always show PTS if they scored, even if not in a category
    if (stats.PTS > 0) statsToShow.add("PTS");

    // Convert Set to Array and Sort (PTS first, then REB/AST)
    const sortedKeys = Array.from(statsToShow).sort((a, b) => {
        const order = ["PTS", "REBS", "ASSTS", "FG", "3-PT FG", "FT", "BLKS", "STLS"];
        return order.indexOf(a) - order.indexOf(b);
    });

    const parts = [];
    sortedKeys.forEach(key => {
        let val = stats[key];
        // Skip if 0 (unless it's points or explicitly required)
        if (val == 0 && key !== "PTS") return;

        let label = key.toLowerCase();
        if(key === "3-PT FG") label = "3pm";
        if(key === "REBS") label = "reb";
        if(key === "ASSTS") label = "ast";
        if(key === "BLKS") label = "blk";
        if(key === "STLS") label = "stl";
        
        parts.push(`${val} ${label}`);
    });

    return parts.join(', ');
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

        const competitors = data.header?.competitions?.[0]?.competitors || [];
        const homeTeamId = competitors.find(c => c.homeAway === 'home')?.id;

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
                            // Pass ALL top matches so we can show ALL relevant stats
                            statsSummary: getDynamicStatString(displayStats, topMatches),
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
