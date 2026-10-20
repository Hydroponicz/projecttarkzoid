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
2. **Follow the guide.** A new character starts a ten-step "First day" tutorial, shown top right. It covers moving, scavenging, the inventory, eating, arming yourself, a first kill, claiming a safehouse, finding a trader, making a deal and fortifying. Each step gives a small reward. After that, five chapters of goals lead the way:
   1. **Dig In**: build, sleep, stock your safehouse, survive to day 3.
   2. **Trade Routes**: find every trader, finish jobs, reach loyalty 2.
   3. **Armed and Dangerous**: a rifle, an optic, body armor, 50 kills.
   4. **The Outpost**: soldier zombies, military loot, loyalty 3.
   5. **Long Haul**: day 14, 250 kills, 15 jobs.

   Each chapter pays out gear. **J** opens the goals panel; **K** (while it's open) skips the tutorial.
3. **Wake up in a random house** in a persistent, procedurally generated town. Loot doesn't respawn. The world is saved automatically (every 30 seconds, when you sleep, and when you close the tab).
3. **Make a home.** Claim the building you're standing in as your safehouse with **V**. Outdoors, **V** claims a 20×20 m camp instead. Zombies never respawn near your safehouse.
4. **Build.** Press **B** to build walls, barricades, doors, storage crates, beds and campfires out of planks and nails. You need a hammer. Planks come from lumber piles in warehouses, or you can chop trees with an axe and saw the logs into planks. Hammering is loud and draws zombies.
5. **Survive the nights.** One in-game minute passes per real second, so a full day takes 24 minutes. At night zombies move faster, and more of them spawn as the days go by. Sleep in a bed to recover fatigue and health. Sleeping outside your safehouse may wake you to company.
6. **Death is permanent.** Your corpse stays in the world with all your gear, and your base keeps standing. The next survivor you create spawns into the same world. Fallen characters are listed in the graveyard on the title screen.

## The town

Every world is generated from a seed, laid out in districts, with loot that fits where you find it:

| Where | What's there |
| --- | --- |
| **Downtown** (centre) | A **skyscraper**: corporate offices with desks, filing cabinets, server racks and executive safes. Expect intel folders, flash drives, laptops and hard drives. |
| **Civic & commercial ring** | The **hospital** (three floors; wards with beds and corridors of rooms holding medicine cabinets and surgical carts, full of infected patients), **office blocks** (open-plan desk floors), a second tower, the **police station** (police lockers with sidearms, ammo and armor; evidence lockers; patrol cars), a **pharmacy** (aisles of pill shelves), a **grocery store** and shops. |
| **Outskirts** | Houses, a **hardware store** (tools, nails, lumber), a **gas station** (snacks and drinks), warehouses, a clinic, parks and parking lots. |
| **Military** | A fenced **military outpost** in one corner (command post, tents, watchtowers, a helipad and a truck) and **checkpoints** on the streets (barriers, sandbags, a guard booth and a military truck). This is the only place to find AK-74s, AK mags, PSO scopes, 6B13 armor, 6B47 helmets, military rucksacks, MREs and military batteries. Guarded by armored soldier zombies: aim for the head. |

Buildings carry signs (pharmacy cross, HOSPITAL, POLICE, company names), offices and the hospital have lit upper floors, and the map (**M**) labels every landmark.

**Interiors.** Buildings are laid out and furnished for what they are.
- **Houses** are split into real rooms joined by interior doors:
  - A living room with a sofa facing the TV, a coffee table on a rug, armchairs and bookshelves.
  - A kitchen with a run of cupboards, sink, stove and fridge along one wall, and a dining table with chairs.
  - Bedrooms with a bed, nightstands, a wardrobe, a dresser and sometimes a desk.
  - A small tiled bathroom (tub, toilet, sink with a mirrored cabinet) next to a laundry room.

  Kitchens and bathrooms have tiled floors and bedrooms are carpeted. Loot follows the furniture: food in kitchen cupboards, pills in the bathroom cabinet, backpacks in wardrobes, valuables in nightstands.
- **Shops** have shelving along the walls and down the middle, a checkout with a cash register by the door, drinks fridges and freezers, and a stocked back storeroom.
- **Clinics** have a waiting room (reception, rows of chairs, a water cooler) and exam rooms.
- **Offices** are desk floors with monitors and chairs, filing cabinets, plants and vending machines.
- **Police stations** have offices, a locker room, an evidence room and a holding cell behind bars.
- **Warehouses** have rows of pallet racking, pallets and a forklift.
- **The hospital** has wards, exam rooms with hospital beds, and supply rooms.

Furniture never blocks doorways or door swings, and tall pieces don't stand in front of windows.

**Windows.** Ground floors have real windows: sash windows on houses, big storefront glass on shops, rows of windows on offices and corridor buildings, and high windows on warehouses.
- **F** opens or closes a window. **Space** while facing an open or smashed one climbs through it. Climbing over broken glass can cut you and start a bleed.
- Bullets shatter glass and keep going, and any melee weapon smashes it.
- Zombies can see you through glass. They path to windows as well as doors, smash the glass and climb in, and sometimes tumble through head first.
- Window states are saved.

New consumables: **vitamins**, **antibiotics** (slow a zombie infection, don't cure it), **morphine**, **surgical kits** (restore a destroyed limb), **coffee** (fights fatigue), chips, rice and MREs.

## Systems

- **Zombies.** Walkers, runners and brutes. They hear noise (gunshots, sprinting, hammering) and need line of sight to spot you; Stealth and crouching make you harder to see. Pathfinding:
  - Chasing zombies follow a flow field around you (60 m). It routes them to doors, which they bash down if closed. Anything you build blocks them too, and brutes do triple damage when they bash.
  - Zombies further out, and zombies heading for a noise, use A* paths around walls and through doorways.
  - A zombie stuck on a wall sidesteps and finds a new route.

  How they react:
  - Shooting a zombie from any distance makes it flinch, then come for you.
  - A bullet hitting a wall makes nearby zombies come to look where it came from. So does another zombie dropping dead.
  - They can't attack through a closed door or a wall.
- **Survivors.** Other people are trying to make it too. Each survivor has a name, a personality, a weapon with real ammo, a backpack of loot, and a disposition: **friendly** (about 45%), **wary** (30%) or **hostile** bandits (25%).
  - **What they do:** survivors scavenge between buildings (opening doors as they go) and fight zombies. Zombies hunt them as well as you, and a survivor bitten to death may get back up.
  - **Bandits** shout, keep their distance and shoot you. They flee when badly hurt.
  - **Wary survivors** warn you off. Point a gun at them and they'll turn on you.
  - **Talking:** press **F** on a friendly or wary survivor to talk. You can ask who they are, ask for rumors about where loot is, or trade. Friendly survivors who trust you will follow you as a companion who fights alongside you; you can also tell them to wait or go their own way.
  - **Trust:** it goes up with fair trades, gifts and reassurance. Stealing during a trade, shooting them or aiming at them lowers it, and other survivors who see you shoot someone lose trust in you too. Enough trust turns a wary survivor friendly; too little turns anyone hostile.
  - **On the map:** survivors you've met are marked green (friendly), yellow (wary) or red (hostile). When they die, their body keeps everything they carried.
- **Doors.** Every building has real doors. Open and close them with **F**. An open door's panel is solid, so you and zombies go around it. Bullet holes and blood on a door swing with it.
  - Zombies after something on the other side of a closed door beat on it: it shakes, splinters and darkens, then bursts into flying planks. A few walkers get through in about ten seconds.
  - You can hack doors down with an axe or crowbar, and barricade over a doorway.
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
- **Aiming physics.**
  - **Mouse lag:** the gun lags behind your mouse, more loosely at a run.
  - **Breathing:** your breathing sways the gun in a figure-8. Sway grows when you're low on stamina, tired, or moving.
  - **Momentum:** the gun carries your body's momentum. Speeding up, stopping dead or cutting sideways at a sprint throws it the other way, harder the sharper the change. Your aim goes with it.
  - **Holding breath:** aiming drains arm stamina. Hold **Shift** while aiming to hold your breath: the sway eases out over a moment, the edges of your vision close in, and you exhale (or gasp, if you ran out) when you let go.
  - **Recoil:** recoil kicks the weapon on springs and climbs the camera, which partly recovers.
  - **Where bullets go:** bullets fire along the barrel, not the screen center.
  - **Sprinting** widens the view slightly and gradually.
- **Animations.** Drawing, magazine swaps (tilt, mag out, hand to pouch, mag in, rack), mag checks, pumping, shell loading, fire-mode switching, bolt and slide cycling, ejected brass and shells, and muzzle flash. The gun pulls back when you face a wall.
- **Attachments.** Open the inventory (**Tab**). Drag an attachment onto your weapon (in your hands or in a bag), or right-click the attachment and choose **Attach to …**. Right-click the weapon to detach things. Each part only fits certain guns; hover an item to see what it fits. Attachments change ergonomics, sway and recoil.
  - Red dot and holographic sights project their reticle at infinity, like real reflex sights.
  - The **PSO-1 4×** and **Hunting 6×** are true picture-in-picture scopes: a magnified view renders onto the lens, with the PSO's chevron and rangefinder reticle and an eye-box shadow when the gun sways. The scope view follows the exact path of the bullet, so the reticle is true: shots land within the rifle's spread.
  - Suppressors cut gunshot noise by about 80%, which matters with zombies around.
  - Also a muzzle brake and a vertical foregrip.
- **Lean** with **Q** / **E**.

## Traders

Four or five survivors have moved into small houses, shops or gas stations around town and turned them into trading posts. The place is chosen when the world is created; it's never your safehouse or the house you woke up in.

- **The post.** Inside: a counter with stock on it, shelves of goods, crates, a lantern and a rug. Outside: sandbags, a generator, a hand-painted sign, and a front door kept open for business. Zombies don't spawn near a post, and the trader shoots any that wander in. The building's cupboards are the trader's own and can't be looted while they're alive.
- **The traders.**
  - **Gunsmith:** magazines, ammo, attachments, rifles.
  - **Medic:** bandages up to antiviral injectors and surgical kits.
  - **Quartermaster:** food, water, building materials, tools, backpacks, helmets.
  - **Fixer:** electronics, intel, high-end armor and helmets.
- **Barter.** Press **F** at the counter. Every deal is items for items, taken from your pockets and backpack. Each deal shows what you have against what's needed. Deals restock daily.
- **Loyalty.** Trades and finished quests earn reputation with that trader. 10 reputation unlocks loyalty level 2 and 25 unlocks level 3, each with better deals.
- **Quests.** Each trader has a chain of five jobs, unlocked one after another:
  - Kill zombies of a certain kind (any zombie, runners, or soldiers) or hostile bandits.
  - Hand over supplies.
  - Recover a quest item planted in a cupboard of a far-off building (marked on the map).
  - Scout a building.

  Active quests show their progress on the HUD, and their targets are marked on the map. Rewards are items and reputation.
- **Finding them.** A post appears on the map once you get close, or when another survivor tells you about it.
- **Zombies leave traders alone.** They never pick a trader as prey, and traders' gunfire doesn't draw crowds.
- **Death.** Traders can be hurt and killed, by you or in crossfire. A dead trader's post is abandoned: no more trades or quests, but their cupboards are free to loot.

## Hits, ragdolls and gore

Zombies and survivors react physically to what hits them.

- **Hit reactions.** A body rocks away from the hit, and a headshot snaps the head back. Leg shots and heavy blows (shotgun at close range, axe, crowbar) can knock a target off its feet. It goes ragdoll, tumbles, and climbs back up once it settles. You can keep shooting it while it's down.
- **Death.** Every death is a ragdoll: 15 joints with joint limits, colliding with the ground, walls, cars and furniture. Knees only bend forward and hips have a natural range. Arms and legs collide with the torso (as a solid box) and with each other, so bodies come to rest with their legs out instead of folded through themselves. Bodies collide with other bodies and pile up. Hitting a wall, a window or glass absorbs the blow instead of bouncing the body away. A shot to the legs sweeps the feet out from under the target.
  - The killing blow pushes where it lands, and a running body keeps its momentum.
  - A headshot drops the body limp on the spot. A body shot buckles the knees first, then the body crumples, sometimes with a few death twitches.
  - Survivors drop their gun as they fall.
- **Corpses.** Settled corpses are merged into a single static mesh to keep draw calls low. Shooting a corpse moves it again. Corpses are saved in their final pose, and a body's loot sits where the body ends up.
- **Blood.**
  - A spray exits along the bullet's path, and a fine mist puffs back toward the shooter.
  - Splatter lands on the wall behind the target and drips onto the floor.
  - Pools spread under bodies.
  - Bullet holes are oriented decals on whatever surface they hit.
- **Feedback.** Different sounds for body hits, headshots, armor hits, kills and bodies hitting the ground. A red hit marker pops on kills.

## Controls

| Key | Action |
| --- | --- |
| WASD / Mouse | Move / look |
| Shift | Sprint |
| Mouse wheel | Walking pace (20–100%) |
| C / X / Space | Crouch / prone / jump |
| LMB / RMB | Fire or swing / aim down sights |
| Shift while aiming | Hold breath |
| J / K | Goals panel / skip the tutorial (with the panel open) |
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
| Debug | Bullet tracers: each shot's path and impact in bright purple for 7 seconds (`tracers` command). Collision-box overlay and zombie AI labels (type, state, HP, distance, whether it can see you, bashing). A live view of the zombie pathfinding grid. FPS, draw calls, and game state. |
| Save | Save now, export or import save files as JSON, reroll the world seed, wipe the save. |

The command line has Tab completion and ↑/↓ history. Type `help` for the full list. Examples:

```
give ak74            give mag_ak30 3      kit Rifleman        kit Marksman
give scope_pso       give supp_rifle      kit Builder         spawn brute 3
survivor hostile 2   survivors            trust 40            spawn walker 5
tp hospital          tp military          tp checkpoint       tp pharmacy
tp 0 0               tp safehouse         time 22:00          time +8
traders              tp trader            tp trader medic     rep 25
speed 20             skill carpentry 8    set fatigue 90      killall 25
god / noclip / invis / freeze / freebuild                    js player.skill
```

## Code layout

| File | Purpose |
| --- | --- |
| `src/main.js` | Game state machine (menu → creation → play → death), save/load, day/night, interactions, sleep, safehouse |
| `src/character.js` | Professions, skills and the character creation screen |
| `src/build.js` | Carpentry: placing, saving and dismantling structures |
| `src/world.js` | Seeded procedural town: districts, building archetypes, house room layouts, furnishing by room and business, doors and windows, military sites, cars, trees; merges static scenery (vertex colours, ~50 draw calls) |
| `src/furniture.js` | Box-built furniture and container models (kitchens, beds, sofas, shelving, racks, desks…) |
| `src/player.js` | First-person controller, leaning, melee, body-part health, status effects |
| `src/weapons.js` | Firearms: weapon/optic models, PIP scopes, sway/recoil physics, animations, magazines, attachments |
| `src/survivors.js` | AI survivors: dispositions and trust, A* pathfinding, combat, following, dialogue, trading |
| `src/progress.js` | First-day tutorial, progression chapters and goals, the guide tracker and goals panel |
| `src/traders.js` | Trading posts: placement, renovation props, barter offers, loyalty, quests, trader screen and quest tracker |
| `src/zombies.js` | Zombie spawning, perception, flow-field pathing, attacks, hit reactions, knockdowns, corpses |
| `src/ragdoll.js` | Verlet ragdolls (death, knockdown, get-up), dropped weapons, corpse freezing |
| `src/fx.js` | Instanced particles (blood, dust, sparks), brass, decals (bullet holes, splatter, blood pools) |
| `src/collision.js` | 2D spatial hash, circle-vs-box movement, raycasts |
| `src/items.js` | Item definitions, loot tables, container types |
| `src/inventory.js` / `src/invui.js` | Grid inventory logic and drag-and-drop UI |
| `src/hud.js` | HUD, compass, map |
| `src/audio.js` | Synthesized sound effects |
| `src/devconsole.js` | Dev console: tabs, cheats, overlays, commands |
| `src/save.js` | Save persistence (localStorage): world seed plus everything that changed |

`window.game` is also exposed in the browser's own devtools console.
