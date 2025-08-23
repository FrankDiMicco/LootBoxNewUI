class LootboxApp {
    constructor() {
        this.lootboxes = [];
        this.participatedGroupBoxes = [];
        this.currentLootbox = null;
        this.editingIndex = -1;
        this.sessionHistory = [];
        this.communityHistory = [];
        this.isOnCooldown = false;
        this.popupTimeout = null;
        this.selectedChestPath = null;
        this.currentFilter = 'all';
        this.isFirebaseReady = false;
        this.isOrganizerReadonly = false;
        
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
                    
                    // Load participated group boxes
                    this.participatedGroupBoxes = await this.loadParticipatedGroupBoxes();
                    console.log(`Loaded ${this.participatedGroupBoxes.length} participated group boxes`);
                    
                    // Migrate old chest paths
                    this.migrateChestPaths();
                } catch (error) {
                    console.error('Error loading lootboxes:', error);
                    this.lootboxes = [];
                    this.participatedGroupBoxes = [];
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
    
    migrateChestPaths() {
        let migrated = false;
        this.lootboxes.forEach(lootbox => {
            if (lootbox.chestImage && lootbox.chestImage.includes('chests/OwnedChests/')) {
                lootbox.chestImage = lootbox.chestImage.replace('chests/OwnedChests/', 'chests/');
                migrated = true;
            }
        });
        
        if (migrated) {
            console.log('Migrated chest paths from OwnedChests to chests folder');
            this.saveLootboxes(); // Save the migrated data
        }
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
        // Try to load from Firestore first
        if (this.isFirebaseReady && window.firebaseDb && window.firebaseFunctions) {
            try {
                const { collection, getDocs, orderBy, query } = window.firebaseFunctions;
                
                // Query the 'chests' collection, ordered by sortOrder
                const chestsRef = collection(window.firebaseDb, 'chests');
                const q = query(chestsRef, orderBy('sortOrder', 'asc'));
                const querySnapshot = await getDocs(q);
                
                const chests = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    // Transform Firestore data to match existing structure and strip extra quotes
                    chests.push({
                        file: data.fileName.replace(/"/g, ''),
                        name: data.name.replace(/"/g, ''),
                        description: data.description.replace(/"/g, ''),
                        tier: data.tier,
                        sortOrder: data.sortOrder
                    });
                });
                
                console.log(`Loaded ${chests.length} chests from Firestore`);
                return chests;
                
            } catch (error) {
                console.error('Failed to load chests from Firestore:', error);
                // Fall through to hardcoded fallback
            }
        }
        
        // Hardcoded fallback: use default chest list
        console.log('Using hardcoded chest fallback');
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

    async populateChestSelection() {
        const chestSelection = document.getElementById('chestSelection');
        if (!chestSelection) {
            console.error('Chest selection container not found');
            return;
        }
        
        chestSelection.innerHTML = '';
        
        const chests = await this.loadChestManifest();
        console.log('Populating chest selection with:', chests);
        
        chests.forEach(chest => {
            const chestPath = `chests/${chest.file}`;
            console.log('Creating chest option for:', chest.name, 'with path:', chestPath);
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
        
        // Filter lootboxes based on current filter
        let filteredLootboxes = [];
        
        // Debug: Log what we're working with
        console.log('renderLootboxes called with:', {
            currentFilter: this.currentFilter,
            personalLootboxes: this.lootboxes.length,
            participatedGroupBoxes: this.participatedGroupBoxes.length,
            groupBoxDetails: this.participatedGroupBoxes.map(gb => ({
                name: gb.groupBoxName,
                isOrganizerOnly: gb.isOrganizerOnly,
                isCreator: gb.isCreator
            }))
        });
        
        if (this.currentFilter === 'all') {
            // Show both personal lootboxes and participated group boxes
            filteredLootboxes = [...this.lootboxes, ...this.participatedGroupBoxes];
        } else if (this.currentFilter === 'favorites') {
            // Show favorited personal lootboxes and favorited group boxes
            const favoriteLootboxes = this.lootboxes.filter(lootbox => lootbox.favorite);
            const favoriteGroupBoxes = this.participatedGroupBoxes.filter(groupBox => groupBox.favorite);
            filteredLootboxes = [...favoriteLootboxes, ...favoriteGroupBoxes];
        } else if (this.currentFilter === 'shared') {
            // Show only participated group boxes for shared filter
            filteredLootboxes = this.participatedGroupBoxes;
        }
        
        console.log('Filtered lootboxes count:', filteredLootboxes.length);
        
        if (filteredLootboxes.length === 0) {
            grid.style.display = 'none';
            emptyState.classList.remove('hidden');
            
            // Update empty state text based on filter
            const emptyTitle = emptyState.querySelector('h3');
            const emptyText = emptyState.querySelector('p');
            
            if (this.currentFilter === 'shared') {
                emptyTitle.textContent = 'No Shared Group Boxes Yet';
                emptyText.textContent = 'Share a lootbox as a Group Box to get started!';
            } else if (this.currentFilter === 'favorites') {
                emptyTitle.textContent = 'No Favorite Lootboxes Yet';
                emptyText.textContent = 'Mark lootboxes as favorites to see them here!';
            } else {
                emptyTitle.textContent = 'No Lootboxes Yet';
                emptyText.textContent = 'Create your first lootbox to get started!';
            }
            return;
        }

        grid.style.display = 'grid';
        emptyState.classList.add('hidden');
        
        // Sort lootboxes by most recently used first, keeping track of original indices
        const indexedLootboxes = filteredLootboxes.map((lootbox) => {
            let originalIndex = -1;
            
            if (lootbox.isGroupBox) {
                // For Group Boxes, we don't need an originalIndex since we handle them differently
                originalIndex = -1;
            } else {
                // Find original index in the full lootboxes array for personal lootboxes
                originalIndex = this.lootboxes.findIndex(lb => lb === lootbox);
            }
            
            return {
                lootbox,
                originalIndex: originalIndex
            };
        });
        
        const sortedIndexedLootboxes = indexedLootboxes.sort((a, b) => {
            // Get last used dates for comparison (handle different date fields for Group Boxes vs personal lootboxes)
            const getLastUsedDate = (lootbox) => {
                if (lootbox.isGroupBox) {
                    // For Group Boxes, use lastParticipated or fallback to firstParticipated
                    return lootbox.lastParticipated || lootbox.firstParticipated || null;
                } else {
                    // For personal lootboxes, use lastUsed
                    return lootbox.lastUsed || null;
                }
            };
            
            const aLastUsed = getLastUsedDate(a.lootbox);
            const bLastUsed = getLastUsedDate(b.lootbox);
            
            // If filtering by favorites, prioritize favorites first
            if (this.currentFilter === 'favorites') {
                // First sort by favorite status (favorites first)
                if (a.lootbox.favorite && !b.lootbox.favorite) return -1;
                if (!a.lootbox.favorite && b.lootbox.favorite) return 1;
                
                // Then sort by lastUsed within each group
                if (!aLastUsed && !bLastUsed) return 0;
                if (!aLastUsed) return 1;
                if (!bLastUsed) return -1;
                return new Date(bLastUsed) - new Date(aLastUsed);
            } else {
                // Default sorting: just by most recent usage
                if (!aLastUsed && !bLastUsed) return 0;
                if (!aLastUsed) return 1;
                if (!bLastUsed) return -1;
                return new Date(bLastUsed) - new Date(aLastUsed);
            }
        });
        
        grid.innerHTML = sortedIndexedLootboxes.map(({lootbox, originalIndex}) => {
            // Handle Group Box vs Regular Lootbox rendering
            if (lootbox.isGroupBox) {
                // Debug: Log Group Box being rendered
                console.log('Rendering Group Box:', {
                    name: lootbox.groupBoxName || lootbox.lootboxData?.name,
                    isOrganizerOnly: lootbox.isOrganizerOnly,
                    isCreator: lootbox.isCreator,
                    userRemainingTries: lootbox.userRemainingTries
                });
                
                // Group Box card rendering
                let chestImage = lootbox.lootboxData?.chestImage || 'chests/chest.png';
                if (chestImage.includes('chests/OwnedChests/')) {
                    chestImage = chestImage.replace('chests/OwnedChests/', 'chests/');
                }
                
                return `
                <div class="lootbox-card group-box-card" onclick="app.openGroupBoxFromList('${lootbox.groupBoxId}')">
                    <div class="group-box-badge">
                        <img src="assets/graphics/groupBoxImage.png" alt="Group Box" class="group-box-icon">
                        Group Box
                    </div>
                    <div class="lootbox-preview" style="background-image: url('${chestImage}')"></div>
                    <div class="lootbox-info">
                        <h3>${lootbox.groupBoxName || lootbox.lootboxData?.name}</h3>
                        <div class="lootbox-stats">
                            <span>Your Opens: ${lootbox.userTotalOpens || 0}</span>
                            <span>${lootbox.isOrganizerOnly ? 'Status: Creator' : `Tries Left: ${lootbox.userRemainingTries !== undefined ? lootbox.userRemainingTries : lootbox.settings?.triesPerPerson || 0}`}</span>
                        </div>
                        <div class="group-box-community-stats">
                            <span>👥 ${lootbox.uniqueUsers || 0} users</span>
                            <span>🎯 ${lootbox.totalOpens || 0} total opens</span>
                        </div>
                        <div class="lootbox-actions">
                            <button class="action-btn" onclick="event.stopPropagation(); app.favoriteGroupBox('${lootbox.groupBoxId}')">
                                <img src="${lootbox.favorite ? 'assets/graphics/favorite_star.png' : 'assets/graphics/empty_favorite_star.png'}" alt="Favorite" class="action-icon">
                            </button>
                            <button class="action-btn" onclick="event.stopPropagation(); app.shareGroupBoxLink('${lootbox.groupBoxId}')">
                                <img src="assets/graphics/share.png" alt="Share" class="action-icon">
                            </button>
                            <button class="action-btn" onclick="event.stopPropagation(); app.deleteGroupBox('${lootbox.groupBoxId}')">
                                <img src="assets/graphics/delete_x.png" alt="Delete" class="action-icon">
                            </button>
                        </div>
                    </div>
                </div>
                `;
            } else {
                // Regular lootbox card rendering
                let chestImage = lootbox.chestImage || 'chests/chest.png';
                if (chestImage.includes('chests/OwnedChests/')) {
                    chestImage = chestImage.replace('chests/OwnedChests/', 'chests/');
                }
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
                            <button class="action-btn" onclick="event.stopPropagation(); app.toggleGroupBox(${originalIndex})">
                                <img src="assets/graphics/groupBoxImage.png" alt="Group Box" class="action-icon">
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
            }
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
        
        // Check if organizer readonly mode and show banner
        const lootboxView = document.querySelector('.lootbox-view');
        let organizerBanner = document.getElementById('organizerBanner');
        
        if (this.isOrganizerReadonly) {
            // Add banner if it doesn't exist
            if (!organizerBanner) {
                organizerBanner = document.createElement('div');
                organizerBanner.id = 'organizerBanner';
                organizerBanner.className = 'organizer-banner';
                organizerBanner.innerHTML = `
                    <div class="organizer-banner-content">
                        <span class="organizer-icon">👤</span>
                        <span class="organizer-text">Organizer view — opens disabled</span>
                    </div>
                `;
                lootboxView.insertBefore(organizerBanner, lootboxView.children[2]); // Insert after title and tries info
            }
        } else {
            // Remove banner if it exists
            if (organizerBanner) {
                organizerBanner.remove();
            }
        }
        
        // Update tries info
        const triesInfo = document.getElementById('triesInfo');
        if (this.isOrganizerReadonly) {
            triesInfo.textContent = "Organizer - View Only";
        } else if (this.currentLootbox.maxTries === "unlimited") {
            triesInfo.textContent = "Unlimited tries";
        } else {
            triesInfo.textContent = `Tries remaining: ${this.currentLootbox.remainingTries}`;
        }
        
        // Set up click handler for the invisible button (or fallback to circle)
        const openButton = document.getElementById('openButton');
        const circle = document.getElementById('lootboxCircle');
        
        if (this.isOrganizerReadonly) {
            // Disable opening in organizer readonly mode
            if (openButton) {
                openButton.onclick = null;
                openButton.disabled = true;
                openButton.style.pointerEvents = 'none';
            }
            circle.onclick = null;
            circle.style.pointerEvents = 'none';
            circle.classList.add('organizer-readonly');
        } else {
            // Normal functionality
            if (openButton) {
                openButton.onclick = () => this.spinLootbox();
                openButton.disabled = false;
                openButton.style.pointerEvents = 'auto';
            } else {
                circle.onclick = () => this.spinLootbox();
            }
            circle.style.pointerEvents = 'auto';
            circle.classList.remove('organizer-readonly');
        }
        
        // Update chest image (migrate old paths)
        let chestImage = this.currentLootbox.chestImage || 'chests/chest.png';
        if (chestImage.includes('chests/OwnedChests/')) {
            chestImage = chestImage.replace('chests/OwnedChests/', 'chests/');
        }
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
        // Check if organizer readonly mode
        if (this.isOrganizerReadonly) {
            this.showToast('Organizer view — opens disabled');
            return;
        }

        // Check if on cooldown
        if (this.isOnCooldown) {
            return;
        }

        // Check if user is organizer-only for this group box
        if (this.currentLootbox && this.currentLootbox.isGroupBox) {
            const groupBox = this.participatedGroupBoxes.find(gb => gb.groupBoxId === this.currentLootbox.groupBoxId);
            if (groupBox && groupBox.isOrganizerOnly) {
                this.showToast('You are the organizer of this Group Box and cannot participate in opens');
                return;
            }
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

        // Save changes differently for group boxes vs personal lootboxes
        if (this.currentLootbox.isGroupBox) {
            await this.saveGroupBoxSpin(result);
        } else {
            this.lootboxes[this.currentLootboxIndex] = this.currentLootbox;
            await this.saveLootboxes();
        }

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
        // Clear any existing validation errors when opening modal
        this.clearValidationErrors();
        document.getElementById('editModal').classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        // Clear validation errors when closing modal
        this.clearValidationErrors();
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

    evenlyDistributeOdds() {
        const rows = document.querySelectorAll('#itemsList .item-row');
        if (rows.length === 0) return;
        
        const evenOdds = (1.0 / rows.length);
        
        rows.forEach(row => {
            const oddsInput = row.querySelector('.item-odds-input');
            oddsInput.value = evenOdds.toFixed(3);
        });
        
        this.updateTotalOdds();
    }

    randomizeOdds() {
        const rows = document.querySelectorAll('#itemsList .item-row');
        if (rows.length === 0) return;
        
        // Generate random values for each item
        const randomValues = [];
        let sum = 0;
        
        for (let i = 0; i < rows.length; i++) {
            const randomValue = Math.random();
            randomValues.push(randomValue);
            sum += randomValue;
        }
        
        // Normalize the random values so they add up to 1
        const normalizedOdds = randomValues.map(value => value / sum);
        
        // Apply the normalized odds to each input
        rows.forEach((row, index) => {
            const oddsInput = row.querySelector('.item-odds-input');
            oddsInput.value = normalizedOdds[index].toFixed(3);
        });
        
        this.updateTotalOdds();
    }

    async saveLootbox() {
        // Clear any existing errors
        this.clearValidationErrors();
        
        let hasErrors = false;
        
        // Validate lootbox name
        const name = document.getElementById('lootboxName').value.trim();
        if (!name) {
            this.showValidationError('lootboxName', 'nameError');
            hasErrors = true;
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

        // Validate items
        if (items.length === 0) {
            this.showValidationError(null, 'itemsError');
            hasErrors = true;
        }
        
        // If there are errors, don't save
        if (hasErrors) {
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

    deleteLootbox(index) {
        const lootbox = this.lootboxes[index];
        
        // Show custom delete confirmation modal
        document.getElementById('deleteLootboxName').textContent = lootbox.name;
        document.getElementById('deleteModal').classList.add('show');
        document.body.style.overflow = 'hidden';
        
        // Store the index for the actual deletion
        this.pendingDeleteIndex = index;
    }

    async confirmDeleteLootbox() {
        // Check if this is a Group Box deletion
        if (this.pendingDeleteGroupBoxId) {
            await this.confirmDeleteGroupBox();
            return;
        }
        
        // Handle regular lootbox deletion
        const index = this.pendingDeleteIndex;
        if (index === undefined) return;
        
        const lootbox = this.lootboxes[index];
        const lootboxName = lootbox.name;
        
        // Close modal first
        this.closeDeleteModal();
        
        try {
            // Delete from Firebase if it has an ID
            if (lootbox.id && this.isFirebaseReady) {
                try {
                    await this.deleteLootboxFromFirebase(lootbox.id);
                    console.log('Deleted from Firebase:', lootbox.id);
                } catch (error) {
                    console.error('Error deleting from Firebase:', error);
                }
            }
            
            // Remove from local array
            this.lootboxes.splice(index, 1);
            await this.saveLootboxes();
            this.renderLootboxes();
            
            // Show success message
            this.showSuccessMessage(`"${lootboxName}" has been deleted`);
            
        } catch (error) {
            console.error('Error deleting lootbox:', error);
            this.showSuccessMessage('Error deleting lootbox', true);
        }
        
        // Clear pending delete
        this.pendingDeleteIndex = undefined;
    }

    closeDeleteModal() {
        document.getElementById('deleteModal').classList.remove('show');
        document.body.style.overflow = '';
        this.pendingDeleteIndex = undefined;
        this.pendingDeleteGroupBoxId = undefined;
    }

    showSuccessMessage(message, isError = false) {
        const successMessage = document.getElementById('successMessage');
        const successText = document.getElementById('successText');
        const successContent = successMessage.querySelector('.success-content');
        
        successText.textContent = message;
        
        // Change styling for error messages
        if (isError) {
            successContent.style.color = '#dc2626';
            successMessage.querySelector('.success-icon').textContent = '❌';
        } else {
            successContent.style.color = '#059669';
            successMessage.querySelector('.success-icon').textContent = '✅';
        }
        
        // Show message
        successMessage.classList.add('show');
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            successMessage.classList.remove('show');
        }, 3000);
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
        
        // Store the index for sharing functions
        this.sharingLootboxIndex = index;
        
        // Show share options modal
        document.getElementById('shareLootboxName').textContent = lootbox.name;
        document.getElementById('shareModal').classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    async favoriteLootbox(index) {
        this.lootboxes[index].favorite = !this.lootboxes[index].favorite;
        await this.saveLootboxes();
        this.renderLootboxes();
    }

    toggleGroupBox(index) {
        alert('Group box features coming soon!');
    }

    async shareAsLootbox() {
        if (this.sharingLootboxIndex === undefined) return;
        
        const lootbox = this.lootboxes[this.sharingLootboxIndex];
        const data = encodeURIComponent(JSON.stringify(lootbox));
        const url = `${window.location.origin}${window.location.pathname}?share=${data}`;
        
        this.closeShareModal();
        
        // Try native share first
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${lootbox.name} - Lootbox Creator`,
                    text: `Check out this custom lootbox: ${lootbox.name}`,
                    url: url
                });
                this.showToast('Shared successfully');
                return;
            } catch (error) {
                // User cancelled share or error occurred
                if (error.name !== 'AbortError') {
                    console.warn('Native share failed:', error);
                } else {
                    // User cancelled, don't show error
                    return;
                }
            }
        }
        
        // Fallback to clipboard
        try {
            await navigator.clipboard.writeText(url);
            this.showToast('Link copied to clipboard');
        } catch (error) {
            console.error('Clipboard failed:', error);
            // Final fallback: show URL in toast for 6 seconds
            this.showToast(`Share link: ${url}`, 6000);
        }
    }


    closeShareModal() {
        document.getElementById('shareModal').classList.remove('show');
        document.body.style.overflow = '';
        this.sharingLootboxIndex = undefined;
        this.sharingLootboxCopy = undefined; // Clear the copy
    }



    filterLootboxes(filter) {
        this.currentFilter = filter;
        this.renderLootboxes();
    }

    showListView() {
        // Sync Group Box data if returning from a Group Box session
        if (this.currentLootbox && this.currentLootbox.isGroupBox) {
            this.syncParticipatedGroupBoxData();
        }
        
        document.getElementById('lootboxView').classList.add('hidden');
        document.getElementById('listView').classList.remove('hidden');
        
        // Clear session and community history when leaving lootbox view
        this.sessionHistory = [];
        this.communityHistory = [];
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
        
        // Reset organizer readonly flag
        this.isOrganizerReadonly = false;
        
        this.currentLootbox = null;
        
        // Refresh the lootbox list to ensure group boxes are visible
        this.renderLootboxes();
    }

    showMenu() {
        console.log('Hamburger menu clicked - implement features like export, import, settings, etc.');
    }

    addToHistory(itemName) {
        const isGroupBox = this.currentLootbox && this.currentLootbox.isGroupBox;
        
        if (isGroupBox) {
            // For Group Boxes, add to community history (this will be updated when we reload from Firebase)
            const userId = window.firebaseAuth?.currentUser?.uid || 'anonymous';
            const userName = userId === 'anonymous' ? 'Anonymous User' : `User ${userId.substring(0, 8)}`;
            
            const communityEntry = {
                userId: userId,
                userName: userName,
                item: itemName,
                timestamp: new Date(),
                sessionId: Date.now().toString()
            };
            
            // Add to local community history (will be at the top since it's most recent)
            this.communityHistory.unshift(communityEntry);
            
            // Keep only the most recent 50 entries
            if (this.communityHistory.length > 50) {
                this.communityHistory = this.communityHistory.slice(0, 50);
            }
        } else {
            // For personal lootboxes, add to session history
            const historyEntry = {
                item: itemName,
                timestamp: new Date(),
                lootboxName: this.currentLootbox.name
            };
            
            this.sessionHistory.unshift(historyEntry);
        }
        
        this.updateSessionDisplay();
    }

    updateSessionDisplay() {
        const historyList = document.getElementById('historyList');
        const totalPulls = document.getElementById('totalPulls');
        const sessionStats = document.getElementById('sessionStats');
        
        if (!historyList || !totalPulls || !sessionStats) return;
        
        // Check if this is a Group Box with community history
        const isGroupBox = this.currentLootbox && this.currentLootbox.isGroupBox;
        const historyData = isGroupBox ? this.communityHistory : this.sessionHistory;
        
        // Update total pulls
        totalPulls.textContent = historyData.length;
        
        // Generate item counts for stats
        const itemCounts = {};
        historyData.forEach(entry => {
            itemCounts[entry.item] = (itemCounts[entry.item] || 0) + 1;
        });
        
        // Update stats section
        const statsTitle = isGroupBox ? 'Community Pulls' : 'Session Pulls';
        sessionStats.innerHTML = `
            <div class="stat-item">${statsTitle}: <span id="totalPulls">${historyData.length}</span></div>
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
        
        if (historyData.length === 0) {
            const noHistoryMessage = isGroupBox ? 'No community pulls yet' : 'No pulls yet this session';
            historyList.innerHTML = `<div class="no-history">${noHistoryMessage}</div>`;
            return;
        }
        
        // Add history items
        historyData.forEach(entry => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            if (isGroupBox) {
                // Show community format: "UserName got: ItemName"
                historyItem.innerHTML = `
                    <span class="history-item-name">${entry.userName} got: ${entry.item}</span>
                    <span class="history-item-time">${entry.timestamp.toLocaleTimeString()}</span>
                `;
            } else {
                // Show personal format: "You got: ItemName"
                historyItem.innerHTML = `
                    <span class="history-item-name">You got: ${entry.item}</span>
                    <span class="history-item-time">${entry.timestamp.toLocaleTimeString()}</span>
                `;
            }
            
            historyList.appendChild(historyItem);
        });
    }

    clearHistory() {
        const isGroupBox = this.currentLootbox && this.currentLootbox.isGroupBox;
        
        if (isGroupBox) {
            // For Group Boxes, clear community history (this is mainly for debugging)
            this.communityHistory = [];
            console.log('Cleared community history (debug only - this does not affect Firestore data)');
        } else {
            // For personal lootboxes, clear session history
            this.sessionHistory = [];
        }
        
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

    async loadParticipatedGroupBoxes() {
        // Try to load from Firebase first, fallback to localStorage
        if (this.isFirebaseReady && window.firebaseDb && window.firebaseAuth && window.firebaseFunctions) {
            try {
                const currentUser = window.firebaseAuth.currentUser;
                if (currentUser) {
                    const { collection, getDocs } = window.firebaseFunctions;
                    const participatedRef = collection(window.firebaseDb, 'users', currentUser.uid, 'participated_group_boxes');
                    const querySnapshot = await getDocs(participatedRef);
                    const participatedGroupBoxes = [];
                    
                    querySnapshot.forEach((doc) => {
                        const data = doc.data();
                        participatedGroupBoxes.push({ 
                            id: doc.id, 
                            ...data,
                            isGroupBox: true
                        });
                    });
                    
                    console.log(`Loaded ${participatedGroupBoxes.length} participated group boxes from Firebase`);
                    
                    // Also save to localStorage as backup
                    localStorage.setItem('participatedGroupBoxes', JSON.stringify(participatedGroupBoxes));
                    
                    return participatedGroupBoxes;
                }
            } catch (error) {
                console.error('Error loading participated group boxes from Firebase:', error);
            }
        }
        
        // Fallback to localStorage
        try {
            const saved = localStorage.getItem('participatedGroupBoxes');
            const participatedGroupBoxes = saved ? JSON.parse(saved) : [];
            console.log(`Loaded ${participatedGroupBoxes.length} participated group boxes from localStorage`);
            return participatedGroupBoxes;
        } catch (error) {
            console.error('Error loading participated group boxes from localStorage:', error);
            return [];
        }
    }











    showValidationError(inputId, errorId) {
        // Add error class to input field if provided
        if (inputId) {
            const input = document.getElementById(inputId);
            if (input) {
                input.classList.add('error');
            }
        }
        
        // Show error message
        const errorElement = document.getElementById(errorId);
        if (errorElement) {
            errorElement.classList.remove('hidden');
        }
    }

    clearValidationErrors() {
        // Remove error classes from all inputs
        const inputs = document.querySelectorAll('.form-input');
        inputs.forEach(input => input.classList.remove('error'));
        
        // Hide all error messages
        const errorMessages = document.querySelectorAll('.error-message');
        errorMessages.forEach(error => error.classList.add('hidden'));
    }

    showToast(message, durationMs = 3000) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            console.error('Toast container not found');
            return;
        }

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        toastContainer.appendChild(toast);

        // Trigger show animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        // Auto-hide and remove toast
        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, durationMs);
    }

    async fallbackToClipboard(url, itemName) {
        try {
            await navigator.clipboard.writeText(url);
            this.showToast('Link copied to clipboard');
        } catch (error) {
            console.error('Clipboard failed:', error);
            // Final fallback: show URL in toast for 6 seconds
            this.showToast(`Share link: ${url}`, 6000);
        }
    }

    deepCopyLootbox(lootbox) {
        return {
            name: lootbox.name,
            items: lootbox.items.map(item => ({
                name: item.name,
                odds: item.odds
            })),
            chestImage: lootbox.chestImage || 'chests/chest.png',
            revealContents: lootbox.revealContents,
            revealOdds: lootbox.revealOdds,
            maxTries: lootbox.maxTries,
            remainingTries: lootbox.remainingTries,
            spins: 0, // Reset stats for the copy
            lastUsed: new Date().toISOString(),
            favorite: false, // Reset favorite status for copy
            isGroupBox: false // Start as regular lootbox, will be converted to group box
        };
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

function evenlyDistributeOdds() {
    app.evenlyDistributeOdds();
}

function randomizeOdds() {
    app.randomizeOdds();
}

function closeDeleteModal() {
    app.closeDeleteModal();
}

function confirmDelete() {
    app.confirmDeleteLootbox();
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

function closeShareModal() {
    app.closeShareModal();
}

function shareAsLootbox() {
    app.shareAsLootbox();
}

function shareAsGroupBox() {
    app.shareAsGroupBox();
}

function closeGroupBoxModal() {
    app.closeGroupBoxModal();
}

function createGroupBox() {
    app.createGroupBox();
}

// Initialize app
const app = new LootboxApp();

// Handle shared lootboxes and group boxes
const urlParams = new URLSearchParams(window.location.search);
const sharedData = urlParams.get('share');
const groupBoxId = urlParams.get('groupbox');

if (sharedData) {
    try {
        const sharedLootbox = JSON.parse(decodeURIComponent(sharedData));
        
        // Wait for app to be ready before adding shared lootbox
        const waitForApp = setInterval(async () => {
            if (app.isFirebaseReady) {
                clearInterval(waitForApp);
                
                // Check if this lootbox already exists (by name and items)
                const exists = app.lootboxes.some(existing => 
                    existing.name === sharedLootbox.name && 
                    JSON.stringify(existing.items) === JSON.stringify(sharedLootbox.items)
                );
                
                if (exists) {
                    alert(`"${sharedLootbox.name}" is already in your collection!`);
                } else {
                    // Clean up the lootbox data for import
                    const cleanLootbox = {
                        name: sharedLootbox.name,
                        items: sharedLootbox.items,
                        chestImage: sharedLootbox.chestImage || 'chests/chest.png',
                        revealContents: sharedLootbox.revealContents !== false, // Default to true
                        revealOdds: sharedLootbox.revealOdds !== false, // Default to true
                        maxTries: sharedLootbox.maxTries || "unlimited",
                        remainingTries: sharedLootbox.remainingTries || sharedLootbox.maxTries || "unlimited",
                        spins: 0, // Reset stats for imported lootbox
                        lastUsed: null, // Reset usage
                        favorite: false, // Not a favorite by default
                        imported: true, // Mark as imported
                        importedAt: new Date().toISOString()
                    };
                    
                    // Add to collection
                    app.lootboxes.push(cleanLootbox);
                    
                    // Save to Firebase/localStorage
                    await app.saveLootboxes();
                    
                    // Update display
                    app.renderLootboxes();
                    
                    // Show success message
                    alert(`✨ Successfully imported "${cleanLootbox.name}"!\n\nIt has been added to your collection.`);
                    
                    console.log('Successfully imported shared lootbox:', cleanLootbox.name);
                }
                
                // Clean up URL after import
                const newUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
            }
        }, 100);
    } catch (error) {
        console.error('Error importing shared lootbox:', error);
        alert('❌ Error importing lootbox. The share link may be corrupted.');
        
        // Clean up URL even on error
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
}

if (groupBoxId) {
    // Wait for app to be ready before loading group box
    const waitForApp = setInterval(async () => {
        if (app.isFirebaseReady) {
            clearInterval(waitForApp);
            await app.loadAndOpenGroupBox(groupBoxId);
        }
    }, 100);
}