import os
import random
import string
import json
from flask import Flask, render_template, request, redirect, url_for, jsonify

app = Flask(__name__)
DATA_DIR = "data"

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

def generate_page_id(length=4):
    """Generates a random string of fixed length."""
    letters = string.ascii_lowercase
    return "".join(random.choice(letters) for i in range(length))

@app.route("/")
def index():
    """Serves the home page."""
    return render_template("index.html")

@app.route("/new_page", methods=["POST"])
def new_page():
    """Creates a new page and redirects to its editor."""
    page_id = generate_page_id()
    # Ensure the generated ID is unique, though collision is unlikely for small numbers of pages
    while os.path.exists(os.path.join(DATA_DIR, f"{page_id}.md")):
        page_id = generate_page_id()
    
    # Create an empty file for the new page
    with open(os.path.join(DATA_DIR, f"{page_id}.md"), "w", encoding="utf-8") as f:
        f.write("") # Start with empty content
        
    return redirect(url_for("editor", page_id=page_id))

@app.route("/<page_id>")
def editor(page_id):
    """Serves the editor page for a given page_id."""
    file_path = os.path.join(DATA_DIR, f"{page_id}.md")
    if not os.path.exists(file_path) or not len(page_id) == 4 or not page_id.isalnum():
        return "Page not found", 404
    return render_template("editor.html", page_id=page_id)

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
    app.run(debug=True)
