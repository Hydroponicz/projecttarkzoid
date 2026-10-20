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
- **Survivors.** Other people are trying to make it too. Each survivor has a name, a personality, a weapon with real ammo, a backpack of loot, and a disposition: **friendly** (about 45%), **wary** (30%) or **hostile** bandits (25%).
  - **What they do:** survivors scavenge between buildings (opening doors as they go) and fight zombies. Zombies hunt them as well as you, and a survivor bitten to death may get back up.
  - **Bandits** shout, keep their distance and shoot you. They flee when badly hurt.
  - **Wary survivors** warn you off. Point a gun at them and they'll turn on you.
  - **Talking:** press **F** on a friendly or wary survivor to talk. You can ask who they are, ask for rumors about where loot is, or trade. Friendly survivors who trust you will follow you as a companion who fights alongside you; you can also tell them to wait or go their own way.
  - **Trust:** it goes up with fair trades, gifts and reassurance. Stealing during a trade, shooting them or aiming at them lowers it, and other survivors who see you shoot someone lose trust in you too. Enough trust turns a wary survivor friendly; too little turns anyone hostile.
  - **On the map:** survivors you've met are marked green (friendly), yellow (wary) or red (hostile). When they die, their body keeps everything they carried.
- **Doors.** Every building has real doors. Open and close them with **F**. Zombies can break them down for good, and you can barricade over a doorway.
- **Health.** Seven body parts. Bleeding, broken limbs and spreading damage work like Tarkov's. Painkillers mask limb damage. Bites can infect you, and you have about 6 minutes to find an antiviral before you turn.
- **Needs.** Hunger, thirst, stamina and fatigue. When you're exhausted you move slower and shoot worse.
- **Movement.** You're an average person, not a super-soldier:
  - **Speeds:** walking is about 1.6 m/s, sprinting 4.6 m/s, crouching 1 m/s and prone 0.4 m/s. Backpedalling and strafing are slower.
  - **Momentum:** you take a moment to get up to speed and slide about a metre and a half to a stop after a sprint. You can barely steer in the air.
  - **Pace:** the mouse wheel sets your walking pace, like Tarkov. Footstep noise scales with speed, so creeping is almost silent.
  - **Stance:** **C** toggles crouch and **X** prone. Both make you harder to see and steady your aim.
  - **Jumping:** **Space** jumps about 0.45 m and costs stamina.
  - **Stamina:** sprinting drains it. Run it dry and you're winded: you can't sprint again until it recovers, and you hear heavy breathing.
  - **Weight:** every item weighs something. Over 25 kg slows you and drains stamina faster; over 45 kg you can't sprint; over 60 kg you can only shuffle.
- **Weapons.** Melee weapons are silent: knife, hammer, crowbar, and an axe that also chops trees.

## Firearms

Guns work much like Tarkov's. Each firearm is a detailed procedural model, and its iron sights are properly aligned with where the bullets go.

- **Magazines are items.** Load them in the inventory, round by round, by dragging ammo onto a magazine (or right-click → Load). Loading only continues while the inventory is open. Drag a magazine onto a weapon to insert it.
- **Chambered rounds.** **R** swaps in your fullest spare magazine. A tactical reload keeps the chambered round (30+1). On an empty reload the bolt has to be racked. Double-tap **R** for a quick reload that drops the old mag on the ground. The MP-133 loads shell by shell; firing interrupts the loading, and you pump between shots. The PM's slide and the SKS bolt lock back when empty.
- **No ammo counter.** Press **T** to check your magazine, which gives a rough "About half" reading. **Z** switches fire mode on the AK.
- **Aiming physics.** The gun lags behind your mouse, and your breathing sways it in a figure-8. Sway grows when you're low on stamina, tired, or moving. Aiming drains arm stamina; hold **Shift** while aiming to hold your breath and steady the shot. Recoil kicks the weapon on springs and climbs the camera, which partly recovers. Bullets fire along the barrel, not the screen center.
- **Animations.** Drawing, magazine swaps (tilt, mag out, hand to pouch, mag in, rack), mag checks, pumping, shell loading, fire-mode switching, bolt and slide cycling, ejected brass and shells, and muzzle flash. The gun pulls back when you face a wall.
- **Attachments.** Drag them onto a weapon to fit them; right-click the weapon to detach. They change ergonomics, sway and recoil.
  - Red dot and holographic sights project their reticle at infinity, like real reflex sights.
  - The **PSO-1 4×** and **Hunting 6×** are true picture-in-picture scopes: a magnified view renders onto the lens, with the PSO's chevron and rangefinder reticle and an eye-box shadow when the gun sways.
  - Suppressors cut gunshot noise by about 80%, which matters with zombies around.
  - Also a muzzle brake and a vertical foregrip.
- **Lean** with **Q** / **E**.

## Controls

| Key | Action |
| --- | --- |
| WASD / Mouse | Move / look |
| Shift | Sprint |
| Mouse wheel | Walking pace (20–100%) |
| C / X / Space | Crouch / prone / jump |
| LMB / RMB | Fire or swing / aim down sights |
| Shift while aiming | Hold breath |
| R / double-tap R | Reload / quick reload (drops the mag) |
| T / Z | Check magazine / switch fire mode |
| Q / E | Lean left / right |
| 1, 2 | Switch between firearm and melee |
| F | Interact: open/close doors, search containers, sleep in beds, talk to survivors (1–9 picks a dialogue option) |
| Tab or I | Inventory. Close it with Esc, Tab, F, the Close button, a click outside, or by walking off. |
| H | Quick-heal (bandage if bleeding, otherwise a medkit) |
| L | Flashlight |
| M | Map (your safehouse is outlined in yellow) |
| B | Build mode: 1–6 select a piece, R rotate, LMB build, X dismantle |
| V | Claim a safehouse |
| Esc | Pause. The game goes fullscreen when you spawn; hold Esc or use the pause menu to leave fullscreen. |

## Dev console

Press **`** (backquote) or **F1** to open the dev console, in game or on the menu. It pauses the game while it's open; you can turn that off in its settings. Its toggles are remembered across reloads.

| Tab | What's in it |
| --- | --- |
| Player | God mode, noclip, infinite stamina and ammo, frozen needs, invisible to zombies. Sliders for every body part, need and skill. Bleed, infect, break legs, heal, cure. Ready-made loadouts. |
| World | Spawn friendly, wary or hostile survivors, list them, or kill them all. Freeze zombies, free build, fullbright, no fog. Hour and day sliders, time speed (0–60×). Click the map to teleport. Spawn zombies at your crosshair, around you, or at random. Kill, enrage or calm all zombies. Open, close or repair every door. Restock loot, claim or clear a safehouse. |
| Items | Search, filter and spawn any item into your inventory, the container you're looking at, or at your feet. Gear goes into an empty equipment slot automatically. |
| Debug | Collision-box overlay and zombie AI labels (type, state, HP, distance, whether it can see you, bashing). A live view of the zombie pathfinding grid. FPS, draw calls, and game state. |
| Save | Save now, export or import save files as JSON, reroll the world seed, wipe the save. |

The command line has Tab completion and ↑/↓ history. Type `help` for the full list. Examples:

```
give ak74            give mag_ak30 3      kit Rifleman        kit Marksman
give scope_pso       give supp_rifle      kit Builder         spawn brute 3
survivor hostile 2   survivors            trust 40            spawn walker 5
tp 0 0               tp safehouse         time 22:00          time +8
speed 20             skill carpentry 8    set fatigue 90      killall 25
god / noclip / invis / freeze / freebuild                    js player.skill
```

## Code layout

| File | Purpose |
| --- | --- |
| `src/main.js` | Game state machine (menu → creation → play → death), save/load, day/night, interactions, sleep, safehouse |
| `src/character.js` | Professions, skills and the character creation screen |
| `src/build.js` | Carpentry: placing, saving and dismantling structures |
| `src/world.js` | Seeded procedural town: roads, buildings with doors and roofs, beds, cars, trees, containers |
| `src/player.js` | First-person controller, leaning, melee, body-part health, status effects |
| `src/weapons.js` | Firearms: weapon/optic models, PIP scopes, sway/recoil physics, animations, magazines, attachments |
| `src/survivors.js` | AI survivors: dispositions and trust, A* pathfinding, combat, following, dialogue, trading |
| `src/zombies.js` | Zombie spawning, perception, flow-field pathing, attacks, corpses |
| `src/collision.js` | 2D spatial hash, circle-vs-box movement, raycasts |
| `src/items.js` | Item definitions, loot tables, container types |
| `src/inventory.js` / `src/invui.js` | Grid inventory logic and drag-and-drop UI |
| `src/hud.js` | HUD, compass, map |
| `src/audio.js` | Synthesized sound effects |
| `src/devconsole.js` | Dev console: tabs, cheats, overlays, commands |
| `src/save.js` | Save persistence (localStorage): world seed plus everything that changed |

`window.game` is also exposed in the browser's own devtools console.
