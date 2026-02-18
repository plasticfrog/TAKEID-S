let dataset = [];

// Load Search Data
fetch('data.json')
    .then(response => response.json())
    .then(data => { dataset = data; });

// --- SEARCH LOGIC (No Changes) ---
const searchInput = document.getElementById('searchInput');
const resultsList = document.getElementById('resultsList');

searchInput.addEventListener('keyup', (e) => {
    let query = e.target.value.toLowerCase().replace(/\//g, ' ').trim();
    query = query.split(' ').map(word => word.replace(/s$/, '')).join(' '); 
    resultsList.innerHTML = ''; 

    if (query.length === 0) { resultsList.style.display = 'none'; return; }

    const matches = dataset.filter(item => {
        const cleanCategory = item.category.toLowerCase().replace(/\//g, ' ');
        const searchWords = query.split(' ').filter(w => w.length > 0);
        const categoryMatch = searchWords.every(word => cleanCategory.includes(word));
        return categoryMatch || item.id.includes(query);
    });

    if (matches.length > 0) {
        resultsList.style.display = 'block';
        matches.forEach(match => {
            const div = document.createElement('div');
            div.classList.add('result-item');
            div.innerHTML = `<span class="category-text">${match.category}</span><span class="take-id">${match.id}</span>`;
            div.addEventListener('click', () => {
                searchInput.value = match.category;
                resultsList.style.display = 'none';
            });
            resultsList.appendChild(div);
        });
    } else {
        resultsList.style.display = 'none';
    }
});

// --- TRACKER LOGIC ---
const gameSelect = document.getElementById('gameSelect');
const trackerResults = document.getElementById('trackerResults');
const statusText = document.getElementById('statusText');
let trackingInterval = null;

// Fetch Games
fetch('/api/games')
    .then(res => res.json())
    .then(games => {
        gameSelect.innerHTML = '<option value="">-- Select a Live Game --</option>';
        games.forEach(g => {
            const option = document.createElement('option');
            option.value = g.id;
            option.textContent = `${g.shortName} (${g.status})`;
            gameSelect.appendChild(option);
        });
    })
    .catch(err => {
        gameSelect.innerHTML = '<option>Error loading games</option>';
    });

// Handle Selection
gameSelect.addEventListener('change', () => {
    const gameId = gameSelect.value;
    if (trackingInterval) clearInterval(trackingInterval);
    
    if (gameId) {
        statusText.textContent = "Fetching live data...";
        updateTracker(gameId); 
        // 200 Seconds = 200,000 milliseconds
        trackingInterval = setInterval(() => updateTracker(gameId), 200000); 
    } else {
        trackerResults.innerHTML = '';
        statusText.textContent = "Select a game to start tracking...";
    }
});

// Manual Refresh
document.getElementById('refreshBtn').addEventListener('click', () => {
    if(gameSelect.value) updateTracker(gameSelect.value);
});

async function updateTracker(gameId) {
    try {
        statusText.textContent = `Updating... (${new Date().toLocaleTimeString()})`;
        const res = await fetch(`/api/game/${gameId}`);
        const data = await res.json();
        renderTracker(data.teams);
        statusText.textContent = `Last Updated: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
        statusText.textContent = "Error fetching data.";
    }
}

function renderTracker(teams) {
    trackerResults.innerHTML = '';
    
    teams.forEach(team => {
        if(team.players.length === 0) return;

        const teamDiv = document.createElement('div');
        teamDiv.classList.add('team-block');
        teamDiv.innerHTML = `<h3>${team.team}</h3>`;
        
        const table = document.createElement('table');
        table.classList.add('tracker-table');
        table.innerHTML = `<tr><th width="25%">Player</th><th width="35%">Stats</th><th>Best Fits</th></tr>`;
        
        team.players.forEach(p => {
            const row = document.createElement('tr');
            
            // Build the Matches HTML
            let matchesHtml = '';
            if (p.matches && p.matches.length > 0) {
                matchesHtml = p.matches.map(m => 
                    `<div class="match-badge">
                        <span class="match-cat">${m.category}</span>
                        <span class="match-id">${m.id}</span>
                     </div>`
                ).join('');
            } else {
                matchesHtml = '<span class="no-match">-</span>';
            }

            row.innerHTML = `
                <td class="player-name">${p.name}</td>
                <td class="stat-sum">${p.statsSummary}</td>
                <td class="match-cell">${matchesHtml}</td>
            `;
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
    else buttons[1].classList.add('active');
};
