const GroupBoxExtension = {
    shareAsGroupBox() {
        if (app.sharingLootboxIndex === undefined) return;
        
        const originalLootbox = app.lootboxes[app.sharingLootboxIndex];
        
        // Create a deep copy of the original lootbox
        const lootboxCopy = app.deepCopyLootbox(originalLootbox);
        
        // Store the copy for use in createGroupBox (instead of the original index)
        app.sharingLootboxCopy = lootboxCopy;
        
        // Pre-fill the group box name with original name + " - Group Box"
        document.getElementById('groupBoxName').value = `${originalLootbox.name} - Group Box`;
        
        // Reset form to defaults
        document.getElementById('triesPerPerson').value = 3;
        document.getElementById('expiresIn').value = '24';
        document.getElementById('creatorParticipates').checked = true;
        document.getElementById('hideContents').checked = true;
        document.getElementById('hideOdds').checked = true;
        
        // Hide share modal and show group box modal
        document.getElementById('shareModal').classList.remove('show');
        document.getElementById('groupBoxModal').classList.add('show');
        document.body.style.overflow = 'hidden';
    },

    closeGroupBoxModal() {
        document.getElementById('groupBoxModal').classList.remove('show');
        document.body.style.overflow = '';
        // Clear the sharing data when user cancels group box creation
        app.sharingLootboxIndex = undefined;
        app.sharingLootboxCopy = undefined;
    },

    async createGroupBox() {
        // Use the copy instead of the original
        if (!app.sharingLootboxCopy) return;
        
        // Check Firebase auth first
        if (!app.isFirebaseReady || !window.firebaseAuth?.currentUser) {
            console.error('Firebase auth not ready or user not authenticated');
            app.showToast('Authentication required. Please wait and try again.');
            return;
        }
        
        const currentUser = window.firebaseAuth.currentUser;
        const lootbox = app.sharingLootboxCopy; // Use the copy
        const groupBoxName = document.getElementById('groupBoxName').value.trim();
        
        // Validate required inputs
        if (!groupBoxName) {
            app.showSuccessMessage('Please enter a group box name', true);
            return;
        }
        
        if (!lootbox || !lootbox.items || lootbox.items.length === 0) {
            app.showSuccessMessage('Invalid lootbox data. Please try again.', true);
            return;
        }
        
        try {
            // Fix expiresAt to avoid undefined values
            const expiresValue = document.getElementById('expiresIn').value;
            const expiresAt = (expiresValue === 'never') 
                ? null 
                : new Date(Date.now() + Number(expiresValue) * 60 * 60 * 1000);
            
            // Get creator participation setting
            const creatorParticipates = Boolean(document.getElementById('creatorParticipates').checked);
            
            // Prepare group box data with all required fields properly set
            const groupBoxData = {
                createdBy: currentUser.uid, // Required by Firestore rules
                creatorName: `User ${currentUser.uid.substring(0, 8)}`, // Generate consistent creator name
                organizerOnly: !creatorParticipates, // New field for query filtering
                lootboxData: {
                    name: groupBoxName, // Use group box name, not lootbox name
                    items: lootbox.items,
                    chestImage: lootbox.chestImage || 'chests/chest.png'
                },
                settings: {
                    triesPerPerson: Number(document.getElementById('triesPerPerson').value) || 1,
                    expiresAt: expiresAt,
                    creatorParticipates: creatorParticipates,
                    hideContents: Boolean(document.getElementById('hideContents').checked),
                    hideOdds: Boolean(document.getElementById('hideOdds').checked)
                },
                totalOpens: 0,
                uniqueUsers: 0,
                createdAt: new Date(),
                status: 'active'
            };
            
            // Validate data before saving
            if (!groupBoxData.lootboxData.items || groupBoxData.lootboxData.items.length === 0) {
                throw new Error('No items in lootbox to share');
            }
            
            // Save to Firebase group_boxes collection
            if (!window.firebaseDb || !window.firebaseFunctions) {
                throw new Error('Firebase database not available');
            }
            
            const { collection, addDoc } = window.firebaseFunctions;
            console.log('Creating group box with data:', groupBoxData);
            
            const docRef = await addDoc(collection(window.firebaseDb, 'group_boxes'), groupBoxData);
            console.log('Group Box created with ID:', docRef.id);
            
            // Generate shareable link
            const groupBoxUrl = `${window.location.origin}${window.location.pathname}?groupbox=${docRef.id}`;
            
            // Always add creator to participated group boxes (for visibility)
            const participatedGroupBox = {
                groupBoxId: docRef.id,
                groupBoxName: groupBoxName,
                lootboxData: {
                    name: groupBoxName,
                    items: lootbox.items,
                    chestImage: lootbox.chestImage
                },
                settings: groupBoxData.settings,
                createdBy: currentUser.uid,
                creatorName: `User ${currentUser.uid.substring(0, 8)}`,
                totalOpens: 0,
                uniqueUsers: 0,
                firstParticipated: new Date(),
                lastParticipated: new Date(),
                userTotalOpens: 0,
                userRemainingTries: creatorParticipates ? groupBoxData.settings.triesPerPerson : 0,
                isCreator: true, // Mark as creator
                isOrganizerOnly: !creatorParticipates, // Mark if organizer-only
                favorite: false,
                isGroupBox: true
            };
            
            // Debug log for participatedGroupBox creation
            console.log('Creating participatedGroupBox:', {
                groupBoxName: participatedGroupBox.groupBoxName,
                creatorParticipates: creatorParticipates,
                isOrganizerOnly: participatedGroupBox.isOrganizerOnly,
                userRemainingTries: participatedGroupBox.userRemainingTries
            });
            
            // Add to local array immediately for instant UI update
            const existingIndex = app.participatedGroupBoxes.findIndex(gb => gb.groupBoxId === docRef.id);
            if (existingIndex >= 0) {
                app.participatedGroupBoxes[existingIndex] = participatedGroupBox;
            } else {
                app.participatedGroupBoxes.push(participatedGroupBox);
            }

            // Save to Firebase/localStorage in background (async)
            app.saveParticipatedGroupBox(participatedGroupBox);

            // Debug: Log the local array after adding
            console.log('Participated group boxes after adding:', app.participatedGroupBoxes.map(gb => ({
                name: gb.groupBoxName,
                isOrganizerOnly: gb.isOrganizerOnly,
                isCreator: gb.isCreator,
                id: gb.groupBoxId
            })));

            // Immediately refresh the home screen and close modal
            app.renderLootboxes();
            app.closeGroupBoxModal();
            
            // Try native share first, then fallback to clipboard
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: `${groupBoxName} - Group Box`,
                        text: `Join this shared lootbox group: ${groupBoxName}`,
                        url: groupBoxUrl
                    });
                    app.showToast('Group Box created and shared!');
                } catch (shareError) {
                    if (shareError.name !== 'AbortError') {
                        console.warn('Native share failed:', shareError);
                        // Fallback to clipboard
                        await app.fallbackToClipboard(groupBoxUrl, groupBoxName);
                    } else {
                        // User cancelled, still show success for creation
                        app.showToast('Group Box created successfully');
                    }
                }
            } else {
                // Fallback to clipboard
                await app.fallbackToClipboard(groupBoxUrl, groupBoxName);
            }
            
        } catch (error) {
            console.error('Group Box creation failed:', error.code, error.message);
            app.showToast(`Create failed: ${error.code || ''} ${error.message || error}`);
        }
        
        // Always clear the copy after attempt (success or failure)
        app.sharingLootboxCopy = undefined;
    },

    async recordJoinEvent(groupBoxId, userId) {
        try {
            if (!app.isFirebaseReady || !window.firebaseDb || !window.firebaseFunctions) {
                console.log('Firebase not available for recording join event');
                return;
            }

            const { collection, addDoc } = window.firebaseFunctions;
            const userName = userId === 'anonymous' ? 'Anonymous User' : `User ${userId.substring(0, 8)}`;
            
            // Create join event data
            const joinData = {
                userId: userId,
                userName: userName,
                item: null, // Special marker for non-item events
                action: 'join',
                timestamp: new Date(),
                sessionId: Date.now().toString()
            };
            
            // Save to the opens collection so it appears in community history
            await addDoc(collection(window.firebaseDb, 'group_boxes', groupBoxId, 'opens'), joinData);
            
            console.log('Recorded join event for:', userName, 'in group box:', groupBoxId);
            
        } catch (error) {
            console.error('Error recording join event:', error);
        }
    },

    async saveParticipatedGroupBox(groupBoxData) {
        try {
            if (!app.isFirebaseReady || !window.firebaseDb || !window.firebaseAuth || !window.firebaseFunctions) {
                console.error('Firebase not available for saving participated group box');
                return;
            }

            const currentUser = window.firebaseAuth.currentUser;
            if (!currentUser) {
                console.error('No authenticated user for saving participated group box');
                return;
            }

            const { doc, setDoc } = window.firebaseFunctions;
            const participatedRef = doc(window.firebaseDb, 'users', currentUser.uid, 'participated_group_boxes', groupBoxData.groupBoxId);
            
            const participatedData = {
                groupBoxId: groupBoxData.groupBoxId,
                groupBoxName: groupBoxData.groupBoxName || groupBoxData.name,
                lootboxData: {
                    name: groupBoxData.groupBoxName || groupBoxData.name,
                    items: groupBoxData.lootboxData?.items || groupBoxData.items,
                    chestImage: groupBoxData.lootboxData?.chestImage || groupBoxData.chestImage
                },
                settings: groupBoxData.settings,
                createdBy: groupBoxData.createdBy,
                creatorName: groupBoxData.creatorName,
                totalOpens: groupBoxData.totalOpens || 0,
                uniqueUsers: groupBoxData.uniqueUsers || 0,
                firstParticipated: groupBoxData.firstParticipated || new Date(),
                lastParticipated: groupBoxData.lastParticipated || new Date(),
                userTotalOpens: groupBoxData.userTotalOpens || groupBoxData.spins || 0,
                userRemainingTries: groupBoxData.userRemainingTries || groupBoxData.remainingTries,
                isCreator: groupBoxData.isCreator || false,
                isOrganizerOnly: groupBoxData.isOrganizerOnly || false
            };

            await setDoc(participatedRef, participatedData, { merge: true });
            
            // Update local array
            const existingIndex = app.participatedGroupBoxes.findIndex(gb => gb.groupBoxId === groupBoxData.groupBoxId);
            const newGroupBoxEntry = { 
                id: groupBoxData.groupBoxId, 
                ...participatedData,
                isGroupBox: true
            };
            
            console.log('saveParticipatedGroupBox - saving entry:', {
                groupBoxId: groupBoxData.groupBoxId,
                isOrganizerOnly: newGroupBoxEntry.isOrganizerOnly,
                isCreator: newGroupBoxEntry.isCreator,
                existingIndex: existingIndex
            });
            
            if (existingIndex >= 0) {
                app.participatedGroupBoxes[existingIndex] = newGroupBoxEntry;
                console.log('Updated existing group box at index:', existingIndex);
            } else {
                app.participatedGroupBoxes.push(newGroupBoxEntry);
                console.log('Added new group box, total count:', app.participatedGroupBoxes.length);
            }
            
            // Save to localStorage as backup
            localStorage.setItem('participatedGroupBoxes', JSON.stringify(app.participatedGroupBoxes));
            
            console.log('Successfully saved participated group box:', groupBoxData.name);
            
        } catch (error) {
            console.error('Error saving participated group box:', error);
        }
    },

    async loadAndOpenGroupBox(groupBoxId) {
        try {
            if (!app.isFirebaseReady || !window.firebaseDb || !window.firebaseFunctions) {
                alert('❌ Firebase not available. Cannot load Group Box.');
                return;
            }

            const { doc, getDoc } = window.firebaseFunctions;
            const groupBoxRef = doc(window.firebaseDb, 'group_boxes', groupBoxId);
            const groupBoxSnap = await getDoc(groupBoxRef);

            if (!groupBoxSnap.exists()) {
                alert('❌ Group Box not found or has expired.');
                // Clean up URL
                const newUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
                return;
            }

            const groupBoxData = groupBoxSnap.data();
            
            // Step 2: Compute organizer-readonly flag
            const currentUser = window.firebaseAuth.currentUser;
            const isOrganizer = currentUser && (currentUser.uid === groupBoxData.createdBy);
            const organizerReadonly = isOrganizer && groupBoxData.settings && groupBoxData.settings.creatorParticipates === false;
            
            // Save flag on app instance for this view
            app.isOrganizerReadonly = organizerReadonly;
            
            console.log('Group Box organizer check:', {
                currentUserId: currentUser?.uid,
                createdBy: groupBoxData.createdBy,
                isOrganizer: isOrganizer,
                creatorParticipates: groupBoxData.settings?.creatorParticipates,
                organizerReadonly: organizerReadonly
            });
            
            // Check if group box has expired
            if (groupBoxData.settings.expiresAt && new Date(groupBoxData.settings.expiresAt.toDate()) < new Date()) {
                alert('❌ This Group Box has expired.');
                // Clean up URL
                const newUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
                return;
            }

            // Check if group box is active
            if (groupBoxData.status !== 'active') {
                alert('❌ This Group Box is no longer active.');
                // Clean up URL
                const newUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, newUrl);
                return;
            }

            // Check user's existing tries for this group box
            const userId = window.firebaseAuth.currentUser?.uid || 'anonymous';
            const userTriesRef = doc(window.firebaseDb, 'group_boxes', groupBoxId, 'user_tries', userId);
            const userTriesSnap = await getDoc(userTriesRef);
            
            let remainingTries = groupBoxData.settings.triesPerPerson;
            let totalOpens = 0;
            let isFirstTimeJoining = false;
            
            if (userTriesSnap.exists()) {
                const userTriesData = userTriesSnap.data();
                remainingTries = userTriesData.remainingTries;
                totalOpens = userTriesData.totalOpens;
            } else {
                // This is the user's first time accessing this group box
                isFirstTimeJoining = true;
            }

            // Create a temporary lootbox object from the group box data
            const groupBoxLootbox = {
                name: groupBoxData.lootboxData.name,
                items: groupBoxData.lootboxData.items,
                chestImage: groupBoxData.lootboxData.chestImage || 'chests/chest.png',
                revealContents: !groupBoxData.settings.hideContents,
                revealOdds: !groupBoxData.settings.hideOdds,
                maxTries: groupBoxData.settings.triesPerPerson,
                remainingTries: remainingTries,
                spins: totalOpens,
                lastUsed: new Date().toISOString(),
                favorite: false,
                isGroupBox: true,
                groupBoxId: groupBoxId,
                groupBoxData: groupBoxData
            };

            // Prepare complete group box data for saving to participated collection
            const participatedGroupBoxData = {
                groupBoxId: groupBoxId,
                groupBoxName: groupBoxData.lootboxData.name,
                lootboxData: groupBoxData.lootboxData,
                settings: groupBoxData.settings,
                createdBy: groupBoxData.createdBy,
                creatorName: groupBoxData.creatorName || `User ${groupBoxData.createdBy.substring(0, 8)}`,
                totalOpens: groupBoxData.totalOpens || 0,
                uniqueUsers: groupBoxData.uniqueUsers || 0,
                firstParticipated: new Date(),
                lastParticipated: new Date(),
                userTotalOpens: totalOpens,
                userRemainingTries: remainingTries,
                isCreator: currentUser && (currentUser.uid === groupBoxData.createdBy),
                isOrganizerOnly: currentUser && (currentUser.uid === groupBoxData.createdBy) && !groupBoxData.settings.creatorParticipates,
                favorite: false,
                isGroupBox: true
            };

            // Add to local array immediately for instant UI update. 
            const existingIndex = app.participatedGroupBoxes.findIndex(gb => gb.groupBoxId === groupBoxId);
            if (existingIndex >= 0) {
                // Update existing entry but preserve favorite status
                participatedGroupBoxData.favorite = app.participatedGroupBoxes[existingIndex].favorite || false;
                app.participatedGroupBoxes[existingIndex] = participatedGroupBoxData;
            } else {
                app.participatedGroupBoxes.push(participatedGroupBoxData);
            }

            // Save to Firebase and localStorage
            await app.saveParticipatedGroupBox(participatedGroupBoxData);
            
            // Record join event if this is the user's first time accessing this group box
            if (isFirstTimeJoining && !organizerReadonly) {
                await app.recordJoinEvent(groupBoxId, userId);
            }
            
            // Load community history for this Group Box
            await app.loadCommunityHistory(groupBoxId);

            // Set this as the current lootbox and open directly
            app.currentLootbox = groupBoxLootbox;
            app.currentLootboxIndex = -1; // Special index for group boxes
            
            // Clear personal session history when opening a group box (community history takes precedence)
            app.sessionHistory = [];
            
            // Reset cooldown
            app.isOnCooldown = false;
            if (app.popupTimeout) {
                clearTimeout(app.popupTimeout);
                app.popupTimeout = null;
            }
            
            // Skip list view and go directly to lootbox view
            document.getElementById('listView').classList.add('hidden');
            document.getElementById('lootboxView').classList.remove('hidden');
            
            app.renderLootboxView();
            app.updateSessionDisplay();
            app.updateLootboxInteractivity();

            console.log('Successfully loaded Group Box:', groupBoxData.lootboxData.name);
            
            // Clean up URL after successful load
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);

        } catch (error) {
            console.error('Error loading Group Box:', error);
            alert('❌ Error loading Group Box. Please try again.');
            
            // Clean up URL on error
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }
    },

    async saveGroupBoxSpin(result) {
        try {
            if (!app.isFirebaseReady || !window.firebaseDb || !window.firebaseFunctions) {
                console.error('Firebase not available for saving Group Box spin');
                return;
            }

            const { collection, addDoc, doc, getDoc, setDoc, updateDoc } = window.firebaseFunctions;
            const groupBoxId = app.currentLootbox.groupBoxId;
            const userId = window.firebaseAuth.currentUser?.uid || 'anonymous';
            
            // Generate a simple user name for anonymous users
            const userName = userId === 'anonymous' ? 'Anonymous User' : `User ${userId.substring(0, 8)}`;
            
            // Create session ID for this opening session
            const sessionId = Date.now().toString();
            
            // Save the spin result to group_boxes/{groupBoxId}/opens/{openId}
            const openData = {
                userId: userId,
                userName: userName,
                item: result,
                timestamp: new Date(),
                sessionId: sessionId
            };
            
            await addDoc(collection(window.firebaseDb, 'group_boxes', groupBoxId, 'opens'), openData);
            
            // Update or create user tries tracking in group_boxes/{groupBoxId}/user_tries/{userId}
            const userTriesRef = doc(window.firebaseDb, 'group_boxes', groupBoxId, 'user_tries', userId);
            const userTriesSnap = await getDoc(userTriesRef);
            
            let userTriesData;
            if (userTriesSnap.exists()) {
                userTriesData = userTriesSnap.data();
                userTriesData.remainingTries--;
                userTriesData.totalOpens++;
                userTriesData.lastOpen = new Date();
            } else {
                userTriesData = {
                    remainingTries: app.currentLootbox.maxTries - 1,
                    totalOpens: 1,
                    lastOpen: new Date()
                };
            }
            
            await setDoc(userTriesRef, userTriesData);
            
            // Update group box statistics
            const groupBoxRef = doc(window.firebaseDb, 'group_boxes', groupBoxId);
            const groupBoxSnap = await getDoc(groupBoxRef);
            
            if (groupBoxSnap.exists()) {
                const groupBoxData = groupBoxSnap.data();
                const updates = {
                    totalOpens: (groupBoxData.totalOpens || 0) + 1
                };
                
                // Update unique users count if this is the first time this user has opened
                if (!userTriesSnap.exists()) {
                    updates.uniqueUsers = (groupBoxData.uniqueUsers || 0) + 1;
                }
                
                await updateDoc(groupBoxRef, updates);
            }
            
            // Update local remaining tries
            app.currentLootbox.remainingTries = userTriesData.remainingTries;
            
            console.log('Successfully saved Group Box spin:', result);
            
        } catch (error) {
            console.error('Error saving Group Box spin:', error);
        }
    },

    async openGroupBoxFromList(groupBoxId) {
        // Debug log for openGroupBoxFromList call
        const groupBox = app.participatedGroupBoxes.find(gb => gb.groupBoxId === groupBoxId);
        console.log('openGroupBoxFromList called:', {
            groupBoxId: groupBoxId,
            groupBoxName: groupBox?.groupBoxName,
            isOrganizerOnly: groupBox?.isOrganizerOnly,
            isCreator: groupBox?.isCreator
        });
        
        // Always navigate to group box screen - don't block navigation
        await app.loadAndOpenGroupBox(groupBoxId);
    },

    async shareGroupBoxLink(groupBoxId) {
        const groupBox = app.participatedGroupBoxes.find(gb => gb.groupBoxId === groupBoxId);
        const groupBoxName = groupBox ? (groupBox.groupBoxName || groupBox.lootboxData?.name || 'Group Box') : 'Group Box';
        const groupBoxUrl = `${window.location.origin}${window.location.pathname}?groupbox=${groupBoxId}`;
        
        // Try native share first
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${groupBoxName} - Group Box`,
                    text: `Join this shared lootbox group: ${groupBoxName}`,
                    url: groupBoxUrl
                });
                app.showToast('Shared successfully');
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
            await navigator.clipboard.writeText(groupBoxUrl);
            app.showToast('Link copied to clipboard');
        } catch (error) {
            console.error('Clipboard failed:', error);
            // Final fallback: show URL in toast for 6 seconds
            app.showToast(`Share link: ${groupBoxUrl}`, 6000);
        }
    },

    syncParticipatedGroupBoxData() {
        if (!app.currentLootbox || !app.currentLootbox.isGroupBox) return;
        
        // Find and update the participated group box in local array
        const groupBoxIndex = app.participatedGroupBoxes.findIndex(
            gb => gb.groupBoxId === app.currentLootbox.groupBoxId
        );
        
        if (groupBoxIndex >= 0) {
            // Update the local data with current session data
            app.participatedGroupBoxes[groupBoxIndex].userTotalOpens = app.currentLootbox.spins;
            app.participatedGroupBoxes[groupBoxIndex].userRemainingTries = app.currentLootbox.remainingTries;
            app.participatedGroupBoxes[groupBoxIndex].lastParticipated = new Date();
            
            // Update localStorage backup
            try {
                localStorage.setItem('participatedGroupBoxes', JSON.stringify(app.participatedGroupBoxes));
            } catch (error) {
                console.error('Error updating participated group boxes in localStorage:', error);
            }
            
            console.log('Synced Group Box data:', app.currentLootbox.name, 
                       'Opens:', app.currentLootbox.spins, 
                       'Remaining:', app.currentLootbox.remainingTries);
        }
    },

    async favoriteGroupBox(groupBoxId) {
        // Find the group box in the participated array
        const groupBoxIndex = app.participatedGroupBoxes.findIndex(gb => gb.groupBoxId === groupBoxId);
        
        if (groupBoxIndex >= 0) {
            // Toggle favorite status
            app.participatedGroupBoxes[groupBoxIndex].favorite = !app.participatedGroupBoxes[groupBoxIndex].favorite;
            
            try {
                // Update in Firebase
                if (app.isFirebaseReady && window.firebaseDb && window.firebaseAuth && window.firebaseFunctions) {
                    const currentUser = window.firebaseAuth.currentUser;
                    if (currentUser) {
                        const { doc, updateDoc } = window.firebaseFunctions;
                        const participatedRef = doc(window.firebaseDb, 'users', currentUser.uid, 'participated_group_boxes', groupBoxId);
                        
                        await updateDoc(participatedRef, {
                            favorite: app.participatedGroupBoxes[groupBoxIndex].favorite
                        });
                        
                        console.log('Updated Group Box favorite status in Firebase:', groupBoxId);
                    }
                }
                
                // Update localStorage backup
                localStorage.setItem('participatedGroupBoxes', JSON.stringify(app.participatedGroupBoxes));
                
                // Re-render to update the favorite icon
                app.renderLootboxes();
                
                // Show feedback message
                const groupBoxName = app.participatedGroupBoxes[groupBoxIndex].groupBoxName || app.participatedGroupBoxes[groupBoxIndex].lootboxData?.name;
                const action = app.participatedGroupBoxes[groupBoxIndex].favorite ? 'added to' : 'removed from';
                app.showSuccessMessage(`${groupBoxName} ${action} favorites!`);
                
            } catch (error) {
                console.error('Error updating Group Box favorite status:', error);
                // Revert the change on error
                app.participatedGroupBoxes[groupBoxIndex].favorite = !app.participatedGroupBoxes[groupBoxIndex].favorite;
                app.showSuccessMessage('Error updating favorite status', true);
            }
        }
    },

    deleteGroupBox(groupBoxId) {
        const groupBox = app.participatedGroupBoxes.find(gb => gb.groupBoxId === groupBoxId);
        
        if (groupBox) {
            const groupBoxName = groupBox.groupBoxName || groupBox.lootboxData?.name || 'Group Box';
            
            // Show custom delete confirmation modal
            document.getElementById('deleteLootboxName').textContent = groupBoxName;
            document.getElementById('deleteModal').classList.add('show');
            document.body.style.overflow = 'hidden';
            
            // Store the group box ID for the actual deletion
            app.pendingDeleteGroupBoxId = groupBoxId;
        }
    },

    async confirmDeleteGroupBox() {
        const groupBoxId = app.pendingDeleteGroupBoxId;
        if (!groupBoxId) return;
        
        const groupBox = app.participatedGroupBoxes.find(gb => gb.groupBoxId === groupBoxId);
        const groupBoxName = groupBox ? (groupBox.groupBoxName || groupBox.lootboxData?.name || 'Group Box') : 'Group Box';
        
        // Close modal first
        app.closeDeleteModal();
        
        try {
            // Record leave event in community history first
            if (app.isFirebaseReady && window.firebaseDb && window.firebaseAuth && window.firebaseFunctions) {
                const currentUser = window.firebaseAuth.currentUser;
                if (currentUser) {
                    // Record leave event for community history
                    const { collection, addDoc, doc, deleteDoc } = window.firebaseFunctions;
                    const userId = currentUser.uid;
                    const userName = userId === 'anonymous' ? 'Anonymous User' : `User ${userId.substring(0, 8)}`;
                    
                    // Don't record leave event for creators who are just removing their own organizer-only box
                    const isOrganizerOnly = groupBox && groupBox.isOrganizerOnly && groupBox.isCreator;
                    
                    if (!isOrganizerOnly) {
                        const leaveData = {
                            userId: userId,
                            userName: userName,
                            item: null, // Special marker for leave events
                            action: 'leave',
                            timestamp: new Date(),
                            sessionId: Date.now().toString()
                        };
                        
                        await addDoc(collection(window.firebaseDb, 'group_boxes', groupBoxId, 'opens'), leaveData);
                        console.log('Recorded leave event for:', userName);
                    }
                    
                    // Delete from user's participated group boxes
                    const participatedRef = doc(window.firebaseDb, 'users', currentUser.uid, 'participated_group_boxes', groupBoxId);
                    await deleteDoc(participatedRef);
                    console.log('Deleted Group Box from Firebase:', groupBoxId);
                }
            }
            
            // Remove from local array
            const groupBoxIndex = app.participatedGroupBoxes.findIndex(gb => gb.groupBoxId === groupBoxId);
            if (groupBoxIndex >= 0) {
                app.participatedGroupBoxes.splice(groupBoxIndex, 1);
            }
            
            // Update localStorage
            localStorage.setItem('participatedGroupBoxes', JSON.stringify(app.participatedGroupBoxes));
            
            // Re-render the lootboxes
            app.renderLootboxes();
            
            // Show success message
            app.showSuccessMessage(`"${groupBoxName}" has been removed from your participated Group Boxes`);
            
        } catch (error) {
            console.error('Error deleting Group Box:', error);
            app.showSuccessMessage('Error removing Group Box', true);
        }
        
        // Clear pending delete
        app.pendingDeleteGroupBoxId = undefined;
    },

    async loadCommunityHistory(groupBoxId) {
        try {
            if (!app.isFirebaseReady || !window.firebaseDb || !window.firebaseFunctions) {
                console.log('Firebase not available for loading community history');
                app.communityHistory = [];
                return;
            }

            const { collection, getDocs, orderBy, query, limit } = window.firebaseFunctions;
            
            // Query the opens collection for this group box, ordered by timestamp (most recent first)
            const opensRef = collection(window.firebaseDb, 'group_boxes', groupBoxId, 'opens');
            const q = query(opensRef, orderBy('timestamp', 'desc'), limit(50)); // Limit to 50 most recent opens
            
            const querySnapshot = await getDocs(q);
            const communityHistory = [];
            
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                communityHistory.push({
                    id: doc.id,
                    userId: data.userId,
                    userName: data.userName,
                    item: data.item,
                    action: data.action, // Include action field for join/leave events
                    timestamp: data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
                    sessionId: data.sessionId
                });
            });
            
            app.communityHistory = communityHistory;
            console.log(`Loaded ${communityHistory.length} community pulls for Group Box ${groupBoxId}`);
            
        } catch (error) {
            console.error('Error loading community history:', error);
            app.communityHistory = [];
        }
    },

    async editGroupBox(groupBoxId) {
        const groupBox = app.participatedGroupBoxes.find(gb => gb.groupBoxId === groupBoxId);
        if (!groupBox) {
            app.showToast('Group Box not found');
            return;
        }
        
        // Store the current group box ID for the modal
        app.currentEditGroupBoxId = groupBoxId;
        
        // Populate the modal
        document.getElementById('editGroupBoxName').textContent = groupBox.groupBoxName || groupBox.lootboxData?.name || 'Group Box';
        
        // Load and display items
        app.renderEditItemsList(groupBox);
        
        // Load users and tries data
        await app.loadGroupBoxParticipants(groupBoxId);
        
        // Show the modal
        document.getElementById('groupBoxEditModal').classList.add('show');
        document.body.style.overflow = 'hidden';
    },

    closeGroupBoxEditModal() {
        document.getElementById('groupBoxEditModal').classList.remove('show');
        document.body.style.overflow = '';
        app.currentEditGroupBoxId = undefined;
    },

    renderEditItemsList(groupBox) {
        const itemsList = document.getElementById('editItemsList');
        const items = groupBox.lootboxData?.items || [];
        
        // Store items for editing
        app.currentEditItems = items.map(item => ({ ...item })); // Deep copy
        
        if (items.length === 0) {
            itemsList.innerHTML = '<div class="no-participants">No items found</div>';
            app.updateEditTotalOdds();
            return;
        }
        
        app.renderEditItemsHTML();
        app.updateEditTotalOdds();
    },

    renderEditItemsHTML() {
        const itemsList = document.getElementById('editItemsList');
        const items = app.currentEditItems || [];
        
        if (items.length === 0) {
            itemsList.innerHTML = '<div class="no-participants">No items found - click "Add Item" to get started</div>';
            return;
        }
        
        itemsList.innerHTML = items.map((item, index) => `
            <div class="edit-item-row">
                <input type="text" class="edit-item-name-input" value="${item.name}" 
                       onchange="app.updateEditItemName(${index}, this.value)" placeholder="Item name">
                <input type="number" class="edit-item-odds-input" value="${(item.odds * 100).toFixed(1)}" 
                       onchange="app.updateEditItemOdds(${index}, this.value)" 
                       placeholder="%" step="0.1" min="0" max="100">
                <div class="edit-item-actions">
                    <button class="delete-item-btn" onclick="app.deleteEditItem(${index})" type="button">×</button>
                </div>
            </div>
        `).join('');
    },

    addEditItem() {
        if (!app.currentEditItems) {
            app.currentEditItems = [];
        }
        
        app.currentEditItems.push({
            name: 'New Item',
            odds: 0.1 // Default to 10%
        });
        
        app.renderEditItemsHTML();
        app.updateEditTotalOdds();
    },

    deleteEditItem(index) {
        if (!app.currentEditItems || index < 0 || index >= app.currentEditItems.length) return;
        
        app.currentEditItems.splice(index, 1);
        app.renderEditItemsHTML();
        app.updateEditTotalOdds();
    },

    updateEditItemName(index, newName) {
        if (!app.currentEditItems || index < 0 || index >= app.currentEditItems.length) return;
        
        app.currentEditItems[index].name = newName.trim() || `Item ${index + 1}`;
    },

    updateEditItemOdds(index, newOdds) {
        if (!app.currentEditItems || index < 0 || index >= app.currentEditItems.length) return;
        
        const odds = Math.max(0, Math.min(100, parseFloat(newOdds) || 0)) / 100;
        app.currentEditItems[index].odds = odds;
        app.updateEditTotalOdds();
    },

    updateEditTotalOdds() {
        const totalOddsSpan = document.getElementById('editTotalOdds');
        if (!totalOddsSpan || !app.currentEditItems) return;
        
        const totalOdds = app.currentEditItems.reduce((sum, item) => sum + (item.odds || 0), 0);
        totalOddsSpan.textContent = totalOdds.toFixed(3);
        
        // Visual feedback for total odds
        if (Math.abs(totalOdds - 1.0) < 0.001) {
            totalOddsSpan.style.color = '#059669'; // Green for exactly 1.0
        } else if (totalOdds > 1.0) {
            totalOddsSpan.style.color = '#dc2626'; // Red for over 1.0
        } else {
            totalOddsSpan.style.color = '#f59e0b'; // Orange for under 1.0
        }
    },

    evenlyDistributeEditOdds() {
        if (!app.currentEditItems || app.currentEditItems.length === 0) return;
        
        const evenOdds = 1.0 / app.currentEditItems.length;
        app.currentEditItems.forEach(item => {
            item.odds = evenOdds;
        });
        
        app.renderEditItemsHTML();
        app.updateEditTotalOdds();
    },

    async loadGroupBoxParticipants(groupBoxId) {
        try {
            if (!app.isFirebaseReady || !window.firebaseDb || !window.firebaseFunctions) {
                document.getElementById('editUsersList').innerHTML = '<div class="no-participants">Unable to load participants</div>';
                return;
            }

            const { collection, getDocs } = window.firebaseFunctions;
            
            // Get all user tries for this group box
            const userTriesRef = collection(window.firebaseDb, 'group_boxes', groupBoxId, 'user_tries');
            const userTriesSnapshot = await getDocs(userTriesRef);
            
            const participants = [];
            userTriesSnapshot.forEach((doc) => {
                const data = doc.data();
                participants.push({
                    userId: doc.id,
                    userName: doc.id === 'anonymous' ? 'Anonymous User' : `User ${doc.id.substring(0, 8)}`,
                    totalOpens: data.totalOpens || 0,
                    remainingTries: data.remainingTries || 0,
                    lastOpen: data.lastOpen
                });
            });
            
            app.renderEditUsersList(participants, groupBoxId);
            
        } catch (error) {
            console.error('Error loading group box participants:', error);
            document.getElementById('editUsersList').innerHTML = '<div class="no-participants">Error loading participants</div>';
        }
    },

    renderEditUsersList(participants, groupBoxId) {
        const usersList = document.getElementById('editUsersList');
        
        if (participants.length === 0) {
            usersList.innerHTML = '<div class="no-participants">No participants yet</div>';
            return;
        }
        
        usersList.innerHTML = participants.map(participant => `
            <div class="edit-user-row">
                <div class="edit-user-info">
                    <div class="edit-user-name">${participant.userName}</div>
                    <div class="edit-user-stats">
                        <span>Opens: ${participant.totalOpens}</span>
                        <span>Last: ${participant.lastOpen ? new Date(participant.lastOpen.toDate ? participant.lastOpen.toDate() : participant.lastOpen).toLocaleDateString() : 'Never'}</span>
                    </div>
                </div>
                <div class="edit-user-actions">
                    <div class="tries-display">${participant.remainingTries} left</div>
                    <button class="grant-tries-btn" onclick="app.grantExtraTries('${groupBoxId}', '${participant.userId}')">
                        +1 Try
                    </button>
                </div>
            </div>
        `).join('');
    },

    async grantExtraTries(groupBoxId, userId) {
        try {
            if (!app.isFirebaseReady || !window.firebaseDb || !window.firebaseFunctions) {
                app.showToast('Firebase not available');
                return;
            }

            const { doc, getDoc, updateDoc } = window.firebaseFunctions;
            
            // Get current user tries data
            const userTriesRef = doc(window.firebaseDb, 'group_boxes', groupBoxId, 'user_tries', userId);
            const userTriesSnap = await getDoc(userTriesRef);
            
            if (!userTriesSnap.exists()) {
                app.showToast('User not found');
                return;
            }
            
            const currentData = userTriesSnap.data();
            const newRemainingTries = (currentData.remainingTries || 0) + 1;
            
            // Update the tries count
            await updateDoc(userTriesRef, {
                remainingTries: newRemainingTries
            });
            
            // Refresh the participants list
            await app.loadGroupBoxParticipants(groupBoxId);
            
            const userName = userId === 'anonymous' ? 'Anonymous User' : `User ${userId.substring(0, 8)}`;
            app.showToast(`Granted +1 try to ${userName}`);
            
        } catch (error) {
            console.error('Error granting extra tries:', error);
            app.showToast('Error granting tries');
        }
    },

    async saveGroupBoxChanges() {
        const groupBoxId = app.currentEditGroupBoxId;
        if (!groupBoxId || !app.currentEditItems) {
            app.showToast('No changes to save');
            return;
        }
        
        // Validate items
        if (app.currentEditItems.length === 0) {
            app.showToast('Group Box must have at least one item');
            return;
        }
        
        // Validate all items have names
        const invalidItems = app.currentEditItems.filter(item => !item.name || item.name.trim() === '');
        if (invalidItems.length > 0) {
            app.showToast('All items must have names');
            return;
        }
        
        // Validate odds
        const totalOdds = app.currentEditItems.reduce((sum, item) => sum + (item.odds || 0), 0);
        if (totalOdds <= 0) {
            app.showToast('Items must have valid odds greater than 0');
            return;
        }
        
        try {
            if (!app.isFirebaseReady || !window.firebaseDb || !window.firebaseFunctions) {
                app.showToast('Firebase not available');
                return;
            }

            const { doc, updateDoc } = window.firebaseFunctions;
            
            // Update the Group Box document in Firebase
            const groupBoxRef = doc(window.firebaseDb, 'group_boxes', groupBoxId);
            await updateDoc(groupBoxRef, {
                'lootboxData.items': app.currentEditItems
            });
            
            // Update local participated group box data
            const groupBoxIndex = app.participatedGroupBoxes.findIndex(gb => gb.groupBoxId === groupBoxId);
            if (groupBoxIndex >= 0) {
                app.participatedGroupBoxes[groupBoxIndex].lootboxData.items = [...app.currentEditItems];
                
                // Update localStorage backup
                localStorage.setItem('participatedGroupBoxes', JSON.stringify(app.participatedGroupBoxes));
            }
            
            app.showToast('Group Box updated successfully!');
            app.closeGroupBoxEditModal();
            
            // Refresh the lootboxes view to show changes
            app.renderLootboxes();
            
        } catch (error) {
            console.error('Error saving Group Box changes:', error);
            app.showToast('Error saving changes');
        }
    }
};

// Make available globally first
window.GroupBoxExtension = GroupBoxExtension;
// Then extend app if it exists
if (window.app) {
    Object.assign(window.app, GroupBoxExtension);
}