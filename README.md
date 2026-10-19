# Tarkzoid

A first-person extraction survival game in the browser: Escape from Tarkov's raid / loot / extract loop in a Project Zomboid-style zombie-infested town at night. Built with [three.js](https://threejs.org/) and Vite. It has no asset files: the geometry is generated in code and the sound is synthesized with WebAudio.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## The loop

1. **Hideout.** Manage your stash. Buy gear from the trader and sell loot (Tarkov-style grid inventory: drag items, press R while dragging to rotate, Shift+click to quick-move, right-click for actions).
2. **Raid.** You spawn at the edge of a procedurally generated town. Loot fridges, cabinets, weapon crates, medcases, PCs, car trunks and corpses.
3. **Extract.** Reach one of the three listed exfils and hold position for 7 seconds before the 25-minute timer runs out.
4. **Die and you lose everything you brought in** except the 2×2 secure container. Closing the tab mid-raid counts as a death.

## Systems

- **Zombies** (Project Zomboid-style). Walkers, runners and brutes. They hear noise: gunshots carry 30–65 m, sprinting carries about 13 m, crouching is nearly silent. They need line of sight to spot you, and the flashlight makes you easier to see. While chasing they follow a BFS flow field, so they route through doorways instead of sticking to walls. More of them keep spawning as the raid goes on.
- **Health** (Tarkov-style). Seven body parts. If the head or thorax reaches 0 you die. A destroyed leg slows you and a destroyed arm wrecks your accuracy (painkillers mask both). Damage to a destroyed limb spreads to the rest of the body. Bleeding drains HP until you bandage it.
- **Infection.** Bites can infect you. You have about 6 minutes to find an antiviral injector before you turn.
- **Hunger, thirst and stamina.**
- **Weapons.** PM pistol, MP-133 shotgun, SKS (zooms when aiming) and AK-74N (full auto). Each uses its own ammo type and has magazines, reload time, recoil and spread. Headshots do 3× damage. Melee weapons (knife, crowbar, axe) are silent, and the axe cleaves through several zombies.
- **Armor and helmets** reduce damage and the chance of bleeding or a bite. They lose durability as they take hits.

## Controls

| Key | Action |
| --- | --- |
| WASD / Mouse | Move / look |
| Shift / C | Sprint / crouch |
| LMB / RMB | Fire or swing / aim down sights |
| R | Reload |
| Q, 1, 2 | Swap between firearm and melee |
| F or E | Search the container you're looking at |
| Tab or I | Inventory |
| H | Quick-heal (bandage if bleeding, otherwise a medkit) |
| L | Flashlight |
| M | Map |
| Esc | Pause |

## Code layout

| File | Purpose |
| --- | --- |
| `src/main.js` | Game state machine (hideout → raid → result), render loop, raid inventory, extraction |
| `src/world.js` | Procedural town: roads, buildings with doors and roofs, cars, trees, containers, extracts |
| `src/player.js` | First-person controller, viewmodel, shooting/melee, body-part health, status effects |
| `src/zombies.js` | Zombie spawning, perception, flow-field pathing, attacks, corpses |
| `src/collision.js` | 2D spatial hash, circle-vs-box movement, raycasts |
| `src/items.js` | Item definitions, loot tables, container types |
| `src/inventory.js` / `src/invui.js` | Grid inventory logic and drag-and-drop UI |
| `src/hud.js` | HUD, compass, map |
| `src/audio.js` | Synthesized sound effects |
| `src/save.js` | Profile persistence (localStorage) |

`window.game` is exposed in the browser console for debugging.
