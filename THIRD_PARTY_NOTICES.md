# Third-Party Notices and Asset Credits

The source code newly implemented for this project and its synthesized sound effects are distributed under the MIT License. Third-party libraries, tile artwork, and fonts remain subject to their own terms below. The complete tile atlas is not relicensed under MIT.

## Mahjong Engine and Computer Players

- `@kobalab/majiang-core` 1.4.1: rules, tile wall, game progression, winning-hand evaluation, scoring, and rankings.
- `@kobalab/majiang-ai` 1.3.0: computer-player decisions for discards, calls, and wins.
- Copyright (c) 2021 Satoshi Kobayashi.
- License: MIT for both packages.
- Source: https://github.com/kobalab/majiang-core and https://github.com/kobalab/majiang-ai
- Full license texts: `licenses/majiang-core-LICENSE.txt` and `licenses/majiang-ai-LICENSE.txt`.

The Vue integration, PlayCanvas rendering, input handling, settings, and audio controls were newly implemented for this project. The previous game implementation is not included in the current source or distribution.

## Tile Mesh

The actual 3D tile mesh is adapted from hiinaspace / just-mahjong:

- Source: https://github.com/hiinaspace/just-mahjong
- Pinned commit: `9ade9ec79d28b5d28f74448a17d0b37dafd63f42`.
- Original file: `Assets/Riichi/tileFbx.fbx`.
- The upstream README declares CC0 / public domain.
- Credit and modification record: `licenses/just-mahjong-CREDITS.txt`.

Only the tile mesh is adopted; unrelated third-party objects and game code from that project are not included. The converted mesh retains the authored bevels and normals, with normalized dimensions and separately colored ivory and amber regions. Conversion is reproducible with `scripts/convert-tile-model.py`; runtime data is `public/models/mahjong-tile.json`.

## Tile-Face Artwork

The 34 standard tile faces and three red-five faces were extracted from the user-supplied `assets/tiles/user-tile-sheet.png`. Crop positions and source mappings are recorded in `assets/tiles/user-tile-sheet-layout.json`; extracted faces are stored in `assets/tiles/user-faces/` and distributed in `public/js/faces/`.

The original tile-face artwork is provided by [Mahjong Toufu](https://majandofu.com/mahjong-images). On November 6, 2026, the distribution page was checked for permission to use the images for personal and commercial purposes and to modify them. Editorial replies also address use in games and distributed applications. Copyright in the artwork remains with Mahjong Toufu. This attribution is included in the distribution in response to the provider's request. The permission record is `assets/tiles/user-tile-sheet-source.json`. These images are not treated as MIT-licensed or public-domain artwork.

`public/js/pat.png` and the compatibility GIF remain as legacy/export assets. Their three-dimensional materials and blank dice parts were newly generated for this project. They are not used to fake the perspective of the current 3D tiles. Rendering now uses the actual mesh, a shared camera and lights. Earlier generated oblique tile studies are retained under `assets/tiles/perspective-hands/` as authoring references, not runtime geometry.

## Dealer-Marker Font

Legacy dealer-marker atlas artwork uses a subset of Noto Serif CJK JP Bold. Current 3D marker and tile-face lettering use the supplied tile sheet instead.

The font is distributed under the SIL Open Font License 1.1. The subset was renamed to "Mahjong Tile Serif", and the font's original copyright notices and OFL text were retained.

- Original font: https://github.com/notofonts/noto-cjk/tree/main/Serif
- Copyright (c) 2017-2024 Adobe (http://www.adobe.com/).
- Source, hash, and subset characters: `assets/tiles/font-source.json`.
- Full license text: `licenses/NotoSerif-OFL.txt`.

## Title, Background, and Seal

The in-game room background `public/js/salon-room.webp` is original artwork newly generated with image_gen on November 11, 2026, using the project's own title concept as a style reference. No characters or interface are baked into this background. Its source and prompt are `assets/title/salon-room-source.png` and `assets/title/salon-room-prompt.json`. It is exported by `scripts/prepare-salon-title.py` and distributed under the project's MIT License.

The current salon title screen uses `public/js/title-salon.webp`, updated on November 13, 2026. It is a composite of an original AI-generated clean illustration and actual dimensioned 3D mahjong tiles. The clean plate is `assets/title/salon-base-no-tiles.png`; its complete prompts are in `assets/title/salon-clean-plate-prompt.json`. The intermediate `salon-scale-study.png` is a hand-pose reference and is not a production tile layer. All production tiles are rendered from the CC0 mesh described above, using `scripts/render-title-tiles.mjs` and `assets/title/title-tiles-layout.json`, then composited by `scripts/compose-title-art.py`. The held tile and all tabletop tiles share the same 21 x 28 x 16.5 mm dimensions. Title lettering and interactive buttons remain separate Vue elements.

The clean illustration and new source code are distributed under MIT. The title's tile-face artwork remains copyrighted by Mahjong Toufu under the usage terms described above. The complete composite is not wholly relicensed under MIT. The earlier `salon-source.png` and its original prompt are retained as production history.

`public/js/title.png`, `bg.png`, and `jong.png` were newly generated without supplying the previous images as references. They depict pale-gold Japanese mahjong calligraphy, green felt, and a red seal with the Japanese character for harmony.

Source images and prompts are stored in `assets/title/`. `scripts/prepare-title-assets.py` reproduces the game-size exports and transparent-margin adjustments. No pixels from the previous images were reused.

## Synthesized Sound Effects

The nine `public/js/w_*.wav` effects were synthesized mathematically for this project without recorded samples, third-party music, or sample libraries.

- `w_clear.wav`: the selected player-win chime, generated by `scripts/generate-win-sound.py`.
- The other eight effects: generated by `scripts/generate-game-sounds.py`. Tile-contact sounds use decaying sinusoidal modes; notification sounds use short sequences of sine tones.
- Purposes, durations, volume information, hashes, and preview order: `assets/audio/effects.json`.

Previous recordings, including the old win sound formerly retained for comparison, were archived outside the project for recovery. They are not included in the current source or distribution.

## PlayCanvas and Vue

- PlayCanvas Engine 2.24.0: https://github.com/playcanvas/engine - MIT - `licenses/PLAYCANVAS-LICENSE.txt`.
- Vue 3.5.45: https://github.com/vuejs/core - MIT - `licenses/VUE-LICENSE.txt`.

Original copyright notices and full license texts are retained. The PlayCanvas Engine is used standalone through npm; no hosted Editor service is required. Paths beginning with `licenses/` refer to the deployed site root; their source files are located in `public/licenses/`.

## Opponent Character Avatars

The nine PNG files in `public/characters/` were newly generated with the built-in image_gen tool as fictional adult female characters for this project. The new set, created on November 11, 2026, uses the project's own generated title-screen concept as its art-style reference. Existing franchise characters, celebrities, and third-party artwork were not supplied as references.

The character profiles and these avatar images are distributed under the project's MIT License. Source images, the original style reference, and generation prompts are stored in `assets/characters/`. `scripts/prepare-character-assets.py` exports the 256-pixel game portraits. Their terms are separate from those of the tile-face artwork and font.

## Development Tools

Vite and `@vitejs/plugin-vue` are MIT-licensed. Playwright is licensed under Apache-2.0. These tools are used for development, building, and validation, and are not loaded by the running game. Exact dependency versions are recorded in `package-lock.json`.
