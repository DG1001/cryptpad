document.addEventListener('DOMContentLoaded', () => {
    const encryptionKeyInput = document.getElementById('encryptionKey');
    const markdownTextArea = document.getElementById('markdownInput');
    const encryptButton = document.getElementById('encryptButton');
    const decryptButton = document.getElementById('decryptButton');
    const copyButton = document.getElementById('copyButton'); // New button
    const saveButton = document.getElementById('saveButton');

    // Toast notification function
    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `px-6 py-4 rounded-lg shadow-lg text-white max-w-sm transform transition-all duration-300 ease-in-out`;
        
        // Set background color based on type
        switch (type) {
            case 'success':
                toast.className += ' bg-green-500';
                break;
            case 'error':
                toast.className += ' bg-red-500';
                break;
            case 'warning':
                toast.className += ' bg-yellow-500';
                break;
            default:
                toast.className += ' bg-blue-500';
        }

        toast.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="text-sm font-medium">${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;

        // Initially hide the toast for animation
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        
        toastContainer.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }, 4000);
    }

    const KEY_STORAGE_ID = 'encryptionKey';

    let encryptedTextMap = {}; // Stores mapping from labelPlaceholder to ENC<data>
    let encryptedTextCounter = 0; // Used to generate unique label IDs

    // Security mode handling functions
    function getStorageKey() {
        return `${KEY_STORAGE_ID}_${currentPageId}`;
    }

    function loadEncryptionKey() {
        if (!encryptionKeyInput) return;
        
        if (securityMode === 'local') {
            const storedKey = localStorage.getItem(getStorageKey());
            if (storedKey) {
                encryptionKeyInput.value = storedKey;
            }
        }
        // For 'prompt' mode (no storage), we don't load any stored key
        // Legacy 'session' mode is now treated as 'prompt'
    }

    function saveEncryptionKey(key) {
        if (securityMode === 'local') {
            localStorage.setItem(getStorageKey(), key);
        }
        // For 'prompt' mode (no storage), we don't save the key
        // Legacy 'session' mode is now treated as 'prompt'
    }

    function getEncryptionKey() {
        // Always use the input field value, regardless of security mode
        // The difference between modes is only in storage behavior
        return encryptionKeyInput ? encryptionKeyInput.value : '';
    }

    // Set up security mode indicator and behavior
    function setupSecurityMode() {
        const indicator = document.getElementById('securityModeIndicator');
        if (indicator) {
            // Handle legacy session mode by treating it as prompt
            const currentMode = (securityMode === 'session') ? 'prompt' : securityMode;
            
            switch (currentMode) {
                case 'local':
                    indicator.textContent = 'Local Storage';
                    indicator.className = 'text-xs px-2 py-1 rounded-full text-white bg-green-500';
                    break;
                case 'prompt':
                default: // Default to no storage for security
                    indicator.textContent = 'No Key Storage';
                    indicator.className = 'text-xs px-2 py-1 rounded-full text-white bg-red-500';
                    if (encryptionKeyInput) {
                        encryptionKeyInput.placeholder = 'Enter key (not stored anywhere)';
                        encryptionKeyInput.readonly = false;
                        // Remove any disabled styling that might have been added
                        encryptionKeyInput.className = encryptionKeyInput.className
                            .replace(' cursor-not-allowed', '')
                            .replace(' opacity-60', '');
                    }
                    break;
            }
        }
    }

    // Load encryption key based on security mode
    loadEncryptionKey();
    setupSecurityMode();

    // Save encryption key on change (only for local storage mode)
    if (encryptionKeyInput && securityMode === 'local') {
        encryptionKeyInput.addEventListener('input', () => {
            saveEncryptionKey(encryptionKeyInput.value);
        });
    }

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
                showToast('Error loading page content.', 'error');
            }
        } catch (error) {
            console.error('Error loading page content:', error);
            showToast('Error loading page content.', 'error');
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
                showToast('Page saved successfully!', 'success');
            } else {
                showToast(`Failed to save page: ${data.message}`, 'error');
            }
        } catch (error) {
            console.error('Error saving page content:', error);
            showToast('Error saving page content.', 'error');
        }
    }
    
    if (saveButton) {
        saveButton.addEventListener('click', savePageContent);
    }

    // Encryption logic: returns a label placeholder, stores mapping
    async function encryptText(text, key) {
        if (!key) {
            showToast('Please enter an encryption key.', 'warning');
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
            showToast('Encryption failed. Check console for details.', 'error');
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
            const currentKey = getEncryptionKey();

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
                showToast('Please select text to encrypt.', 'warning');
            } else {
                showToast('Please enter an encryption key.', 'warning');
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
            const currentKey = getEncryptionKey();
            if (!currentKey) {
                showToast('Please enter an encryption key.', 'warning');
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
                    showToast('Could not find encrypted data for this label. It might have been already decrypted or an error occurred.', 'error');
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
                    showToast('Text decrypted successfully.', 'success');
                } else {
                    showToast('Failed to decrypt. Key might be incorrect or data corrupted.', 'error');
                }
            } else {
                showToast('Cursor is not inside a recognized encrypted label.', 'warning');
            }
        });
    }
    
    
    if (copyButton && markdownTextArea) {
        copyButton.addEventListener('click', async () => {
            const currentKey = getEncryptionKey();
            // Note: We don't alert for missing key here immediately, 
            // as copying selected text without decryption is still an option.

            const selectionStart = markdownTextArea.selectionStart;
            const selectionEnd = markdownTextArea.selectionEnd;
            const fullText = markdownTextArea.value;

            if (selectionStart !== selectionEnd) { // Text is selected
                const selectedText = fullText.substring(selectionStart, selectionEnd);
                let resultText = "";
                let lastIndex = 0;
                const labelRegex = /\[LOCKED_CONTENT_#\d+\]/g;
                let match;
                let decryptionOccurred = false;
                let decryptionAttemptedWithKey = false;

                // Iterate over selected text to find and decrypt labels
                // Create a new regex for each iteration within the loop to avoid issues with 'g' flag and lastIndex
                const localLabelRegex = /\[LOCKED_CONTENT_#\d+\]/g; 

                while ((match = localLabelRegex.exec(selectedText)) !== null) {
                    resultText += selectedText.substring(lastIndex, match.index); // Append text before label
                    
                    const labelPlaceholder = match[0];
                    const encryptedDataString = encryptedTextMap[labelPlaceholder];
                    let decryptedSegment = labelPlaceholder; // Default to label itself

                    if (encryptedDataString) {
                        if (currentKey) {
                            decryptionAttemptedWithKey = true;
                            const tempDecrypted = await decryptRawData(encryptedDataString, currentKey);
                            if (tempDecrypted !== null) {
                                decryptedSegment = tempDecrypted;
                                decryptionOccurred = true;
                            }
                            // If tempDecrypted is null, decryption failed (bad key/corrupted), keep label
                        }
                        // If no currentKey, encryptedDataString exists but can't decrypt, keep label
                    }
                    // If no encryptedDataString for label, keep label (should not happen if map is correct)
                    
                    resultText += decryptedSegment;
                    lastIndex = match.index + match[0].length;
                }
                resultText += selectedText.substring(lastIndex); // Append remaining text

                try {
                    await navigator.clipboard.writeText(resultText);
                    if (decryptionOccurred) {
                        showToast('Selected text (with decrypted content) copied to clipboard!', 'success');
                    } else if (decryptionAttemptedWithKey) {
                        showToast('Selected text copied. Some parts could not be decrypted (check key or data).', 'warning');
                    } else if (selectedText.match(/\[LOCKED_CONTENT_#\d+\]/g) && !currentKey) {
                         showToast('Selected text copied. Provide an encryption key to decrypt locked content.', 'warning');
                    } else {
                        showToast('Selected text copied to clipboard!', 'success');
                    }
                } catch (err) {
                    console.error('Failed to copy text: ', err);
                    showToast('Failed to copy selected text to clipboard.', 'error');
                }

            } else { // No text selected, try to copy label at cursor
                const currentKey = getEncryptionKey();
                if (!currentKey) {
                    showToast('Please enter an encryption key to copy decrypted content.', 'warning');
                    return;
                }
                const cursorPos = selectionStart;
                let labelToCopy = null;
                const labelRegex = /\[LOCKED_CONTENT_#\d+\]/g;
                let match;

                // Find if cursor is inside a label in the full text
                while ((match = labelRegex.exec(fullText)) !== null) {
                    if (cursorPos >= match.index && cursorPos <= match.index + match[0].length) {
                        labelToCopy = match[0];
                        break;
                    }
                }

                if (labelToCopy) {
                    const encryptedDataString = encryptedTextMap[labelToCopy];
                    if (!encryptedDataString) {
                        showToast('Could not find encrypted data for this label.', 'error');
                        return;
                    }

                    const decryptedText = await decryptRawData(encryptedDataString, currentKey);

                    if (decryptedText !== null) {
                        try {
                            await navigator.clipboard.writeText(decryptedText);
                            showToast('Decrypted text copied to clipboard!', 'success');
                        } catch (err) {
                            console.error('Failed to copy text: ', err);
                            showToast('Failed to copy decrypted text to clipboard.', 'error');
                        }
                    } else {
                        showToast('Failed to decrypt. Key might be incorrect or data corrupted.', 'error');
                    }
                } else {
                    showToast('Cursor is not inside a recognized encrypted label. Cannot copy.', 'warning');
                }
            }
        });
    }

    // Initial load of page content
    if (markdownTextArea) { // Check if editor element exists
        loadPageContent();
    }
});
