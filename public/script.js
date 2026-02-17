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
    const query = e.target.value.toLowerCase();
    resultsList.innerHTML = ''; // Clear previous results

    if (query.length === 0) {
        resultsList.style.display = 'none';
        return;
    }

    // Filter data: check if category OR id includes the query
    const matches = dataset.filter(item => {
        return item.category.toLowerCase().includes(query) || 
               item.id.includes(query);
    });

    if (matches.length > 0) {
        resultsList.style.display = 'block';
        matches.forEach(match => {
            const div = document.createElement('div');
            div.classList.add('result-item');
            
            // Highlight the text logic (optional, keeping it simple here)
            div.innerHTML = `
                <span class="category-text">${match.category}</span>
                <span class="take-id">${match.id}</span>
            `;

            // If user clicks an item, fill the box
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
