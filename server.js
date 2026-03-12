const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const port = process.env.PORT || 3000;

app.use(express.static('public'));

// --- CONFIGURATION ---
const LEAGUE = "nba"; 

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
    const statsToShow = new Set();
    
    if (topMatches && topMatches.length > 0) {
        topMatches.forEach(match => {
            if(match.required) {
                match.required.forEach(r => statsToShow.add(r));
            }
        });
    }

    if (stats.PTS > 0) statsToShow.add("PTS");

    const sortedKeys = Array.from(statsToShow).sort((a, b) => {
        const order = ["PTS", "REBS", "ASSTS", "FG", "3-PT FG", "FT", "BLKS", "STLS"];
        return order.indexOf(a) - order.indexOf(b);
    });

    const parts = [];
    sortedKeys.forEach(key => {
        let val = stats[key];
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

// --- PREGAME: CATEGORY TEMPLATES (from Take ID reference sheet) ---
const PREGAME_CATEGORIES = [
    // Season Averages (00-09)
    { suffix: "00", group: "Season", title: "Season - pts/rbs/ast", stats: ["PTS","REB","AST"] },
    { suffix: "01", group: "Season", title: "Season - pts/rbs/fg%", stats: ["PTS","REB","FG%"] },
    { suffix: "02", group: "Season", title: "Season - pts/ast/stl", stats: ["PTS","AST","STL"] },
    { suffix: "03", group: "Season", title: "Season - fg%/ft%/3-pt%", stats: ["FG%","FT%","3P%"] },
    { suffix: "04", group: "Season", title: "Season - min/pts/rbs", stats: ["MIN","PTS","REB"] },
    { suffix: "05", group: "Season", title: "Season - min/pts/ast", stats: ["MIN","PTS","AST"] },
    { suffix: "06", group: "Season", title: "Season - pts/fg%/ft%", stats: ["PTS","FG%","FT%"] },
    { suffix: "07", group: "Season", title: "Season - pts/ast/fg%", stats: ["PTS","AST","FG%"] },
    { suffix: "08", group: "Season", title: "Season - ast/stl/to", stats: ["AST","STL","TO"] },
    { suffix: "09", group: "Season", title: "Season - pts/fg%/3pt%", stats: ["PTS","FG%","3P%"] },
    // Last 5 Games (20-29)
    { suffix: "20", group: "Last 5", title: "Last 5 Games - pts/rbs/ast", stats: ["PTS","REB","AST"] },
    { suffix: "21", group: "Last 5", title: "Last 5 Games - pts/rbs/fg%", stats: ["PTS","REB","FG%"] },
    { suffix: "22", group: "Last 5", title: "Last 5 Games - pts/ast/stl", stats: ["PTS","AST","STL"] },
    { suffix: "23", group: "Last 5", title: "Last 5 Games - fg%/ft%/3-pt%", stats: ["FG%","FT%","3P%"] },
    { suffix: "24", group: "Last 5", title: "Last 5 Games - min/pts/rbs", stats: ["MIN","PTS","REB"] },
    { suffix: "25", group: "Last 5", title: "Last 5 Games - min/pts/ast", stats: ["MIN","PTS","AST"] },
    { suffix: "26", group: "Last 5", title: "Last 5 Games - pts/fg%/ft%", stats: ["PTS","FG%","FT%"] },
    { suffix: "27", group: "Last 5", title: "Last 5 Games - pts/ast/fg%", stats: ["PTS","AST","FG%"] },
    { suffix: "28", group: "Last 5", title: "Last 5 Games - ast/stl/to", stats: ["AST","STL","TO"] },
    { suffix: "29", group: "Last 5", title: "Last 5 Games - pts/fg%/3pt%", stats: ["PTS","FG%","3P%"] },
    // Last Game (50-54)
    { suffix: "50", group: "Last Game", title: "Last Game - pts/reb/ast/min", stats: ["PTS","REB","AST","MIN"] },
    { suffix: "51", group: "Last Game", title: "Last Game - pts/fgm-fga/reb/min", stats: ["PTS","FG","REB","MIN"] },
    { suffix: "52", group: "Last Game", title: "Last Game - pts/fgm-fga/ast/min", stats: ["PTS","FG","AST","MIN"] },
    // Career Averages (80-89)
    { suffix: "80", group: "Career", title: "Career - pts/rbs/ast", stats: ["PTS","REB","AST"] },
    { suffix: "81", group: "Career", title: "Career - pts/rbs/fg%", stats: ["PTS","REB","FG%"] },
    { suffix: "82", group: "Career", title: "Career - pts/ast/stl", stats: ["PTS","AST","STL"] },
    { suffix: "83", group: "Career", title: "Career - fg%/ft%/3-pt%", stats: ["FG%","FT%","3P%"] },
    { suffix: "84", group: "Career", title: "Career - min/pts/rbs", stats: ["MIN","PTS","REB"] },
    { suffix: "85", group: "Career", title: "Career - min/pts/ast", stats: ["MIN","PTS","AST"] },
    { suffix: "86", group: "Career", title: "Career - pts/fg%/ft%", stats: ["PTS","FG%","FT%"] },
    { suffix: "87", group: "Career", title: "Career - pts/ast/fg%", stats: ["PTS","AST","FG%"] },
    { suffix: "88", group: "Career", title: "Career - ast/stl/to", stats: ["AST","STL","TO"] },
    { suffix: "89", group: "Career", title: "Career - pts/fg%/3pt%", stats: ["PTS","FG%","3P%"] },
    // Bio
    { suffix: "77", group: "Bio", title: "Bio - Age/Ht/Wt/College/Years Pro", stats: [] },
];

// --- PREGAME: FETCH REAL PLAYER DATA FROM ESPN ---
async function fetchPlayerStats(athleteId) {
    try {
        const [statsRes, logRes] = await Promise.all([
            fetch(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/${LEAGUE}/athletes/${athleteId}/stats`),
            fetch(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/${LEAGUE}/athletes/${athleteId}/gamelog`)
        ]);
        const statsData = await statsRes.json();
        const logData = await logRes.json();
        return { statsData, logData };
    } catch (err) {
        console.error(`Failed to fetch stats for athlete ${athleteId}:`, err.message);
        return null;
    }
}

function parseSeasonAndCareer(statsData) {
    // ESPN stats endpoint: categories[0] = averages with labels & statistics array
    const avgCat = (statsData.categories || []).find(c => c.name === 'averages');
    if (!avgCat) return { season: null, career: null };

    const labels = avgCat.labels || [];
    const seasons = avgCat.statistics || [];
    const careerRaw = avgCat.totals || [];

    const mapRow = (row) => {
        const obj = {};
        labels.forEach((label, i) => {
            let val = row[i];
            if (typeof val === 'string' && val.includes('-')) val = val.split('-')[0]; // "7.9-18.9" → "7.9"
            obj[label] = parseFloat(val) || 0;
        });
        return obj;
    };

    // Current season = last entry in statistics array
    const currentSeason = seasons.length > 0 ? mapRow(seasons[seasons.length - 1].stats) : null;
    const career = careerRaw.length > 0 ? mapRow(careerRaw) : null;

    return { season: currentSeason, career };
}

function parseLast5AndLastGame(logData) {
    // Gamelog: seasonTypes[0].categories[] = months, each with events[]
    // events at top level = metadata keyed by eventId
    const seasonType = (logData.seasonTypes || [])[0];
    if (!seasonType) return { last5: null, lastGame: null };

    const labels = logData.labels || []; // ['MIN','FG','FG%','3PT','3P%','FT','FT%','REB','AST','BLK','STL','PF','TO','PTS']

    // Collect all games in order (months are reverse chronological, events within month are too)
    const allGames = [];
    for (const month of (seasonType.categories || [])) {
        for (const ev of (month.events || [])) {
            allGames.push(ev);
        }
    }

    if (allGames.length === 0) return { last5: null, lastGame: null };

    const mapGame = (ev) => {
        const obj = {};
        labels.forEach((label, i) => {
            let val = ev.stats[i];
            if (label === 'FG' || label === '3PT' || label === 'FT') {
                // Keep as string for display (e.g., "7-11") but also parse made count
                obj[label + '_STR'] = val;
                obj[label] = parseFloat((val || '0').split('-')[0]) || 0;
            } else {
                obj[label] = parseFloat(val) || 0;
            }
        });
        // Add metadata from events object
        const meta = (logData.events || {})[ev.eventId];
        if (meta) {
            obj._opponent = meta.opponent?.abbreviation || '?';
            obj._result = meta.gameResult || '?';
            obj._date = meta.gameDate || '';
        }
        return obj;
    };

    const lastGame = mapGame(allGames[0]);
    const last5Raw = allGames.slice(0, 5).map(mapGame);

    // Average the last 5
    const last5 = {};
    if (last5Raw.length > 0) {
        const numericKeys = labels.filter(l => !['FG','3PT','FT'].includes(l));
        numericKeys.forEach(key => {
            last5[key] = parseFloat((last5Raw.reduce((s, g) => s + g[key], 0) / last5Raw.length).toFixed(1));
        });
        // For FG/3PT/FT, average the made counts
        ['FG','3PT','FT'].forEach(key => {
            last5[key] = parseFloat((last5Raw.reduce((s, g) => s + g[key], 0) / last5Raw.length).toFixed(1));
        });
        // Also compute shooting %s for L5
        ['FG','3PT','FT'].forEach(key => {
            const pctLabel = key === 'FG' ? 'FG%' : key === '3PT' ? '3P%' : 'FT%';
            const totalMade = last5Raw.reduce((s, g) => s + parseFloat((g[key + '_STR'] || '0').split('-')[0] || 0), 0);
            const totalAtt = last5Raw.reduce((s, g) => s + parseFloat((g[key + '_STR'] || '0-0').split('-')[1] || 0), 0);
            if (totalAtt > 0) last5[pctLabel] = parseFloat(((totalMade / totalAtt) * 100).toFixed(1));
        });
    }

    return { last5, lastGame, last5Raw };
}

// --- PREGAME: SCORE CATEGORIES FOR A PLAYER ---
function scoreCategories(season, career, last5, lastGame, prefix) {
    if (!season) return [];

    // Thresholds for "impressive" stats (above these = the stat is worth highlighting)
    const impressive = {
        PTS: [{ min: 25, s: 3 }, { min: 18, s: 2 }, { min: 12, s: 1 }],
        REB: [{ min: 10, s: 3 }, { min: 7, s: 2 }, { min: 5, s: 1 }],
        AST: [{ min: 8, s: 3 }, { min: 5, s: 2 }, { min: 3, s: 1 }],
        STL: [{ min: 2, s: 3 }, { min: 1.3, s: 2 }, { min: 0.8, s: 1 }],
        BLK: [{ min: 2, s: 3 }, { min: 1.2, s: 2 }, { min: 0.7, s: 1 }],
        "FG%": [{ min: 52, s: 3 }, { min: 47, s: 2 }, { min: 43, s: 1 }],
        "3P%": [{ min: 40, s: 3 }, { min: 36, s: 2 }, { min: 33, s: 1 }],
        "FT%": [{ min: 88, s: 3 }, { min: 80, s: 2 }, { min: 72, s: 1 }],
        MIN: [{ min: 34, s: 2 }, { min: 28, s: 1 }],
        TO: [{ min: 0, s: 0 }] // Turnovers: only interesting in combo with AST
    };

    function statScore(statName, value) {
        const tiers = impressive[statName];
        if (!tiers) return 0;
        for (const t of tiers) { if (value >= t.min) return t.s; }
        return 0;
    }

    function getStatVal(source, statName) {
        if (!source) return 0;
        return source[statName] || 0;
    }

    function fmtStat(statName, value) {
        if (statName.includes('%')) return `${value}%`;
        return `${value}`;
    }

    const scored = [];

    for (const cat of PREGAME_CATEGORIES) {
        // Bio always gets a base score
        if (cat.suffix === "77") {
            scored.push({ ...cat, score: 0.5, code: `${prefix}${cat.suffix}`, desc: "Age/Ht/Wt/College/Years Pro" });
            continue;
        }

        let source, comparisonSource, compLabel;
        if (cat.group === "Season") {
            source = season;
        } else if (cat.group === "Last 5") {
            source = last5;
            comparisonSource = season;
            compLabel = "Season";
        } else if (cat.group === "Last Game") {
            source = lastGame;
            comparisonSource = season;
            compLabel = "Season Avg";
        } else if (cat.group === "Career") {
            source = career;
            comparisonSource = season;
            compLabel = "This Season";
        }

        if (!source) continue;

        // Base score: sum of how impressive each stat in this category is
        let score = 0;
        const descParts = [];

        for (const st of cat.stats) {
            const val = getStatVal(source, st);
            score += statScore(st, val);
            descParts.push(`${fmtStat(st, val)} ${st.toLowerCase()}`);
        }

        // Bonus for anomalies/trends (L5 vs season, career vs season)
        if (comparisonSource && cat.stats.length > 0) {
            let deviationBonus = 0;
            const compParts = [];

            for (const st of cat.stats) {
                const srcVal = getStatVal(source, st);
                const compVal = getStatVal(comparisonSource, st);
                if (compVal === 0) continue;

                let diff;
                if (st.includes('%')) {
                    diff = srcVal - compVal; // percentage point difference
                    if (Math.abs(diff) >= 5) deviationBonus += 2;
                    else if (Math.abs(diff) >= 3) deviationBonus += 1;
                } else {
                    diff = srcVal - compVal;
                    const pctChange = Math.abs(diff / compVal);
                    if (pctChange >= 0.25) deviationBonus += 2; // 25%+ change
                    else if (pctChange >= 0.15) deviationBonus += 1; // 15%+ change
                }
                compParts.push(`${fmtStat(st, compVal)} ${st.toLowerCase()}`);
            }

            score += deviationBonus;

            if (compParts.length > 0 && deviationBonus > 0) {
                descParts.push(`(${compLabel}: ${compParts.join(', ')})`);
            }
        }

        // Special boost: ast/stl/to category (08/28/88) is interesting when AST/TO ratio is high
        if (cat.suffix.endsWith('8') && cat.stats.includes('AST') && cat.stats.includes('TO')) {
            const ast = getStatVal(source, 'AST');
            const to = getStatVal(source, 'TO');
            if (to > 0 && ast / to >= 2.5) score += 2;
        }

        if (score > 0) {
            scored.push({
                ...cat,
                score,
                code: `${prefix}${cat.suffix}`,
                desc: descParts.join(' / ')
            });
        }
    }

    return scored;
}

// --- PREGAME: PICK BEST 2-3 CATEGORIES (spread across groups) ---
function pickBestCategories(scoredCategories) {
    if (scoredCategories.length === 0) return [];

    // Sort by score descending
    scoredCategories.sort((a, b) => b.score - a.score);

    const picked = [];
    const usedGroups = new Set();

    // First pass: pick top from each unique group
    for (const cat of scoredCategories) {
        if (picked.length >= 3) break;
        if (!usedGroups.has(cat.group)) {
            picked.push(cat);
            usedGroups.add(cat.group);
        }
    }

    // Second pass: if under 3, fill with remaining highest scoring
    if (picked.length < 2) {
        for (const cat of scoredCategories) {
            if (picked.length >= 2) break;
            if (!picked.includes(cat)) {
                picked.push(cat);
            }
        }
    }

    return picked.slice(0, 3).map(c => ({
        code: c.code,
        title: c.title,
        desc: c.desc
    }));
}

// --- API ENDPOINTS ---

// NEW: Endpoint to populate the 30 teams for the Pregame dropdown
app.get('/api/teams', async (req, res) => {
    try {
        const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/teams?limit=30`);
        const data = await response.json();
        const teams = data.sports[0].leagues[0].teams.map(t => ({ id: t.team.id, name: t.team.displayName, abbrev: t.team.abbreviation }));
        teams.sort((a, b) => a.name.localeCompare(b.name));
        res.json(teams);
    } catch (err) { 
        res.status(500).json({ error: "Failed to fetch teams" }); 
    }
});

// Endpoint to process the Pregame Matchup (real ESPN data)
app.get('/api/pregame', async (req, res) => {
    try {
        const { away, home } = req.query;
        if (!away || !home) return res.status(400).json({ error: "Missing teams" });

        const processTeam = async (teamId, isHome) => {
            const response = await fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/teams/${teamId}?enable=roster`);
            const data = await response.json();
            const teamInfo = data.team;
            const athletes = teamInfo.athletes || [];
            const teamPrefix = isHome ? "2" : "1";

            // Filter out injured players
            const active = athletes.filter(ath => {
                if (ath.injuries && ath.injuries.length > 0) {
                    return !ath.injuries.some(i => ['out', 'injured reserve'].includes(i.status.toLowerCase()));
                }
                return true;
            });

            // Fetch real stats for all active players (batch in groups of 5)
            const processedPlayers = [];
            for (let i = 0; i < active.length; i += 5) {
                const batch = active.slice(i, i + 5);
                const results = await Promise.all(batch.map(async (ath) => {
                    const athleteId = ath.id;
                    let jerseyStr = ath.jersey || "00";
                    if (jerseyStr.length === 1) jerseyStr = "0" + jerseyStr;
                    const prefix = `${teamPrefix}00${jerseyStr}`;

                    const playerData = await fetchPlayerStats(athleteId);
                    if (!playerData) return null;

                    const { season, career } = parseSeasonAndCareer(playerData.statsData);
                    const { last5, lastGame } = parseLast5AndLastGame(playerData.logData);

                    if (!season || (season.GP || 0) < 5) return null; // Skip players with very few games

                    const scored = scoreCategories(season, career, last5, lastGame, prefix);
                    const storylines = pickBestCategories(scored);

                    if (storylines.length === 0) return null;

                    return {
                        name: ath.fullName,
                        jersey: ath.jersey || "00",
                        storylines
                    };
                }));
                results.forEach(r => { if (r) processedPlayers.push(r); });
            }

            return { team: teamInfo.displayName, color: teamInfo.color || "333333", isHome, players: processedPlayers };
        };

        const [awayTeam, homeTeam] = await Promise.all([processTeam(away, false), processTeam(home, true)]);
        res.json({ teams: [awayTeam, homeTeam] });
    } catch (error) {
        console.error("Error processing pregame:", error);
        res.status(500).json({ error: "Failed to process pregame" });
    }
});

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

        const competition = data.header?.competitions?.[0];
        const competitors = competition?.competitors || [];
        
        // --- GRAB LIVE GAME SCORE & CLOCK ---
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

                    // --- CALCULATE PLAYER CODE ---
                    let jNum = parseInt(jersey);
                    if (isNaN(jNum)) jNum = 0; // Handle missing or weird jerseys
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
                            playerCode: playerCode, // Send the code to the frontend
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

        // Return gameInfo along with the teams
        res.json({ gameInfo: gameInfo, teams: processedTeams });

    } catch (error) {
        console.error("Error processing game:", error);
        res.status(500).json({ error: "Failed to process game" });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
