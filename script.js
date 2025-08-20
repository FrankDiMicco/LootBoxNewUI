class LootboxApp {
    constructor() {
        this.lootboxes = [];
        this.currentLootbox = null;
        this.editingIndex = -1;
        this.sessionHistory = [];
        this.isOnCooldown = false;
        this.popupTimeout = null;
        this.selectedChestPath = null;
        this.currentFilter = 'all';
        this.isFirebaseReady = false;
        
        this.initializeApp();
    }

    async initializeApp() {
        this.renderLootboxes();
        this.attachEventListeners();
        
        // Wait for Firebase auth to be ready, then load lootboxes
        await this.waitForAuthAndLoad();
    }
    
    async waitForAuthAndLoad() {
        console.log('Waiting for Firebase auth...');
        
        // Wait for Firebase to be initialized
        while (!window.firebaseAuth) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Wait for auth state to resolve (either signed in or failed)
        return new Promise((resolve) => {
            const unsubscribe = window.firebaseAuth.onAuthStateChanged(async (user) => {
                console.log('Auth state changed:', user ? `User ${user.uid}` : 'No user');
                unsubscribe(); // Stop listening after first state change
                
                this.isFirebaseReady = true;
                
                try {
                    // Load lootboxes from Firebase or localStorage
                    this.lootboxes = await this.loadLootboxes();
                    console.log(`Loaded ${this.lootboxes.length} lootboxes`);
                } catch (error) {
                    console.error('Error loading lootboxes:', error);
                    this.lootboxes = [];
                }
                
                // Add default lootbox if none exist
                if (this.lootboxes.length === 0) {
                    await this.createDefaultLootbox();
                }
                
                this.renderLootboxes();
                resolve();
            });
        });
    }
    
    async createDefaultLootbox() {
        const defaultLootbox = {
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
            lastUsed: new Date().toISOString(),
            favorite: false
        };
        
        this.lootboxes.push(defaultLootbox);
        await this.saveLootboxes();
        console.log('Created default lootbox');
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
    }

    async loadChestManifest() {
        try {
            const response = await fetch('chests/OwnedChests/manifest.json', { 
                cache: 'no-store' 
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const manifest = await response.json();
            return manifest.chests || [];
        } catch (error) {
            console.error('Failed to load chest manifest:', error);
            // Fallback with hardcoded chest list
            return [
                { file: 'chest.png', name: 'Default Chest', description: 'Classic treasure chest' },
                { file: 'metal.png', name: 'Metal Chest', description: 'Sturdy metal chest' },
                { file: 'skull_bone.png', name: 'Skull Chest', description: 'Spooky bone chest' },
                { file: 'wood_flower.png', name: 'Flower Chest', description: 'Wooden chest with flowers' },
                { file: 'kid_happy.png', name: 'Happy Kid Chest', description: 'Cheerful kid-themed chest' },
                { file: 'fruit_wood.png', name: 'Fruity Chest', description: 'Chest with fruit' },
                { file: 'weapon_wood.png', name: 'Weapon Chest', description: 'Wooden chest with weapons' },
                { file: 'orb_chest.png', name: 'Orb Chest', description: 'Chest with orbs' }
            ];
        }
    }

    async populateChestSelection() {
        const chestSelection = document.getElementById('chestSelection');
        if (!chestSelection) {
            console.error('Chest selection container not found');
            return;
        }
        
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
                return;
            }
            e.preventDefault();
            container.scrollLeft += e.deltaY;
        });

        // Mouse drag scrolling
        let isDown = false;
        let startX;
        let scrollLeft;

        container.addEventListener('mousedown', (e) => {
            if (e.target.closest('.chest-option')) {
                return;
            }
            isDown = true;
            container.style.cursor = 'grabbing';
            startX = e.pageX - container.offsetLeft;
            scrollLeft = container.scrollLeft;
            e.preventDefault();
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
            const walk = (x - startX) * 2;
            container.scrollLeft = scrollLeft - walk;
        });

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
        
        // Sort lootboxes by most recently used first, keeping track of original indices
        const indexedLootboxes = this.lootboxes.map((lootbox, index) => ({
            lootbox,
            originalIndex: index
        }));
        
        const sortedIndexedLootboxes = indexedLootboxes.sort((a, b) => {
            // If filtering by favorites, prioritize favorites first
            if (this.currentFilter === 'favorites') {
                // First sort by favorite status (favorites first)
                if (a.lootbox.favorite && !b.lootbox.favorite) return -1;
                if (!a.lootbox.favorite && b.lootbox.favorite) return 1;
                
                // Then sort by lastUsed within each group
                if (!a.lootbox.lastUsed && !b.lootbox.lastUsed) return 0;
                if (!a.lootbox.lastUsed) return 1;
                if (!b.lootbox.lastUsed) return -1;
                return new Date(b.lootbox.lastUsed) - new Date(a.lootbox.lastUsed);
            } else {
                // Default sorting: just by most recent usage
                if (!a.lootbox.lastUsed && !b.lootbox.lastUsed) return 0;
                if (!a.lootbox.lastUsed) return 1;
                if (!b.lootbox.lastUsed) return -1;
                return new Date(b.lootbox.lastUsed) - new Date(a.lootbox.lastUsed);
            }
        });
        
        grid.innerHTML = sortedIndexedLootboxes.map(({lootbox, originalIndex}) => {
            const chestImage = lootbox.chestImage || 'chests/chest.png';
            const favoriteIcon = lootbox.favorite ? 'assets/graphics/favorite_star.png' : 'assets/graphics/empty_favorite_star.png';
            return `
            <div class="lootbox-card" onclick="app.openLootbox(${originalIndex})">
                <div class="lootbox-preview" style="background-image: url('${chestImage}')"></div>
                <div class="lootbox-info">
                    <h3>${lootbox.name}</h3>
                    <div class="lootbox-stats">
                        <span>Spins: ${lootbox.spins || 0}</span>
                        <span>Used: ${lootbox.lastUsed ? this.timeAgo(lootbox.lastUsed) : 'Never'}</span>
                    </div>
                    <div class="lootbox-actions">
                        <button class="action-btn" onclick="event.stopPropagation(); app.editLootbox(${originalIndex})">
                            <img src="assets/graphics/settings_cog.png" alt="Edit" class="action-icon">
                        </button>
                        <button class="action-btn" onclick="event.stopPropagation(); app.shareLootbox(${originalIndex})">
                            <img src="assets/graphics/share.png" alt="Share" class="action-icon">
                        </button>
                        <button class="action-btn" onclick="event.stopPropagation(); app.favoriteLootbox(${originalIndex})">
                            <img src="${favoriteIcon}" alt="Favorite" class="action-icon">
                        </button>
                        <button class="action-btn" onclick="event.stopPropagation(); app.deleteLootbox(${originalIndex})">
                            <img src="assets/graphics/delete_x.png" alt="Delete" class="action-icon">
                        </button>
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
        this.updateSessionDisplay();
        this.updateLootboxInteractivity();
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

    async spinLootbox() {
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
        await this.saveLootboxes();

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

    async saveLootbox() {
        // Check if modal is open (indicates user action from Save button)
        const modal = document.getElementById('editModal');
        const showAlerts = modal && modal.classList.contains('show');
        
        const name = document.getElementById('lootboxName').value.trim();
        if (!name) {
            if (showAlerts) alert('Please enter a lootbox name');
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
            if (showAlerts) alert('Please add at least one item');
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
            lastUsed: new Date().toISOString(),
            favorite: false
        };

        if (this.editingIndex === -1) {
            // Creating new
            this.lootboxes.push(lootbox);
        } else {
            // Editing existing - preserve stats
            const existing = this.lootboxes[this.editingIndex];
            lootbox.spins = existing.spins;
            lootbox.lastUsed = existing.lastUsed;
            lootbox.favorite = existing.favorite || false;
            lootbox.id = existing.id; // Preserve Firebase ID if it exists
            this.lootboxes[this.editingIndex] = lootbox;
        }

        await this.saveLootboxes();
        this.renderLootboxes();
        this.closeModal();
    }

    async deleteLootbox(index) {
        if (confirm('Are you sure you want to delete this lootbox?')) {
            const lootbox = this.lootboxes[index];
            
            // Delete from Firebase if it has an ID
            if (lootbox.id && this.isFirebaseReady) {
                try {
                    await this.deleteLootboxFromFirebase(lootbox.id);
                    console.log('Deleted from Firebase:', lootbox.id);
                } catch (error) {
                    console.error('Error deleting from Firebase:', error);
                }
            }
            
            this.lootboxes.splice(index, 1);
            await this.saveLootboxes();
            this.renderLootboxes();
        }
    }

    async deleteLootboxFromFirebase(id) {
        if (!window.firebaseDb || !window.firebaseFunctions) {
            throw new Error('Firebase not available');
        }
        
        const { doc, deleteDoc } = window.firebaseFunctions;
        await deleteDoc(doc(window.firebaseDb, 'lootboxes', id));
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

    async favoriteLootbox(index) {
        this.lootboxes[index].favorite = !this.lootboxes[index].favorite;
        await this.saveLootboxes();
        this.renderLootboxes();
    }

    filterLootboxes(filter) {
        this.currentFilter = filter;
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
        
        // Re-render lootboxes to update sorting after potential usage
        this.renderLootboxes();
    }

    showMenu() {
        alert('Menu clicked - implement features like export, import, settings, etc.');
    }

    addToHistory(itemName) {
        const historyEntry = {
            item: itemName,
            timestamp: new Date(),
            lootboxName: this.currentLootbox.name
        };
        
        this.sessionHistory.unshift(historyEntry);
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

    async loadLootboxes() {
        // Try to load from Firebase first, fallback to localStorage
        if (this.isFirebaseReady && window.firebaseDb && window.firebaseAuth && window.firebaseFunctions) {
            try {
                const currentUser = window.firebaseAuth.currentUser;
                if (currentUser) {
                    const { collection, query, where, getDocs } = window.firebaseFunctions;
                    const q = query(
                        collection(window.firebaseDb, 'lootboxes'),
                        where('uid', '==', currentUser.uid)
                    );
                    const querySnapshot = await getDocs(q);
                    const lootboxes = [];
                    querySnapshot.forEach((doc) => {
                        const data = doc.data();
                        // Remove the uid field for local use and add document id
                        delete data.uid;
                        lootboxes.push({ id: doc.id, ...data });
                    });
                    console.log(`Loaded ${lootboxes.length} lootboxes from Firebase`);
                    
                    // Also save to localStorage as backup
                    localStorage.setItem('lootboxes', JSON.stringify(lootboxes));
                    
                    return lootboxes;
                }
            } catch (error) {
                console.error('Error loading lootboxes from Firebase:', error);
            }
        }
        
        // Fallback to localStorage
        try {
            const saved = localStorage.getItem('lootboxes');
            const lootboxes = saved ? JSON.parse(saved) : [];
            console.log(`Loaded ${lootboxes.length} lootboxes from localStorage`);
            return lootboxes;
        } catch (error) {
            console.error('Error loading lootboxes from localStorage:', error);
            return [];
        }
    }

    async saveLootboxes() {
        // Save to Firebase if available
        if (this.isFirebaseReady && window.firebaseDb && window.firebaseAuth && window.firebaseFunctions) {
            try {
                const currentUser = window.firebaseAuth.currentUser;
                if (currentUser) {
                    const { collection, addDoc, doc, setDoc } = window.firebaseFunctions;
                    
                    // Save each lootbox individually
                    for (let i = 0; i < this.lootboxes.length; i++) {
                        const lootbox = this.lootboxes[i];
                        const lootboxWithUid = { ...lootbox, uid: currentUser.uid };
                        
                        if (lootbox.id) {
                            // Update existing
                            delete lootboxWithUid.id; // Remove id from data before saving
                            await setDoc(doc(window.firebaseDb, 'lootboxes', lootbox.id), lootboxWithUid);
                            console.log('Updated lootbox in Firebase:', lootbox.id);
                        } else {
                            // Create new
                            const docRef = await addDoc(collection(window.firebaseDb, 'lootboxes'), lootboxWithUid);
                            this.lootboxes[i].id = docRef.id; // Store the new ID
                            console.log('Created new lootbox in Firebase:', docRef.id);
                        }
                    }
                    
                    // Also save to localStorage as backup
                    localStorage.setItem('lootboxes', JSON.stringify(this.lootboxes));
                    console.log('Saved to Firebase and localStorage');
                    return;
                }
            } catch (error) {
                console.error('Error saving to Firebase:', error);
                // Fall through to localStorage save
            }
        }
        
        // Fallback to localStorage only
        try {
            localStorage.setItem('lootboxes', JSON.stringify(this.lootboxes));
            console.log('Saved to localStorage only');
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
        // Wait for app to be ready before adding shared lootbox
        const waitForApp = setInterval(async () => {
            if (app.isFirebaseReady) {
                clearInterval(waitForApp);
                app.lootboxes.push(lootbox);
                await app.saveLootboxes();
                app.renderLootboxes();
                alert(`Imported: ${lootbox.name}`);
            }
        }, 100);
    } catch (error) {
        console.error('Error importing shared lootbox:', error);
    }
}