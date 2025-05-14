document.addEventListener('DOMContentLoaded', () => {
    const encryptionKeyInput = document.getElementById('encryptionKey');
    const markdownTextArea = document.getElementById('markdownInput');
    const encryptButton = document.getElementById('encryptButton');
    const decryptButton = document.getElementById('decryptButton'); // New button
    const saveButton = document.getElementById('saveButton');

    const KEY_STORAGE_ID = 'encryptionKey';

    let encryptedTextMap = {}; // Stores mapping from labelPlaceholder to ENC<data>
    let encryptedTextCounter = 0; // Used to generate unique label IDs

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
                    const displayContent = transformContentForDisplay(data.content);
                    markdownTextArea.value = displayContent;
                    // The event listeners will handle finding these new labels
                    // processForEncryptedPlaceholders might not be strictly needed for textarea
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
        
        let contentWithLabels = "";
        if (markdownTextArea) {
            contentWithLabels = markdownTextArea.value;
        }
        const rawContent = transformContentForSaving(contentWithLabels);

        try {
            const response = await fetch(`/${currentPageId}/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: rawContent }),
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

    // Encryption logic: returns a label placeholder, stores mapping
    async function encryptText(text, key) {
        if (!key) {
            alert("Please enter an encryption key.");
            return null;
        }
        try {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encodedText = new TextEncoder().encode(text);
            const cryptoKey = await getCryptoKey(key);

            const encryptedContent = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv },
                cryptoKey,
                encodedText
            );
            
            const encryptedData = {
                iv: Array.from(iv),
                ciphertext: Array.from(new Uint8Array(encryptedContent))
            };
            const encryptedDataString = `ENC<${btoa(JSON.stringify(encryptedData))}>`;

            encryptedTextCounter++;
            const labelPlaceholder = `[LOCKED_CONTENT_#${encryptedTextCounter}]`;
            encryptedTextMap[labelPlaceholder] = encryptedDataString;
            
            return labelPlaceholder;

        } catch (e) {
            console.error("Encryption failed:", e);
            alert("Encryption failed. Check console for details.");
            return null;
        }
    }

    // Decryption logic: now takes the raw ENC<...> string
    async function decryptRawData(encryptedDataString, key) {
        if (!key) {
            return null; 
        }
        if (!encryptedDataString || !encryptedDataString.startsWith('ENC<') || !encryptedDataString.endsWith('>')) {
            console.error("Invalid encrypted data format for decryption:", encryptedDataString);
            return null; 
        }
        
        const base64Data = encryptedDataString.substring(4, encryptedDataString.length - 1);
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
                    // No need to call processForEncryptedPlaceholders explicitly here,
                    // the event listeners will pick up the new labels.
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
        // For textarea, this function is less critical as direct DOM manipulation of placeholders isn't done.
        // Event listeners handle interactions.
    }

    function transformContentForDisplay(rawContent) {
        encryptedTextMap = {}; // Reset map for fresh load
        encryptedTextCounter = 0; // Reset counter
        const encRegex = /ENC<[^>]+>/g;
        
        // Replace ENC<data> with labels and populate the map
        const displayContent = rawContent.replace(encRegex, (encryptedDataString) => {
            encryptedTextCounter++;
            const labelPlaceholder = `[LOCKED_CONTENT_#${encryptedTextCounter}]`;
            encryptedTextMap[labelPlaceholder] = encryptedDataString;
            return labelPlaceholder;
        });
        return displayContent;
    }

    function transformContentForSaving(contentWithLabels) {
        const labelRegex = /\[LOCKED_CONTENT_#\d+\]/g;
        // Replace labels back with their original ENC<data> strings
        const rawContent = contentWithLabels.replace(labelRegex, (labelPlaceholder) => {
            return encryptedTextMap[labelPlaceholder] || labelPlaceholder; // Fallback to label if not in map (error)
        });
        return rawContent;
    }
    
    if (decryptButton && markdownTextArea) {
        decryptButton.addEventListener('click', async () => {
            const currentKey = encryptionKeyInput.value;
            if (!currentKey) {
                alert("Please enter an encryption key.");
                return;
            }

            const text = markdownTextArea.value;
            const cursorPos = markdownTextArea.selectionStart;
            let labelToDecrypt = null;
            let labelStartIndex = -1;
            let labelEndIndex = -1;
            
            const labelRegex = /\[LOCKED_CONTENT_#\d+\]/g;
            let match;

            while ((match = labelRegex.exec(text)) !== null) {
                if (cursorPos >= match.index && cursorPos <= match.index + match[0].length) {
                    labelToDecrypt = match[0];
                    labelStartIndex = match.index;
                    labelEndIndex = match.index + match[0].length;
                    break;
                }
            }

            if (labelToDecrypt) {
                const encryptedDataString = encryptedTextMap[labelToDecrypt];
                if (!encryptedDataString) {
                    alert("Could not find encrypted data for this label. It might have been already decrypted or an error occurred.");
                    return;
                }

                const decryptedText = await decryptRawData(encryptedDataString, currentKey);

                if (decryptedText !== null) {
                    // Replace the label with the decrypted text in the textarea
                    const beforeText = text.substring(0, labelStartIndex);
                    const afterText = text.substring(labelEndIndex);
                    markdownTextArea.value = beforeText + decryptedText + afterText;

                    // Remove the mapping as it's now decrypted
                    delete encryptedTextMap[labelToDecrypt];
                    
                    // Adjust cursor position to be after the inserted decrypted text
                    markdownTextArea.selectionStart = markdownTextArea.selectionEnd = labelStartIndex + decryptedText.length;
                    markdownTextArea.focus(); // Refocus on textarea
                    alert("Text decrypted successfully.");
                } else {
                    alert("Failed to decrypt. Key might be incorrect or data corrupted.");
                }
            } else {
                alert("Cursor is not inside a recognized encrypted label.");
            }
        });
    }
    
    // Mouseover and click handling for encrypted placeholders (simplified for textarea)
    let activePopup = null;

    if (markdownTextArea) {
        markdownTextArea.addEventListener('mousemove', async (event) => {
            const text = markdownTextArea.value;
            const cursorPos = markdownTextArea.selectionStart; 
            let hoveredLabel = null;
            
            const labelRegex = /\[LOCKED_CONTENT_#\d+\]/g;
            let match;
            while ((match = labelRegex.exec(text)) !== null) {
                if (cursorPos >= match.index && cursorPos <= match.index + match[0].length) {
                    hoveredLabel = match[0];
                    break;
                }
            }

            if (hoveredLabel) {
                if (activePopup && activePopup.dataset.placeholder === hoveredLabel) {
                    positionPopup(event, activePopup); 
                    return;
                }
                
                if (activePopup) {
                    activePopup.remove();
                    activePopup = null;
                }

                const currentKey = encryptionKeyInput.value;
                const encryptedDataString = encryptedTextMap[hoveredLabel];
                if (!encryptedDataString) return; // Label not found in map

                const decryptedText = await decryptRawData(encryptedDataString, currentKey);

                if (decryptedText) {
                    activePopup = document.createElement('div');
                    activePopup.className = 'decryption-popup';
                    activePopup.textContent = decryptedText;
                    activePopup.dataset.placeholder = hoveredLabel; // Store which label it's for
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
            let clickedLabel = null;
            
            const labelRegex = /\[LOCKED_CONTENT_#\d+\]/g;
            let match;

            while ((match = labelRegex.exec(text)) !== null) {
                if (markdownTextArea.selectionEnd === markdownTextArea.selectionStart &&
                    cursorPos >= match.index && cursorPos <= match.index + match[0].length) {
                    clickedLabel = match[0];
                    break;
                }
            }

            if (clickedLabel) {
                const currentKey = encryptionKeyInput.value;
                const encryptedDataString = encryptedTextMap[clickedLabel];
                if (!encryptedDataString) {
                    alert("Could not find encrypted data for this label.");
                    return;
                }

                const decryptedText = await decryptRawData(encryptedDataString, currentKey);
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
