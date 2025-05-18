import os
import random
import string
import json
import logging
import secrets
import shutil
import io # For in-memory zip file
import zipfile # For creating zip archives
from datetime import datetime # For backup naming
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, jsonify, session, flash, send_file
# send_file will be used for download

app = Flask(__name__)
DATA_DIR = "data"
BACKUP_DIR = "backup" # New directory for backups

# Configure logging
logging.basicConfig(level=logging.INFO)

# Admin password setup
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if ADMIN_PASSWORD is None:
    ADMIN_PASSWORD = secrets.token_hex(16)
    logging.warning(f"ADMIN_PASSWORD not set. Using a random password: {ADMIN_PASSWORD}")

app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32)) # For session management

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)
if not os.path.exists(BACKUP_DIR): # Create backup directory
    os.makedirs(BACKUP_DIR)

def generate_page_id(length=4):
    """Generates a random string of fixed length."""
    letters = string.ascii_lowercase
    return "".join(random.choice(letters) for i in range(length))

@app.route("/")
def index():
    """Serves the home page."""
    return render_template("index.html")

# Decorator to require login for admin routes
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "admin_logged_in" not in session:
            return redirect(url_for("admin_login", next=request.url))
        return f(*args, **kwargs)
    return decorated_function

@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    """Handles admin login."""
    if request.method == "POST":
        password = request.form.get("password")
        if password == ADMIN_PASSWORD:
            session["admin_logged_in"] = True
            next_url = request.args.get("next")
            flash("Login successful!", "success")
            return redirect(next_url or url_for("admin_panel"))
        else:
            flash("Invalid password.", "danger")
    return render_template("admin_login.html")

@app.route("/admin/logout", methods=["POST"])
@login_required
def admin_logout():
    """Handles admin logout."""
    session.pop("admin_logged_in", None)
    flash("You have been logged out.", "info")
    return redirect(url_for("index"))

@app.route("/admin")
@login_required
def admin_panel():
    """Serves the admin dashboard page, listing existing pages."""
    pages = []
    for filename in os.listdir(DATA_DIR):
        if filename.endswith(".md"):
            page_id = filename[:-3]
            page_data = {"id": page_id, "name": page_id}
            
            # Get backup timestamps
            page_specific_backup_dir = os.path.join(BACKUP_DIR, page_id)
            backup_timestamps = []
            if os.path.exists(page_specific_backup_dir):
                for backup_file in sorted(os.listdir(page_specific_backup_dir), reverse=True): # Sort to get latest first
                    if backup_file.startswith(f"{page_id}_") and backup_file.endswith(".md"):
                        try:
                            # Extract timestamp string: pageid_YYYYMMDDHHMMSS.md
                            timestamp_str = backup_file[len(page_id)+1:-3]
                            dt_obj = datetime.strptime(timestamp_str, "%Y%m%d%H%M%S")
                            backup_timestamps.append(dt_obj.strftime("%Y-%m-%d %H:%M:%S"))
                        except ValueError:
                            # Handle cases where filename format might be unexpected
                            logging.warning(f"Could not parse timestamp from backup file: {backup_file}")
            page_data["backups"] = backup_timestamps # List of formatted timestamps
            pages.append(page_data)
            
    return render_template("admin.html", pages=pages)

@app.route("/admin/delete_page/<page_id>", methods=["POST"])
@login_required
def delete_page(page_id):
    """Deletes a page (but not its backups)."""
    file_path = os.path.join(DATA_DIR, f"{page_id}.md")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            flash(f"Page '{page_id}' deleted successfully.", "success")
        except OSError as e:
            flash(f"Error deleting page '{page_id}': {e}", "danger")
    else:
        flash(f"Page '{page_id}' not found.", "warning")
    return redirect(url_for("admin_panel"))

@app.route("/admin/backup_page/<page_id>", methods=["POST"])
@login_required
def backup_page(page_id):
    """Creates a timestamped backup of a page."""
    source_file_path = os.path.join(DATA_DIR, f"{page_id}.md")
    
    if not os.path.exists(source_file_path):
        flash(f"Page '{page_id}' not found. Cannot create backup.", "warning")
        return redirect(url_for("admin_panel"))

    # Ensure backup directory for the page exists (e.g. backup/eppa/)
    # This helps organize backups per page.
    page_specific_backup_dir = os.path.join(BACKUP_DIR, page_id)
    if not os.path.exists(page_specific_backup_dir):
        try:
            os.makedirs(page_specific_backup_dir)
        except OSError as e:
            flash(f"Error creating backup directory for page '{page_id}': {e}", "danger")
            return redirect(url_for("admin_panel"))
        
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    # Backup filename will be like: pagename_timestamp.md, e.g., eppa_20230101120000.md
    # Stored inside backup/pagename/
    backup_filename = f"{page_id}_{timestamp}.md" 
    backup_file_path = os.path.join(page_specific_backup_dir, backup_filename)
    
    try:
        shutil.copy2(source_file_path, backup_file_path) # copy2 preserves metadata
        flash(f"Backup for page '{page_id}' created successfully: {backup_filename}", "success")
    except Exception as e:
        flash(f"Error creating backup for page '{page_id}': {e}", "danger")
        
    return redirect(url_for("admin_panel"))

@app.route("/admin/download_page/<page_id>", methods=["GET"])
@login_required
def download_page(page_id):
    """Packs the page and its backups into a zip file for download."""
    page_file_path = os.path.join(DATA_DIR, f"{page_id}.md")
    page_specific_backup_dir = os.path.join(BACKUP_DIR, page_id)

    if not os.path.exists(page_file_path):
        flash(f"Page '{page_id}' not found. Cannot download.", "warning")
        return redirect(url_for("admin_panel"))

    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add the main page file
        zf.write(page_file_path, arcname=f"{page_id}.md")

        # Add backups if the backup directory exists
        if os.path.exists(page_specific_backup_dir):
            for backup_file in os.listdir(page_specific_backup_dir):
                if backup_file.endswith(".md"):
                    full_backup_path = os.path.join(page_specific_backup_dir, backup_file)
                    # Store backups in a 'backups' folder within the zip
                    zf.write(full_backup_path, arcname=os.path.join("backups", backup_file))
    
    memory_file.seek(0)
    zip_filename = f"{page_id}_archive.zip"
    
    return send_file(
        memory_file,
        as_attachment=True,
        download_name=zip_filename,
        mimetype='application/zip'
    )

@app.route("/admin/create_page", methods=["POST"])
@login_required
def admin_create_page():
    """Creates a new page and redirects to its editor."""
    page_id = generate_page_id()
    # Ensure the generated ID is unique
    while os.path.exists(os.path.join(DATA_DIR, f"{page_id}.md")):
        page_id = generate_page_id()
    
    # Create an empty file for the new page
    file_path = os.path.join(DATA_DIR, f"{page_id}.md")
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write("") # Start with empty content
        flash(f"Page '{page_id}' created successfully.", "success")
        return redirect(url_for("editor", page_id=page_id))
    except IOError as e:
        flash(f"Error creating page '{page_id}': {e}", "danger")
        return redirect(url_for("admin_panel"))


@app.route("/<page_id>")
def editor(page_id):
    """Serves the editor page for a given page_id."""
    file_path = os.path.join(DATA_DIR, f"{page_id}.md")
    if not os.path.exists(file_path) or not len(page_id) == 4 or not page_id.isalnum():
        return render_template("404.html"), 404
    return render_template("editor.html", page_id=page_id)

@app.errorhandler(404)
def page_not_found(e):
    """Serves the custom 404 page."""
    return render_template("404.html"), 404

@app.route("/<page_id>/save", methods=["POST"])
def save_page(page_id):
    """Saves the content of a page."""
    file_path = os.path.join(DATA_DIR, f"{page_id}.md")
    if not os.path.exists(os.path.dirname(file_path)): # Should not happen if new_page created it
        return jsonify({"success": False, "message": "Page directory not found"}), 404
    
    try:
        data = request.get_json()
        content = data.get("content", "")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return jsonify({"success": True, "message": "Page saved."})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/<page_id>/load", methods=["GET"])
def load_page(page_id):
    """Loads the content of a page."""
    file_path = os.path.join(DATA_DIR, f"{page_id}.md")
    if not os.path.exists(file_path):
        return jsonify({"success": False, "message": "Page not found"}), 404
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return jsonify({"success": True, "content": content})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

if __name__ == "__main__":
    app.run(host='0.0.0.0', debug=True)
