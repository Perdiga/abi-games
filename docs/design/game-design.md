# ABI Trainer — Game Design v1 Plan

## 1. Scope and planning stance

This document is now the **locked v1 planning baseline** for implementation handoff.
Mateus confirmed that we should **pick sensible defaults now**, document any invented values
clearly as placeholders, and only revisit true unknowns later.

### v1 goal
- Build a **desktop-only** browser game in **React + TypeScript**.
- Core loop: start a run, receive player storage/equipment, watch bot deaths generate loot,
  and pack the highest-value haul into the player's secured inventory before the timer ends.
- Recreate the **interaction language** of an extraction-game inventory screen without copying
  copyrighted ABI art or assets.

### v1 locked non-goals
- **No Health tab at all** in v1.
- No backend/server requirement in the initial slice unless later implementation work proves a
  local persistence layer needs one.
- No mobile/responsive target in v1.
- No durability/charge-based value scaling in v1.
- No loot despawn, cleanup, or AI scavenging.
- No weapon attachment system beyond ordinary inventory placement and equipment rules.

### v1 still deferred, but not blockers
- Real item catalog data
- Final icon/art set from Mateus
- Final numeric balance for score tiers, time penalty, and item values
- Exact per-item weapon and container catalog breadth

---

## 2. Core design principles

1. **Separate data from presentation.** Item definitions, states, rules, layouts, and run logic
   should be UI-agnostic.
2. **Treat placement as shape-on-grid, not width/height-only.** Rectangles still work, but the
   engine must support irregular masks in v1.
3. **Model containers as one or more independent compartments.** Adjacent cells separated by a
   compartment boundary are **not** continuous placement space.
4. **Support stateful items.** Backpacks and vests may switch between worn/open and collapsed/rolled
   forms under explicit rules.
5. **Support rotation.** Placement validation must work against rotated item masks.
6. **Keep run simulation deterministic where helpful, randomized where intended.** Bot death timing
   is fixed; bot loot generation is randomized from a pool.
7. **Use original placeholder art only.** Layout inspiration is allowed; copyrighted ABI assets are not.

---

## 3. Proposed data model

The critical architectural choice for v1 is this:

> A "container" is not one giant uninterrupted grid.  
> A container layout owns **one or more compartments**, and an item must fit entirely inside
> exactly one compartment unless a future rule explicitly allows otherwise.

That rule solves backpacks and tactical vests cleanly, including layouts with visible breaks,
gaps, or isolated side pouches.

## 3.1 Main entities

### `item_definitions`
Static catalog rows. Mateus will provide the real catalog later; v1 implementation can begin
against placeholder/example rows.

Suggested fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable internal id |
| `name` | string | Player-facing label |
| `category` | string | `helmet`, `mask`, `backpack`, `vest_tactical`, etc. |
| `subtype` | string nullable | Optional finer grouping |
| `baseValue` | number | Fixed static catalog value |
| `durabilityType` | string nullable | `armor`, `weapon`, `medkit`, `none` |
| `maxDurability` | number nullable | Tracked for gameplay/info only in v1 |
| `allowedEquipmentSlots` | string[] | Legal equipment anchors |
| `tags` | string[] | Used by validation rules |
| `defaultStateId` | string | Default item state |
| `containerLayoutId` | string nullable | Default internal layout if the item is a container |
| `allowRotation` | boolean | Whether the item may rotate in storage |

### `item_states`
Alternate footprints and behavior modes for a definition.

Suggested fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable state id |
| `itemDefinitionId` | string | Parent item |
| `label` | string | `worn-open`, `collapsed`, `rolled`, etc. |
| `shapeMask` | string[] | Occupancy mask, e.g. `["111","111"]` |
| `boundingWidth` | number | Width of the unrotated mask |
| `boundingHeight` | number | Height of the unrotated mask |
| `equippable` | boolean | Whether this state can be worn |
| `storable` | boolean | Whether this state can be placed in another container |
| `containerLayoutId` | string nullable | Internal layout available in this state |
| `uiLabel` | string nullable | Optional player-facing state label |

### `item_instances`
Actual items in a run.

Suggested fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique instance id |
| `itemDefinitionId` | string | Catalog reference |
| `stateId` | string | Current state |
| `rotation` | `0 \| 90` | v1-facing APIs only accept `0` or `90`; `180`/`270` are reserved for future expansion |
| `currentDurability` | number nullable | Informational or future use |
| `ownerEntityId` | string | `player`, `bot_3`, `ground_drop_2`, etc. |
| `parentContainerInstanceId` | string nullable | Container item holding this item |
| `parentCompartmentId` | string nullable | Exact compartment occupied inside the parent |
| `gridX` | number nullable | Cell position relative to the compartment origin |
| `gridY` | number nullable | Cell position relative to the compartment origin |
| `equippedSlotId` | string nullable | Present when worn instead of gridded |

### `container_layouts`
High-level container metadata.

Suggested fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable id |
| `name` | string | Human-readable label |
| `boundingWidth` | number | Overall extents for rendering |
| `boundingHeight` | number | Overall extents for rendering |
| `compartmentIds` | string[] | Ordered child compartment ids |
| `supportsIrregularGeometry` | boolean | Always `true` in v1-capable data model |

### `container_compartments`
The key structure for backpacks and tactical vests.

Suggested fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable id |
| `layoutId` | string | Parent layout |
| `label` | string | `main`, `left-pouch`, `right-pouch`, etc. |
| `originX` | number | X position inside the layout canvas |
| `originY` | number | Y position inside the layout canvas |
| `shapeMask` | string[] | Occupancy for this compartment only |
| `boundingWidth` | number | Width of compartment bounds |
| `boundingHeight` | number | Height of compartment bounds |
| `acceptsTags` | string[] nullable | Optional later filter |
| `sortOrder` | number | Stable UI ordering |

### `equipment_slots`
Named body/equipment anchors.

Suggested fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | e.g. `helmet`, `mask`, `backpack` |
| `label` | string | UI text |
| `slotType` | string | For validation logic |
| `maxItems` | number | Usually `1` |
| `acceptsCategories` | string[] | Allowed item families |

### `rule_definitions`
Data-driven validation rules.

Suggested fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable id |
| `priority` | number | Higher runs first |
| `ruleType` | string | `mutual_exclusion`, `requires_tag`, `max_depth`, etc. |
| `subjectSelector` | json | What is being moved/equipped/toggled |
| `contextSelector` | json | Existing inventory/equipment context |
| `operator` | string | Comparison/evaluation operator |
| `value` | json | Rule payload |
| `effect` | string | `deny`, `warn` |
| `message` | string | Player-facing failure reason |

### `run_definitions`
Mode-level constants and timing.

Suggested fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | e.g. `training-mode-v1` |
| `durationSeconds` | number | Fixed at `300` for v1 |
| `botDeathSchedule` | number[] | `[5, 10, 15, 20, 25]` |
| `timePenaltyPointsPerSecond` | number | Tunable linear score deduction; placeholder starts at 25 |
| `rankThresholds` | json | Placeholder medal/tier thresholds |
| `lootGenerationMode` | string | `randomized_from_pool` |

## 3.2 Placement model and compartment rules

### Core placement rule
Any attempted placement must satisfy **all** of the following:

1. Choose a target container instance.
2. Choose **one target compartment** inside that container.
3. Resolve the item's current state mask.
4. Apply rotation if allowed.
5. Verify every occupied cell of the rotated mask lands on a valid `1` cell in that compartment.
6. Verify no occupied cell overlaps another item.

If any occupied cell would cross into another compartment, even an adjacent one, the move is invalid.

### Why this matters
This rule is what makes the following possible without hacky exceptions:

- backpacks with multiple isolated storage bays
- tactical vests with separated pouches
- irregular storage silhouettes
- future per-compartment restrictions if needed

### Recommended normalized geometry convention

- `shapeMask` uses strings of `1` and `0`
- `1` = usable/occupied cell
- `0` = empty/non-cell inside the bounding box
- rotation is applied to the mask before validation
- `gridX` / `gridY` are coordinates **inside the selected compartment**, not global layout coordinates

## 3.3 Example multi-compartment backpack layout

Mateus provided a representative backpack shape where storage is split into separate regions.
Model that as multiple compartments, not as a single irregular mask.

Example layout:

```json
{
  "id": "backpack_example_split",
  "name": "Split backpack example",
  "boundingWidth": 5,
  "boundingHeight": 6,
  "compartmentIds": [
    "bp-example-top",
    "bp-example-left",
    "bp-example-center",
    "bp-example-right"
  ]
}
```

```json
[
  {
    "id": "bp-example-top",
    "layoutId": "backpack_example_split",
    "label": "top",
    "originX": 1,
    "originY": 0,
    "shapeMask": ["111", "111", "111"],
    "boundingWidth": 3,
    "boundingHeight": 3,
    "sortOrder": 1
  },
  {
    "id": "bp-example-left",
    "layoutId": "backpack_example_split",
    "label": "left-pouch",
    "originX": 0,
    "originY": 3,
    "shapeMask": ["1", "1", "1"],
    "boundingWidth": 1,
    "boundingHeight": 3,
    "sortOrder": 2
  },
  {
    "id": "bp-example-center",
    "layoutId": "backpack_example_split",
    "label": "main-lower",
    "originX": 1,
    "originY": 3,
    "shapeMask": ["111", "111", "111"],
    "boundingWidth": 3,
    "boundingHeight": 3,
    "sortOrder": 3
  },
  {
    "id": "bp-example-right",
    "layoutId": "backpack_example_split",
    "label": "right-pouch",
    "originX": 4,
    "originY": 3,
    "shapeMask": ["1", "1", "1"],
    "boundingWidth": 1,
    "boundingHeight": 3,
    "sortOrder": 4
  }
]
```

This lets the UI render one backpack card while the placement engine still knows that:

- the top section is independent
- the left pouch is independent
- the center lower section is independent
- the right pouch is independent

An item can fit inside **one** of those areas, but never span from left pouch into center or
from top into lower compartments.

---

## 4. Item taxonomy draft

Mateus does **not** want us to author a full production catalog yet.  
So this section defines **families and representative placeholder examples only**.

## 4.1 Equipment and item families

| Family | Category id | Typical properties | Container? | Locked v1 notes |
|---|---|---|---|---|
| Helmet | `helmet` | armor tags, compatibility tags | No | Fixed 2x2 example footprint |
| Face shield / visor | `face_shield` | compatible helmet ids/tags | No | Fixed 2x2 example footprint |
| Mask | `mask` | cosmetic/protective tags | No | Fixed 2x2 example footprint |
| Headset | `headset` | compatibility tags | No | Fixed 2x2 example footprint |
| Armband | `armband` | cosmetic/team tag | No | Small simple footprint |
| Primary weapon | `weapon_primary` | ammo data later | No | Per-item shape |
| Secondary weapon | `weapon_secondary` | ammo data later | No | Per-item shape |
| Pistol | `weapon_pistol` | ammo data later | No | Per-item shape |
| Melee | `melee` | optional sheath slot | No | Per-item shape |
| Tactical vest | `vest_tactical` | compartment layout, optional ballistic tags | Yes | Irregular layout allowed |
| Ballistic vest | `vest_ballistic` | armor values, compartment layout | Yes | 3x3 or 4x3 depending on vest |
| Backpack | `backpack` | compartment layout, nesting tags | Yes | Irregular, multi-compartment allowed |
| Quick-use item | `quick_use` | grenade/utility/etc. | No | Small footprints |
| Ammo | `ammo` | discrete single-item ammo units for scoring/storage | No | No stacking in v1 |
| Ammo box | `ammo_box` | ordinary loot item | Optional | Simple rectangular |
| Medical kit | `medkit` | charges for gameplay only | No | Value stays fixed in v1 |
| Consumable / utility | `consumable` | optional charges | No | Value stays fixed in v1 |
| Misc storage item | `container_misc` | future cases/crates | Yes | Out of scope for authored catalog, but model supports it |

## 4.2 Representative placeholder sizes

These are not the final item catalog. They are planning defaults so Mr. Pink and Mr. Orange can
start implementation cleanly.

| Item family | Placeholder shape |
|---|---|
| Helmet | `["11","11"]` |
| Face shield | `["11","11"]` |
| Mask | `["11","11"]` |
| Headset | `["11","11"]` |
| Ballistic vest (small) | `["111","111","111"]` |
| Ballistic vest (wide) | `["1111","1111","1111"]` |
| Weapon example: carbine | `["11111","00100"]` |
| Weapon example: shotgun | `["111111","000100"]` |
| Weapon example: pistol | `["11","10"]` |

Rotation is enabled, so these masks may be rotated when allowed by the item definition. In v1,
legal stored orientations are only `0°` and `90°`.

## 4.3 Equipment slots in v1

| Slot id | Purpose |
|---|---|
| `helmet` | Head armor |
| `helmetFaceShield` | Face shield mounted to helmet |
| `mask` | Face covering |
| `headset` | Headset/auricular |
| `armband` | Cosmetic identifier |
| `primaryWeapon` | Main weapon |
| `secondaryWeapon` | Additional long gun slot |
| `pistol` | Handgun slot |
| `melee` | Melee/sheath slot |
| `tacticalVest` | Tactical vest |
| `ballisticVest` | Ballistic vest / plate carrier |
| `backpack` | Worn backpack |
| `pockets` | Ordinary player-worn container layout anchored to the pockets slot |
| `quickUse5` | Quick-use slot |
| `quickUse6` | Quick-use slot |
| `quickUse7` | Quick-use slot |
| `quickUse8` | Quick-use slot |
| `mastery` | Reserved slot if retained in UI |

## 4.4 Player-owned inventory regions counted for score

At run end, **all secured player inventory counts**, not just the backpack:

- worn backpack contents
- tactical vest contents
- ballistic vest contents
- pockets
- equipped non-container items on the player
- weapons on the player
- items inside nested containers that are themselves secured by the player

Ground loot that was never moved into player-owned storage/equipment scores `0`.
Worn/equipped container-holder shells do **not** add their own value unless a future mode explicitly
changes that rule.

### Locked v1 scoring clarification

For scoring purposes:

- every secured item instance is valued as **one discrete item** at its `baseValue`
- v1 has **no stacking mechanic**; ammo, meds, and similar items are separate item instances
- equipped or worn **container shells** (for example the player's backpack, tactical vest, ballistic vest,
  or pocket-container structure) do **not** add their own `baseValue` simply for being the holder
- the score includes:
  - loose items placed inside secured containers
  - equipped non-container items
  - weapons
  - nested contained items if the containment chain ends in player-owned secured storage

Potential future stacking support is explicitly out of scope for v1.

---

## 5. Compatibility, nesting, and state rules

## 5.1 Recommendation

Use a rule-evaluation layer for attempted actions:

- equip item to slot
- move item into a compartment
- rotate item during placement
- change item state

## 5.2 Action envelope

```ts
type InventoryAction =
  | { type: "equip"; itemInstanceId: string; targetSlotId: string }
  | {
      type: "move";
      itemInstanceId: string;
      targetContainerId: string;
      targetCompartmentId: string;
      x: number;
      y: number;
      rotation: 0 | 90;
    }
  | { type: "change-state"; itemInstanceId: string; targetStateId: string };
```

## 5.3 Locked v1 rules

### Rule A — Helmet supports shield
- Face shields are equipped through the normal `equip` path into the `helmetFaceShield` slot.
- They require a compatible helmet/tag.

### Rule B — Mask blocks shield
- A mask and face shield cannot coexist if the compatibility rules say they conflict.

### Rule C — Shield blocks mask
- Symmetric with Rule B.

### Rule D — Helmet may block headset
- Certain helmets can deny headset use via tags.

### Rule E — Ballistic tactical vest blocks separate ballistic vest
- Tactical vest definitions can declare that they already count as ballistic armor.

### Rule F — Separate ballistic vest blocks ballistic tactical vest
- Symmetric with Rule E.

### Rule G — Backpack nesting limit
- The **worn backpack counts as level 1**.
- v1 allows **two additional nested backpack levels inside it**.
- Maximum total depth along any backpack-to-backpack chain is **3**.

### Rule H — v1 uses an even stricter empty-only state-change rule
- The broader "do not invalidate contents" principle still describes the intent.
- In v1, implementation should not offer a geometry-preserving exception path; Rule I is the
  actual enforced rule for collapsed/rolled storage states.

### Rule I — Collapsed or rolled storage states must be empty
- This is **mandatory in v1**.
- A backpack or vest can only be collapsed/rolled if its internal compartments are completely empty.

### Rule J — Equipped containers must use an equippable state
- Example: a backpack cannot be worn while in a collapsed/stored-only state.

### Rule K — Items cannot span compartment boundaries
- Placement is validated entirely within one compartment. No exceptions in v1.

## 5.4 Why this is the cleanest fit

- Multi-compartment storage becomes a first-class rule, not a UI illusion.
- Mr. Pink can build one placement validator for all containers.
- Mr. Orange can render boundaries visually without inventing separate game logic.

---

## 6. Irregular shapes, rotation, and stateful containers

## 6.1 Locked v1 decision

v1 **does support**:

- item rotation
- irregular item footprints
- irregular container compartments
- manual state toggles for qualifying items

Locked rotation scope for v1:

- only `0°` and `90°` are legal orientations
- `180°` and `270°` must be rejected by v1-facing APIs and validation paths
- wider rotation support is a future expansion, not dead design space

## 6.2 Representation recommendation

Store:

- `shapeMask` for items and compartments
- `boundingWidth` / `boundingHeight` for quick layout
- `allowRotation` on item definitions
- `containerLayoutId` on item states

This is enough for:

- rectangles
- L-shapes
- rifles with awkward silhouettes
- pouches and packs with holes, side wings, or segmented storage

## 6.3 State-change rules for backpacks and vests

Locked v1 behavior:

1. **Manual toggle is allowed** through the UI.
2. **Collapsed/rolled states are storage states**, not equipped states.
3. A collapsed/rolled state may be entered **only when the container is completely empty**.
4. v1 does **not** support "contents still fit, so allow the collapse anyway" exceptions.
5. If a backpack is currently worn, the legal state should be its worn/open state.

This avoids destructive or confusing state changes in v1.

---

## 7. UI layout plan

## 7.1 Visual target

The reference layout still informs panel placement, but v1 removes the Health tab entirely.

Suggested major zones:

1. **Top header strip** — mode title, timer, current secured value
2. **Left equipment rail** — worn gear and weapons
3. **Center silhouette panel** — mannequin/character overview
4. **Right player storage rail** — vests, pockets, backpack compartments
5. **Ground loot panel** — visible alongside the player inventory, not modal
6. **Bottom status strip** — weight/noise/mobility and score-related feedback

## 7.2 Proposed layout map

### A. Top header strip
- `Equipment` title or mode header only
- no `Health` tab
- include remaining time
- include current provisional secured value

### B. Left column
- Helmet
- Face shield
- Mask
- Armband
- Primary weapon
- Secondary weapon
- Pistol
- Melee
- Quick-use slots 5–8

### C. Center panel
- Character silhouette/mannequin
- Purely visual anchor for understanding worn gear

### D. Right column
- Headset slot
- Tactical vest panel
- Ballistic vest panel
- Pockets panel
- Backpack panel

### E. Adjacent ground loot panel
- One or more visible loot sources
- Each bot death adds another lootable source that persists for the whole run
- Panel is part of the main screen layout, not a modal

### F. Bottom status strip
- secured score/value preview
- carry weight / capacity
- movement/noise indicators if desired
- timer pressure feedback

## 7.3 Interaction model

- Drag-and-drop between player storage, equipment, and ground loot
- Rotation input during drag/placement
- Hover preview for valid/invalid cells
- Visible compartment boundaries inside segmented containers
- Failure messaging for:
  - overlap
  - out-of-bounds
  - crossing compartment boundaries
  - illegal equipment compatibility
  - illegal state toggle

## 7.4 Recommended implementation approach

### Locked stack: **React + TypeScript**

Recommended rendering approach:

- DOM/CSS grid or absolutely positioned cell layers for inventory regions
- React state or reducer-style state transitions for deterministic inventory updates

Why this is still the right call:

- The problem is data-heavy, not animation-heavy
- Segmented compartments are straightforward to render in DOM
- Tooltips, drag previews, and validation errors are easier in standard UI primitives

## 7.5 Desktop-only v1 implication

Because v1 is desktop-only:

- no responsive mobile layout work is required now
- drag target sizing can optimize for mouse/keyboard
- panel density can mirror PC extraction-game conventions

## 7.6 Art direction guardrail

Reconfirm the standing rule:

- use **original placeholder/original art only**
- do **not** reuse copyrighted ABI assets
- imitate the genre's information architecture, not protected art files

---

## 8. Training Mode game loop spec

## 8.1 Mode summary

Training Mode is a timed loot-efficiency challenge:

- run duration hard-capped at **300 seconds**
- at most 5 bots die on a fixed 5-second cadence
- the fifth drop occurs at 25 seconds; no more loot is generated afterward
- each death creates persistent loot
- the player may voluntarily choose **Extract Now** to end the run early
- the player uses the remaining time to decide what to secure and when to extract

## 8.2 State machine

```text
PreRun
  -> LoadRunData
  -> RunActive
       -> AwaitNextBotDeath
       -> SpawnLootDrop
       -> PlayerLooting
       -> AwaitNextBotDeath (repeat)
       -> ExtractNow
  -> RunEnd
  -> ScoreRun
  -> ResultsScreen
```

## 8.3 Detailed states

### `PreRun`
- show mode summary
- initialize player equipment/storage

### `LoadRunData`
- seed randomized bot loadouts from a pool
- build the fixed death schedule

### `RunActive`
- global timer advances until `300s`
- player may rearrange inventory and loot continuously
- player may trigger **Extract Now** at any time to end the run voluntarily

#### `AwaitNextBotDeath`
- wait until the next fixed timestamp

#### `SpawnLootDrop`
- create a persistent ground-loot source from the dead bot

#### `PlayerLooting`
- player transfers items into their own secure inventory/equipment
- all placement/equip/state changes go through the same validator

#### `ExtractNow`
- immediately ends the run voluntarily
- locks the elapsed seconds used for the linear point deduction
- transitions directly to `RunEnd`

### `RunEnd`
- triggers at `t = 300s` exactly if the player never extracted earlier
- no grace period beyond the hard cap

### `ScoreRun`
- compute gross value, apply time penalty, assign tier

### `ResultsScreen`
- show numeric score
- show tier/medal
- optionally show breakdown by slot/container family later

## 8.4 Locked bot death cadence

Confirmed exact schedule; loot does not disappear and no drops occur after bot 5:

- bot 1 dies at **5s**
- bot 2 dies at **10s**
- bot 3 dies at **15s**
- bot 4 dies at **20s**
- bot 5 dies at **25s**
- no more bots or loot drop after **25s**

### Exact-timestamp resolution order

If a queued player action and a scheduled bot-death event land on the exact same simulation
tick/timestamp, the **player action resolves first**, then the bot death and loot spawn fire.

## 8.5 Loot generation and drop representation

Locked v1 behavior:

- bot loot is **randomized from a pool**
- each dead bot drops its carried/equipped loot into a persistent ground-loot source
- the bot's **equipped backpack itself drops as loot**
- if that backpack contains items, it drops **with those contents intact**
- players may open that dropped backpack in the ground-loot panel and loot items **directly out of it**
  without first transferring the backpack itself

This is important: the backpack is not flattened into loose items unless a later mode chooses to.
It remains a lootable container instance.

## 8.6 Scoring formula

### Baseline v1 formula

```text
grossScore = sum(baseValue of every scoring secured item instance in all player-owned inventory/equipment at run end)
timePenaltyPoints = min(floor(scoringElapsedSeconds), 300) * timePenaltyPointsPerSecond
finalScore = max(0, grossScore - timePenaltyPoints)
```

Where:

- `scoringElapsedSeconds` is the elapsed time at the moment the player uses **Extract Now**
- if the player never extracts, `scoringElapsedSeconds = 300`
- elapsed time is **floored** before calculating the point deduction, so `180.9s` uses `180s`
- the provisional `timePenaltyPointsPerSecond` is **25 points/second** and is a balance value to tune
- the round can award no less than zero points

### What counts as secured

Everything on the player at run end:

- equipped non-container items
- weapons
- pockets
- tactical vest contents
- ballistic vest contents
- worn backpack contents
- nested containers and their contents, as long as the chain ends in player-owned secured storage

Worn/equipped holder containers themselves do not add score in v1 unless they are being treated as
ordinary loose loot items rather than as the active holder structure.

### Locked v1 valuation rule

- item values come from a **static catalog**
- durability and remaining charges **do not** alter score value in v1
- every scored item instance contributes its `baseValue` once
- v1 does **not** support stack quantities or stack-based score multiplication

### Perfect-packing benchmark — implementation pending

- The game should calculate the maximum loot value that can fit in the player's secured containers
  from the bot drops available at the time of evaluation.
- The solver must respect item masks, permitted rotations, compartment boundaries, occupied cells,
  container state, and any configured capacity rules.
- This benchmark is distinct from the time deduction: leaving loot on the ground does not itself
  reduce score, while every elapsed second continues to subtract points.
- The exact solver and player-facing maximum-value preview are not implemented yet.

## 8.7 Score presentation

Results should show:

- **numeric final score**
- **named tier/medal**

### Placeholder — tune later: v1 medal thresholds

| Tier | Placeholder threshold |
|---|---|
| Bronze | `>= 10,000` |
| Silver | `>= 25,000` |
| Gold | `>= 45,000` |
| Platinum | `>= 70,000` |
| Diamond | `>= 100,000` |

These numbers are balance placeholders only.

## 8.8 Uncollected loot

Locked v1 rule:

- dropped loot stays available for the whole run
- any loot left on the ground when the run ends, whether by extraction or the `300s` hard cap, scores `0`

---

## 9. Suggested v1 system boundaries

To keep the first implementation slice clean:

1. **Catalog layer**  
   Item definitions, states, placeholder catalog content, values, tags

2. **Geometry layer**  
   Item masks, container layouts, compartments, rotation helpers

3. **Rules layer**  
   Compatibility checks, state toggle rules, nesting depth rules

4. **Inventory engine**  
   Occupancy validation, placement, moves, equipment transitions, container ownership traversal

5. **Run simulation layer**  
   Timer, bot death schedule, randomized loadout generation, loot source creation, score computation

6. **UI layer**  
   Panels, grids, compartment rendering, drag/drop, timer, results

---

## 10. Locked assumptions and defaults

These are no longer open questions; they are the working v1 baseline:

- React + TypeScript
- Desktop only
- No Health tab
- Original placeholder art only; no copyrighted ABI assets
- Fixed static item values
- No durability-based value scaling
- Rotation enabled
- Irregular item shapes enabled
- Irregular multi-compartment containers enabled
- Worn backpack counts as nesting level 1
- Randomized bot loot from a pool
- Ground loot shown as a persistent panel, not a modal
- Five bot drops at 5-second intervals, ending at 25 seconds
- Hard run cap of 300 seconds
- Linear score deduction per elapsed second; starting balance is 25 points/second
- Perfect-packing maximum-value solver is still to be implemented
- Score counts all secured player inventory/equipment
- Dead bots drop their backpacks as intact loot containers

---

## 11. Remaining blockers

There are **no blocking design questions left** for implementation kickoff.

Deferred content that can be filled in during implementation planning without blocking architecture:

- real catalog rows from Mateus
- real icon set from Mateus
- final numeric tuning for loot values, time penalties, and score thresholds

From a planning standpoint, this is ready to hand off to:

- **Mr. Pink** for the data model, inventory engine, and rules implementation plan
- **Mr. Orange** for the equipment/loot screen UI plan
