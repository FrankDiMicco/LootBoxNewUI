class LootboxApp {
    constructor() {
        this.lootboxes = this.loadLootboxes();
        this.currentLootbox = null;
        this.editingIndex = -1;
        this.sessionHistory = [];
        this.isOnCooldown = false;
        this.popupTimeout = null;
        this.selectedChestPath = null;
        
        this.initializeApp();
    }

    async initializeApp() {
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
                chestImage: 'chests/chest.png',
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
        document.getElementById('unlimitedTries').addEventListener('change', (e) => {
            document.getElementById('maxTriesGroup').style.display = e.target.checked ? 'none' : 'block';
        });

        // Modal close on backdrop click
        document.getElementById('editModal').addEventListener('click', (e) => {
            if (e.target.id === 'editModal') {
                this.closeModal();
            }
        });

        // Note: Chest selection listeners are now handled in populateChestSelection()
    }

    async loadChestManifest() {
        try {
            const response = await fetch('chests/OwnedChests/manifest.json', { 
                cache: 'no-store' 
            });
            const manifest = await response.json();
            return manifest.chests || [];
        } catch (error) {
            console.error('Failed to load chest manifest:', error);
            // Fallback to default chest from main chests folder
            return [{
                file: '../chest.png',
                name: 'Default Chest',
                description: 'Classic treasure chest'
            }];
        }
    }

    async populateChestSelection() {
        const chestSelection = document.getElementById('chestSelection');
        chestSelection.innerHTML = '';
        
        const chests = await this.loadChestManifest();
        
        chests.forEach(chest => {
            const chestPath = `chests/OwnedChests/${chest.file}`;
            const chestOption = document.createElement('div');
            chestOption.className = 'chest-option';
            chestOption.dataset.image = chestPath;
            
            chestOption.innerHTML = `
                <img src="${chestPath}" alt="${chest.name}">
                <span>${chest.name}</span>
            `;
            
            // Add click handler
            chestOption.addEventListener('click', () => {
                // Remove selected class from all options
                document.querySelectorAll('.chest-option').forEach(opt => opt.classList.remove('selected'));
                // Add selected class to clicked option
                chestOption.classList.add('selected');
                // Store selected path
                this.selectedChestPath = chestPath;
                // Update preview immediately
                this.updateChestPreview(chestPath);
            });
            
            chestSelection.appendChild(chestOption);
        });
        
        // Add scroll interaction handlers
        this.addChestSelectionScrollHandlers(chestSelection);
    }

    addChestSelectionScrollHandlers(container) {
        // Mouse wheel horizontal scrolling
        container.addEventListener('wheel', (e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                // Already horizontal scroll, let it through
                return;
            }
            // Convert vertical scroll to horizontal
            e.preventDefault();
            container.scrollLeft += e.deltaY;
        });

        // Mouse drag scrolling
        let isDown = false;
        let startX;
        let scrollLeft;

        container.addEventListener('mousedown', (e) => {
            // Don't start drag on chest option click
            if (e.target.closest('.chest-option')) {
                return;
            }
            isDown = true;
            container.style.cursor = 'grabbing';
            startX = e.pageX - container.offsetLeft;
            scrollLeft = container.scrollLeft;
            e.preventDefault();
            // Prevent text selection during drag
            document.body.style.userSelect = 'none';
        });

        container.addEventListener('mouseleave', () => {
            isDown = false;
            container.style.cursor = 'grab';
            document.body.style.userSelect = '';
        });

        container.addEventListener('mouseup', () => {
            isDown = false;
            container.style.cursor = 'grab';
            document.body.style.userSelect = '';
        });

        container.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - container.offsetLeft;
            const walk = (x - startX) * 2; // Scroll speed multiplier
            container.scrollLeft = scrollLeft - walk;
        });

        // Set initial cursor
        container.style.cursor = 'grab';
    }

    updateChestPreview(chestPath) {
        const circle = document.getElementById('lootboxCircle');
        if (circle) {
            circle.style.backgroundImage = `url('${chestPath}')`;
        }
    }

    renderLootboxes() {
        const grid = document.getElementById('lootboxGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (this.lootboxes.length === 0) {
            grid.style.display = 'none';
            emptyState.classList.remove('hidden');
            return;
        }

        grid.style.display = 'grid';
        emptyState.classList.add('hidden');
        
        grid.innerHTML = this.lootboxes.map((lootbox, index) => {
            const chestImage = lootbox.chestImage || 'chests/chest.png';
            return `
            <div class="lootbox-card" onclick="app.openLootbox(${index})">
                <div class="lootbox-preview" style="background-image: url('${chestImage}')"></div>
                <div class="lootbox-info">
                    <h3>${lootbox.name}</h3>
                    <div class="lootbox-stats">
                        <span>Spins: ${lootbox.spins || 0}</span>
                        <span>Used: ${lootbox.lastUsed ? this.timeAgo(lootbox.lastUsed) : 'Never'}</span>
                    </div>
                    <div class="lootbox-actions">
                        <button class="action-btn" onclick="event.stopPropagation(); app.editLootbox(${index})">⚙️</button>
                        <button class="action-btn" onclick="event.stopPropagation(); app.shareLootbox(${index})">🔗</button>
                        <button class="action-btn" onclick="event.stopPropagation(); app.deleteLootbox(${index})">🗑️</button>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    openLootbox(index) {
        this.currentLootbox = this.lootboxes[index];
        this.currentLootboxIndex = index;
        
        // Clear session history when opening a new lootbox
        this.sessionHistory = [];
        
        // Reset cooldown when switching lootboxes
        this.isOnCooldown = false;
        if (this.popupTimeout) {
            clearTimeout(this.popupTimeout);
            this.popupTimeout = null;
        }
        
        document.getElementById('listView').classList.add('hidden');
        document.getElementById('lootboxView').classList.remove('hidden');
        
        this.renderLootboxView();
        this.updateSessionDisplay(); // Initialize session display
        this.updateLootboxInteractivity(); // Update interactivity state
    }

    renderLootboxView() {
        document.getElementById('lootboxTitle').textContent = this.currentLootbox.name;
        
        // Update tries info
        const triesInfo = document.getElementById('triesInfo');
        if (this.currentLootbox.maxTries === "unlimited") {
            triesInfo.textContent = "Unlimited tries";
        } else {
            triesInfo.textContent = `Tries remaining: ${this.currentLootbox.remainingTries}`;
        }
        
        // Set up click handler for the invisible button (or fallback to circle)
        const openButton = document.getElementById('openButton');
        const circle = document.getElementById('lootboxCircle');
        
        if (openButton) {
            openButton.onclick = () => this.spinLootbox();
        } else {
            circle.onclick = () => this.spinLootbox();
        }
        
        // Update chest image
        const chestImage = this.currentLootbox.chestImage || 'chests/chest.png';
        circle.style.backgroundImage = `url('${chestImage}')`;
        
        // Render items if content should be revealed
        const itemsContainer = document.getElementById('lootboxItems');
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

    spinLootbox() {
        // Check if on cooldown
        if (this.isOnCooldown) {
            return;
        }

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

        // Set cooldown
        this.isOnCooldown = true;
        this.updateLootboxInteractivity();

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

        // Add to session history
        this.addToHistory(result);

        // Save changes
        this.lootboxes[this.currentLootboxIndex] = this.currentLootbox;
        this.saveLootboxes();

        // Show result
        this.showResult(result);
        
        // Update view
        this.renderLootboxView();

        // Set cooldown timer (1.5 seconds)
        setTimeout(() => {
            this.isOnCooldown = false;
            this.updateLootboxInteractivity();
        }, 1500);
    }

    showResult(itemName) {
        const popup = document.getElementById('resultPopup');
        const resultItem = document.getElementById('resultItem');
        
        // Clear any existing popup timeout
        if (this.popupTimeout) {
            clearTimeout(this.popupTimeout);
        }
        
        resultItem.textContent = itemName;
        popup.classList.add('show');
        
        // Set new timeout for 3 seconds
        this.popupTimeout = setTimeout(() => {
            popup.classList.remove('show');
            this.popupTimeout = null;
        }, 3000);
    }

    updateLootboxInteractivity() {
        const circle = document.getElementById('lootboxCircle');
        const openButton = document.getElementById('openButton');
        
        if (this.isOnCooldown) {
            circle.classList.add('on-cooldown');
            if (openButton) openButton.disabled = true;
        } else {
            circle.classList.remove('on-cooldown');
            if (openButton) openButton.disabled = false;
        }
    }

    async createNewLootbox() {
        this.editingIndex = -1;
        this.showEditModal();
        
        // Reset form
        document.getElementById('lootboxName').value = '';
        document.getElementById('revealContents').checked = true;
        document.getElementById('revealOdds').checked = true;
        document.getElementById('unlimitedTries').checked = true;
        document.getElementById('maxTriesGroup').style.display = 'none';
        document.getElementById('maxTries').value = 10;
        document.getElementById('modalTitle').textContent = 'Create New Lootbox';
        
        // Clear items and add default
        document.getElementById('itemsList').innerHTML = '';
        this.addItemRow('Default Item', 1.0);
        this.updateTotalOdds();
        
        // Populate chest selection
        await this.populateChestSelection();
        
        // Reset selection
        this.selectedChestPath = null;
        
        // Select first available chest as default
        const firstChestOption = document.querySelector('.chest-option');
        if (firstChestOption) {
            firstChestOption.classList.add('selected');
            this.selectedChestPath = firstChestOption.dataset.image;
            this.updateChestPreview(this.selectedChestPath);
        }
    }

    async editLootbox(index) {
        this.editingIndex = index;
        const lootbox = this.lootboxes[index];
        this.showEditModal();
        
        // Populate form
        document.getElementById('lootboxName').value = lootbox.name;
        document.getElementById('revealContents').checked = lootbox.revealContents;
        document.getElementById('revealOdds').checked = lootbox.revealOdds;
        document.getElementById('unlimitedTries').checked = lootbox.maxTries === "unlimited";
        document.getElementById('maxTriesGroup').style.display = lootbox.maxTries === "unlimited" ? 'none' : 'block';
        document.getElementById('maxTries').value = lootbox.maxTries === "unlimited" ? 10 : lootbox.maxTries;
        document.getElementById('modalTitle').textContent = 'Edit Lootbox';
        
        // Populate items
        document.getElementById('itemsList').innerHTML = '';
        lootbox.items.forEach(item => {
            this.addItemRow(item.name, item.odds);
        });
        this.updateTotalOdds();
        
        // Populate chest selection
        await this.populateChestSelection();
        
        // Set current selection
        const chestImage = lootbox.chestImage || 'chests/chest.png';
        this.selectedChestPath = chestImage;
        
        const selectedOption = document.querySelector(`.chest-option[data-image="${chestImage}"]`);
        if (selectedOption) {
            selectedOption.classList.add('selected');
            this.updateChestPreview(chestImage);
        } else {
            // Fallback to first available chest if saved image doesn't exist
            const firstChestOption = document.querySelector('.chest-option');
            if (firstChestOption) {
                firstChestOption.classList.add('selected');
                this.selectedChestPath = firstChestOption.dataset.image;
                this.updateChestPreview(this.selectedChestPath);
            }
        }
    }

    showEditModal() {
        document.getElementById('editModal').classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        document.getElementById('editModal').classList.remove('show');
        document.body.style.overflow = '';
    }

    addItemRow(name = '', odds = 0) {
        const itemsList = document.getElementById('itemsList');
        const itemRow = document.createElement('div');
        itemRow.className = 'item-row';
        itemRow.innerHTML = `
            <input type="text" class="item-name-input" placeholder="Item name" value="${name}">
            <input type="number" class="item-odds-input" step="0.01" min="0" max="1" placeholder="0.00" value="${odds}">
            <button class="remove-item-btn" onclick="this.parentElement.remove(); app.updateTotalOdds();">Remove</button>
        `;
        
        // Add event listeners for real-time odds calculation
        const oddsInput = itemRow.querySelector('.item-odds-input');
        oddsInput.addEventListener('input', () => this.updateTotalOdds());
        
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
        totalElement.textContent = total.toFixed(3);
        
        // Color coding
        if (Math.abs(total - 1.0) > 0.001) {
            totalElement.style.color = '#ef4444';
        } else {
            totalElement.style.color = '#10b981';
        }
    }

    saveLootbox() {
        const name = document.getElementById('lootboxName').value.trim();
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

        // Get selected chest image
        const chestImage = this.selectedChestPath || 'chests/chest.png';

        const lootbox = {
            name,
            items,
            chestImage,
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
            });
        }
    }

    filterLootboxes(filter) {
        // For now, just show all - you can implement filtering logic here
        this.renderLootboxes();
    }

    showListView() {
        document.getElementById('lootboxView').classList.add('hidden');
        document.getElementById('listView').classList.remove('hidden');
        
        // Clear session history when leaving lootbox view
        this.sessionHistory = [];
        this.updateSessionDisplay();
        
        // Reset cooldown and hide popup when leaving lootbox view
        this.isOnCooldown = false;
        if (this.popupTimeout) {
            clearTimeout(this.popupTimeout);
            this.popupTimeout = null;
        }
        const popup = document.getElementById('resultPopup');
        if (popup) {
            popup.classList.remove('show');
        }
        
        this.currentLootbox = null;
    }

    showMenu() {
        // Implement menu functionality here
        alert('Menu clicked - implement features like export, import, settings, etc.');
    }

    addToHistory(itemName) {
        const historyEntry = {
            item: itemName,
            timestamp: new Date(),
            lootboxName: this.currentLootbox.name
        };
        
        this.sessionHistory.unshift(historyEntry); // Add to beginning
        this.updateSessionDisplay();
    }

    updateSessionDisplay() {
        const historyList = document.getElementById('historyList');
        const totalPulls = document.getElementById('totalPulls');
        const sessionStats = document.getElementById('sessionStats');
        
        if (!historyList || !totalPulls || !sessionStats) return;
        
        // Update total pulls
        totalPulls.textContent = this.sessionHistory.length;
        
        // Generate item counts for stats
        const itemCounts = {};
        this.sessionHistory.forEach(entry => {
            itemCounts[entry.item] = (itemCounts[entry.item] || 0) + 1;
        });
        
        // Update stats section
        sessionStats.innerHTML = `
            <div class="stat-item">Total Pulls: <span id="totalPulls">${this.sessionHistory.length}</span></div>
        `;
        
        // Add item counts
        Object.entries(itemCounts)
            .sort(([,a], [,b]) => b - a) // Sort by count descending
            .forEach(([item, count]) => {
                const statItem = document.createElement('div');
                statItem.className = 'stat-item';
                statItem.innerHTML = `${item}: <span>${count}</span>`;
                sessionStats.appendChild(statItem);
            });
        
        // Update history list
        historyList.innerHTML = '';
        
        if (this.sessionHistory.length === 0) {
            historyList.innerHTML = '<div class="no-history">No pulls yet this session</div>';
            return;
        }
        
        // Add history items
        this.sessionHistory.forEach(entry => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <span class="history-item-name">You got: ${entry.item}</span>
                <span class="history-item-time">${entry.timestamp.toLocaleTimeString()}</span>
            `;
            historyList.appendChild(historyItem);
        });
    }

    clearHistory() {
        this.sessionHistory = [];
        this.updateSessionDisplay();
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
    app.showListView();
}

function showMenu() {
    app.showMenu();
}

function createNewLootbox() {
    app.createNewLootbox();
}

function closeModal() {
    app.closeModal();
}

function addItemRow() {
    app.addItemRow();
}

function saveLootbox() {
    app.saveLootbox();
}

// FIXED: Better toggle function with smooth animation
function toggleSessionHistory() {
    const content = document.getElementById('sessionContent');
    const btn = document.getElementById('toggleButton');
    
    if (content && btn) {
        const isCollapsed = content.classList.contains('collapsed');
        
        if (isCollapsed) {
            // Expanding
            content.classList.remove('collapsed');
            btn.textContent = '▼';
            btn.style.transform = 'rotate(0deg)';
        } else {
            // Collapsing
            content.classList.add('collapsed');
            btn.textContent = '▶';
            btn.style.transform = 'rotate(0deg)';
        }
    }
}

function clearHistory() {
    if (window.app) {
        app.clearHistory();
    }
}

// Initialize app
const app = new LootboxApp();

// Handle shared lootboxes
const urlParams = new URLSearchParams(window.location.search);
const sharedData = urlParams.get('share');
if (sharedData) {
    try {
        const lootbox = JSON.parse(decodeURIComponent(sharedData));
        app.lootboxes.push(lootbox);
        app.saveLootboxes();
        app.renderLootboxes();
        alert(`Imported: ${lootbox.name}`);
    } catch (error) {
        console.error('Error importing shared lootbox:', error);
    }
}