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
    
    // Wait for extensions to load, then initialize
    this.waitForExtensionsAndInitialize();
}

async waitForExtensionsAndInitialize() {
    // Wait for extensions to be available
    while (!window.UIRenderer || !window.GroupBoxExtension) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Load extensions
    Object.assign(this, window.UIRenderer);
    Object.assign(this, window.GroupBoxExtension);
    
    // Now initialize the app
    this.initializeApp();
}

    
    renderLootboxes() {
        if (window.UIRenderer && typeof window.UIRenderer.renderLootboxes === 'function') {
            window.UIRenderer.renderLootboxes();
        } else {
            // Wait for UI module to be ready
            const onReady = () => {
                if (window.UIRenderer && typeof window.UIRenderer.renderLootboxes === 'function') {
                    window.UIRenderer.renderLootboxes();
                }
                document.removeEventListener('ui:ready', onReady);
            };
            document.addEventListener('ui:ready', onReady, { once: true });
        }
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
            // Use app reference instead of this to ensure method is available
            app.filterLootboxes(e.target.dataset.filter);
        });
    });

    // Modal checkbox listeners
    document.getElementById('unlimitedTries').addEventListener('change', (e) => {
        document.getElementById('maxTriesGroup').style.display = e.target.checked ? 'none' : 'block';
    });

    // Modal close on backdrop click
    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target.id === 'editModal') {
            // Use app reference instead of this
            app.closeModal();
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
                    const { collection, getDocs, query, where } = window.firebaseFunctions;
                    
                    // Query 1: Boxes where participants contains my uid
                    const participatedRef = collection(window.firebaseDb, 'users', currentUser.uid, 'participated_group_boxes');
                    const participatedSnapshot = await getDocs(participatedRef);
                    const participatedBoxes = [];
                    
                    participatedSnapshot.forEach((doc) => {
                        const data = doc.data();
                        participatedBoxes.push({ 
                            id: doc.id, 
                            ...data,
                            isGroupBox: true
                        });
                    });
                    
                    console.log(`Loaded ${participatedBoxes.length} participated group boxes`);
                    
                    // Query 2: Boxes where createdBy == my uid AND organizerOnly == true
                    const organizerRef = collection(window.firebaseDb, 'group_boxes');
                    const organizerQuery = query(
                        organizerRef, 
                        where('createdBy', '==', currentUser.uid),
                        where('organizerOnly', '==', true)
                    );
                    const organizerSnapshot = await getDocs(organizerQuery);
                    const organizerBoxes = [];
                    
                    organizerSnapshot.forEach((doc) => {
                        const data = doc.data();
                        organizerBoxes.push({
                            id: doc.id,
                            groupBoxId: doc.id,
                            groupBoxName: data.lootboxData?.name || data.name,
                            lootboxData: data.lootboxData,
                            settings: data.settings,
                            createdBy: data.createdBy,
                            creatorName: data.creatorName,
                            totalOpens: data.totalOpens || 0,
                            uniqueUsers: data.uniqueUsers || 0,
                            firstParticipated: data.createdAt,
                            lastParticipated: data.createdAt,
                            userTotalOpens: 0, // Organizer hasn't opened any
                            userRemainingTries: 0, // Organizer has no tries
                            isCreator: true,
                            isOrganizerOnly: true,
                            favorite: false,
                            isGroupBox: true
                        });
                    });
                    
                    console.log(`Loaded ${organizerBoxes.length} organizer-only group boxes`);
                    
                    // Merge both result sets, avoiding duplicates
                    const allGroupBoxes = [...participatedBoxes];
                    organizerBoxes.forEach(organizerBox => {
                        // Check if this box is already in participated boxes
                        const existingIndex = allGroupBoxes.findIndex(pb => pb.groupBoxId === organizerBox.groupBoxId);
                        if (existingIndex === -1) {
                            allGroupBoxes.push(organizerBox);
                        } else {
                            // Update existing entry to ensure it has organizer flags
                            allGroupBoxes[existingIndex] = {
                                ...allGroupBoxes[existingIndex],
                                ...organizerBox
                            };
                        }
                    });
                    
                    console.log(`Total merged group boxes: ${allGroupBoxes.length}`);
                    
                    // Also save to localStorage as backup
                    localStorage.setItem('participatedGroupBoxes', JSON.stringify(allGroupBoxes));
                    
                    return allGroupBoxes;
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

function closeGroupBoxEditModal() {
    app.closeGroupBoxEditModal();
}

// Initialize app
window.app = new LootboxApp();
const app = window.app;

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