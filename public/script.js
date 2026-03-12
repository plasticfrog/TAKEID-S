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

// --- POPULATE LIVE GAMES ---
const gameSelect = document.getElementById('gameSelect');
fetch('/api/games').then(res => res.json()).then(games => {
    gameSelect.innerHTML = '<option value="">-- Select a Live Game --</option>';
    games.forEach(g => { gameSelect.insertAdjacentHTML('beforeend', `<option value="${g.id}">${g.shortName} (${g.status})</option>`); });
});

// --- POPULATE ALL 30 TEAMS FOR PREGAME ---
const awaySelect = document.getElementById('awayTeamSelect');
const homeSelect = document.getElementById('homeTeamSelect');
fetch('/api/teams').then(res => res.json()).then(teams => {
    teams.forEach(t => {
        const opt = `<option value="${t.id}">${t.name}</option>`;
        awaySelect.insertAdjacentHTML('beforeend', opt);
        homeSelect.insertAdjacentHTML('beforeend', opt);
    });
});

// --- PREGAME LOGIC ---
const pregameResults = document.getElementById('pregameResults');
const pregameStatus = document.getElementById('pregameStatus');

document.getElementById('pregameBtn').addEventListener('click', async () => {
    const awayId = awaySelect.value;
    const homeId = homeSelect.value;
    if (!awayId || !homeId) return alert("Select both an Away and Home team!");
    
    pregameStatus.textContent = "Scanning rosters for historical anomalies...";
    pregameResults.innerHTML = '';
    
    try {
        const res = await fetch(`/api/pregame?away=${awayId}&home=${homeId}`);
        const data = await res.json();
        
        data.teams.forEach(team => {
            const teamDiv = document.createElement('div');
            teamDiv.classList.add('team-block');
            teamDiv.innerHTML = `<div class="team-header" style="background-color: #${team.color};"><h3>${team.team} ${team.isHome ? "(HOME)" : "(AWAY)"}</h3></div>`;
            
            const table = document.createElement('table');
            table.classList.add('tracker-table');
            table.innerHTML = `<tr><th width="35%">Player</th><th>Suggested Graphics</th></tr>`;
            
            team.players.forEach(p => {
                const storiesHtml = p.storylines.map(s => `
                    <div class="match-badge compact-badge">
                        <div class="badge-row">
                            <span class="match-cat"><b>${s.title}</b>: ${s.desc}</span>
                            <span class="match-id">${s.code}</span>
                        </div>
                    </div>
                `).join('');

                table.insertAdjacentHTML('beforeend', `<tr><td class="player-name"><div><span class="jersey">#${p.jersey}</span> ${p.name}</div></td><td class="match-cell">${storiesHtml}</td></tr>`);
            });
            teamDiv.appendChild(table);
            pregameResults.appendChild(teamDiv);
        });
        pregameStatus.textContent = "Storylines Generated.";
    } catch (err) { pregameStatus.textContent = "Error generating storylines."; }
});

// --- LIVE TRACKER LOGIC ---
// [Kept exactly the same as your previous working version]
window.switchTab = function(tabName) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabName + '-view').style.display = 'block';
    const buttons = document.querySelectorAll('.tab-btn');
    if(tabName === 'search') buttons[0].classList.add('active');
    else if(tabName === 'pregame') buttons[1].classList.add('active');
    else buttons[2].classList.add('active');
};
