# Grok Snake

A small retro browser game: the classic phone "Snake", redone with a neon arcade
look, chunky pixel font and a subtle CRT scanline effect.

Steer the snake, eat the glowing food, and don't hit the walls or your own tail.
Each piece of food is worth 10 points, makes the snake one block longer and
makes it a little faster. Your best score is saved in your browser.

## How to play

**Computer**
- Arrow keys or W A S D to steer
- Space or Enter to start / restart
- P or Esc to pause and resume

**Phone or tablet**
- Tap the title screen to start
- Swipe on the screen, or use the arrow buttons below the board, to steer
- The II button pauses; tap the board to resume
- Tap RESTART after a game over

## How to run it

It is just three files (`index.html`, `style.css`, `game.js`) with no
dependencies or build step.

- Easiest: double-click `index.html` to open it in a browser.
- Or serve the folder locally:
  ```
  python3 -m http.server 8000
  ```
  then open http://localhost:8000
- To put it online, upload the folder to any static host (GitHub Pages,
  Netlify, etc.).

The pixel font ("Press Start 2P") loads from Google Fonts. If you are offline
the game still works and falls back to a plain monospace font.

## Tests

`tests/test_snake.py` is an optional automated check (needs Python Playwright +
Chromium). It serves the folder, plays the game in a headless browser at desktop
and phone sizes, and saves screenshots to `/workspace/grok-snake-shots/`.
Run it with `python3 tests/test_snake.py`.
