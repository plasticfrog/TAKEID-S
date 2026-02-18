let dataset = [];

// Load data when page loads
fetch('data.json')
    .then(response => response.json())
    .then(data => {
        dataset = data;
    });

const searchInput = document.getElementById('searchInput');
const resultsList = document.getElementById('resultsList');

searchInput.addEventListener('keyup', (e) => {
    // 1. Clean the user input: 
    // - Lowercase it
    // - Replace slashes with spaces (so "pts/reb" is same as "pts reb")
    // - Remove 's' at the end of words (so "blks" matches "blk")
    let query = e.target.value.toLowerCase().replace(/\//g, ' ').trim();
    
    // Remove trailing 's' from words in the query to handle plurals loosely
    query = query.split(' ').map(word => word.replace(/s$/, '')).join(' ');

    resultsList.innerHTML = ''; // Clear previous results

    if (query.length === 0) {
        resultsList.style.display = 'none';
        return;
    }

    // 2. Filter data
    const matches = dataset.filter(item => {
        // Clean the category text for comparison in the same way
        const cleanCategory = item.category.toLowerCase().replace(/\//g, ' ');
        
        // Check if all words in the query exist in the category OR if ID matches
        // This allows "pts reb" to match "PTS / REBS" regardless of order or slashes
        const searchWords = query.split(' ').filter(w => w.length > 0);
        const categoryMatch = searchWords.every(word => cleanCategory.includes(word));
        
        return categoryMatch || item.id.includes(query);
    });

    if (matches.length > 0) {
        resultsList.style.display = 'block';
        matches.forEach(match => {
            const div = document.createElement('div');
            div.classList.add('result-item');
            
            div.innerHTML = `
                <span class="category-text">${match.category}</span>
                <span class="take-id">${match.id}</span>
            `;

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

// Close dropdown if clicking outside
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !resultsList.contains(e.target)) {
        resultsList.style.display = 'none';
    }
});
