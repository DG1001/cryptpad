document.addEventListener('DOMContentLoaded', () => {
    const encryptionKeyInput = document.getElementById('encryptionKey');
    const markdownTextArea = document.getElementById('markdownInput'); // Renamed for clarity
    const encryptButton = document.getElementById('encryptButton');
    const saveButton = document.getElementById('saveButton');

    const KEY_STORAGE_ID = 'encryptionKey';
    let easymde = null;

    if (markdownTextArea) {
        easymde = new EasyMDE({
            element: markdownTextArea,
            spellChecker: false, // Optional: disable spell checker
            // You can add more configuration options here
            // e.g., status bar, toolbar icons, etc.
        });
    }

    // Load encryption key from localStorage
    if (localStorage.getItem(KEY_STORAGE_ID)) {
        encryptionKeyInput.value = localStorage.getItem(KEY_STORAGE_ID);
    }

    // Save encryption key to localStorage on change
    encryptionKeyInput.addEventListener('input', () => {
        localStorage.setItem(KEY_STORAGE_ID, encryptionKeyInput.value);
    });

    // Function to load page content
    async function loadPageContent() {
        if (typeof currentPageId === 'undefined') return; // currentPageId should be defined in editor.html
        try {
            const response = await fetch(`/${currentPageId}/load`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (data.success) {
                if (easymde) {
                    easymde.value(data.content);
                    // Process content for encrypted placeholders after loading
                    // Note: processForEncryptedPlaceholders might need adjustments for EasyMDE/CodeMirror
                    processForEncryptedPlaceholders(easymde.codemirror); 
                } else if (markdownTextArea) { // Fallback if EasyMDE failed to init
                    markdownTextArea.value = data.content;
                }
            } else {
                console.error('Failed to load page:', data.message);
                alert('Error loading page content.');
            }
        } catch (error) {
            console.error('Error loading page content:', error);
            alert('Error loading page content.');
        }
    }

    // Function to save page content
    async function savePageContent() {
        if (typeof currentPageId === 'undefined') return;
        
        let content = "";
        if (easymde) {
            content = easymde.value();
        } else if (markdownTextArea) { // Fallback
            content = markdownTextArea.value;
        }

        try {
            const response = await fetch(`/${currentPageId}/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: content }),
            });
            const data = await response.json();
            if (data.success) {
                alert('Page saved successfully!');
            } else {
                alert(`Failed to save page: ${data.message}`);
            }
        } catch (error) {
            console.error('Error saving page content:', error);
            alert('Error saving page content.');
        }
    }
    
    if (saveButton) {
        saveButton.addEventListener('click', savePageContent);
    }

    // Placeholder for encryption logic
    async function encryptText(text, key) {
        // This is a very basic placeholder.
        // Real implementation should use Web Crypto API (crypto.subtle) for AES-GCM or similar.
        if (!key) {
            alert("Please enter an encryption key.");
            return null;
        }
        // Simulate encryption for now - in a real app, this would be actual crypto
        // For demonstration, let's just base64 encode it and add a prefix
        // This is NOT secure.
        try {
            const iv = crypto.getRandomValues(new Uint8Array(12)); // Initialization vector for AES-GCM
            const encodedText = new TextEncoder().encode(text);
            const cryptoKey = await getCryptoKey(key);

            const encryptedContent = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv },
                cryptoKey,
                encodedText
            );
            
            const encryptedData = {
                iv: Array.from(iv), // Convert Uint8Array to array for JSON stringification
                ciphertext: Array.from(new Uint8Array(encryptedContent)) // Convert ArrayBuffer to Uint8Array then to array
            };
            return `ENC<${btoa(JSON.stringify(encryptedData))}>`;

        } catch (e) {
            console.error("Encryption failed:", e);
            alert("Encryption failed. Check console for details.");
            return null;
        }
    }

    // Placeholder for decryption logic
    async function decryptText(encryptedPlaceholder, key) {
        if (!key) {
            // No key, can't decrypt
            return null; 
        }
        if (!encryptedPlaceholder.startsWith('ENC<') || !encryptedPlaceholder.endsWith('>')) {
            return null; // Not a valid placeholder
        }
        
        const base64Data = encryptedPlaceholder.substring(4, encryptedPlaceholder.length - 1);
        try {
            const encryptedData = JSON.parse(atob(base64Data));
            const iv = new Uint8Array(encryptedData.iv);
            const ciphertext = new Uint8Array(encryptedData.ciphertext);
            const cryptoKey = await getCryptoKey(key);

            const decryptedContent = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                cryptoKey,
                ciphertext
            );
            return new TextDecoder().decode(decryptedContent);
        } catch (e) {
            console.error("Decryption failed:", e);
            // Common issue: wrong key or corrupted data
            return null; 
        }
    }

    async function getCryptoKey(secretKey) {
        const encodedKey = new TextEncoder().encode(secretKey);
        const hashedKey = await crypto.subtle.digest('SHA-256', encodedKey);
        return crypto.subtle.importKey(
            'raw',
            hashedKey,
            { name: 'AES-GCM' },
            false, // not extractable
            ['encrypt', 'decrypt']
        );
    }


    if (encryptButton && easymde) { // Ensure EasyMDE is initialized
        encryptButton.addEventListener('click', async () => {
            const cm = easymde.codemirror;
            const selectedText = cm.getSelection();
            const currentKey = encryptionKeyInput.value;

            if (selectedText && currentKey) {
                const encryptedPlaceholder = await encryptText(selectedText, currentKey);
                if (encryptedPlaceholder) {
                    cm.replaceSelection(encryptedPlaceholder);
                    // After encrypting, re-process for placeholders to make them interactive
                    processForEncryptedPlaceholders(cm);
                }
            } else if (!selectedText) {
                alert("Please select text to encrypt.");
            } else {
                alert("Please enter an encryption key.");
            }
        });
    }

    function processForEncryptedPlaceholders(element) {
        // This function will find ENC<...> placeholders and make them interactive.
        // For simplicity, we'll re-apply this to the whole editor content.
        // A more performant approach might be needed for very large texts.
        // `element` is now expected to be a CodeMirror instance from EasyMDE.
        
        // Remove existing popups and event listeners to avoid duplication
        document.querySelectorAll('.decryption-popup').forEach(p => p.remove());

        if (!element || typeof element.getValue !== 'function') {
            console.warn("processForEncryptedPlaceholders: CodeMirror instance not provided correctly.");
            return;
        }

        const text = element.getValue(); // Get text from CodeMirror instance
        
        // We can't directly overlay HTML on textarea content. (Comment still relevant for concept)
        // The "popup" on mouseover for a textarea is tricky.
        // A common approach is to show a tooltip near the mouse cursor or a fixed position popup.
        // For clicking, we can check if the click was on a placeholder.

        // For now, let's focus on the logic. UI for popups in textareas is complex.
        // We will add spans if we were rendering to a div, but for a textarea, it's text-only.
        // The mouseover/click handling will need to be clever.

        // Let's try a simplified approach for mouseover:
        // When mouse moves over textarea, check if cursor is over a known placeholder.
        // This requires knowing placeholder positions.
    }
    
    // Mouseover and click handling for encrypted placeholders (simplified for textarea)
    let activePopup = null;

    if (easymde) { // Attach to CodeMirror instance used by EasyMDE
        const cmInstance = easymde.codemirror;
        cmInstance.on('mousemove', async (cm, event) => { // CodeMirror's event structure
            const coords = cm.coordsChar({ left: event.clientX, top: event.clientY }, 'window');
            const text = cm.getValue();
            let hoveredPlaceholder = null;
            let placeholderMatch = null; // To store the match object for index

            // Iterate through placeholders to find if cursor is over one
            const regex = /ENC<[^>]+>/g;
            let match;
            while ((match = regex.exec(text)) !== null) {
                const placeholderStartPos = cm.posFromIndex(match.index);
                const placeholderEndPos = cm.posFromIndex(match.index + match[0].length);

                // Check if coords.line is within placeholder's line range
                // And if coords.ch is within placeholder's char range on that line
                // This is a simplified check; multi-line placeholders need more complex logic
                if (coords.line >= placeholderStartPos.line && coords.line <= placeholderEndPos.line) {
                    if (coords.line === placeholderStartPos.line && coords.ch < placeholderStartPos.ch) continue;
                    if (coords.line === placeholderEndPos.line && coords.ch > placeholderEndPos.ch) continue;
                    
                    hoveredPlaceholder = match[0];
                    placeholderMatch = match; // Store the match
                    break;
                }
            }

            if (hoveredPlaceholder) {
                if (activePopup && activePopup.dataset.placeholder === hoveredPlaceholder) {
                    // Popup already shown for this placeholder
                    positionPopup(event, activePopup); // Keep it near mouse
                    return;
                }
                
                // Remove old popup if any
                if (activePopup) {
                    activePopup.remove();
                    activePopup = null;
                }

                const currentKey = encryptionKeyInput.value;
                const decryptedText = await decryptText(hoveredPlaceholder, currentKey);

                if (decryptedText) {
                    activePopup = document.createElement('div');
                    activePopup.className = 'decryption-popup';
                    activePopup.textContent = decryptedText;
                    activePopup.dataset.placeholder = hoveredPlaceholder; // Store which placeholder it's for
                    document.body.appendChild(activePopup);
                    // Use original mouse event for positioning popup relative to viewport
                    positionPopup(event, activePopup); 
                }
            } else {
                if (activePopup) {
                    activePopup.remove();
                    activePopup = null;
                }
            }
        });

        // Mouseleave for CodeMirror needs to be on its wrapper element
        cmInstance.getWrapperElement().addEventListener('mouseleave', () => {
            if (activePopup) {
                activePopup.remove();
                activePopup = null;
            }
        });
        
        cmInstance.on('mousedown', async (cm, event) => { // Use mousedown for CodeMirror, click might be too late
            const clickCoords = cm.coordsChar({ left: event.clientX, top: event.clientY }, 'window');
            const text = cm.getValue();
            let clickedPlaceholder = null;
            
            const regex = /ENC<[^>]+>/g;
            let match;
            // Check if the click was within a placeholder
            while ((match = regex.exec(text)) !== null) {
                const placeholderStartPos = cm.posFromIndex(match.index);
                const placeholderEndPos = cm.posFromIndex(match.index + match[0].length);

                if (clickCoords.line >= placeholderStartPos.line && clickCoords.line <= placeholderEndPos.line) {
                    if (clickCoords.line === placeholderStartPos.line && clickCoords.ch < placeholderStartPos.ch) continue;
                    if (clickCoords.line === placeholderEndPos.line && clickCoords.ch > placeholderEndPos.ch) continue;
                    
                    // Check if selection is a caret (no range)
                    if (!cm.somethingSelected()) {
                         clickedPlaceholder = match[0];
                         break;
                    }
                }
            }

            if (clickedPlaceholder) {
                const currentKey = encryptionKeyInput.value;
                const decryptedText = await decryptText(clickedPlaceholder, currentKey);
                if (decryptedText) {
                    try {
                        await navigator.clipboard.writeText(decryptedText);
                        // Optionally, provide feedback that text was copied
                        // For example, flash the popup or show a temporary message
                        if(activePopup) { // If popup was visible
                            const originalText = activePopup.textContent;
                            activePopup.textContent = "Copied!";
                            setTimeout(() => {
                                if(activePopup) activePopup.textContent = originalText;
                            }, 1000);
                        } else {
                            // If no popup, maybe a small temporary message near cursor or input
                            console.log("Decrypted text copied to clipboard.");
                        }
                    } catch (err) {
                        console.error('Failed to copy text: ', err);
                        alert('Failed to copy decrypted text to clipboard.');
                    }
                } else if (currentKey) {
                    alert("Failed to decrypt. Key might be incorrect or data corrupted.");
                } else {
                    alert("Please enter the encryption key to decrypt and copy.");
                }
            }
        });
    }

    function positionPopup(event, popupElement) {
        // Position popup near mouse cursor
        // Add some offset to prevent flickering if mouse is exactly on popup edge
        popupElement.style.left = (event.pageX + 15) + 'px';
        popupElement.style.top = (event.pageY + 15) + 'px';
    }


    // Initial load of page content
    if (easymde || markdownTextArea) { // Check if editor element exists
        loadPageContent();
    }
});
