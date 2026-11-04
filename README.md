# RefGen

A local citation generator with a custom style editor.

Enter a URL to scrape metadata, paste an existing citation from another
generator to fill in missing fields, and design your own output format
with per-field bold / italic / wrapping and indentation.

## Features

- Scrape author, title, site name, date, and URL from any web page
- Parse pasted citations (MLA, APA, Chicago, and other free-form formats)
  to backfill any fields that could not be scraped
- Design your own citation format:
  - Include or exclude any field
  - Bold / italic per field
  - Wrap in quotes, parentheses, brackets, or angle brackets
  - Hanging indent or first-line indent
- Live preview, one-click copy (rich text + plain text)
- Missing-field warnings with editable inputs

## Quick start

### Windows
1. Download the repository (Code -> Download ZIP, then unzip).
2. Double-click `start.bat`.
3. Your browser opens `http://localhost:8000` automatically.

### macOS / Linux
1. Download the repository (Code -> Download ZIP, then unzip).
2. In a terminal:
   ```bash
   chmod +x start.sh
   ./start.sh