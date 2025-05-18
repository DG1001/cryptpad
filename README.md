# Simple Encrypted Text Editor

This is a simple web-based text editor that allows users to create pages, write text, and encrypt/decrypt portions of the text using a symmetric key. The encryption key is stored in the browser's local storage.

## Features

- Create new pages with unique 4-letter IDs (e.g., `http://yourdomain/abcd`).
- Basic text editing in a textarea.
- Encrypt selected text: Replaces selected text with a `[LOCKED_CONTENT_#ID]` label.
- Decrypt at cursor: Replaces a `[LOCKED_CONTENT_#ID]` label at the cursor with its decrypted content.
- Copy decrypted text:
    - If text is selected, copies the selection, decrypting any `[LOCKED_CONTENT_#ID]` labels within it.
    - If no text is selected and the cursor is within a label, copies the decrypted content of that label.
- Encryption key is stored in browser's local storage for convenience.
- Page content is saved on the server in the `data/` directory.
- **Admin Panel:**
    - Secure login using an environment variable `ADMIN_PASSWORD`.
    - Create new pages, with an option to specify a custom page ID (3-20 chars, lowercase alphanumeric, underscore) or use a randomly generated one.
    - List existing pages with their last backup timestamps.
    - Display the first line of each page as a title for easier identification.
    - Enable/disable pages (restricts access for non-admin users).
    - Delete pages (keeps backups).
    - Backup pages (creates a timestamped copy in the `backup/` directory).
    - Download a zip archive of a page and all its backups.

## Setup and Running

### Prerequisites

- Python 3.x
- pip (Python package installer)

### Installation

1.  **Clone the repository (if applicable) or download the files.**

2.  **Create and activate a virtual environment (recommended):**
    ```bash
    python3 -m venv .venv
    source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Environment Variables:**
    -   `ADMIN_PASSWORD`: Set this environment variable to your desired admin password. If not set, a random password will be generated and logged to the console on startup.
        ```bash
        export ADMIN_PASSWORD='your_secure_password_here' 
        ```
    -   `FLASK_SECRET_KEY` (Optional): Set this for Flask session management. If not set, a random one will be generated.

5.  **Create necessary directories:**
    The application will automatically create `data/` and `backup/` directories on first run if they don't exist.
    - `data/`: Stores the live content of the pages (`.md` files) and page status information (`page_status.json`).
    - `backup/`: Stores timestamped backups of pages.
    The `static/` and `templates/` directories should exist as part of the project structure.

### Running the Application

1.  **Start the Flask development server:**
    ```bash
    python app.py
    ```

2.  **Access the application:**
    Open your web browser and go to `http://127.0.0.1:5000/` or `http://localhost:5000/`.
    - To access the admin panel, go to `/admin` (e.g., `http://127.0.0.1:5000/admin`). You will be prompted to log in.
    If you configured the app to run on `0.0.0.0` (as it is by default in the provided `app.py`), you can also access it using your machine's local network IP address.

## How it Works

-   **Backend:** A Flask application handles routing, creating new pages, saving/loading page content, and admin functionalities.
    - Page content is stored as plain text files (with `.md` extension) in the `data/` directory.
    - Page statuses (enabled/disabled) are stored in `data/page_status.json`.
    - Backups are stored in the `backup/` directory, organized by page ID.
    - Admin access is protected by a password.
-   **Frontend:**
    -   HTML templates are rendered by Flask (including admin pages).
    -   CSS is used for basic styling.
    -   JavaScript (`static/js/script.js`) handles all client-side logic:
        -   Managing the encryption key in local storage.
        -   Interacting with the textarea for text selection.
        -   Encrypting text using the Web Crypto API (AES-GCM). Encrypted text is stored on the server as `ENC<base64_encoded_data>`.
        -   Displaying `[LOCKED_CONTENT_#ID]` labels in the textarea instead of raw encrypted strings. A client-side map (`encryptedTextMap`) keeps track of the association between labels and their actual encrypted data.
        -   Decrypting text using the Web Crypto API.
        -   Communicating with the backend via `fetch` API to load and save page content.

## Important Notes

-   **Security of Encryption Key:** The encryption key is stored in the browser's local storage. While convenient, this means anyone with access to your browser's local storage for this site could potentially retrieve the key. Be mindful of this if using on a shared computer.
-   **Data Storage:** Page content, including the `ENC<...>` encrypted strings, is stored on the server. The security of this data depends on the security of your server environment.
-   **Development Server:** The Flask development server (`app.run()`) is not suitable for production use. For deployment, use a production-grade WSGI server like Gunicorn or uWSGI.
-   **No Markdown Rendering:** Despite files being saved with `.md`, there is currently no markdown rendering feature implemented in the editor UI. It's a plain text editor.
