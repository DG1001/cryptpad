document.addEventListener('DOMContentLoaded', () => {
    const encryptionKeyInput = document.getElementById('encryptionKey');
    const markdownTextArea = document.getElementById('markdownInput');
    const encryptButton = document.getElementById('encryptButton');
    const saveButton = document.getElementById('saveButton');

    const KEY_STORAGE_ID = 'encryptionKey';

    // Load encryption key from localStorage
    if (encryptionKeyInput && localStorage.getItem(KEY_STORAGE_ID)) { // Added check for encryptionKeyInput
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
                if (markdownTextArea) {
                    markdownTextArea.value = data.content;
                    // Process content for encrypted placeholders after loading
                    processForEncryptedPlaceholders(markdownTextArea);
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
        if (markdownTextArea) {
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


    if (encryptButton && markdownTextArea) { 
        encryptButton.addEventListener('click', async () => {
            const selectionStart = markdownTextArea.selectionStart;
            const selectionEnd = markdownTextArea.selectionEnd;
            const selectedText = markdownTextArea.value.substring(selectionStart, selectionEnd);
            const currentKey = encryptionKeyInput.value;

            if (selectedText && currentKey) {
                const encryptedPlaceholder = await encryptText(selectedText, currentKey);
                if (encryptedPlaceholder) {
                    const beforeText = markdownTextArea.value.substring(0, selectionStart);
                    const afterText = markdownTextArea.value.substring(selectionEnd);
                    markdownTextArea.value = beforeText + encryptedPlaceholder + afterText;
                    // After encrypting, re-process for placeholders to make them interactive
                    processForEncryptedPlaceholders(markdownTextArea);
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
        // For simplicity, we'll re-apply this to the whole textarea content.
        // A more performant approach might be needed for very large texts.
        
        // Remove existing popups and event listeners to avoid duplication
        document.querySelectorAll('.decryption-popup').forEach(p => p.remove());

        if (!element || typeof element.value === 'undefined') { // Check for textarea
            console.warn("processForEncryptedPlaceholders: Textarea element not provided correctly.");
            return;
        }

        const text = element.value; // Get text from textarea
        
        // We can't directly overlay HTML on textarea content.
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

    if (markdownTextArea) {
        markdownTextArea.addEventListener('mousemove', async (event) => {
            const text = markdownTextArea.value;
            const cursorPos = markdownTextArea.selectionStart; // Approximation of mouse position in text
            let hoveredPlaceholder = null;
            
            const regex = /ENC<[^>]+>/g;
            let match;
            while ((match = regex.exec(text)) !== null) {
                if (cursorPos >= match.index && cursorPos <= match.index + match[0].length) {
                    hoveredPlaceholder = match[0];
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
                    positionPopup(event, activePopup);
                }
            } else {
                if (activePopup) {
                    activePopup.remove();
                    activePopup = null;
                }
            }
        });

        markdownTextArea.addEventListener('mouseleave', () => {
            if (activePopup) {
                activePopup.remove();
                activePopup = null;
            }
        });
        
        markdownTextArea.addEventListener('click', async (event) => {
            const text = markdownTextArea.value;
            const cursorPos = markdownTextArea.selectionStart;
            let clickedPlaceholder = null;
            
            const regex = /ENC<[^>]+>/g;
            let match;
            // Check if the click was within a placeholder
            // This is an approximation. A more robust way would be to calculate click position relative to text.
            while ((match = regex.exec(text)) !== null) {
                 // If selection is just a caret (no range), and it's inside a placeholder
                if (markdownTextArea.selectionEnd === markdownTextArea.selectionStart &&
                    cursorPos >= match.index && cursorPos <= match.index + match[0].length) {
                    clickedPlaceholder = match[0];
                    break;
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
    if (markdownTextArea) { // Check if editor element exists
        loadPageContent();
    }
});
