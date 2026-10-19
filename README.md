# Tarkzoid

A first-person zombie survival sandbox in the browser. It has Project Zomboid's persistent world, base building and permadeath, combined with Escape from Tarkov's grid inventory, body-part health and gunplay. Built with [three.js](https://threejs.org/) and Vite. It has no asset files: the geometry is generated in code and the sound is synthesized with WebAudio.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## How it plays

1. **Create a survivor.** Pick a name and a profession: Unemployed, Police Officer, Fire Officer, Carpenter, Nurse, Burglar or Veteran. Each comes with skill bonuses and a starting kit. Then spend points on Strength, Fitness, Aiming, Carpentry, Stealth and First Aid.
2. **Wake up in a random house** in a persistent, procedurally generated town. Loot doesn't respawn. The world is saved automatically (every 30 seconds, when you sleep, and when you close the tab).
3. **Make a home.** Claim the building you're standing in as your safehouse with **V**. Outdoors, **V** claims a 20×20 m camp instead. Zombies never respawn near your safehouse.
4. **Build.** Press **B** to build walls, barricades, doors, storage crates, beds and campfires out of planks and nails. You need a hammer. Planks come from lumber piles in warehouses, or you can chop trees with an axe and saw the logs into planks. Hammering is loud and draws zombies.
5. **Survive the nights.** One in-game minute passes per real second, so a full day takes 24 minutes. At night zombies move faster, and more of them spawn as the days go by. Sleep in a bed to recover fatigue and health. Sleeping outside your safehouse may wake you to company.
6. **Death is permanent.** Your corpse stays in the world with all your gear, and your base keeps standing. The next survivor you create spawns into the same world. Fallen characters are listed in the graveyard on the title screen.

## Systems

- **Zombies.** Walkers, runners and brutes. They hear noise (gunshots, sprinting, hammering) and need line of sight to spot you; Stealth and crouching make you harder to see. They follow a flow field to route through open doorways. Closed doors and anything you build block them, so they bash their way through instead (brutes do triple damage).
- **Doors.** Every building has real doors. Open and close them with **F**. Zombies can break them down for good, and you can barricade over a doorway.
- **Health.** Seven body parts. Bleeding, broken limbs and spreading damage work like Tarkov's. Painkillers mask limb damage. Bites can infect you, and you have about 6 minutes to find an antiviral before you turn.
- **Needs.** Hunger, thirst, stamina and fatigue. When you're exhausted you move slower and shoot worse.
- **Weapons.** PM, MP-133, SKS and AK-74N, each with its own ammo, magazine, recoil and aim-down-sights. Melee weapons are silent: knife, hammer, crowbar, and an axe that also chops trees.

## Controls

| Key | Action |
| --- | --- |
| WASD / Mouse | Move / look |
| Shift / C | Sprint / crouch |
| LMB / RMB | Fire or swing / aim down sights |
| R | Reload |
| Q, 1, 2 | Swap between firearm and melee |
| F or E | Interact: open/close doors, search containers, sleep in beds |
| Tab or I | Inventory |
| H | Quick-heal (bandage if bleeding, otherwise a medkit) |
| L | Flashlight |
| M | Map (your safehouse is outlined in yellow) |
| B | Build mode: 1–6 select a piece, R rotate, LMB build, X dismantle |
| V | Claim a safehouse |
| Esc | Pause |

## Code layout

| File | Purpose |
| --- | --- |
| `src/main.js` | Game state machine (menu → creation → play → death), save/load, day/night, interactions, sleep, safehouse |
| `src/character.js` | Professions, skills and the character creation screen |
| `src/build.js` | Carpentry: placing, saving and dismantling structures |
| `src/world.js` | Seeded procedural town: roads, buildings with doors and roofs, beds, cars, trees, containers |
| `src/player.js` | First-person controller, viewmodel, shooting/melee, body-part health, status effects |
| `src/zombies.js` | Zombie spawning, perception, flow-field pathing, attacks, corpses |
| `src/collision.js` | 2D spatial hash, circle-vs-box movement, raycasts |
| `src/items.js` | Item definitions, loot tables, container types |
| `src/inventory.js` / `src/invui.js` | Grid inventory logic and drag-and-drop UI |
| `src/hud.js` | HUD, compass, map |
| `src/audio.js` | Synthesized sound effects |
| `src/save.js` | Save persistence (localStorage): world seed plus everything that changed |

`window.game` is exposed in the browser console for debugging.
