# TranscriptBot

AI chatbot for video transcripts. Powered by Puter.js (free, no API key).

## Setup

### 1. Fork / Clone this repo

### 2. Enable GitHub Pages
- Go to repo **Settings → Pages**
- Source: **Deploy from branch → main → / (root)**
- Save

### 3. Admin Setup
- Go to `https://yourusername.github.io/your-repo/admin.html`
- Default password: `admin123` (change in Settings tab)
- Upload your `.txt` transcript files
- Go to **Export tab → Download transcripts.json**
- Upload `transcripts.json` to the `data/` folder in your repo
- In **Export tab → Step 4**, paste your raw GitHub URL:
  ```
  https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/data/transcripts.json
  ```

### 4. Share with users
- Users visit: `https://yourusername.github.io/your-repo/`
- Admin panel: `https://yourusername.github.io/your-repo/admin.html`

## Default Password
```
admin123
```
Change it in Admin → Settings → Security tab.