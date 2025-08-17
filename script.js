console.log('Script loaded!'); // This should appear in console if working

class LootboxApp {
    constructor() {
        this.lootboxes = this.loadLootboxes();
        this.currentLootbox = null;
        this.editingIndex = -1;
        this.sessionHistory = [];
        
        this.initializeApp();
    }

    initializeApp() {
        console.log('App initializing...');
        this.renderLootboxes();
        this.attachEventListeners();
        
        // Add default lootbox if none exist
        if (this.lootboxes.length === 0) {
            this.lootboxes.push({
                name: 'Sample Lootbox',
                items: [
                    { name: 'Common Item', odds: 0.6 },
                    { name: 'Rare Item', odds: 0.3 },
                    { name: 'Epic Item', odds: 0.1 }
                ],
                revealContents: true,
                revealOdds: true,
                maxTries: "unlimited",
                remainingTries: "unlimited",
                spins: 0,
                lastUsed: new Date().toISOString()
            });
            this.saveLootboxes();
            this.renderLootboxes();
        }
    }

    attachEventListeners() {
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filterLootboxes(e.target.dataset.filter);
            });
        });

        // Modal checkbox listeners
        const unlimitedTries = document.getElementById('unlimitedTries');
        if (unlimitedTries) {
            unlimitedTries.addEventListener('change', (e) => {
                document.getElementById('maxTriesGroup').style.display = e.target.checked ? 'none' : 'block';
            });
        }

        // Modal close on backdrop click
        const editModal = document.getElementById('editModal');
        if (editModal) {
            editModal.addEventListener('click', (e) => {
                if (e.target.id === 'editModal') {
                    this.closeModal();
                }
            });
        }
    }

    renderLootboxes() {
        const grid = document.getElementById('lootboxGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (!grid || !emptyState) return;
        
        if (this.lootboxes.length === 0) {
            grid.style.display = 'none';
            emptyState.classList.remove('hidden');
            return;
        }

        grid.style.display = 'grid';
        emptyState.classList.add('hidden');
        
        grid.innerHTML = this.lootboxes.map((lootbox, index) => `
            <div class="lootbox-card" onclick="app.openLootbox(${index})">
                <div class="lootbox-preview"></div>
                <div class="lootbox-info">
                    <h3>${lootbox.name}</h3>
                    <div class="lootbox-stats">
                        <span>Spins: ${lootbox.spins || 0}</span>
                        <span>Used: ${lootbox.lastUsed ? this.timeAgo(lootbox.lastUsed) : 'Never'}</span>
                    </div>
                    <div class="lootbox-actions">
                        <button class="action-btn" onclick="event.stopPropagation(); app.editLootbox(${index})">⚙</button>
                        <button class="action-btn" onclick="event.stopPropagation(); app.shareLootbox(${index})">🔗</button>
                        <button class="action-btn" onclick="event.stopPropagation(); app.deleteLootbox(${index})">🗑</button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    openLootbox(index) {
        this.currentLootbox = this.lootboxes[index];
        this.currentLootboxIndex = index;
        
        document.getElementById('listView').classList.add('hidden');
        document.getElementById('lootboxView').classList.remove('hidden');
        
        this.renderLootboxView();
    }

    renderLootboxView() {
        const titleEl = document.getElementById('lootboxTitle');
        const triesInfo = document.getElementById('triesInfo');
        const circle = document.getElementById('lootboxCircle');
        const itemsContainer = document.getElementById('lootboxItems');
        
        if (titleEl) titleEl.textContent = this.currentLootbox.name;
        
        // Update tries info
        if (triesInfo) {
            if (this.currentLootbox.maxTries === "unlimited") {
                triesInfo.textContent = "Unlimited tries";
            } else {
                triesInfo.textContent = `Tries remaining: ${this.currentLootbox.remainingTries}`;
            }
        }
        
        // Generate colors for lootbox circle based on items
        if (circle && this.currentLootbox.items.length > 0) {
            const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#fd79a8', '#fdcb6e', '#e84393'];
            const gradientStops = this.currentLootbox.items.map((item, i) => {
                const startAngle = (360 / this.currentLootbox.items.length) * i;
                const endAngle = (360 / this.currentLootbox.items.length) * (i + 1);
                return `${colors[i % colors.length]} ${startAngle}deg ${endAngle}deg`;
            }).join(', ');
            
            circle.style.background = `conic-gradient(from 0deg, ${gradientStops})`;
            circle.onclick = () => this.spinLootbox();
        }
        
        // Render items if content should be revealed
        if (itemsContainer) {
            if (this.currentLootbox.revealContents) {
                itemsContainer.innerHTML = this.currentLootbox.items.map(item => `
                    <div class="lootbox-item">
                        <div class="item-name">${item.name}</div>
                        ${this.currentLootbox.revealOdds ? `<div class="item-odds">${(item.odds * 100).toFixed(1)}%</div>` : ''}
                    </div>
                `).join('');
            } else {
                itemsContainer.innerHTML = '';
            }
        }
    }

    spinLootbox() {
        // Check if can spin
        if (this.currentLootbox.maxTries !== "unlimited" && this.currentLootbox.remainingTries <= 0) {
            alert('No tries remaining!');
            return;
        }

        // Validate odds
        const totalOdds = this.currentLootbox.items.reduce((sum, item) => sum + item.odds, 0);
        if (Math.abs(totalOdds - 1.0) > 0.001) {
            if (!confirm('Warning: Odds do not add up to 1. Results may not be accurate. Continue anyway?')) {
                return;
            }
        }

        // Roll for item
        const random = Math.random();
        let cumulativeOdds = 0;
        let result = null;

        for (const item of this.currentLootbox.items) {
            cumulativeOdds += item.odds;
            if (random <= cumulativeOdds) {
                result = item.name;
                break;
            }
        }

        if (!result) {
            result = this.currentLootbox.items[this.currentLootbox.items.length - 1]?.name || 'Nothing';
        }

        // Update statistics
        this.currentLootbox.spins = (this.currentLootbox.spins || 0) + 1;
        this.currentLootbox.lastUsed = new Date().toISOString();
        
        if (this.currentLootbox.maxTries !== "unlimited") {
            this.currentLootbox.remainingTries--;
        }

        // Save changes
        this.lootboxes[this.currentLootboxIndex] = this.currentLootbox;
        this.saveLootboxes();

        // Show result
        this.showResult(result);
        
        // Update view
        this.renderLootboxView();
    }

    showResult(itemName) {
        const popup = document.getElementById('resultPopup');
        const resultItem = document.getElementById('resultItem');
        
        if (popup && resultItem) {
            resultItem.textContent = itemName;
            popup.classList.add('show');
            
            setTimeout(() => {
                popup.classList.remove('show');
            }, 3000);
        }
    }

    createNewLootbox() {
        this.editingIndex = -1;
        this.showEditModal();
        
        // Reset form
        const elements = {
            lootboxName: document.getElementById('lootboxName'),
            revealContents: document.getElementById('revealContents'),
            revealOdds: document.getElementById('revealOdds'),
            unlimitedTries: document.getElementById('unlimitedTries'),
            maxTriesGroup: document.getElementById('maxTriesGroup'),
            maxTries: document.getElementById('maxTries'),
            modalTitle: document.getElementById('modalTitle'),
            itemsList: document.getElementById('itemsList')
        };
        
        if (elements.lootboxName) elements.lootboxName.value = '';
        if (elements.revealContents) elements.revealContents.checked = true;
        if (elements.revealOdds) elements.revealOdds.checked = true;
        if (elements.unlimitedTries) elements.unlimitedTries.checked = true;
        if (elements.maxTriesGroup) elements.maxTriesGroup.style.display = 'none';
        if (elements.maxTries) elements.maxTries.value = 10;
        if (elements.modalTitle) elements.modalTitle.textContent = 'Create New Lootbox';
        
        // Clear items and add default
        if (elements.itemsList) elements.itemsList.innerHTML = '';
        this.addItemRow('Default Item', 1.0);
        this.updateTotalOdds();
    }

    editLootbox(index) {
        this.editingIndex = index;
        const lootbox = this.lootboxes[index];
        this.showEditModal();
        
        // Populate form
        const elements = {
            lootboxName: document.getElementById('lootboxName'),
            revealContents: document.getElementById('revealContents'),
            revealOdds: document.getElementById('revealOdds'),
            unlimitedTries: document.getElementById('unlimitedTries'),
            maxTriesGroup: document.getElementById('maxTriesGroup'),
            maxTries: document.getElementById('maxTries'),
            modalTitle: document.getElementById('modalTitle'),
            itemsList: document.getElementById('itemsList')
        };
        
        if (elements.lootboxName) elements.lootboxName.value = lootbox.name;
        if (elements.revealContents) elements.revealContents.checked = lootbox.revealContents;
        if (elements.revealOdds) elements.revealOdds.checked = lootbox.revealOdds;
        if (elements.unlimitedTries) elements.unlimitedTries.checked = lootbox.maxTries === "unlimited";
        if (elements.maxTriesGroup) elements.maxTriesGroup.style.display = lootbox.maxTries === "unlimited" ? 'none' : 'block';
        if (elements.maxTries) elements.maxTries.value = lootbox.maxTries === "unlimited" ? 10 : lootbox.maxTries;
        if (elements.modalTitle) elements.modalTitle.textContent = 'Edit Lootbox';
        
        // Populate items
        if (elements.itemsList) elements.itemsList.innerHTML = '';
        lootbox.items.forEach(item => {
            this.addItemRow(item.name, item.odds);
        });
        this.updateTotalOdds();
    }

    showEditModal() {
        const modal = document.getElementById('editModal');
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal() {
        const modal = document.getElementById('editModal');
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    addItemRow(name = '', odds = 0) {
        const itemsList = document.getElementById('itemsList');
        if (!itemsList) return;
        
        const itemRow = document.createElement('div');
        itemRow.className = 'item-row';
        itemRow.innerHTML = `
            <input type="text" class="item-name-input" placeholder="Item name" value="${name}">
            <input type="number" class="item-odds-input" step="0.01" min="0" max="1" placeholder="0.00" value="${odds}">
            <button class="remove-item-btn" onclick="this.parentElement.remove(); app.updateTotalOdds();">Remove</button>
        `;
        
        // Add event listeners for real-time odds calculation
        const oddsInput = itemRow.querySelector('.item-odds-input');
        if (oddsInput) {
            oddsInput.addEventListener('input', () => this.updateTotalOdds());
        }
        
        itemsList.appendChild(itemRow);
        this.updateTotalOdds();
    }

    updateTotalOdds() {
        const rows = document.querySelectorAll('#itemsList .item-row');
        let total = 0;
        
        rows.forEach(row => {
            const oddsInput = row.querySelector('.item-odds-input');
            const odds = parseFloat(oddsInput.value) || 0;
            total += odds;
        });
        
        const totalElement = document.getElementById('totalOdds');
        if (totalElement) {
            totalElement.textContent = total.toFixed(3);
            
            // Color coding
            if (Math.abs(total - 1.0) > 0.001) {
                totalElement.style.color = '#ef4444';
            } else {
                totalElement.style.color = '#10b981';
            }
        }
    }

    saveLootbox() {
        const nameInput = document.getElementById('lootboxName');
        if (!nameInput) return;
        
        const name = nameInput.value.trim();
        if (!name) {
            alert('Please enter a lootbox name');
            return;
        }

        // Collect items
        const rows = document.querySelectorAll('#itemsList .item-row');
        const items = [];
        
        rows.forEach(row => {
            const nameInput = row.querySelector('.item-name-input');
            const oddsInput = row.querySelector('.item-odds-input');
            
            const itemName = nameInput.value.trim();
            const odds = parseFloat(oddsInput.value) || 0;
            
            if (itemName) {
                items.push({ name: itemName, odds });
            }
        });

        if (items.length === 0) {
            alert('Please add at least one item');
            return;
        }

        const lootbox = {
            name,
            items,
            revealContents: document.getElementById('revealContents').checked,
            revealOdds: document.getElementById('revealOdds').checked,
            maxTries: document.getElementById('unlimitedTries').checked ? "unlimited" : parseInt(document.getElementById('maxTries').value),
            remainingTries: document.getElementById('unlimitedTries').checked ? "unlimited" : parseInt(document.getElementById('maxTries').value),
            spins: 0,
            lastUsed: null
        };

        if (this.editingIndex === -1) {
            // Creating new
            this.lootboxes.push(lootbox);
        } else {
            // Editing existing - preserve stats
            const existing = this.lootboxes[this.editingIndex];
            lootbox.spins = existing.spins;
            lootbox.lastUsed = existing.lastUsed;
            this.lootboxes[this.editingIndex] = lootbox;
        }

        this.saveLootboxes();
        this.renderLootboxes();
        this.closeModal();
    }

    deleteLootbox(index) {
        if (confirm('Are you sure you want to delete this lootbox?')) {
            this.lootboxes.splice(index, 1);
            this.saveLootboxes();
            this.renderLootboxes();
        }
    }

    shareLootbox(index) {
        const lootbox = this.lootboxes[index];
        const data = encodeURIComponent(JSON.stringify(lootbox));
        const url = `${window.location.origin}${window.location.pathname}?share=${data}`;
        
        if (navigator.share) {
            navigator.share({
                title: `${lootbox.name} - Lootbox`,
                url: url
            });
        } else {
            navigator.clipboard.writeText(url).then(() => {
                alert('Share link copied to clipboard!');
            }).catch(() => {
                alert('Share URL: ' + url);
            });
        }
    }

    filterLootboxes(filter) {
        // For now, just show all - you can implement filtering logic here
        this.renderLootboxes();
    }

    showListView() {
        const listView = document.getElementById('listView');
        const lootboxView = document.getElementById('lootboxView');
        
        if (listView) listView.classList.remove('hidden');
        if (lootboxView) lootboxView.classList.add('hidden');
        
        this.currentLootbox = null;
    }

    showMenu() {
        // Implement menu functionality here
        alert('Menu clicked - implement features like export, import, settings, etc.');
    }

    timeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        return `${Math.floor(diffInSeconds / 86400)} days ago`;
    }

    loadLootboxes() {
        try {
            const saved = localStorage.getItem('lootboxes');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('Error loading lootboxes:', error);
            return [];
        }
    }

    saveLootboxes() {
        try {
            localStorage.setItem('lootboxes', JSON.stringify(this.lootboxes));
        } catch (error) {
            console.error('Error saving lootboxes:', error);
            alert('Error saving lootboxes. Your changes may not be preserved.');
        }
    }
}

// Global functions for onclick handlers
function showListView() {
    if (window.app) app.showListView();
}

function showMenu() {
    if (window.app) app.showMenu();
}

function createNewLootbox() {
    if (window.app) app.createNewLootbox();
}

function closeModal() {
    if (window.app) app.closeModal();
}

function addItemRow() {
    if (window.app) app.addItemRow();
}

function saveLootbox() {
    if (window.app) app.saveLootbox();
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    window.app = new LootboxApp();
});

// Handle shared lootboxes
const urlParams = new URLSearchParams(window.location.search);
const sharedData = urlParams.get('share');
if (sharedData && window.app) {
    try {
        const lootbox = JSON.parse(decodeURIComponent(sharedData));
        window.app.lootboxes.push(lootbox);
        window.app.saveLootboxes();
        window.app.renderLootboxes();
        alert(`Imported: ${lootbox.name}`);
    } catch (error) {
        console.error('Error importing shared lootbox:', error);
    }
}