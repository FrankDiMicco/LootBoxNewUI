const UIRenderer = {
    renderLootboxes() {
        const app = window.app || { currentFilter: 'all', lootboxes: [], participatedGroupBoxes: [] };
        if (!window.app) { console.warn('UIRenderer: window.app not set yet; using empty state'); }
        const grid = document.getElementById('lootboxGrid');
        const emptyState = document.getElementById('emptyState');
        
        // Filter lootboxes based on current filter
        let filteredLootboxes = [];
        
        // Debug: Log what we're working with
        console.log('renderLootboxes called with:', {
            currentFilter: window.app.currentFilter,
            personalLootboxes: window.app.lootboxes.length,
            participatedGroupBoxes: window.app.participatedGroupBoxes.length,
            groupBoxDetails: window.app.participatedGroupBoxes.map(gb => ({
                name: gb.groupBoxName,
                isOrganizerOnly: gb.isOrganizerOnly,
                isCreator: gb.isCreator
            }))
        });
        
        if (window.app.currentFilter === 'all') {
            // Show both personal lootboxes and participated group boxes
            filteredLootboxes = [...window.app.lootboxes, ...window.app.participatedGroupBoxes];
        } else if (window.app.currentFilter === 'favorites') {
            // Show favorited personal lootboxes and favorited group boxes
            const favoriteLootboxes = window.app.lootboxes.filter(lootbox => lootbox.favorite);
            const favoriteGroupBoxes = window.app.participatedGroupBoxes.filter(groupBox => groupBox.favorite);
            filteredLootboxes = [...favoriteLootboxes, ...favoriteGroupBoxes];
        } else if (window.app.currentFilter === 'shared') {
            // Show only participated group boxes for shared filter
            filteredLootboxes = window.app.participatedGroupBoxes;
        }
        
        console.log('Filtered lootboxes count:', filteredLootboxes.length);
        
        if (filteredLootboxes.length === 0) {
            grid.style.display = 'none';
            emptyState.classList.remove('hidden');
            
            // Update empty state text based on filter
            const emptyTitle = emptyState.querySelector('h3');
            const emptyText = emptyState.querySelector('p');
            
            if (window.app.currentFilter === 'shared') {
                emptyTitle.textContent = 'No Shared Group Boxes Yet';
                emptyText.textContent = 'Share a lootbox as a Group Box to get started!';
            } else if (window.app.currentFilter === 'favorites') {
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
                originalIndex = window.app.lootboxes.findIndex(lb => lb === lootbox);
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
        // For Group Boxes, use lastParticipated, fallback to firstParticipated
        // Both will be the same for newly created Group Boxes, ensuring they appear at top
        const lastDate = lootbox.lastParticipated || lootbox.firstParticipated;
        return lastDate ? (lastDate.toDate ? lastDate.toDate() : new Date(lastDate)) : new Date(0);
    } else {
        // For personal lootboxes, use lastUsed
        return lootbox.lastUsed ? new Date(lootbox.lastUsed) : new Date(0);
    }
};
            
            const aLastUsed = getLastUsedDate(a.lootbox);
            const bLastUsed = getLastUsedDate(b.lootbox);
            
            // If filtering by favorites, prioritize favorites first
            if (window.app.currentFilter === 'favorites') {
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
                <div class="lootbox-card group-box-card${lootbox.isOrganizerOnly ? ' organizer-only' : ''}" onclick="app.openGroupBoxFromList('${lootbox.groupBoxId}')">
                    ${(lootbox.userTotalOpens || 0) === 0 && !lootbox.isOrganizerOnly ? '<div class="new-box-badge"><span class="new-box-label">New Box</span></div>' : ''}
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
                            ${lootbox.isOrganizerOnly ? `<button class="action-btn" onclick="event.stopPropagation(); app.editGroupBox('${lootbox.groupBoxId}')">
                                <img src="assets/graphics/settings_cog.png" alt="Edit" class="action-icon">
                            </button>` : ''}
                            <button class="action-btn" onclick="event.stopPropagation(); app.favoriteGroupBox('${lootbox.groupBoxId}')">
                                <img src="${lootbox.favorite ? 'assets/graphics/favorite_star.png' : 'assets/graphics/empty_favorite_star.png'}" alt="Favorite" class="action-icon">
                            </button>
                            ${lootbox.isCreator ? `<button class="action-btn" onclick="event.stopPropagation(); app.shareGroupBoxLink('${lootbox.groupBoxId}')">
                                <img src="assets/graphics/share.png" alt="Share" class="action-icon">
                            </button>` : ''}
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
                    ${(lootbox.spins || 0) === 0 ? '<div class="new-box-badge"><span class="new-box-label">New Box</span></div>' : ''}
                    <div class="lootbox-preview" style="background-image: url('${chestImage}')"></div>
                    <div class="lootbox-info">
                        <h3>${lootbox.name}</h3>
                        <div class="lootbox-stats">
                            ${(lootbox.spins || 0) === 0 ? '' : `<span>Opens: ${lootbox.spins || 0}</span><span>Used: ${window.app.timeAgo(lootbox.lastUsed)}</span>`}
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
    },

    renderLootboxView() {
        document.getElementById('lootboxTitle').textContent = window.app.currentLootbox.name;
        
        // Check if organizer readonly mode and show banner
        const lootboxView = document.querySelector('.lootbox-view');
        let organizerBanner = document.getElementById('organizerBanner');
        
        if (window.app.isOrganizerReadonly) {
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
        if (window.app.isOrganizerReadonly) {
            triesInfo.textContent = "Organizer - View Only";
        } else if (window.app.currentLootbox.maxTries === "unlimited") {
            triesInfo.textContent = "Unlimited tries";
        } else {
            triesInfo.textContent = `Tries remaining: ${window.app.currentLootbox.remainingTries}`;
        }
        
        // Set up click handler for the invisible button (or fallback to circle)
        const openButton = document.getElementById('openButton');
        const circle = document.getElementById('lootboxCircle');
        
        if (window.app.isOrganizerReadonly) {
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
                openButton.onclick = () => window.app.spinLootbox();
                openButton.disabled = false;
                openButton.style.pointerEvents = 'auto';
            } else {
                circle.onclick = () => window.app.spinLootbox();
            }
            circle.style.pointerEvents = 'auto';
            circle.classList.remove('organizer-readonly');
        }
        
        // Update chest image (migrate old paths)
        let chestImage = window.app.currentLootbox.chestImage || 'chests/chest.png';
        if (chestImage.includes('chests/OwnedChests/')) {
            chestImage = chestImage.replace('chests/OwnedChests/', 'chests/');
        }
        circle.style.backgroundImage = `url('${chestImage}')`;
        
        // Render items if content should be revealed
        const itemsContainer = document.getElementById('lootboxItems');
        if (window.app.currentLootbox.revealContents) {
            itemsContainer.innerHTML = window.app.currentLootbox.items.map(item => `
                <div class="lootbox-item">
                    <div class="item-name">${item.name}</div>
                    ${window.app.currentLootbox.revealOdds ? `<div class="item-odds">${(item.odds * 100).toFixed(1)}%</div>` : ''}
                </div>
            `).join('');
        } else {
            itemsContainer.innerHTML = '';
        }
    },

    updateSessionDisplay() {
        const historyList = document.getElementById('historyList');
        const totalPulls = document.getElementById('totalPulls');
        const sessionStats = document.getElementById('sessionStats');
        
        if (!historyList || !totalPulls || !sessionStats) return;
        
        // Check if this is a Group Box with community history
        const isGroupBox = window.app.currentLootbox && window.app.currentLootbox.isGroupBox;
        const historyData = isGroupBox ? window.app.communityHistory : window.app.sessionHistory;
        
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
                // Check if this is a join event
                if (entry.action === 'join') {
                    // Show join format: "UserName has joined the box."
                    historyItem.innerHTML = `
                        <span class="history-item-name join-event">${entry.userName} has joined the box.</span>
                        <span class="history-item-time">${entry.timestamp.toLocaleTimeString()}</span>
                    `;
                    historyItem.classList.add('join-history-item');
                } else if (entry.action === 'leave' || entry.item === null) {
                    // Show leave format: "UserName has left the box."
                    historyItem.innerHTML = `
                        <span class="history-item-name leave-event">${entry.userName} has left the box.</span>
                        <span class="history-item-time">${entry.timestamp.toLocaleTimeString()}</span>
                    `;
                    historyItem.classList.add('leave-history-item');
                } else {
                    // Show community format: "UserName got: ItemName"
                    historyItem.innerHTML = `
                        <span class="history-item-name">${entry.userName} got: ${entry.item}</span>
                        <span class="history-item-time">${entry.timestamp.toLocaleTimeString()}</span>
                    `;
                }
            } else {
                // Show personal format: "You got: ItemName"
                historyItem.innerHTML = `
                    <span class="history-item-name">You got: ${entry.item}</span>
                    <span class="history-item-time">${entry.timestamp.toLocaleTimeString()}</span>
                `;
            }
            
            historyList.appendChild(historyItem);
        });
    },

    showEditModal() {
        // Clear any existing validation errors when opening modal
        window.app.clearValidationErrors();
        document.getElementById('editModal').classList.add('show');
        document.body.style.overflow = 'hidden';
    },

    closeModal() {
        // Clear validation errors when closing modal
        window.app.clearValidationErrors();
        document.getElementById('editModal').classList.remove('show');
        document.body.style.overflow = '';
    },

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
    },

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
    },

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
    },

    clearValidationErrors() {
        // Remove error classes from all inputs
        const inputs = document.querySelectorAll('.form-input');
        inputs.forEach(input => input.classList.remove('error'));
        
        // Hide all error messages
        const errorMessages = document.querySelectorAll('.error-message');
        errorMessages.forEach(error => error.classList.add('hidden'));
    }
};

// Make available globally first
window.UIRenderer = UIRenderer;
// Then extend app if it exists
if (window.app) {
    Object.assign(window.app, UIRenderer);
}