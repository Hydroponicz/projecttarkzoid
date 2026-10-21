# Tarkzoid

A first-person zombie survival sandbox in the browser. It has Project Zomboid's persistent world, base building and permadeath, combined with Escape from Tarkov's grid inventory, body-part health and gunplay. Built with [three.js](https://threejs.org/) and Vite. It has no asset files: the geometry is generated in code and the sound is synthesized with WebAudio (real recordings can be dropped in, see [Sound](#sound)).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## How it plays

1. **Create a survivor.** Pick a name and a profession: Unemployed, Police Officer, Fire Officer, Carpenter, Nurse, Burglar, Farmer or Veteran. Each comes with skill bonuses and a starting kit. Then spend points on Strength, Fitness, Agility, Dexterity, Aiming, Guns, Carpentry, Stealth, First Aid and Farming.
2. **Follow the guide.** A new character starts a ten-step "First day" tutorial, shown top right. It covers moving, scavenging, the inventory, eating, arming yourself, a first kill, claiming a safehouse, finding a trader, making a deal and fortifying. Each step gives a small reward. After that, five chapters of goals lead the way:
   1. **Dig In**: build, sleep, stock your safehouse, survive to day 3, harvest a crop you grew.
   2. **Trade Routes**: find every trader, finish jobs, reach loyalty 2.
   3. **Armed and Dangerous**: a rifle, an optic, body armor, 50 kills.
   4. **The Outpost**: soldier zombies, military loot, loyalty 3.
   5. **Long Haul**: day 14, 250 kills, 15 jobs.

   Each chapter pays out gear. **J** opens the goals panel; **K** (while it's open) skips the tutorial.
3. **Wake up in a random house** in a persistent, procedurally generated town. Loot doesn't respawn. The world is saved automatically (every 30 seconds, when you sleep, and when you close the tab).
3. **Make a home.** Claim the building you're standing in as your safehouse with **V**. Outdoors, **V** claims a 20×20 m camp instead. Zombies never respawn near your safehouse.
4. **Build.** Press **B** to build walls, barricades, doors, storage crates, beds, campfires and rain barrels out of planks and nails, or dig garden plots with a shovel. You need a hammer. Planks come from lumber piles in warehouses, or you can chop trees with an axe and saw the logs into planks. Hammering is loud and draws zombies.
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

Buildings carry signs (pharmacy cross, HOSPITAL, POLICE, company names), and the map (**M**) labels every landmark.

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

## The countryside

The town sits in the middle of a map about 440 m across. Around it is farmland and wilderness, laid out on a grid of 40 m parcels. The town's streets continue out as dirt farm tracks, and a ring track loops round the town.

| What | What's there |
| --- | --- |
| **Farms** (8) | A clapboard **farmhouse** with a pitched roof and a pantry in the kitchen. A red **barn** with a gambrel roof and sliding doors, holding stalls, hay, farm supply shelves, seed racks and sometimes a tractor. Outside: a silo, a chicken coop (eggs), produce crates, round hay bales, a tractor and plow, a pickup truck, a **well**, and a fenced **kitchen garden** whose crops were left growing. A few zombies wander each farm. |
| **Fields** | Next to the farms: wheat, corn (tall rows you can lose sight in), fenced vegetable rows, plowed earth, pasture with a water trough, and mown hay fields. Corn and vegetable rows can be picked for food and grow back. |
| **Orchards** (4) | Rows of apple trees. Pick the apples; they grow back over a day or two. |
| **Forests** | Dense mixed pine, oak and birch woods with fallen logs, rocks and bushes. Some have **clearings** with berry bushes, a **hunting cabin** (hunting locker with a rifle or shotgun, a pantry, a bed) or an abandoned **campsite**. |
| **Meadows** | Open grass with scattered trees, boulders (big ones are cover), bushes, berry bushes and **ponds** ringed with reeds. |

New loot: farm supply shelves (shovels, watering cans, fertilizer, seeds), seed racks, produce crates, chicken coops, pantries (preserves, honey, milk), hay piles and hunting lockers. Hardware stores also stock some seeds and tools, and grocery shelves carry some produce.

Most zombies are in town; the countryside is quieter. Everything far away is hidden by fog, and the scenery is split into chunks so only what's near you gets drawn (see [Performance](#performance)).

## Weather and seasons

- **Seasons.** A year is four 7-day seasons, and a new world starts late in spring. Each season changes:
  - **Temperature:** around 12 °C in spring, 24 °C in summer, 10 °C in autumn and −4 °C in winter. It's warmest mid-afternoon and varies day to day.
  - **Day length:** summer nights are short and winter days are short. Zombies are more dangerous at night.
  - **Which weather is likely.**
  - **Crops:** good growth in summer, slower in autumn, none in winter.
  - **The trees:** fresh in spring, orange and brown in autumn, bare and snow-dusted in winter.

  Seasons blend over their first two days.
- **Weather fronts.** Clear, cloudy, overcast, fog, rain, thunderstorm, snow and blizzard, each lasting a few hours and blending in over about an in-game hour. What comes next depends on what's here now and on the season:
  - Thunderstorms grow out of overcast or cloudy skies and leave as rain. They're most common in summer.
  - Blizzards come out of snow.
  - Rain falls as snow below freezing.
  - Before a storm or blizzard the sky darkens, the wind rises, and you get a warning.
- **What you see and hear.**
  - Rain streaks and snowflakes blow with the wind but don't fall indoors.
  - Fog and storms close in the view and grey the sky.
  - Lightning bolts flash the sky, followed by thunder that arrives late for distant strikes and cracks for close ones.
  - Wind and rain have their own sound. Indoors you hear a muffled drumming on the roof.
  - The ground darkens when soaked, and snow builds up and turns it white, then melts.
- **Your body.**
  - Rain and snow soak you unless you're indoors or in a car. A raincoat or parka keeps most of it off.
  - Wet clothes, wind chill and cold air bring your **body temperature** down. Clothing, shelter, a campfire and a running car's heater warm you up.
  - Cold makes you shiver, which spoils your aim, and stamina comes back slower.
  - Freezing slows you, tires you and hurts. Hypothermia can kill.
  - Summer heat makes you thirsty. Overheating in heavy clothes can lead to heatstroke.
  - The HUD shows WET, SOAKED, COLD, FREEZING, HYPOTHERMIA, OVERHEATING or HEATSTROKE with your body temperature.
- **Clothing slot.** Hoodie (everyone starts with one), work jacket, raincoat, winter coat and military parka, each with warmth and rain protection. Find them in wardrobes, dressers, police lockers, farm shelves, workbenches, hunting lockers and military duffels. Clothing and vests also carry things: see **Clothing storage** below.
- **Zombies.**
  - Rain and wind drown out noise (footsteps, doors, even some gunfire carries less).
  - Fog, rain and snow cut how far zombies see.
  - Hard frost makes them sluggish.
  - Lightning strikes draw the dead.
- **Driving.** Wet and snowy roads mean longer stops and wider corners.
- **Snow** slows you on foot outdoors.
- **Farming.**
  - Rain waters every plot. Heat dries plots faster.
  - Frost damages crops, and nothing grows in the cold. Foraged plants barely regrow in winter.
  - **Rain barrels** (build item 7, Carpentry 1) collect rainwater to drink and to fill watering cans.
- **Saved:** the calendar, the current front and the next one, snow cover, wet ground, your wetness and body temperature.

## Clothing storage

**Your character.** The inventory shows your character in 3D beside the equipment slots, wearing what you have on: the jacket or coat, body armor, vest or chest rig, helmet and backpack, with your gun slung across the back and your melee weapon on the hip. It turns slowly; drag it to turn it yourself. Your body looks the same if you die.

**Skills.** The inventory's skills page lists every skill with its level. Guns, Agility, Dexterity and Farming rise with use; each has a bar of experience toward the next level and says what trains it. The rest are set when the character is made.

What you wear adds inventory space. Each pocket or pouch is its own small grid, Tarkov-style, so its shape matters: an AK magazine needs a tall 1×2 pouch, a can of beans fits anywhere. When you open your inventory, the pockets show up under the jacket's and vest's names, and things stay in them if you take the garment off.

| Slot | Item | Pockets |
| --- | --- | --- |
| Clothing | Hoodie | one 2×2 front pouch |
| Clothing | Work Jacket | two 1×2 and a 2×1 chest pocket |
| Clothing | Raincoat | two 1×2 |
| Clothing | Winter Coat | two 2×2 |
| Clothing | Military Parka | two 2×2 and two 1×2 |
| Vest / Rig | Fishing Vest | six 1×1 and two 1×2 |
| Vest / Rig | Hunting Vest | four 1×2 (hunting lockers, crates) |
| Vest / Rig | Police Duty Vest | two 1×2 and four 1×1 (police lockers) |
| Vest / Rig | Scav Chest Rig | four 1×2 and two 1×1 (crates, soldiers) |
| Vest / Rig | Tactical Assault Rig | four 1×2, two 2×2 and two 1×1 (military crates and duffels) |

Reloads, ammo and every other "do you have it" check look through your pockets, vest, jacket and backpack. Backpacks and garments with pockets can't be put inside a pouch. Vests add a little warmth.

## Farming

- **Dig a plot.** Build mode (**B**), item 8: a 2×2 m garden plot. Needs a shovel, outdoors only. The farms' kitchen gardens are already dug, and some are ready to pick.
- **Tend it.** Look at a plot and press **F**:
  - **Plant** carrots, cabbages, potatoes, tomatoes or corn.
  - **Water** with a watering can (2 L per watering) or a water bottle.
  - **Fertilize** for faster growth.
  - **Harvest** when it's ripe. You can also pull up a crop, clear dead plants, or fill the plot in.
- **Growth.**
  - Crops ripen in 2 to 4 game days with steady water (carrots fastest, corn slowest). They grow on game time, so sleeping counts.
  - A soaked plot dries out in about 30 hours. A dry crop barely grows and dies after about a day and a half without water.
  - A ripe crop left in the ground rots after two days.
  - The plants visibly grow, and the soil darkens when it's wet.
- **Water.** Wells and ponds: press **F** to drink your fill and top up every watering can you carry.
- **Foraging.** Apple trees, berry bushes and the farm fields' corn and vegetable rows. Pick them with **F**. They grow back over a day or two.
- **Farming skill (0–8).** It rises with use: digging, planting, watering, fertilizing, harvesting and picking. Each level:
  - Speeds growth and slows thirst damage.
  - Every 3 levels, adds one to each harvest.
  - Raises the chance of saving seeds from a harvest.
  - Gives ripe crops longer before they rot.
  - From level 1 you see a crop's health; from level 3 its exact growth.
  - The **Farmer** profession starts at Farming 3 with a shovel, a full watering can, seed potatoes, carrot seeds and a backpack.
- **Saved:** every plot and crop, what's been picked from trees and bushes, and your Farming experience.

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
  - **Lower your weapon** with **G** to show you mean no harm. A lowered gun points at the ground and nobody feels threatened by it. Talking to a survivor or trader lowers it for you. Aiming or clicking fire brings it back up (that click doesn't fire).
  - **Talking:** press **F** on a friendly or wary survivor to talk. You can ask who they are, ask for rumors about where loot is, or trade. Friendly survivors who trust you will follow you as a companion who fights alongside you; you can also tell them to wait or go their own way.
  - **Trust:** it goes up with fair trades, gifts and reassurance. Stealing during a trade, shooting them or aiming at them lowers it, and other survivors who see you shoot someone lose trust in you too. Enough trust turns a wary survivor friendly; too little turns anyone hostile.
  - **On the map:** survivors you've met are marked green (friendly), yellow (wary) or red (hostile). When they die, their body keeps everything they carried.
- **Doors.** Every building has real doors. Open and close them with **F**. An open door's panel is solid, so you and zombies go around it. Bullet holes and blood on a door swing with it.
  - Zombies after something on the other side of a closed door beat on it: it shakes, splinters and darkens, then bursts into flying planks. A few walkers get through in about ten seconds.
  - You can hack doors down with an axe or crowbar, and barricade over a doorway.
- **Using items takes time.** Eating, drinking and treating yourself are animated, and you can't use another item until you've finished:
  - You tip back a bottle or can, spoon beans out of a tin, or bite into fruit.
  - You wind a bandage round your forearm, open a medkit and press dressings on, shake out pills, or jab an injector.
  - Surgery is a long, careful job over the open kit.
  - You move slower and can't sprint or shoot while your hands are busy. Tired or hurt hands take longer.
- **Health.** Seven body parts. Bleeding, broken limbs and spreading damage work like Tarkov's. Painkillers mask limb damage. Bites can infect you, and you have about 6 minutes to find an antiviral before you turn.
- **Needs.** Hunger, thirst, stamina and fatigue. When you're exhausted you move slower and shoot worse.
- **Movement.** You're an average person, not a super-soldier:
  - **Speeds:** walking is about 1.6 m/s, sprinting 4.6 m/s, crouching 1 m/s and prone 0.4 m/s. Backpedalling and strafing are slower.
  - **Momentum:** you take a moment to get up to speed and slide about a metre and a half to a stop after a sprint. You can barely steer in the air.
  - **Pace:** the mouse wheel sets your walking pace, like Tarkov. Footstep noise scales with speed, so creeping is almost silent.
  - **Stance:** **C** toggles crouch and **X** prone. Both make you harder to see and steady your aim.
  - **Jumping:** **Space** jumps about 0.45 m and costs stamina.
  - **Stamina:** sprinting drains it. Run it dry and you're winded: you can't sprint again until it recovers, and you hear heavy breathing.
  - **Movement skills:** two skills grow as you move.
    - **Agility** makes you faster on your feet. At 8 you walk about 12% faster and sprint 14% faster, jump higher for less stamina, and sprinting drains less stamina. It rises as you sprint, jump, vault through windows and climb stairs.
    - **Dexterity** makes you quicker to respond. You get up to speed and stop sooner (less slide after a sprint), strafe and back off faster, steer better in the air, change stance and vault faster, and your gun is thrown around less when you change direction. It rises as you strafe and back off, move crouched, cut sharply at speed, change stance and vault.
    - Fire Officers start with Agility +1 and Burglars with Dexterity +1.
  - **Weight:** every item weighs something. Over 25 kg slows you and drains stamina faster; over 45 kg you can't sprint; over 60 kg you can only shuffle.
- **Weapons.** Melee weapons are silent: knife, hammer, crowbar, and an axe that also chops trees.

## Firearms

Guns work much like Tarkov's. Each firearm is a detailed procedural model, and its iron sights are properly aligned with where the bullets go.

| Gun | Calibre | Feeds from | Where to find it |
| --- | --- | --- | --- |
| PM | 9×18 | 8-round mag | Bodies, nightstands, police |
| Glock 17 | 9×19 | 17-round mag | Police lockers, evidence rooms, bodies, soldiers |
| M1911A1 | .45 ACP | 7-round mag | Evidence rooms, hunting cabins |
| MP5A3 | 9×19 | 30-round mag, semi/auto | Police lockers |
| AK-74N | 5.45×39 | 30/45-round mags, semi/auto | Military |
| M4A1 | 5.56×45 | STANAG 30, semi/auto | Military crates, soldiers, police (rare) |
| M249 SAW | 5.56×45 | 100-round belt box or STANAG mags, auto | Military crates (rare) |
| SKS | 7.62×39 | 10-round mag | Hunting cabins, crates, military |
| M14 | 7.62×51 | 20-round mag, semi-auto | Military crates, hunting cabins (rare) |
| MP-133 | 12 gauge | Tube, shell by shell | Hunting cabins, crates, police |
| Remington 870 | 12 gauge | Tube, shell by shell | Police lockers, hunting cabins |

The gunsmith trader sells the NATO guns as your reputation grows.

- **Magazines are items.** Load them in the inventory, round by round, by dragging ammo onto a magazine (or right-click → Load). Loading only continues while the inventory is open. Drag a magazine onto a weapon to insert it.
- **Chambered rounds.** **R** swaps in your fullest spare magazine. A tactical reload keeps the chambered round (30+1). On an empty reload the bolt has to be racked. Double-tap **R** for a quick reload that drops the old mag on the ground. The MP-133 loads shell by shell; firing interrupts the loading, and you pump between shots. The PM's slide and the SKS bolt lock back when empty.
- **Models.**
  - Each gun is built from shaped parts:
    - AK-74N: stamped receiver with rivets, plum handguards, curved ribbed magazines, a polymer stock with a rubber butt pad.
    - SKS: one-piece wooden stock and folded bayonet.
    - PM: blued slide with serrations and Bakelite grips.
    - MP-133: walnut stock and a grooved pump.
    - M4A1: flat-top upper with a rail and flip-up rear sight, A2 front sight tower, ribbed handguard, collapsible stock and a birdcage flash hider.
    - MP5: stamped receiver, cocking tube over the barrel, drum rear sight, hooded front post and a curved mag.
    - Glock 17: squared polymer frame and slide. The M1911 has a blued slide, exposed hammer, grip safety and checkered wood grips.
    - M14: walnut stock, operating rod handle, winged front post and a box mag. The M249 has a heat shield, carry handle, folded bipod and belt box. The Remington 870 has a matte receiver, a bead sight and a ribbed pump.
  - Textures are generated: wood grain, worn and blued metal, stippled polymer, Bakelite.
  - Gloved hands have fingers wrapped round the grip, camo sleeves and a wristwatch.
- **Reload animations.** Reloads are shown in full, with the body behind them, the way modern shooters animate them:
  - The gun swings across your view onto its side, muzzle up and in, so the magazine well faces you. It turns at your wrist, not around the middle of the gun.
  - The gun follows the hands on springs, so it carries momentum and settles. Pulling the magazine dips it, the new one seating and being slapped home jolts it, and the bolt flying forward kicks it. The view sways a little with the work and glances down at your rig as you reach for a magazine.
  - The hands move in arcs. The wrist comes up from the pouch turned and squares up at the well, and it winds up before the slap.
  - The motion is continuous. The gun, magazines and hands follow smooth curves that carry their speed through each step of the reload instead of stopping between steps. They ease in and out the way people move a hand, and no two reloads are timed exactly alike.
  - The left hand rocks the old magazine out (AK) or pulls it down (SKS, PM), then pockets it. A quick reload drops it instead.
  - The hand brings the new magazine up from your gear, seats it and slaps it home. On an empty gun it reaches over and racks the charging handle (or lets the pistol's slide drop).
  - The shotgun rolls over so the loading port faces you, and each shell is pushed in with the fingers.
- **Your condition shows in your hands.**
  - **Rested:** reloads are quick and crisp.
  - **Tired** (low stamina, exhausted, very fatigued or shivering): reloads are slower and the arms sag. You breathe hard, and at the hip the gun droops and heaves with each breath.
  - **Injured arms:** slower still, held lower, with a tremor. A destroyed arm without painkillers is much slower.
  - Shaky hands can **fumble** the magazine: it knocks the edge of the well, comes back out and goes in on the second try.
  - All of this stays out of your sight picture when aiming. The steadiness there comes from the sway system.
- **Guns skill.** Hip fire gets more accurate as your Guns skill rises. At 0 a hip-fired round can land anywhere in a wide cone; at 8, hip fire is as accurate as aiming down the sights, and moving costs you less accuracy. The skill rises as you hit things with firearms, faster for hip-fire hits and kills. Police start with +1 and veterans with +2.
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
  - The **ACOG 4×** (M4A1, M14, M249) is a picture-in-picture scope with a red chevron and bullet-drop ladder.
  - Suppressors cut gunshot noise by about 80%, which matters with zombies around. The rifle can fits the AK, SKS, M4A1 and M14; the pistol can fits the Glock, M1911 and MP5.
  - Also a muzzle brake and a vertical foregrip.
- **Lean** with **Q** / **E**.

## Vehicles

Every car and truck in town (about 50 sedans, pickups, police cruisers and military trucks) can be driven once it's in working order. Each was abandoned in a different state; a handful run as found.

- **Parts.** Each vehicle has an engine, battery, fuel tank, brakes, headlights and four tires, each with a condition. Press **F** at a vehicle to see them.
  - **Swapping:** pull parts off one vehicle and fit them to another, or install ones you've found. You need a wrench, and a jack for tires.
  - **Engine:** repaired with spark plugs or engine parts (and a wrench).
  - **Fuel tank:** patched with scrap metal and duct tape. A badly damaged tank leaks.
  - **Tires:** can be taped up to 60%.
- **What it needs to run:** a battery with charge, an engine that isn't wrecked, an intact tank and fuel. Weak engines and batteries sometimes don't catch. A flat tire limits you to a crawl and pulls the car sideways.
- **Fuel.** Gas cans carry 20 L. Fill them at the gas station pumps or siphon them from other cars, then pour them into the tank. A car parked beside a pump is filled straight from it. Pumps run dry.
- **Driving.** The car has momentum: steering softens at speed, the engine's condition limits power and top speed, and the brakes' condition limits stopping. The battery charges while the engine runs and drains with the lights on and the engine off. Tires wear as you drive, faster with the handbrake. The engine is noisy and draws zombies.
- **Damage.**
  - **Crashing:** hitting things damages the engine and headlights (front) or the fuel tank (rear). Hard enough and you hit the wheel.
  - **Zombies:** running zombies down at speed sends them flying as ragdolls, and dents the car. Slowly, you shove them aside.
  - **Inside the car:** zombies can reach you through the driver's window for less damage. Military trucks keep them out.
- **Where to find parts.**
  - **Auto repair shops** (two per town): a roll-up garage door, a car on a two-post lift, workbenches (wrenches, jacks, scrap, plugs), parts shelves (tires, batteries, brake pads, headlights, engine parts) and tire racks, with project cars in the yard.
  - **Warehouses** carry parts shelves and workbenches.
  - **Car trunks** often hold a jack, a spare tire or a gas can.
- **Saved:** where every vehicle is, its parts, its fuel, and whether you're in it.
- **Models.** Each body type is shaped, not boxed:
  - Sedans, police cruisers and pickups have wheel arches, a glasshouse with pillars, door seams and handles, mirrors, bumpers, grilles, plates and lights. Paint carries dirt, rust spots and scratches.
  - Police cruisers add a stripe, push bar and lightbar; pickups an open bed and tailgate. Military trucks are cab-over trucks with a canvas tilt over the bed.
  - Wheels have tread blocks, rims, spokes and hubs. From the driver's seat you see the dash, gauges and the steering wheel.
- **Animations.**
  - Doors swing open as you get in and out, the hood lifts while you work on the parts, and the trunk lid (or tailgate, or canvas flap) opens while you search it.
  - Driving: the wheels turn and steer, the body pitches under braking and acceleration and rolls in corners, the engine shakes at idle, brake lights glow, a police lightbar flashes while its lights are on, and the exhaust puffs smoke.

| In a vehicle | |
| --- | --- |
| W | Start the engine (first press), accelerate |
| S | Brake, then reverse |
| A / D | Steer |
| Space | Handbrake |
| L / H | Headlights / horn |
| F | Get out |
| Mouse | Look around |

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
- **Ground.** Bodies settle on whatever is under them: stair flights and landings, the elevator car, the sidewalk (they slide up over the kerb rather than being shoved along it), a car's hood. A body can't move faster than a car could throw it, so a scuffle with a wall or kerb can't fling it across the street.
- **Death.** Every death is a ragdoll: 15 joints with joint limits, colliding with the ground, walls, cars and furniture. Knees only bend forward and hips have a natural range. Arms and legs collide with the torso (as a solid box) and with each other, so bodies come to rest with their legs out instead of folded through themselves. The legs are solid to each other along their whole length: if one leg falls across the other it rests on top of it instead of passing through. Bodies collide with other bodies and pile up. Hitting a wall, a window or glass absorbs the blow instead of bouncing the body away. A shot to the legs sweeps the feet out from under the target.
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
| G | Lower / raise your weapon (survivors and traders relax) |
| 1, 2 | Switch between firearm and melee |
| F | Interact: open/close doors, search containers, sleep in beds, talk to survivors (1–9 picks a dialogue option), call and ride elevators, tend garden plots, pick fruit, drink at wells and ponds |
| Tab or I | Inventory. Close it with Esc, Tab, F, the Close button, a click outside, or by walking off. |
| H | Quick-heal (bandage if bleeding, otherwise a medkit) |
| L | Flashlight |
| M | Map (your safehouse is outlined in yellow) |
| B | Build mode: 1–8 select a piece (7 = rain barrel, 8 = garden plot), R rotate, LMB build, X dismantle |
| N | Raise / lower the laser designator (if you carry one): hold LMB to lase, wheel to zoom |
| V | Claim a safehouse |
| Esc | Pause. The game goes fullscreen when you spawn; hold Esc or use the pause menu to leave fullscreen. |

## Close air support

Two rare military finds work together: the **SOFLAM laser designator** and the **PRC-117 military radio pack**. The radio is worn in the backpack slot (with a little room for kit); the designator just has to be somewhere on you.

- **Lasing.** Press **N** (or right-click the designator → **Raise**) to bring it up: a zoomed view with a rangefinder, bearing and zoom (mouse wheel, 2–10×). Hold the left mouse button on a target; the beam puts a red spot on it, and after a little over a second of steady lasing the target is fixed. Let go to call it in. Right-click or **N** lowers it.
- **Painting a line.** Sweep the beam along a street or across a row of buildings while you hold it, and the gun runs follow the line you painted. Lase a single spot and the runs cross it, side to side as you see it, so they don't come down your line of sight.
- **The strike.** With the radio on your back, an A-10 checks in ("Hog 1-1, copy your laser…") and arrives about 15 seconds later. It dives in, fires a two-second burst from its 30 mm cannon that walks along the strip, pulls off, comes around and makes a second run from the other way. You see the rounds land before you hear the gun: the tearing BRRRT reaches you a couple of seconds later, then the jet roars over.
- **What it does.** Every round bursts with dust, sparks and a flash, scorching the ground. Zombies and people within a few metres are torn apart (rounds through a roof reach the storey under it), windows shatter and doors splinter. It's loud enough to bring every zombie for streets around, and if you're standing in the strip, it hits you too ("danger close").
- **Rearming.** The radio needs three minutes between strikes; the designator view shows the countdown.
- **Finding them.** Military crates, rarely soldier zombies, or the gunsmith at the highest loyalty. `kit JTAC` in the dev console gives you both.

## Sound

Everything is synthesized live with WebAudio. Nothing is a looped recording, so no two sounds are quite the same.

- **Gunshots** are built the way a real shot is heard: the supersonic crack of the bullet (rifles), the muzzle blast, the low thump of the gas, the action cycling, and the echo off the town. Every calibre has its own profile: a 9 mm pops, a .45 thumps, 5.56 cracks hard, 7.62×51 booms, and a 12 gauge roars. Indoors the shot slaps off the walls in a short room reverb; outdoors it rolls away in a long tail. Suppressed shots keep the action and a dull thud. Other people's gunfire is panned, duller and further away the further off it is.
- **Zombies** have voices. A formant synth (throat, vowels and rasp) gives each zombie a pitch and size of its own: walkers moan, runners are higher and raspier, brutes and soldiers are deep. They groan while they wander, growl on the chase, snarl as they swing, cry out when hit and give a death rattle. Every voice is panned to where the zombie is, quieter with distance and muffled from another floor.
- **Mechanics:** magazines clicking out and seating, bolts and slides, the shotgun pump, dry fire, footsteps, and bullets chipping walls near you. Spent brass lands with a few quiet, dull tinks as it bounces and rolls; shotgun hulls give hollow plastic taps.
- **Dying zombies** let out a falling moan, the throat fills with a few wet gurgles, and the last air goes out of them.

**Volume for every sound.** Open **Sound** from the pause screen or the title menu. Every sound in the game has its own slider (0–200%), grouped as gunshots (one per calibre), gun handling, zombies (groaning, growling, snarling, hurt, dying), combat, you, the world and vehicles, plus a master volume. Each has a ▶ button to hear it. Settings are saved in your browser; **Reset all** puts them back to 100%.

**Using real recordings.** Put audio files in `public/sounds/` and list them in `public/sounds/manifest.json`. Each name maps to one or more files, and one is picked at random each time:

```json
{
  "shot_m4a1": ["m4_1.ogg", "m4_2.ogg"],
  "shot_rifle308_supp": ["m14_supp.ogg"],
  "zombie_groan": ["groan1.ogg", "groan2.ogg", "groan3.ogg"],
  "mag_in": ["magin.wav"]
}
```

Names are `shot_<weapon>` or `shot_<calibre class>` (`pistol9`, `pistol45`, `smg9`, `rifle545`, `rifle556`, `lmg`, `rifle762`, `rifle308`, `shotgun`), with `_supp` for suppressed; `zombie_<groan|growl|snarl|hurt|die>`; `impact`, `mag_out`, `mag_in`, `bolt`, `pump`. Anything not listed stays synthesized.

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
give m4a1            give mag_stanag 3    kit Operator        kit Gunner
give designator      give radio_pack      kit JTAC
give scope_pso       give supp_rifle      kit Builder         spawn brute 3
survivor hostile 2   survivors            trust 40            spawn walker 5
tp hospital          tp military          tp checkpoint       tp pharmacy
tp 0 0               tp safehouse         time 22:00          time +8
car                  car military         fixcar              kit Mechanic
traders              tp trader            tp trader medic     rep 25
speed 20             skill carpentry 8    set fatigue 90      killall 25
kit Farmer           grow                 grow 12             farmxp 100
weather storm now    weather snow 6       season winter       lightning
tp farm              tp orchard           tp cabin            tp camp
god / noclip / invis / freeze / freebuild                    js player.skill
```

## Tall buildings

Offices and police stations have two real floors, the hospital three, and the downtown skyscraper 9 to 13, all the way up to its roof. Every floor has its own rooms, doors, windows, furniture, loot and zombies.

- **Stairs.** A switchback stairwell sits at the end of the corridor. A flight climbs to a half landing, then a second flight turns back up to the next floor. Walk up and down them like anywhere else.
- **Elevators.** The hospital and skyscraper also have an elevator beside the stairs. Press **F** at the call button by its doors on any floor to call it. Inside, press **F** at the panel and pick a floor with the number keys (**0** is the tenth) or click it. The doors stay open a few seconds, then close, and the car carries you (and anything standing in it) up or down.
- **Zombies use the stairs.** They hear gunfire and footsteps through the floors (muffled), find their way to the stairwell and climb or descend floor by floor to reach you. They see and attack only on their own floor. Floors and ceilings stop bullets, and you can't jump out of an upstairs window.
- Survivors stay on the ground floor, and you can only build on the ground.
- **Bodies on the stairs.** Ragdolls, dropped guns and blood land on the flights and landings (and slide down them), not on an invisible floor.
- **Saves.** These buildings were rebuilt without moving anything else in town, so existing saves keep their base, stash and traders. (When the skyscraper got its full height, its upper floors' loot started fresh.)

## Performance

The world is drawn with level of detail, the way open-world games do it:

- **Chunks.** Scenery (walls, roofs, fences, sheds, trees) is batched by 40 m chunk. Chunks off screen or past the fog aren't drawn, and the sun's and the flashlight's shadow passes only draw the chunks they reach.
- **Detail distance.** Small outdoor props (benches, bins, sandbags, posts) are drawn to 100 m. Furniture and fittings are batched by building and by storey, and drawn within 50 m. Inside a tall building, only your storey and the ones directly above and below are drawn. Doors are drawn to 70 m.
- **The horde.** Zombies are drawn as one instanced mesh per body part, so the whole horde takes a handful of draw calls. Zombies, survivors, cars and bodies past the fog aren't drawn at all.
- About half the draw calls and triangles of before, in the same views.

## The look of the town

Buildings and streets are textured with generated maps: brick, wood siding, concrete panels, and plaster inside. Each wall gets a finish that fits the building. Houses are brick or siding, farm buildings are siding, shops are brick, and everything else is concrete. Wall textures are projected in world space, so every brick is the same size whatever the wall's shape. Floors are planks, with tiles in kitchens and bathrooms and concrete slab in commercial buildings. Roads are asphalt with sidewalks and curbs; dirt tracks are dirt. Houses have gable roofs. Flat roofs have parapets, AC units and vent pipes, and shops have awnings.

## Code layout

| File | Purpose |
| --- | --- |
| `src/main.js` | Game state machine (menu → creation → play → death), save/load, day/night, interactions, sleep, safehouse |
| `src/character.js` | Professions, skills and the character creation screen |
| `src/build.js` | Carpentry: placing, saving and dismantling structures |
| `src/world.js` | Seeded procedural town: districts, building archetypes (including farmhouses, barns and cabins with pitched roofs), house room layouts, furnishing by room and business, doors and windows, military sites, cars; merges static scenery (vertex colours) into level-of-detail batches by chunk, building and storey, and culls them; keeps garage openings clear |
| `src/countryside.js` | Farmland and wilderness: dirt tracks, farms, fields, orchards, forests with clearings, meadows and ponds, instanced trees by species, rocks, bushes and corn |
| `src/weather.js` | Seasons, weather fronts, temperature, rain and snow particles, lightning and thunder, snow cover, wetness and body temperature, rain barrels, seasonal foliage |
| `src/farming.js` | Garden plots, crops and growth, watering and fertilizer, harvests, wells and ponds, foraging, the Farming skill and the plot screen |
| `src/furniture.js` | Box-built furniture and container models (kitchens, beds, sofas, shelving, racks, desks…) |
| `src/player.js` | First-person controller, leaning, melee, body-part health, status effects |
| `src/weapons.js` | Firearms: optics, PIP scopes, sway/recoil physics, reload timelines and condition variants, magazines, attachments |
| `src/skills.js` | XP and levelling for skills that rise with use (Guns, Agility, Dexterity), and the skills page |
| `src/useanim.js` | Item-use animations: eating, drinking, bandaging, medkits, pills, injections, surgery |
| `src/worldtex.js` | Generated building, road, ground and grime textures; the world-space wall material |
| `src/storeys.js` | Multi-storey buildings: floors laid out storey by storey, the stairwell, slabs, the elevator |
| `src/levels.js` | Floor heights: stairs, storeys and elevators (where movers stand), slabs that stop bullets, elevator control, stair routes for zombies |
| `src/carmodels.js` | Vehicle models: body profiles, details, wheels, cockpit, hinged doors/hood/trunk |
| `src/gunmodels.js` | Weapon, magazine and hand models; procedural wood, metal, polymer, fabric and camo textures |
| `src/natoguns.js` | M4A1, MP5, Glock 17, M1911, M14, Remington 870 and M249 models and their magazines |
| `src/survivors.js` | AI survivors: dispositions and trust, A* pathfinding, combat, following, dialogue, trading |
| `src/progress.js` | First-day tutorial, progression chapters and goals, the guide tracker and goals panel |
| `src/vehicles.js` | Vehicles: door/hood/trunk and driving animations, parts and condition, driving physics, collisions and run-overs, the parts screen, fuel, saving |
| `src/traders.js` | Trading posts: placement, renovation props, barter offers, loyalty, quests, trader screen and quest tracker |
| `src/zombies.js` | Zombie spawning, perception, flow-field pathing, attacks, hit reactions, knockdowns, corpses, voices; draws the horde instanced |
| `src/ragdoll.js` | Verlet ragdolls (death, knockdown, get-up), dropped weapons, corpse freezing |
| `src/fx.js` | Instanced particles (blood, dust, sparks), brass, decals (bullet holes, splatter, blood pools) |
| `src/collision.js` | 2D spatial hash, circle-vs-box movement, raycasts |
| `src/items.js` | Item definitions, loot tables, container types |
| `src/inventory.js` / `src/invui.js` | Grid inventory logic and drag-and-drop UI |
| `src/airstrike.js` | Close air support: the laser designator view, painting targets, the A-10 and its gun runs |
| `src/soundui.js` | The Sound panel: a volume slider (and a test button) for every sound |
| `src/paperdoll.js` | The 3D figure of your character in the inventory |
| `src/hud.js` | HUD, compass, map |
| `src/audio.js` | Synthesized gunshots, zombie voices and effects, reverb, and optional recorded samples |
| `src/devconsole.js` | Dev console: tabs, cheats, overlays, commands |
| `src/save.js` | Save persistence (localStorage): world seed plus everything that changed |

`window.game` is also exposed in the browser's own devtools console.
