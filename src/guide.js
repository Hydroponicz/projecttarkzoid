// The survival guide: an in-game, searchable wiki of how everything works.
// F2 opens and closes it (and Esc closes it); it opens by itself the first
// time you step off the helicopter. The game is paused while it's up.
//
// Articles are plain HTML. Keep them true to the game: when a mechanic
// changes, change its article.

const K = (k) => `<kbd>${k}</kbd>`;

export const SECTIONS = [
  ['start', 'Getting started'],
  ['base', 'The base and contracts'],
  ['survive', 'Staying alive'],
  ['threats', 'Zombies and people'],
  ['combat', 'Weapons and combat'],
  ['gear', 'Gear and loot'],
  ['world', 'The world'],
  ['build', 'Building and farming'],
  ['vehicles', 'Vehicles'],
  ['settings', 'Characters and settings'],
];

export const ARTICLES = [
  // ---------------------------------------------------------------- start
  { id: 'how', sec: 'start', title: 'How to play', html: `
<p class="lead">You run operatives out of a forward base into a dead post-Soviet town. Take a contract from one of the handlers, fly in, do the job, and be at the landing zone when the helicopter comes back for you. Whatever you carry out is yours. Whoever doesn't make it out is gone, with everything on them.</p>
<h4>The loop</h4>
<ol>
<li><b>At the base:</b> recruit an operative, take a contract from a handler, kit up from your stash, then <b>Enter the Zone</b>.</li>
<li><b>In the zone:</b> do the contract, loot, survive. The contract tells you when the helicopter is coming back.</li>
<li><b>Extraction:</b> two hours before the helicopter, the dead come for you in waves. Hold the landing zone, get aboard, and you're out.</li>
</ol>
<h4>In the zone, what to do</h4>
<ol>
<li><b>Get off the landing zone.</b> The helicopter is loud: every zombie for streets around heads for where it set down. Move away, and keep moving.</li>
<li><b>Scavenge.</b> Walk into buildings and search what's in them (${K('F')} on a cupboard, shelf, fridge or body). Loot follows the building: food in kitchens and shops, pills in pharmacies, tools in hardware stores and garages, guns at police and military sites.</li>
<li><b>Eat, drink, patch yourself up.</b> Watch the bars bottom left. Bandage bleeding at once (${K('H')}).</li>
<li><b>Find a home.</b> Pick a building with few ways in and claim it as your safehouse with ${K('V')}. Zombies never respawn near it.</li>
<li><b>Fortify and stock it.</b> With a hammer, planks and nails, build mode (${K('B')}) puts up walls, barricades, doors, beds, crates and campfires.</li>
<li><b>Trade and take jobs.</b> Traders have set up posts around town. Barter with them, finish their quests, earn their loyalty for better deals.</li>
<li><b>Watch the clock.</b> Top right: your contract, its objectives, and when and where the helicopter comes back. Be there.</li>
<li><b>Survive the nights.</b> A day is 24 real minutes. At night the dead are faster and see less, and more of them turn up as the days go by. Sleep in a bed to recover.</li>
</ol>
<h4>Rules worth knowing early</h4>
<ul>
<li>Noise is what kills you. Gunshots, sprinting, hammering, breaking glass and engines all draw zombies. Melee weapons are silent.</li>
<li>There's no ammo counter. Check your magazine with ${K('T')}.</li>
<li>A zombie bite can infect you. You have about six minutes to find an antiviral injector.</li>
<li>Loot doesn't respawn. Spread out to find more.</li>
<li>The game saves every 30 seconds, when you sleep, and when you close the tab.</li>
</ul>` },
  // ---------------------------------------------------------------- base
  { id: 'base', sec: 'base', title: 'The base', html: `
<p class="lead">The main menu is the base: a forward operating base outside the town, with the helicopter on the pad. The tabs along the top:</p>
<ul>
<li><b>Operative:</b> who you're sending in: profession, skills, extractions, kills. Recruit a new one here when you have none.</li>
<li><b>Stash:</b> your container at the base. Drag kit between your operative and the stash. What's on your operative goes into the zone with them; what's in the stash is safe. <b>Move carried loot to stash</b> empties your pockets, vest and backpack into it in one go.</li>
<li><b>Handlers:</b> the four people you work for. Each offers contracts and barters (from your stash).</li>
<li><b>Enter the Zone</b> (the middle tab): pick a contract (or a free run), an insertion window, check your loadout, deploy. While deployed it reads <b>Return to the Zone</b>.</li>
<li><b>Memorial:</b> the operatives you've lost.</li>
</ul>
<p>Extracted operatives are patched up at the base: wounds, hunger and infection are all dealt with before the next deployment. Skills carry over.</p>` },
  { id: 'contracts', sec: 'base', title: 'Handlers and contracts', html: `
<p>Four handlers, each with their own kind of work:</p>
<ul>
<li><b>Colonel Belov, Command:</b> eliminate turned officers (bring back their tag), cull the dead, survey the tall buildings.</li>
<li><b>Dr. Irina Sokolova, Institute:</b> bring her scientists out alive; recover samples and research.</li>
<li><b>Quartermaster Hale, Logistics:</b> bring back supplies; recover the flight recorder; survey industrial sites.</li>
<li><b>The Broker:</b> valuables, drives, and people who know things.</li>
</ul>
<p>Each keeps three contracts on the board. You can hold three at a time and take one in per deployment. A contract says how long you'll be in: <i>"Helicopter back: Day 14, 06:00"</i>. That's your extraction, done or not.</p>
<p>Objectives:</p>
<ul>
<li><b>Escort:</b> find the scientist (they're hiding in a marked building), talk to them, and they follow you. Keep them alive and near you when you board.</li>
<li><b>Retrieve:</b> the item is in a cupboard in a marked building. Have it on you when you board.</li>
<li><b>Eliminate:</b> a turned officer, tougher than the others, with his unit around him. Kill him, search the body for his tag, and bring it out.</li>
<li><b>Survey:</b> get inside each marked building (any floor).</li>
<li><b>Cull:</b> kill that many of the dead.</li>
<li><b>Supply:</b> have the items on you when you board. They're handed over.</li>
</ul>
<p>The contract pays only if every objective is done when you board: reputation with the handler and items delivered to your stash. Failing costs a little reputation. Reputation raises your loyalty level with the handler, which unlocks better barter offers and better contract rewards. The handlers restock and post new contracts after each deployment.</p>` },
  { id: 'extraction', sec: 'base', title: 'Extraction and the final stand', html: `
<p>The helicopter comes back to the landing zone it dropped you at (marked <b>H</b> on the map, ${K('M')}; the tracker top right gives its distance and direction).</p>
<ul>
<li><b>The day before</b> and <b>six hours out</b>, the radio reminds you.</li>
<li><b>Two hours out</b>, the horde: waves of the dead come out of the streets toward wherever you are, more and faster the closer the helicopter gets. Dig in at the LZ: find cover, keep ammo and meds handy, watch every direction.</li>
<li><b>On time</b>, the helicopter comes in low and lands. Walk to its open side door and press ${K('F')}: <i>Board the helicopter</i>.</li>
<li>It waits <b>a minute and a half</b> on the ground, then lifts off. Anyone not aboard is <b>missing in action</b>: the operative and their gear are lost.</li>
</ul>
<p>Sleep can't carry you past the two-hour warning: you wake for it. Save and quit at any time; <b>Return to the Zone</b> picks up where you left off.</p>` },
  { id: 'firstday', sec: 'start', title: 'Your first day (the tutorial)', html: `
<p>A new survivor gets a ten-step "First day" checklist, top right. Each step pays a small reward:</p>
<ol><li>Move about and look around.</li><li>Search something.</li><li>Open your inventory (${K('Tab')}).</li><li>Eat or drink.</li><li>Arm yourself.</li><li>Kill a zombie.</li><li>Claim a safehouse (${K('V')}).</li><li>Find a trader.</li><li>Make a deal.</li><li>Fortify: build something.</li></ol>
<p>After that, five chapters of goals lead the way: <b>Dig In</b>, <b>Trade Routes</b>, <b>Armed and Dangerous</b>, <b>The Outpost</b> and <b>Long Haul</b>. Each chapter pays out gear.</p>
<p>${K('J')} opens the goals panel. ${K('K')} (with it open) skips the tutorial.</p>` },
  { id: 'controls', sec: 'start', title: 'Controls', html: `
<table class="keys">
<tr><td>${K('W')}${K('A')}${K('S')}${K('D')} / mouse</td><td>Move / look</td></tr>
<tr><td>${K('Shift')}</td><td>Sprint (while aiming: hold breath)</td></tr>
<tr><td>Mouse wheel</td><td>Walking pace, 20–100%. With several things in reach: choose between them</td></tr>
<tr><td>${K('C')} / ${K('X')} / ${K('Space')}</td><td>Crouch / prone / jump (Space also climbs through open or broken windows)</td></tr>
<tr><td>Left / right mouse</td><td>Fire or swing / aim down sights</td></tr>
<tr><td>${K('R')} / double-tap ${K('R')}</td><td>Reload / quick reload (drops the old magazine)</td></tr>
<tr><td>${K('T')} / ${K('Z')}</td><td>Check magazine / switch fire mode</td></tr>
<tr><td>${K('Q')} / ${K('E')}</td><td>Lean left / right</td></tr>
<tr><td>${K('G')}</td><td>Lower or raise your weapon (survivors relax)</td></tr>
<tr><td>${K('1')} ${K('2')}</td><td>Firearm / melee</td></tr>
<tr><td>${K('3')}–${K('6')}</td><td>Hotbar: use what's in the slot, or bring up a grenade</td></tr>
<tr><td>${K('F')}</td><td>Use what you're looking at: doors, containers, beds, people, elevators, plots, wells</td></tr>
<tr><td>${K('Tab')} or ${K('I')}</td><td>Inventory</td></tr>
<tr><td>${K('H')}</td><td>Quick-heal (bandage if bleeding, otherwise a medkit)</td></tr>
<tr><td>${K('L')}</td><td>Flashlight (headlights in a car)</td></tr>
<tr><td>${K('M')}</td><td>Map</td></tr>
<tr><td>${K('B')}</td><td>Build mode</td></tr>
<tr><td>${K('V')}</td><td>Claim a safehouse</td></tr>
<tr><td>${K('N')}</td><td>Laser designator (if you carry one)</td></tr>
<tr><td>${K('J')}</td><td>Goals</td></tr>
<tr><td>${K('F2')}</td><td>This guide</td></tr>
<tr><td>${K('Esc')}</td><td>Pause (hold it to leave fullscreen)</td></tr>
</table>` },
  { id: 'interact', sec: 'start', title: 'Using things (and picking between them)', html: `
<p>Look at something within about two metres and press ${K('F')}: a door, a container, a bed, a person, a window, an elevator button, a garden plot, a well.</p>
<p><b>Several things in reach</b> (a body lying in a doorway, a shelf beside a door): the prompt lists them all, with the one you'll use marked ▶. Turn the <b>mouse wheel</b> to choose, then press ${K('F')}. While the list is up, the wheel picks instead of changing your pace. What you picked stays picked while it's in reach.</p>
<p>Open windows can be climbed through with ${K('Space')}; broken glass can cut you.</p>` },

  // ---------------------------------------------------------------- survive
  { id: 'health', sec: 'survive', title: 'Health and wounds', html: `
<p>You have seven body parts: head, thorax, stomach, both arms and both legs. Each has its own health (top left of the HUD).</p>
<ul>
<li><b>Head or thorax</b> at zero: you die.</li>
<li><b>A limb</b> at zero is destroyed. Its damage spreads to the rest of you. A destroyed leg slows you to a limp; a destroyed arm wrecks your aim and reloads. Only a <b>surgical kit</b> restores it.</li>
<li><b>Bleeding</b> (the red drop beside a part) drains you steadily. A <b>bandage</b> or a Salewa kit stops it. ${K('H')} bandages first if you're bleeding.</li>
<li><b>Painkillers and morphine</b> hide the effects of damaged limbs for a while. They don't heal.</li>
<li><b>Bites</b> can infect you. Infection turns you in about six minutes. An <b>antiviral injector</b> cures it; <b>antibiotics</b> slow it.</li>
</ul>
<h4>Medical supplies</h4>
<table class="keys">
<tr><td>Bandage</td><td>Stops bleeding</td></tr>
<tr><td>AI-2 medkit</td><td>Heals 40 (2 uses)</td></tr>
<tr><td>Salewa kit</td><td>Heals 60 and stops bleeding (4 uses)</td></tr>
<tr><td>Vitamins</td><td>A little healing (5 uses)</td></tr>
<tr><td>Painkillers / morphine</td><td>Mask pain; morphine for longer, and heals a little</td></tr>
<tr><td>Antibiotics</td><td>Slow an infection</td></tr>
<tr><td>Antiviral injector</td><td>Cures infection</td></tr>
<tr><td>Surgical kit</td><td>Restores a destroyed limb</td></tr>
</table>
<p>Treating yourself takes time and is animated. You move slower and can't shoot while your hands are busy. First Aid skill makes medkits heal more.</p>` },
  { id: 'needs', sec: 'survive', title: 'Hunger, thirst, fatigue and stamina', html: `
<ul>
<li><b>Food and water</b> run down over time. Eat and drink from your inventory (right-click an item, or put it on the hotbar). Summer heat makes you thirstier. Wells and ponds let you drink your fill (${K('F')}).</li>
<li><b>Fatigue</b> builds through the day. Tired, you aim and reload worse; exhausted, you move slower. Sleep in a bed. Coffee helps for a while.</li>
<li><b>Stamina</b> goes on sprinting, jumping and swinging. Run it dry and you're winded until it recovers.</li>
<li><b>Weight</b>: over 25 kg slows you and burns stamina faster, over 45 kg you can't sprint, over 60 kg you can only shuffle.</li>
</ul>` },
  { id: 'temperature', sec: 'survive', title: 'Cold, heat and getting wet', html: `
<ul>
<li>Rain and snow soak you unless you're under a roof or in a car. A raincoat or parka keeps most of it off.</li>
<li>Wet clothes, wind and cold air bring your <b>body temperature</b> down. Clothing, shelter, a campfire and a running car's heater warm you back up.</li>
<li>Cold makes you shiver, which spoils your aim, and stamina comes back slower. Freezing slows you and hurts. <b>Hypothermia</b> can kill.</li>
<li>Heavy clothes in summer heat can bring on <b>heatstroke</b>.</li>
<li>The HUD shows WET, SOAKED, COLD, FREEZING, HYPOTHERMIA, OVERHEATING or HEATSTROKE.</li>
</ul>
<h4>Clothing (warmth and rain)</h4>
<p>Hoodie (you start with one), work jacket, raincoat, winter coat, military parka. Find them in wardrobes, dressers, lockers and duffels.</p>` },
  { id: 'seasons', sec: 'survive', title: 'Seasons, weather and time', html: `
<ul>
<li>A year is four seasons of 7 days. A new world starts in the season and at the time you chose before the insertion.</li>
<li><b>Spring</b> about 12 °C, <b>summer</b> 24 °C with short nights, <b>autumn</b> 10 °C with rain and fog, <b>winter</b> −4 °C with snow and short days.</li>
<li>Weather comes in fronts: clear, cloudy, overcast, fog, rain, thunderstorm, snow, blizzard. Before a storm the sky darkens and the wind rises.</li>
<li>Rain and wind cover your noise. Fog, rain and snow cut how far zombies see. Hard frost makes them sluggish. Lightning draws them.</li>
<li>Snow slows you on foot; wet and icy roads make cars slide.</li>
<li>One in-game minute passes per real second.</li>
</ul>` },
  { id: 'safehouse', sec: 'survive', title: 'Safehouse and sleeping', html: `
<ul>
<li>${K('V')} claims the building you're standing in as your safehouse (outdoors, a 20×20 m camp). It's outlined in yellow on the map.</li>
<li>Zombies never respawn near your safehouse, but they still wander in. Build walls and barricades over the ways in.</li>
<li><b>Sleeping</b> (${K('F')} on a bed) passes time and recovers fatigue and health. Sleeping outside your safehouse may wake you to company. You can't sleep with zombies close by.</li>
<li>Store things in crates and containers. They stay where you put them.</li>
</ul>` },
  { id: 'death', sec: 'survive', title: 'Death', html: `
<p>Death is permanent. An operative who dies in the zone, or is left behind when the helicopter lifts off (missing in action), is gone with everything they carried, and their contract fails. The base keeps your stash, your standing with the handlers and your other contracts: recruit another operative and go again.</p>
<p>Fallen operatives are listed on the memorial at the base.</p>` },

  // ---------------------------------------------------------------- threats
  { id: 'zombies', sec: 'threats', title: 'Zombies', html: `
<ul>
<li><b>Walkers</b> are slow and many. <b>Runners</b> chase fast. <b>Brutes</b> are big, take a lot of killing and bash through doors three times as hard. <b>Soldiers</b> at military sites wear helmets and vests: aim for the head. <b>Patients</b> fill the hospital.</li>
<li>They <b>hear</b> noise and <b>see</b> you if they have line of sight and are facing your way. Crouching, going prone and the Stealth skill make you harder to spot. A flashlight makes you easier to see at night.</li>
<li>Hurt one from any distance and it comes for you. A bullet hitting a wall, or another zombie dropping dead, makes them come to look.</li>
<li>They find their way round walls, through doorways and up and down stairs, floor by floor. Closed doors get beaten down; a few walkers get through in about ten seconds.</li>
<li>They can't attack through a closed door or a wall. They can climb in through open or broken windows.</li>
<li>At night they're faster, and more turn up as the days pass.</li>
<li>Through a thermal scope they glow faintly; their bodies cool to nothing over about 20 seconds.</li>
</ul>` },
  { id: 'noise', sec: 'threats', title: 'Noise and stealth', html: `
<ul>
<li>Gunshots carry the furthest. A suppressor cuts that by about 80%.</li>
<li>Footsteps scale with your speed: sprinting is loud, creeping at a low pace (mouse wheel) is almost silent.</li>
<li>Hammering, breaking glass, doors being smashed, car engines and the horn all draw zombies.</li>
<li>Explosions, the helicopter and the A-10 bring every zombie for streets around.</li>
<li>Rain and wind drown out noise.</li>
</ul>` },
  { id: 'survivors', sec: 'threats', title: 'Other survivors', html: `
<ul>
<li>Survivors scavenge and fight zombies too. Each one is <b>friendly</b>, <b>wary</b> or <b>hostile</b> (a bandit).</li>
<li><b>Bandits</b> shout, keep their distance and shoot you. They flee when badly hurt.</li>
<li><b>Wary</b> survivors warn you off; point a gun at them and they'll turn on you.</li>
<li>${K('G')} lowers your weapon so nobody feels threatened. Talking to someone lowers it for you.</li>
<li>${K('F')} on a friendly or wary survivor to talk: ask who they are, ask for rumours about loot, trade, or have a trusted friend follow you.</li>
<li><b>Trust</b> rises with fair trades, gifts and reassurance, and falls if you steal, aim at or shoot them. Others who see you shoot someone trust you less.</li>
<li>Survivors you've met show on the map: green, yellow or red.</li>
</ul>` },
  { id: 'traders', sec: 'threats', title: 'Traders and quests', html: `
<ul>
<li>Four or five traders run posts in small houses, shops and gas stations. A post appears on the map once you're close, or when someone tells you about it.</li>
<li><b>Gunsmith</b>: magazines, ammo, attachments, rifles. <b>Medic</b>: bandages up to antivirals and surgical kits. <b>Quartermaster</b>: food, water, building materials, tools, backpacks, helmets. <b>Fixer</b>: electronics, intel, high-end armour.</li>
<li>Every deal is <b>barter</b>: items for items, from your pockets and backpack. Deals restock daily.</li>
<li><b>Loyalty</b>: trades and quests earn reputation. 10 unlocks level 2, 25 level 3, with better deals.</li>
<li><b>Quests</b>: each trader has five jobs, unlocked in turn: kill certain zombies or bandits, hand over supplies, recover an item from a far-off building, or scout one. Targets are marked on the map.</li>
<li>A dead trader's post is abandoned, and their cupboards are free to loot.</li>
</ul>` },

  // ---------------------------------------------------------------- combat
  { id: 'firearms', sec: 'combat', title: 'Firearms: magazines and reloading', html: `
<ul>
<li><b>Magazines are items.</b> Load them in the inventory by dragging ammo onto a magazine (or right-click → Load). Loading carries on round by round while the inventory is open.</li>
<li>${K('R')} swaps in your fullest spare magazine from your pockets, vest, jacket or backpack. A tactical reload keeps the round in the chamber. An empty gun needs its bolt racked (it does that for you). Double-tap ${K('R')} for a quick reload that drops the old magazine on the ground.</li>
<li>Shotguns load shell by shell; firing interrupts the loading.</li>
<li><b>No ammo counter.</b> ${K('T')} checks the magazine for a rough reading.</li>
<li>${K('Z')} switches fire mode on guns that have one.</li>
<li>Tired, cold or injured hands reload slower and can fumble the magazine.</li>
</ul>` },
  { id: 'aiming', sec: 'combat', title: 'Aiming, sway and recoil', html: `
<ul>
<li>Right mouse aims down the sights. Bullets go along the barrel, not the centre of the screen.</li>
<li>The gun lags your mouse, sways with your breathing, and is thrown about when you start, stop or turn sharply. Sway grows when you're tired, out of breath or moving.</li>
<li>Hold ${K('Shift')} while aiming to <b>hold your breath</b> and steady the gun, until you run out.</li>
<li>Recoil kicks the gun and climbs the view.</li>
<li><b>Hip fire</b> gets more accurate as your Guns skill rises: at 8 it's as good as aiming.</li>
<li>${K('Q')} / ${K('E')} lean round corners. Crouching and lying prone steady your aim.</li>
</ul>` },
  { id: 'guns', sec: 'combat', title: 'The guns', html: `
<table class="keys">
<tr><td>PM</td><td>9×18 pistol, 8-round mag. Bodies, nightstands, police</td></tr>
<tr><td>Glock 17</td><td>9×19 pistol, 17 rounds. Police, evidence rooms, soldiers</td></tr>
<tr><td>M1911A1</td><td>.45 pistol, 7 rounds. Evidence rooms, hunting cabins</td></tr>
<tr><td>MP5A3</td><td>9×19 SMG, 30 rounds, auto. Police lockers</td></tr>
<tr><td>AK-74N</td><td>5.45×39, 30/45 rounds, auto. Military</td></tr>
<tr><td>M4A1</td><td>5.56×45, 30 rounds, auto. Military, rarely police</td></tr>
<tr><td>M249</td><td>5.56 machine gun, belt box or STANAG mags. Military (rare)</td></tr>
<tr><td>SKS</td><td>7.62×39, 10 rounds. Hunting cabins, crates, military</td></tr>
<tr><td>M14</td><td>7.62×51, 20 rounds. Military, hunting cabins (rare)</td></tr>
<tr><td>MP-133 / Remington 870</td><td>12 gauge pump shotguns. Hunting cabins, crates, police</td></tr>
</table>
<p>The gunsmith trader sells NATO guns as your reputation grows.</p>` },
  { id: 'attachments', sec: 'combat', title: 'Attachments: sights, scopes, lasers, suppressors', html: `
<ul>
<li>In the inventory, drag an attachment onto your gun, or right-click it → <b>Attach to</b>. Right-click the gun to take things off.</li>
<li><b>Hover or right-click an attachment</b> to see which guns it fits; the guns you carry that take it light up.</li>
<li><b>Red dot and holographic sights</b> project their reticle at infinity.</li>
<li><b>PSO-1 4×, Hunting 6×, ACOG 4×</b>: true picture-in-picture scopes; the reticle is where the bullets go.</li>
<li><b>Pulsar thermal 3×</b>: the world goes grey and cold, and warmth shows: people white-hot, running engines hot, zombies a faint glow. A body cools to nothing over about 20 seconds. Works in the dark.</li>
<li><b>Lasers</b> (PEQ-15 on rifles, the MP5 and shotguns; Klesch-2 also on pistols) put a red dot where you're pointing and tighten hip fire a lot.</li>
<li><b>Suppressors</b> cut gunshot noise by about 80%.</li>
<li>Also a muzzle brake and a vertical foregrip (less recoil).</li>
</ul>` },
  { id: 'melee', sec: 'combat', title: 'Melee', html: `
<p>${K('2')} switches to your melee weapon: knife, hammer, crowbar or axe. Melee is <b>silent</b>, the best way to deal with a lone zombie. Heavy blows (axe, crowbar) can knock a target down; keep hitting it while it's down. Strength makes swings hit harder and cost less stamina. An axe also chops trees, and an axe or crowbar hacks doors down.</p>` },
  { id: 'grenades', sec: 'combat', title: 'Grenades and the hotbar', html: `
<ul>
<li>The <b>hotbar</b> is four slots on ${K('3')}–${K('6')}, bottom centre. In the inventory, drag something from a pocket, your vest or your jacket onto a slot (or right-click → Put on hotbar). Not from a backpack: you can't reach into that in a hurry.</li>
<li>Pressing a slot uses it: bandages and medkits are applied, food is eaten, a grenade comes up in your hand.</li>
<li>With a grenade up: left click throws it overarm, right click lobs it underhand; ${K('1')} or ${K('2')} puts it away.</li>
<li><b>F-1</b> (big fragmentation radius), <b>RGD-5</b>, <b>M67</b>. They bounce, then go off when the fuse runs out. A wall between you and the blast shields you; something low (a car, a counter) takes half. Everything for streets around hears it.</li>
</ul>` },
  { id: 'drones', sec: 'combat', title: 'FPV drones', html: `
<ul>
<li>Drag a grenade, C4 or a PG-7V warhead onto the drone in the inventory to arm it. Right-click → <b>Fly</b> (or put it on the hotbar).</li>
<li>You see through its camera: ${K('W')}${K('A')}${K('S')}${K('D')} to fly, the mouse to turn and tilt, ${K('Space')}/${K('C')} to climb and drop, ${K('Shift')} for speed. Your body stays where you stood; if anything hurts it, you snap back.</li>
<li>Left click drops a grenade. With C4 or a warhead it's a kamikaze: it goes off when it hits something or when you click.</li>
<li>Right click sets it down to be picked up again. The battery lasts about six minutes; past 300 m the signal breaks up.</li>
</ul>` },
  { id: 'airsupport', sec: 'combat', title: 'Close air support (A-10)', html: `
<ul>
<li>You need the <b>laser designator</b> anywhere on you and the <b>military radio</b> in your backpack slot. Both are rare military finds.</li>
<li>${K('N')} raises the designator. Hold left click on a target (or sweep it along a street) for a second or so, then let go to call it in.</li>
<li>About 15 seconds later an A-10 makes two gun runs along the line. It shreds anything in the strip, including you ("danger close"), and brings every zombie around.</li>
<li>The radio needs three minutes between strikes.</li>
</ul>` },

  // ---------------------------------------------------------------- gear
  { id: 'inventory', sec: 'gear', title: 'The inventory', html: `
<ul>
<li>${K('Tab')} opens it. Items take up grid space, Tarkov-style: shape matters.</li>
<li><b>Equipment slots</b>: weapon, melee, armour, helmet, backpack, clothing, vest. Your character is shown in 3D wearing it; drag to turn them.</li>
<li>Searching a container opens it beside your own. Drag things across, or right-click for options (use, load, attach, drop, put on hotbar).</li>
<li>Close it with ${K('Esc')}, ${K('Tab')}, ${K('F')}, a click outside, or by walking off.</li>
<li>Reloads and "do you have it" checks look through your pockets, vest, jacket and backpack.</li>
<li>The <b>skills page</b> shows every skill and what trains it.</li>
</ul>` },
  { id: 'clothing', sec: 'gear', title: 'Clothing and pockets', html: `
<p>What you wear adds storage. Each pocket or pouch is its own small grid, so an AK magazine needs a tall 1×2 pouch while a tin of beans fits anywhere.</p>
<table class="keys">
<tr><td>Hoodie</td><td>one 2×2</td></tr><tr><td>Work jacket</td><td>two 1×2, one 2×1</td></tr><tr><td>Raincoat</td><td>two 1×2</td></tr><tr><td>Winter coat</td><td>two 2×2</td></tr><tr><td>Military parka</td><td>two 2×2, two 1×2</td></tr>
<tr><td>Fishing vest</td><td>six 1×1, two 1×2</td></tr><tr><td>Hunting vest</td><td>four 1×2</td></tr><tr><td>Police vest</td><td>two 1×2, four 1×1</td></tr><tr><td>Scav chest rig</td><td>four 1×2, two 1×1</td></tr><tr><td>Tactical rig</td><td>four 1×2, two 2×2, two 1×1</td></tr>
</table>` },
  { id: 'loot', sec: 'gear', title: 'Where to find what', html: `
<table class="keys">
<tr><td>Food and drink</td><td>Kitchens, fridges, shop shelves, kiosks, the gastronom, pantries</td></tr>
<tr><td>Medicine</td><td>Pharmacies, the hospital, the clinic, bathroom cabinets</td></tr>
<tr><td>Tools and materials</td><td>Hardware stores, garages, lock-ups, the factory, warehouses, toolboxes, lumber piles</td></tr>
<tr><td>Car parts</td><td>Auto repair shops, warehouses, garage shelving, car trunks</td></tr>
<tr><td>Clothing and bags</td><td>Wardrobes, dressers, lockers, hotel rooms</td></tr>
<tr><td>Guns and ammo</td><td>Police lockers and evidence rooms, hunting cabins, crates, bodies; military gear only at the outpost, checkpoints and on soldiers</td></tr>
<tr><td>Valuables, intel</td><td>Offices and skyscrapers (desks, filing cabinets, servers, safes)</td></tr>
<tr><td>Seeds and farm supplies</td><td>Farms, seed racks, hardware stores, dachas</td></tr>
</table>
<p>Upper floors of tall buildings are less picked over.</p>` },

  // ---------------------------------------------------------------- world
  { id: 'town', sec: 'world', title: 'The town', html: `
<ul>
<li><b>Downtown</b>: skyscrapers (14–20 floors), the Hotel Vostok, the hospital, the police station, offices, the gastronom.</li>
<li><b>The big housing</b>: 16-storey tower blocks, nine-storey panel blocks and Stalin-era blocks, with courtyards, playgrounds and lock-up garages.</li>
<li><b>Outskirts</b>: five-storey Khrushchyovkas, the private sector of fenced houses, dachas, shops, the market, a park, the TV tower.</li>
<li><b>Industry</b>: one whole edge of town: factories, boiler houses and their garages, warehouses, auto repair.</li>
<li><b>Military</b>: an outpost in one corner and checkpoints on the streets, guarded by soldier zombies.</li>
<li>Signs are in Cyrillic: ПРОДУКТЫ (groceries), АПТЕКА (pharmacy), БОЛЬНИЦА (hospital), ПОЛИЦИЯ (police), ХОЗТОВАРЫ (hardware), АЗС (fuel), ГОСТИНИЦА (hotel), КОТЕЛЬНАЯ (boiler house). The map shows them in English.</li>
</ul>` },
  { id: 'tall', sec: 'world', title: 'Tall buildings, stairs and elevators', html: `
<ul>
<li>Every floor of every building is real, with its own rooms, loot and zombies.</li>
<li>Stairwells sit at the end of the corridor: a flight up to a half landing, then on up.</li>
<li><b>Elevators</b> (hospital, tower blocks, hotel, skyscrapers): ${K('F')} at the call button, then ${K('F')} at the panel inside and pick a floor (number keys, ${K('0')} for the tenth, or click).</li>
<li>Zombies hear you through floors and come up the stairs after you. Floors stop bullets. You can't jump out of upstairs windows.</li>
</ul>` },
  { id: 'country', sec: 'world', title: 'The countryside', html: `
<ul>
<li>Farms and collective farms (farmhouse, barn, silo, chicken coop, kitchen garden, a well), fields, orchards, forests with hunting cabins and campsites, meadows with ponds.</li>
<li>Town streets carry on as dirt tracks, with a ring track round the town.</li>
<li>Fewer zombies than in town. Apples, berries, corn and vegetable rows can be picked and grow back.</li>
</ul>` },
  { id: 'map', sec: 'world', title: 'The map', html: `
<p>${K('M')} opens the map: streets, buildings by type, named landmarks, your safehouse (yellow outline), traders you've found, survivors you've met (green, yellow, red) and quest targets.</p>` },

  // ---------------------------------------------------------------- build
  { id: 'building', sec: 'build', title: 'Building', html: `
<p>${K('B')} toggles build mode (ground floor only). You need a <b>hammer</b>. ${K('1')}–${K('8')} choose, ${K('R')} rotates, left click builds, ${K('X')} dismantles what you're looking at.</p>
<table class="keys">
<tr><td>Wooden wall</td><td>3 planks, 4 nails</td></tr>
<tr><td>Barricade (waist high)</td><td>2 planks, 3 nails</td></tr>
<tr><td>Wooden door</td><td>4 planks, 4 nails · Carpentry 2</td></tr>
<tr><td>Storage crate</td><td>3 planks, 2 nails</td></tr>
<tr><td>Bed</td><td>4 planks, 4 nails · Carpentry 2</td></tr>
<tr><td>Campfire (warmth, light)</td><td>2 planks</td></tr>
<tr><td>Rain barrel</td><td>3 planks, 4 nails · Carpentry 1</td></tr>
<tr><td>Garden plot</td><td>a shovel, outdoors</td></tr>
</table>
<p>Planks come from lumber piles, or chop a tree with an axe and saw the logs. Hammering is loud. Zombies bash through what you build; brutes hit three times as hard.</p>` },
  { id: 'farming', sec: 'build', title: 'Farming and foraging', html: `
<ul>
<li>Dig a plot (build item 8, shovel). ${K('F')} on it to plant carrots, cabbages, potatoes, tomatoes or corn, water, fertilize, and harvest.</li>
<li>Crops ripen in 2–4 days with steady water. A dry crop barely grows and dies after about a day and a half; a ripe one rots if left two days. Nothing grows in winter, and frost kills crops.</li>
<li>Rain waters every plot. Rain barrels collect water; watering cans hold 2 L per watering.</li>
<li>The Farming skill grows as you farm: faster growth, bigger harvests, more seeds back.</li>
<li>Forage apple trees, berry bushes and field rows.</li>
</ul>` },

  // ---------------------------------------------------------------- vehicles
  { id: 'cars', sec: 'vehicles', title: 'Vehicles', html: `
<ul>
<li>About 50 cars and trucks were abandoned, each in a different state. ${K('F')} on one shows its parts: engine, battery, fuel tank, brakes, headlights, four tyres.</li>
<li>To run it needs a charged battery, a working engine, an intact tank and fuel. Swap parts between cars with a wrench (and a jack for tyres), or repair: spark plugs or engine parts for the engine, scrap and tape for the tank, tape for tyres.</li>
<li>Fuel: 20 L gas cans, filled at gas station pumps or siphoned from other cars. A car parked by a pump fills straight from it.</li>
<li>Engines are loud. Running zombies down dents the car.</li>
</ul>
<table class="keys"><tr><td>${K('W')}</td><td>Start, then accelerate</td></tr><tr><td>${K('S')}</td><td>Brake, then reverse</td></tr><tr><td>${K('A')} ${K('D')}</td><td>Steer</td></tr><tr><td>${K('Space')}</td><td>Handbrake</td></tr><tr><td>${K('L')} / ${K('H')}</td><td>Headlights / horn</td></tr><tr><td>${K('F')}</td><td>Get out</td></tr></table>` },

  // ---------------------------------------------------------------- settings
  { id: 'skills', sec: 'settings', title: 'Professions and skills', html: `
<table class="keys">
<tr><td>Unemployed</td><td>No training, the most free points, a knife</td></tr>
<tr><td>Police Officer</td><td>Aiming, Fitness, Guns; a PM with ammo</td></tr>
<tr><td>Fire Officer</td><td>Strength, Fitness, Agility; an axe</td></tr>
<tr><td>Carpenter</td><td>Carpentry 3; hammer, saw, planks, nails, a bag</td></tr>
<tr><td>Nurse</td><td>First Aid 3; medical supplies</td></tr>
<tr><td>Burglar</td><td>Stealth 3, Dexterity; a crowbar</td></tr>
<tr><td>Farmer</td><td>Farming 3, Strength; shovel, watering can, seeds</td></tr>
<tr><td>Veteran</td><td>Aiming 3, Guns 2, Strength; a shotgun</td></tr>
</table>
<p>Skills run 0–8. Guns, Agility, Dexterity and Farming rise as you use them; the rest are set when you make the character. You also choose the gun you bring in on the helicopter, and when you go in: three choices of season and time of day for a new world.</p>` },
  { id: 'settingsgfx', sec: 'settings', title: 'Graphics, sound and saving', html: `
<ul>
<li><b>Graphics</b> (pause screen or title menu): Low, Medium, High and Ultra presets, or set render scale, shadows, view distance and anti-aliasing yourself. If the game runs slowly, lower the render scale first.</li>
<li><b>Sound</b>: a volume slider for every sound.</li>
<li><b>Fullscreen</b>: the game goes fullscreen when you start. Hold ${K('Esc')} to leave it.</li>
<li><b>Saving</b> is automatic: every 30 seconds, when you sleep, and when you close the tab. While you're playing, closing the tab (Ctrl+W) asks first; in fullscreen the game keeps those shortcuts from closing it at all.</li>
</ul>` },
];

const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function setupGuide(game) {
  const el = document.createElement('div');
  el.id = 'survival-guide';
  el.className = 'overlay';
  el.innerHTML = `<div class="panel guide-panel">
    <div class="guide-head"><h2>SURVIVAL GUIDE</h2><input class="guide-search" type="search" placeholder="Search the guide…" spellcheck="false"><button class="guide-close">✕ Close <kbd>F2</kbd></button></div>
    <div class="guide-body"><nav class="guide-nav"></nav><article class="guide-art"></article></div>
  </div>`;
  document.body.appendChild(el);
  const nav = el.querySelector('.guide-nav'), art = el.querySelector('.guide-art'), search = el.querySelector('.guide-search');
  const text = new Map(ARTICLES.map((a) => [a.id, plain(a.title + ' ' + a.html).toLowerCase()]));
  let current = 'how';

  function drawNav(list) {
    nav.innerHTML = SECTIONS.map(([sec, name]) => {
      const items = list.filter((a) => a.sec === sec);
      if (!items.length) return '';
      return `<div class="guide-sec">${name}</div>` + items.map((a) => `<a data-id="${a.id}" class="${a.id === current ? 'on' : ''}">${a.title}</a>`).join('');
    }).join('') || '<div class="dim guide-none">Nothing found.</div>';
  }
  function show(id, terms = []) {
    const a = ARTICLES.find((x) => x.id === id) || ARTICLES[0];
    current = a.id;
    let html = `<h3>${a.title}</h3>${a.html}`;
    // highlight the search words in the text (not inside tags)
    for (const t of terms) if (t.length > 1) html = html.replace(new RegExp(`(>[^<]*?)(${escRe(t)})`, 'gi'), (m, pre, w) => `${pre}<mark>${w}</mark>`);
    art.innerHTML = html;
    art.scrollTop = 0;
    for (const n of nav.querySelectorAll('a')) n.classList.toggle('on', n.dataset.id === current);
  }
  function filter() {
    const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) { drawNav(ARTICLES); show(current); return; }
    // ranked: a word in the title counts most, then how often the words appear
    const score = (a) => terms.reduce((s, t) => s + (a.title.toLowerCase().includes(t) ? 20 : 0) + text.get(a.id).split(t).length - 1, 0);
    const list = ARTICLES.filter((a) => terms.every((t) => text.get(a.id).includes(t))).sort((p, q) => score(q) - score(p));
    nav.innerHTML = list.length ? `<div class="guide-sec">${list.length} result${list.length === 1 ? '' : 's'}</div>` + list.map((a) => `<a data-id="${a.id}">${a.title}</a>`).join('') : '<div class="dim guide-none">Nothing found.</div>';
    if (list.length) show(list[0].id, terms);
  }
  nav.addEventListener('click', (e) => { const id = e.target.dataset?.id; if (id) show(id, search.value.toLowerCase().split(/\s+/).filter(Boolean)); });
  search.addEventListener('input', filter);
  el.querySelector('.guide-close').onclick = () => api.close();
  el.addEventListener('pointerdown', (e) => { if (e.target === el) api.close(); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F2') { e.preventDefault(); if (api.isOpen) api.close(); else if ((game.state === 'play' && !game.intro && !game.player?.dead) || game.state === 'menu') api.open(); }
    else if (e.code === 'Escape' && api.isOpen) { e.preventDefault(); e.stopPropagation(); api.close(); }
    else if (api.isOpen && document.activeElement !== search && e.key.length === 1 && !e.ctrlKey && !e.metaKey) search.focus(); // type to search
  }, true);

  const api = {
    get isOpen() { return el.style.display === 'flex'; },
    open(id) {
      if (id) current = id;
      search.value = '';
      drawNav(ARTICLES); show(current);
      el.style.display = 'flex';
      game.guideOpen = true;
      game.input?.unlock();
      game.updatePause?.();
    },
    close() {
      if (!api.isOpen) return;
      el.style.display = 'none';
      game.guideOpen = false;
      if (game.state === 'play') game.resume(); else game.updatePause?.();
    },
  };
  return api;
}
