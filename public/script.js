let dataset = [];
fetch('data.json').then(r => r.json()).then(d => { dataset = d; });
const searchInput = document.getElementById('searchInput');
const resultsList = document.getElementById('resultsList');

searchInput.addEventListener('keyup', (e) => {
    let query = e.target.value.toLowerCase().replace(/\//g, ' ').trim();
    query = query.split(' ').map(w => w.replace(/s$/, '')).join(' '); 
    resultsList.innerHTML = ''; 
    if (query.length === 0) { resultsList.style.display = 'none'; return; }
    const matches = dataset.filter(item => {
        const cleanCategory = item.category.toLowerCase().replace(/\//g, ' ');
        const searchWords = query.split(' ').filter(w => w.length > 0);
        return searchWords.every(word => cleanCategory.includes(word)) || item.id.includes(query);
    });
    if (matches.length > 0) {
        resultsList.style.display = 'block';
        matches.forEach(match => {
            const div = document.createElement('div');
            div.classList.add('result-item');
            div.innerHTML = `<span class="category-text">${match.category}</span><span class="take-id">${match.id}</span>`;
            div.addEventListener('click', () => { searchInput.value = match.category; resultsList.style.display = 'none'; });
            resultsList.appendChild(div);
        });
    } else { resultsList.style.display = 'none'; }
});

// --- POPULATE DROPDOWNS ---
const gameSelect = document.getElementById('gameSelect');
const pregameSelect = document.getElementById('pregameSelect');

fetch('/api/games')
    .then(res => res.json())
    .then(games => {
        const defaultOpt1 = '<option value="">-- Select a Live Game --</option>';
        const defaultOpt2 = '<option value="">-- Select a Matchup --</option>';
        gameSelect.innerHTML = defaultOpt1;
        pregameSelect.innerHTML = defaultOpt2;
        
        games.forEach(g => {
            const opt1 = document.createElement('option');
            opt1.value = g.id; opt1.textContent = `${g.shortName} (${g.status})`;
            gameSelect.appendChild(opt1);
            
            const opt2 = document.createElement('option');
            opt2.value = g.id; opt2.textContent = `${g.shortName}`;
            pregameSelect.appendChild(opt2);
        });
    });

// --- PREGAME LOGIC ---
const pregameResults = document.getElementById('pregameResults');
const pregameStatus = document.getElementById('pregameStatus');

document.getElementById('pregameBtn').addEventListener('click', async () => {
    const gameId = pregameSelect.value;
    if (!gameId) return;
    
    pregameStatus.textContent = "Scanning for historical anomalies...";
    pregameResults.innerHTML = '';
    
    try {
        const res = await fetch(`/api/pregame/${gameId}`);
        const data = await res.json();
        
        data.teams.forEach(team => {
            const teamDiv = document.createElement('div');
            teamDiv.classList.add('team-block');
            teamDiv.innerHTML = `<div class="team-header" style="background-color: #${team.color};"><h3>${team.team} ${team.isHome ? "(HOME)" : "(AWAY)"}</h3></div>`;
            
            const table = document.createElement('table');
            table.classList.add('tracker-table');
            table.innerHTML = `<tr><th width="30%">Player</th><th>Suggested Graphics & Storylines</th></tr>`;
            
            team.players.forEach(p => {
                const row = document.createElement('tr');
                
                const storiesHtml = p.storylines.map(s => `
                    <div class="match-badge" style="margin-bottom: 6px; flex-direction: column; align-items: flex-start;">
                        <div style="display:flex; justify-content: space-between; width: 100%; margin-bottom: 4px;">
                            <span class="match-cat" style="font-weight: bold;">${s.title}</span>
                            <span class="match-id">${s.code}</span>
                        </div>
                        <span style="font-size: 0.9em; color: #666;">${s.desc}</span>
                    </div>
                `).join('');

                row.innerHTML = `<td class="player-name"><div><span class="jersey">#${p.jersey}</span> ${p.name}</div></td><td class="match-cell">${storiesHtml}</td>`;
                table.appendChild(row);
            });
            
            teamDiv.appendChild(table);
            pregameResults.appendChild(teamDiv);
        });
        pregameStatus.textContent = "Storylines Generated.";
    } catch (err) { pregameStatus.textContent = "Error generating storylines."; }
});

// --- LIVE TRACKER LOGIC ---
const trackerResults = document.getElementById('trackerResults');
const statusText = document.getElementById('statusText');
let trackingInterval = null;

gameSelect.addEventListener('change', () => {
    const gameId = gameSelect.value;
    if (trackingInterval) clearInterval(trackingInterval);
    if (gameId) {
        statusText.textContent = "Fetching live data...";
        updateTracker(gameId); 
        trackingInterval = setInterval(() => updateTracker(gameId), 200000); 
    } else {
        trackerResults.innerHTML = '';
        statusText.textContent = "Select a game to start tracking...";
    }
});

document.getElementById('refreshBtn').addEventListener('click', () => {
    if(gameSelect.value) updateTracker(gameSelect.value);
});

async function updateTracker(gameId) {
    try {
        statusText.textContent = `Updating...`;
        const res = await fetch(`/api/game/${gameId}`);
        const data = await res.json();
        renderTracker(data);
        statusText.textContent = `Last Updated: ${new Date().toLocaleTimeString()}`;
    } catch (err) { statusText.textContent = "Error fetching data."; }
}

function renderTracker(data) {
    trackerResults.innerHTML = '';
    
    if (data.gameInfo) {
        const scoreBoard = document.createElement('div');
        scoreBoard.classList.add('live-scoreboard');
        scoreBoard.innerHTML = `<span class="sb-team">${data.gameInfo.awayAbbrev} ${data.gameInfo.awayScore}</span> <span class="sb-divider">-</span> <span class="sb-team">${data.gameInfo.homeScore} ${data.gameInfo.homeAbbrev}</span><span class="sb-clock">| ${data.gameInfo.status}</span>`;
        trackerResults.appendChild(scoreBoard);
    }

    data.teams.forEach(team => {
        if(team.players.length === 0) return;
        const teamDiv = document.createElement('div');
        teamDiv.classList.add('team-block');
        
        const loc = team.isHome ? "(HOME)" : "(AWAY)";
        teamDiv.innerHTML = `<div class="team-header" style="background-color: #${team.color};"><h3>${team.team} <span class="loc-badge">${loc}</span></h3></div>`;
        
        const table = document.createElement('table');
        table.classList.add('tracker-table');
        table.innerHTML = `<tr><th width="30%">Player</th><th width="30%">Notable Stats</th><th>Best Fits</th></tr>`;
        
        team.players.forEach(p => {
            const row = document.createElement('tr');
            let matchesHtml = p.matches && p.matches.length > 0 
                ? p.matches.map(m => `<div class="match-badge"><span class="match-cat">${m.category}</span><span class="match-id">${m.id}</span></div>`).join('')
                : '<span class="no-match">-</span>';

            row.innerHTML = `<td class="player-name"><div><span class="jersey">#${p.jersey}</span> ${p.name}</div><div class="player-code">Code: ${p.playerCode}</div></td><td class="stat-sum">${p.statsSummary}</td><td class="match-cell">${matchesHtml}</td>`;
            table.appendChild(row);
        });
        teamDiv.appendChild(table);
        trackerResults.appendChild(teamDiv);
    });
}

// --- TABS LOGIC ---
window.switchTab = function(tabName) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabName + '-view').style.display = 'block';
    const buttons = document.querySelectorAll('.tab-btn');
    if(tabName === 'search') buttons[0].classList.add('active');
    else if(tabName === 'pregame') buttons[1].classList.add('active');
    else buttons[2].classList.add('active');
};
