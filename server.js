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

const THRESHOLDS = { "PTS": 8, "REBS": 5, "ASSTS": 4, "BLKS": 2, "STLS": 2, "3-PT FG": 3, "FG": 4, "FT": 4, "TO": 4, "MINS": 20 };
function findStatIndex(names, target) { return names.indexOf(target); }

// --- PREGAME RULES ENGINE (THE "POP" LOGIC) ---
function generatePregameStorylines(player, isHome) {
    const storylines = [];
    const teamPrefix = isHome ? "2" : "1"; 
    let jerseyStr = player.jersey || "00";
    if (jerseyStr.length === 1) jerseyStr = "0" + jerseyStr; 
    const prefix = `${teamPrefix}00${jerseyStr}`; 

    // MOCK DATA (Simulating historical DB fetch)
    const seasonPts = Math.floor(Math.random() * 20) + 8;
    const l5Pts = seasonPts + (Math.floor(Math.random() * 10) - 4);
    
    // Career vs Opponent Mock Variables
    const gamesVsOpp = Math.floor(Math.random() * 15); // 0 to 14 games played vs this team
    const careerVsOppPts = seasonPts + (Math.floor(Math.random() * 12) - 4);

    // RULE 1: On Fire (Last 5 Games > 20% over season average)
    if (l5Pts > (seasonPts * 1.2)) {
        storylines.push({ code: `${prefix}20`, title: "Hot Streak (L5)", desc: `${l5Pts.toFixed(1)} pts over L5 (Avg: ${seasonPts})` });
    }

    // RULE 2: Team Killer (Must have 5+ games AND > 20% over season average)
    if (gamesVsOpp >= 5 && careerVsOppPts > (seasonPts * 1.2)) {
        storylines.push({ code: `${prefix}30`, title: `Career vs Opp (${gamesVsOpp} Gms)`, desc: `Averages ${careerVsOppPts.toFixed(1)} pts vs Opp (Avg: ${seasonPts})` });
    }

    // FALLBACKS (Only if no anomalies popped)
    if (storylines.length === 0) {
        storylines.push({ code: `${prefix}00`, title: "Season Averages", desc: `Standard pts/rbs/ast graphic` });
    }

    // Add Bio as a safe backup always
    storylines.push({ code: `${prefix}77`, title: "Bio Info", desc: `Age/Ht/Wt/College` });

    return storylines.slice(0, 3);
}

// --- API ENDPOINTS ---

app.get('/api/teams', async (req, res) => {
    try {
        const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/teams?limit=30`);
        const data = await response.json();
        const teams = data.sports[0].leagues[0].teams.map(t => ({ id: t.team.id, name: t.team.displayName, abbrev: t.team.abbreviation }));
        // Sort alphabetically
        teams.sort((a, b) => a.name.localeCompare(b.name));
        res.json(teams);
    } catch (err) { res.status(500).json({ error: "Failed to fetch teams" }); }
});

app.get('/api/games', async (req, res) => {
    try {
        const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/scoreboard`);
        const data = await response.json();
        const games = data.events.map(event => ({ id: event.id, name: event.name, shortName: event.shortName, status: event.status.type.shortDetail }));
        res.json(games);
    } catch (err) { res.status(500).json({ error: "Failed to fetch games" }); }
});

// NEW CUSTOM PREGAME MATCHUP ENDPOINT
app.get('/api/pregame', async (req, res) => {
    try {
        const { away, home } = req.query;
        if (!away || !home) return res.status(400).json({ error: "Missing teams" });

        const processedTeams = [];

        // Helper to fetch roster and process
        const processTeam = async (teamId, isHome) => {
            const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/teams/${teamId}?enable=roster`);
            const data = await response.json();
            const teamInfo = data.team;
            
            const processedPlayers = [];
            const athletes = teamInfo.athletes || [];

            for (const ath of athletes) {
                // Generate storylines based on rules engine
                const storylines = generatePregameStorylines({ jersey: ath.jersey }, isHome);
                processedPlayers.push({ name: ath.fullName, jersey: ath.jersey || "00", storylines: storylines });
            }
            return { team: teamInfo.displayName, color: teamInfo.color || "333333", isHome: isHome, players: processedPlayers };
        };

        const [awayTeam, homeTeam] = await Promise.all([processTeam(away, false), processTeam(home, true)]);
        processedTeams.push(awayTeam, homeTeam);

        res.json({ teams: processedTeams });
    } catch (error) { res.status(500).json({ error: "Failed to process pregame" }); }
});

// LIVE TRACKER ENDPOINT (Kept unchanged, just minified logic to save space here)
app.get('/api/game/:id', async (req, res) => { /* ... Existing Live Tracker Logic ... */ });

app.listen(port, () => { console.log(`Server running on port ${port}`); });
