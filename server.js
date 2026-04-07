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

// --- PREGAME: CATEGORY TEMPLATES (full reference sheet) ---
// Priority groups: higher-priority groups get picked first, Season is fallback
const PREGAME_CATEGORIES = [
    // Last 5 Games (20-29) — HIGH PRIORITY (recent trends)
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
    // Last Game (x00__50-54) — HIGH PRIORITY (standout performances)
    { suffix: "50", group: "Last Game", title: "Last Game - pts/reb/ast/min", stats: ["PTS","REB","AST","MIN"] },
    { suffix: "51", group: "Last Game", title: "Last Game - pts/fgm-fga/reb/min", stats: ["PTS","FG","REB","MIN"] },
    { suffix: "52", group: "Last Game", title: "Last Game - pts/fgm-fga/ast/min", stats: ["PTS","FG","AST","MIN"] },
    { suffix: "53", group: "Last Game", title: "Last Game - fgm-fga/ftm-fta/pts", stats: ["FG","FT","PTS"] },
    { suffix: "54", group: "Last Game", title: "Last Game - fgm-fga/3ptm-3pta/pts", stats: ["FG","3PT","PTS"] },
    // Additional Last Game (x01__50-59)
    { suffix: "1_50", group: "Last Game", title: "Last Game - pts/reb/ast", stats: ["PTS","REB","AST"] },
    { suffix: "1_51", group: "Last Game", title: "Last Game - pts/reb/fgm-fga", stats: ["PTS","REB","FG"] },
    { suffix: "1_52", group: "Last Game", title: "Last Game - pts/ast/stl", stats: ["PTS","AST","STL"] },
    { suffix: "1_55", group: "Last Game", title: "Last Game - min/pts/ast", stats: ["MIN","PTS","AST"] },
    { suffix: "1_56", group: "Last Game", title: "Last Game - pts/ast/fgm-fga", stats: ["PTS","AST","FG"] },
    { suffix: "1_57", group: "Last Game", title: "Last Game - pts/ast/to", stats: ["PTS","AST","TO"] },
    // Career Averages (80-89) — MEDIUM PRIORITY (notable career numbers)
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
    // Last Game vs Opponent (x00__55-59) — HIGH PRIORITY if data available
    { suffix: "55", group: "Last vs Opp", title: "Last Game vs. Opp - pts/reb/ast/min", stats: ["PTS","REB","AST","MIN"] },
    { suffix: "56", group: "Last vs Opp", title: "Last Game vs. Opp - pts/fgm-fga/reb/min", stats: ["PTS","FG","REB","MIN"] },
    { suffix: "57", group: "Last vs Opp", title: "Last Game vs. Opp - pts/fgm-fga/ast/smin", stats: ["PTS","FG","AST","MIN"] },
    { suffix: "58", group: "Last vs Opp", title: "Last Game vs. Opp - fgm-fga/ftm-fta/pts", stats: ["FG","FT","PTS"] },
    { suffix: "59", group: "Last vs Opp", title: "Last Game vs. Opp - fgm-fga/3ptm-3pta/pts", stats: ["FG","3PT","PTS"] },
    // Bio (77-79)
    { suffix: "77", group: "Bio", title: "Bio - Age/Ht/Wt/College/Years Pro", stats: [] },
    { suffix: "78", group: "Bio", title: "Draft - Team/Year/Round/College/Pick", stats: [] },
    { suffix: "79", group: "Bio", title: "Experience - NBA Exp/Team Exp", stats: [] },
    // Season Averages (00-09) — LOWEST PRIORITY (fallback only)
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
    // Additional Season Averages (x01__00-09)
    { suffix: "1_00", group: "Season", title: "Season - pts/ast/reb", stats: ["PTS","AST","REB"] },
    { suffix: "1_01", group: "Season", title: "Season - pts/ast/to", stats: ["PTS","AST","TO"] },
    { suffix: "1_02", group: "Season", title: "Season - pts/reb/blk", stats: ["PTS","REB","BLK"] },
    { suffix: "1_03", group: "Season", title: "Season - min/pts/fg%", stats: ["MIN","PTS","FG%"] },
    { suffix: "1_04", group: "Season", title: "Season - min/pts/to", stats: ["MIN","PTS","TO"] },
    { suffix: "1_05", group: "Season", title: "Season - pts/reb/to", stats: ["PTS","REB","TO"] },
    { suffix: "1_06", group: "Season", title: "Season - pts/reb/3pt%", stats: ["PTS","REB","3P%"] },
    { suffix: "1_07", group: "Season", title: "Season - pts/ast/3pt%", stats: ["PTS","AST","3P%"] },
    { suffix: "1_08", group: "Season", title: "Season - pts/reb/ft%", stats: ["PTS","REB","FT%"] },
    { suffix: "1_09", group: "Season", title: "Season - pts/ast/ft%", stats: ["PTS","AST","FT%"] },
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
    const avgCat = (statsData.categories || []).find(c => c.name === 'averages');
    if (!avgCat) return { season: null, career: null };

    const labels = avgCat.labels || [];
    const seasons = avgCat.statistics || [];
    const careerRaw = avgCat.totals || [];

    const mapRow = (row) => {
        const obj = {};
        labels.forEach((label, i) => {
            let val = row[i];
            if (typeof val === 'string' && val.includes('-')) val = val.split('-')[0];
            obj[label] = parseFloat(val) || 0;
        });
        return obj;
    };

    const currentSeason = seasons.length > 0 ? mapRow(seasons[seasons.length - 1].stats) : null;
    const career = careerRaw.length > 0 ? mapRow(careerRaw) : null;

    return { season: currentSeason, career };
}

function parseLast5AndLastGame(logData, opponentAbbrev) {
    const seasonType = (logData.seasonTypes || [])[0];
    if (!seasonType) return { last5: null, lastGame: null, lastVsOpp: null };

    const labels = logData.labels || [];

    // Collect all games in order (months are reverse chronological)
    const allGames = [];
    for (const month of (seasonType.categories || [])) {
        for (const ev of (month.events || [])) {
            allGames.push(ev);
        }
    }
    if (allGames.length === 0) return { last5: null, lastGame: null, lastVsOpp: null };

    const mapGame = (ev) => {
        const obj = {};
        labels.forEach((label, i) => {
            let val = ev.stats[i];
            if (label === 'FG' || label === '3PT' || label === 'FT') {
                obj[label + '_STR'] = val;
                obj[label] = parseFloat((val || '0').split('-')[0]) || 0;
            } else {
                obj[label] = parseFloat(val) || 0;
            }
        });
        const meta = (logData.events || {})[ev.eventId];
        if (meta) {
            obj._opponent = meta.opponent?.abbreviation || '?';
            obj._result = meta.gameResult || '?';
            obj._date = meta.gameDate || '';
        }
        return obj;
    };

    const mappedGames = allGames.map(mapGame);
    const lastGame = mappedGames[0];
    const last5Raw = mappedGames.slice(0, 5);

    // Find last game vs this specific opponent
    let lastVsOpp = null;
    if (opponentAbbrev) {
        lastVsOpp = mappedGames.find(g => g._opponent === opponentAbbrev) || null;
    }

    // Average the last 5
    const last5 = {};
    if (last5Raw.length > 0) {
        const numericKeys = labels.filter(l => !['FG','3PT','FT'].includes(l));
        numericKeys.forEach(key => {
            last5[key] = parseFloat((last5Raw.reduce((s, g) => s + g[key], 0) / last5Raw.length).toFixed(1));
        });
        ['FG','3PT','FT'].forEach(key => {
            last5[key] = parseFloat((last5Raw.reduce((s, g) => s + g[key], 0) / last5Raw.length).toFixed(1));
        });
        ['FG','3PT','FT'].forEach(key => {
            const pctLabel = key === 'FG' ? 'FG%' : key === '3PT' ? '3P%' : 'FT%';
            const totalMade = last5Raw.reduce((s, g) => s + parseFloat((g[key + '_STR'] || '0').split('-')[0] || 0), 0);
            const totalAtt = last5Raw.reduce((s, g) => s + parseFloat((g[key + '_STR'] || '0-0').split('-')[1] || 0), 0);
            if (totalAtt > 0) last5[pctLabel] = parseFloat(((totalMade / totalAtt) * 100).toFixed(1));
        });
    }

    return { last5, lastGame, lastVsOpp, last5Raw };
}

// --- PREGAME: SCORE CATEGORIES FOR A PLAYER ---
function scoreCategories(season, career, last5, lastGame, lastVsOpp, prefix) {
    if (!season) return [];

    // How impressive a stat value is (used for base scoring)
    // Percentage stats score LOWER — they're easy for everyone to hit and
    // shouldn't dominate category selection. Counting stats (pts/reb/ast) are
    // what make a graphic interesting.
    const impressive = {
        PTS: [{ min: 25, s: 3 }, { min: 18, s: 2 }, { min: 12, s: 1 }],
        REB: [{ min: 10, s: 3 }, { min: 7, s: 2 }, { min: 5, s: 1 }],
        AST: [{ min: 8, s: 3 }, { min: 5, s: 2 }, { min: 3, s: 1 }],
        STL: [{ min: 2, s: 3 }, { min: 1.3, s: 2 }, { min: 0.8, s: 1 }],
        BLK: [{ min: 2, s: 3 }, { min: 1.2, s: 2 }, { min: 0.7, s: 1 }],
        "FG%": [{ min: 55, s: 2 }, { min: 50, s: 1 }],
        "3P%": [{ min: 42, s: 2 }, { min: 38, s: 1 }],
        "FT%": [{ min: 90, s: 2 }, { min: 85, s: 1 }],
        MIN: [{ min: 34, s: 2 }, { min: 28, s: 1 }],
        TO: [{ min: 0, s: 0 }],
        FG: [{ min: 10, s: 3 }, { min: 7, s: 2 }, { min: 4, s: 1 }],
        "3PT": [{ min: 4, s: 3 }, { min: 3, s: 2 }, { min: 2, s: 1 }],
        FT: [{ min: 8, s: 3 }, { min: 5, s: 2 }, { min: 3, s: 1 }],
    };

    // Stats that are percentages — categories with ONLY these are less useful
    const PCT_STATS = new Set(["FG%", "3P%", "FT%"]);

    function statScore(statName, value, sourcePts) {
        // Percentage stats are ONLY impressive if the player has real volume.
        // A bench guy going 2/2 (100% FG) isn't interesting — need at least 10 pts to care about shooting %
        if (PCT_STATS.has(statName) && sourcePts < 10) return 0;
        const tiers = impressive[statName];
        if (!tiers) return 0;
        for (const t of tiers) { if (value >= t.min) return t.s; }
        return 0;
    }

    function v(source, statName) { return (source && source[statName]) || 0; }

    function fmt(statName, value) {
        if (statName.includes('%')) return `${value}%`;
        return `${value}`;
    }

    const scored = [];

    for (const cat of PREGAME_CATEGORIES) {
        // Bio categories always available as fallback
        if (cat.group === "Bio") {
            scored.push({ ...cat, score: 0.5, code: `${prefix}${cat.suffix}`, desc: cat.title.split(' - ')[1] || cat.title });
            continue;
        }

        // Determine data source for this group
        let source;
        if (cat.group === "Last 5") source = last5;
        else if (cat.group === "Last Game") source = lastGame;
        else if (cat.group === "Last vs Opp") source = lastVsOpp;
        else if (cat.group === "Career") source = career;
        else if (cat.group === "Season") source = season;

        if (!source) continue;

        // --- BASE SCORE: how impressive are the raw stat values ---
        let score = 0;
        const descParts = [];
        const sourcePts = v(source, 'PTS'); // Volume check — % stats only matter if real scoring

        for (const st of cat.stats) {
            const val = v(source, st);
            score += statScore(st, val, sourcePts);
            descParts.push(`${fmt(st, val)} ${st.toLowerCase()}`);
        }

        // Penalize categories where ALL stats are percentages (e.g. fg%/ft%/3-pt%)
        // These are boring — most players hit decent percentages. Prefer pts/reb/ast.
        const countingStats = cat.stats.filter(s => !PCT_STATS.has(s));
        if (countingStats.length === 0 && cat.stats.length > 0) {
            score = Math.floor(score * 0.3); // Heavy penalty — percentage-only categories rarely interesting
        }

        // Save the raw base score BEFORE any bonuses — this is the "are these stats actually good?" check
        const baseScore = score;

        // --- DEVIATION BONUS for L5/Last Game/Career (compared to season) ---
        // Season categories get NO comparison bonus — they're just fallback numbers
        // Only apply deviation bonus if the base stats are already at least somewhat notable
        if (cat.group !== "Season" && cat.group !== "Bio" && cat.group !== "Last vs Opp" && baseScore >= 2) {
            let devBonus = 0;
            for (const st of cat.stats) {
                const srcVal = v(source, st);
                const seasonVal = v(season, st);
                if (seasonVal === 0) continue;

                if (st.includes('%')) {
                    const diff = Math.abs(srcVal - seasonVal);
                    if (diff >= 5) devBonus += 2;
                    else if (diff >= 3) devBonus += 1;
                } else {
                    const pctChange = Math.abs((srcVal - seasonVal) / seasonVal);
                    if (pctChange >= 0.25) devBonus += 2;
                    else if (pctChange >= 0.15) devBonus += 1;
                }
            }
            score += devBonus;

            // Add season comparison in desc ONLY if there's a notable deviation
            if (devBonus > 0) {
                const compParts = cat.stats.map(st => `${fmt(st, v(season, st))} ${st.toLowerCase()}`);
                descParts.push(`(Season: ${compParts.join(', ')})`);
            }
        }

        // --- SPECIAL: Last vs Opp — only show if the stat line is actually impressive ---
        if (cat.group === "Last vs Opp" && lastVsOpp) {
            if (baseScore >= 3) { // Need genuinely good stats (e.g. 15+ pts, or 10+ reb with other stats)
                score += 3;
            } else {
                score = 0; // Kill weak lines — "6 pts 0 ast" vs opponent isn't worth a graphic
            }
            if (score > 0 && lastVsOpp._opponent) {
                descParts.push(`(vs ${lastVsOpp._opponent})`);
            }
        }

        // --- SPECIAL: Last Game — only show if it was a standout performance ---
        if (cat.group === "Last Game") {
            const pts = v(lastGame, 'PTS');
            const reb = v(lastGame, 'REB');
            const ast = v(lastGame, 'AST');
            if (pts >= 25) score += 3;
            else if (pts >= 20) score += 2;
            else if (pts >= 15 && (reb >= 7 || ast >= 7)) score += 2;
            else if (baseScore < 3) score = 0; // Kill weak last game lines — need real stats to show
            if (reb >= 10 || ast >= 10) score += 1;
            if (score > 0 && lastGame._opponent) {
                descParts.push(`(vs ${lastGame._opponent})`);
            }
        }

        // --- SPECIAL: Career — boost if season significantly differs from career ---
        // Only meaningful for players with real career numbers (10+ pts career avg)
        if (cat.group === "Career") {
            let careerBonus = 0;
            const careerPts = v(career, 'PTS');
            if (careerPts >= 10) { // Only worth highlighting career stats for real contributors
                for (const st of cat.stats) {
                    if (PCT_STATS.has(st)) continue; // Don't bonus for percentage deviations
                    const careerVal = v(career, st);
                    const seasonVal = v(season, st);
                    if (careerVal === 0) continue;
                    const diff = Math.abs((seasonVal - careerVal) / careerVal);
                    if (diff >= 0.30) careerBonus += 2; // Need BIG difference to justify career graphic
                    else if (diff >= 0.20) careerBonus += 1;
                }
            }
            score += careerBonus;
            if (careerBonus > 0) {
                const seasonParts = cat.stats.map(st => `${fmt(st, v(season, st))} ${st.toLowerCase()}`);
                descParts.push(`(This Season: ${seasonParts.join(', ')})`);
            }
        }

        // --- SPECIAL: AST/TO ratio boost ---
        if (cat.stats.includes('AST') && cat.stats.includes('TO')) {
            const ast = v(source, 'AST');
            const to = v(source, 'TO');
            if (to > 0 && ast / to >= 2.5) score += 2;
        }

        // Season categories keep their natural score — no artificial penalty.
        // They'll only appear when higher-priority groups don't meet the quality bar.
        // Boost pts/reb/ast Season category slightly so it's the default fallback
        if (cat.group === "Season" && cat.suffix === "00") {
            score += 0.5;
        }

        if (score > 0) {
            scored.push({
                ...cat, score,
                code: `${prefix}${cat.suffix}`,
                desc: descParts.join(' / ')
            });
        }
    }

    return scored;
}

// --- PREGAME: PICK BEST 2-3 CATEGORIES ---
// Priority: Last vs Opp > Last Game > Last 5 > Career > Season > Bio
function pickBestCategories(scoredCategories) {
    if (scoredCategories.length === 0) return [];

    const groupPriority = { "Last vs Opp": 0, "Last Game": 1, "Last 5": 2, "Career": 3, "Season": 4, "Bio": 5 };

    // Sort by score descending — the quality threshold in the pick logic
    // handles filtering out weak lines, so best stats float to the top
    scoredCategories.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Tiebreak: prefer higher-priority groups
        const pa = groupPriority[a.group] ?? 99;
        const pb = groupPriority[b.group] ?? 99;
        return pa - pb;
    });

    const picked = [];
    const usedGroups = new Set();

    // Only pick non-Season/non-Bio categories if the stats are genuinely impressive.
    // Bench players with weak numbers should just show Season averages + Bio.
    const MIN_QUALITY = 5; // Must have genuinely strong stats to justify L5/LastGame/Career/vsOpp

    // Prefer categories with counting stats (pts/reb/ast) over percentage-heavy ones
    function hasCounting(cat) {
        return cat.stats.some(s => !["FG%","3P%","FT%","MIN","TO"].includes(s));
    }

    // First pass: pick impressive non-Season categories (one per group, highest score first)
    // Prefer counting-stat categories over percentage-heavy ones
    for (const cat of scoredCategories) {
        if (picked.length >= 3) break;
        if (cat.group === "Bio" || cat.group === "Season") continue;
        if (cat.score < MIN_QUALITY) continue;
        if (!hasCounting(cat)) continue; // Skip percentage-only categories in first pass
        if (!usedGroups.has(cat.group)) {
            picked.push(cat);
            usedGroups.add(cat.group);
        }
    }

    // Second pass: fill with more impressive categories (allow same group, allow % cats now)
    for (const cat of scoredCategories) {
        if (picked.length >= 3) break;
        if (picked.includes(cat)) continue;
        if (cat.group === "Bio" || cat.group === "Season") continue;
        if (cat.score < MIN_QUALITY) continue;
        picked.push(cat);
    }

    // Third pass: fill remaining with best Season categories
    // Prefer the pts/reb/ast category (suffix "00") as the clean default
    const seasonCats = scoredCategories.filter(c => c.group === "Season" && !picked.includes(c));
    seasonCats.sort((a, b) => {
        // Prefer pts/reb/ast (suffix "00") as the default Season graphic
        if (a.suffix === "00") return -1;
        if (b.suffix === "00") return 1;
        // Then prefer categories with counting stats over percentage ones
        const aC = hasCounting(a) ? 0 : 1;
        const bC = hasCounting(b) ? 0 : 1;
        if (aC !== bC) return aC - bC;
        return b.score - a.score;
    });
    for (const cat of seasonCats) {
        if (picked.length >= 3) break;
        picked.push(cat);
    }

    // Fallback: if still under 2, add Bio
    while (picked.length < 2) {
        const bio = scoredCategories.find(c => c.group === "Bio" && !picked.includes(c));
        if (bio) picked.push(bio);
        else break;
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

        // Fetch both rosters to get team abbreviations for opponent lookups
        const [awayRes, homeRes] = await Promise.all([
            fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/teams/${away}?enable=roster`),
            fetch(`http://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUE}/teams/${home}?enable=roster`)
        ]);
        const awayData = (await awayRes.json()).team;
        const homeData = (await homeRes.json()).team;
        const awayAbbrev = awayData.abbreviation;
        const homeAbbrev = homeData.abbreviation;

        const processTeam = async (teamInfo, isHome, opponentAbbrev) => {
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
                    const { last5, lastGame, lastVsOpp } = parseLast5AndLastGame(playerData.logData, opponentAbbrev);

                    if (!season || (season.GP || 0) < 5) return null;

                    const scored = scoreCategories(season, career, last5, lastGame, lastVsOpp, prefix);
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

        // Away team's opponent is the home team, and vice versa
        const [awayTeam, homeTeam] = await Promise.all([
            processTeam(awayData, false, homeAbbrev),
            processTeam(homeData, true, awayAbbrev)
        ]);
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
