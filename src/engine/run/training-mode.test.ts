import { describe, expect, it } from 'vitest'
import { type CatalogIndex } from '../../data'
import { abiCompartmentId, abiDefinitionId, abiPlacement, createAbiTestCatalog } from '../../test-utils/abi-fixtures'
import {
  addItemInstance,
  createEmptyInventoryState,
  createItemInstance as createCatalogItemInstance,
  equipItemToSlot,
  getChildItems,
  getStorageUnitForItem,
  placeItemInStorage as placeCatalogItemInStorage,
} from '../inventory'
import {
  PLAYER_DROP_LOOT_SOURCE_ID,
  advanceTrainingRun,
  createTrainingRunState,
  dropItemToGround,
  getTimePenaltyPoints,
  scoreTrainingRun,
} from './index'

const catalog = createAbiTestCatalog()
const createItemInstance: typeof createCatalogItemInstance = (id, index, options) =>
  createCatalogItemInstance(abiDefinitionId(id), index, options)
const placeItemInStorage: typeof placeCatalogItemInStorage = (state, options, index) => {
  const position = abiPlacement(options.targetCompartmentId, options.x, options.y)
  return placeCatalogItemInStorage(state, { ...options, ...position, targetCompartmentId: abiCompartmentId(options.targetCompartmentId) }, index)
}
const advanceToElapsed = (state: ReturnType<typeof createTrainingRunState>, elapsedSeconds: number) =>
  advanceTrainingRun(state, { type: 'ADVANCE_TIME', deltaSeconds: elapsedSeconds - state.elapsedSeconds }, catalog)
const createStartedRun = () => advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed: 7 }, catalog)
const createStartedRunWithPlayerDropFixtures = () => {
  const started = createStartedRun()
  let inventory = started.inventory
  const items = [
    createItemInstance('backpack-split', catalog, { id: 'player-backpack', ownerEntityId: 'player' }),
    createItemInstance('weapon-pistol-service', catalog, { id: 'player-pistol', ownerEntityId: 'player' }),
    createItemInstance('ammo-556-box', catalog, { id: 'player-backpack-item-0', ownerEntityId: 'player' }),
    createItemInstance('consumable-ration', catalog, { id: 'player-backpack-item-1', ownerEntityId: 'player' }),
  ]

  inventory = items.reduce((nextState, item) => addItemInstance(nextState, item, catalog), inventory)
  inventory = expectSuccessfulEquip(inventory, 'player-backpack', 'backpack')
  inventory = expectSuccessfulEquip(inventory, 'player-pistol', 'pistol')

  const backpackStorage = getStorageUnitForItem(inventory, 'player-backpack')
  inventory = expectSuccessfulPlacement(inventory, {
    itemInstanceId: 'player-backpack-item-0',
    targetStorageUnitId: backpackStorage!.id,
    targetCompartmentId: 'bp-example-top',
    x: 0,
    y: 0,
  })
  inventory = expectSuccessfulPlacement(inventory, {
    itemInstanceId: 'player-backpack-item-1',
    targetStorageUnitId: backpackStorage!.id,
    targetCompartmentId: 'bp-example-right',
    x: 0,
    y: 0,
  })

  return {
    ...started,
    inventory,
  }
}

const expectSuccessfulEquip = (
  state: ReturnType<typeof createEmptyInventoryState>,
  itemInstanceId: string,
  slotId: Parameters<typeof equipItemToSlot>[2],
) => {
  const result = equipItemToSlot(state, itemInstanceId, slotId, catalog)
  expect(result.ok).toBe(true)
  return result.ok ? result.state : state
}

const expectSuccessfulPlacement = (
  state: ReturnType<typeof createEmptyInventoryState>,
  options: Parameters<typeof placeItemInStorage>[1],
) => {
  const result = placeItemInStorage(state, options, catalog)
  expect(result.ok).toBe(true)
  return result.ok ? result.state : state
}

const createFixedGrossScoreInventory = () => {
  let inventory = createEmptyInventoryState(catalog)
  const pockets = createItemInstance('pockets-standard', catalog, { id: 'score-pockets', ownerEntityId: 'player' })
  const ration = createItemInstance('consumable-ration', catalog, { id: 'score-ration', ownerEntityId: 'player' })
  const ammo = createItemInstance('ammo-556-box', catalog, { id: 'score-ammo', ownerEntityId: 'player' })
  inventory = [pockets, ration, ammo].reduce((nextState, item) => addItemInstance(nextState, item, catalog), inventory)
  inventory = expectSuccessfulEquip(inventory, pockets.id, 'pockets')
  const pocketsStorage = getStorageUnitForItem(inventory, pockets.id)
  inventory = expectSuccessfulPlacement(inventory, {
    itemInstanceId: ration.id,
    targetStorageUnitId: pocketsStorage!.id,
    targetCompartmentId: 'pockets-main',
    x: 0,
    y: 0,
  })
  inventory = expectSuccessfulPlacement(inventory, {
    itemInstanceId: ammo.id,
    targetStorageUnitId: pocketsStorage!.id,
    targetCompartmentId: 'pockets-main',
    x: 1,
    y: 0,
  })
  return inventory
}

describe('training mode run state machine', () => {
  it('progresses through load, bot deaths, and scoring on the locked schedule', () => {
    const started = advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed: 7 }, catalog)

    expect(started.phase).toBe('RunActive')
    expect(started.activePhase).toBe('PlayerLooting')
    expect(started.pendingBotDeaths).toHaveLength(4)
    expect(started.lootSources).toHaveLength(1)

    const afterFirstDrop = advanceToElapsed(started, 10)
    expect(afterFirstDrop.lootSources).toHaveLength(2)
    expect(afterFirstDrop.activePhase).toBe('PlayerLooting')
    expect(afterFirstDrop.phaseHistory).toContain('RunActive:SpawnLootDrop')

    const afterAllDrops = advanceToElapsed(afterFirstDrop, 40)
    expect(afterAllDrops.lootSources).toHaveLength(5)

    const finished = advanceToElapsed(afterAllDrops, 300)
    expect(finished.phase).toBe('ResultsScreen')
    expect(finished.runEndReason).toBe('time-cap')
    expect(finished.score?.scoringElapsedSeconds).toBe(300)
    expect(finished.phaseHistory.slice(-3)).toEqual(['RunEnd', 'ScoreRun', 'ResultsScreen'])
  })

  it('supports Extract Now and locks scoring time immediately', () => {
    const started = advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed: 7 }, catalog)
    const advanced = advanceTrainingRun(started, { type: 'ADVANCE_TIME', deltaSeconds: 180.9 }, catalog)
    const extracted = advanceTrainingRun(advanced, { type: 'EXTRACT_NOW' }, catalog)

    expect(extracted.phase).toBe('ResultsScreen')
    expect(extracted.runEndReason).toBe('extract')
    expect(extracted.score?.scoringElapsedSeconds).toBe(180)
    expect(extracted.lootSources).toHaveLength(5)
  })

  it('preserves all generated loot for optimization even when extracting early', () => {
    const started = createStartedRun()
    const afterFirstDrop = advanceToElapsed(started, 5)
    const extracted = advanceTrainingRun(afterFirstDrop, { type: 'EXTRACT_NOW' }, catalog)

    expect(afterFirstDrop.botRoster.filter((entry) => !entry.dropped)).toHaveLength(4)
    expect(started.maximumPotentialScore).toBe(0)
    expect(started.runEndReason).toBeUndefined()
    expect(started.perfectExtraction?.status).toBe('pending')
    expect(started.perfectExtraction?.inventory).toBe(started.inventory)
    expect(extracted.perfectExtraction?.inventory).toBe(started.inventory)
    expect(extracted.score?.starRating).toBe(0)
  })

  it('starts runs with equipped empty pockets and zero secured score', () => {
    const started = createStartedRun()

    expect(started.inventory.equipment.pockets).toBeDefined()
    expect(
      Object.values(started.inventory.itemInstances).filter((item) => item.ownerEntityId === 'player'),
    ).toHaveLength(1)
    expect(scoreTrainingRun(started.inventory, 0, catalog)).toMatchObject({
      grossScore: 0,
      finalScore: 0,
      starRating: 0,
    })
  })

  it('fires the first bot death at zero, then the remaining deaths on schedule', () => {
    let state = advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed: 7 }, catalog)
    expect(state.lootSources).toHaveLength(1)

    const checkpoints = [
      { before: 9.999, exact: 10, totalLootSources: 2, botId: 'bot-2' },
      { before: 19.999, exact: 20, totalLootSources: 3, botId: 'bot-3' },
      { before: 29.999, exact: 30, totalLootSources: 4, botId: 'bot-4' },
      { before: 39.999, exact: 40, totalLootSources: 5, botId: 'bot-5' },
    ] as const

    for (const checkpoint of checkpoints) {
      state = advanceToElapsed(state, checkpoint.before)
      expect(state.lootSources).toHaveLength(checkpoint.totalLootSources - 1)

      state = advanceToElapsed(state, checkpoint.exact)
      expect(state.lootSources).toHaveLength(checkpoint.totalLootSources)
      expect(state.lootSources.at(-1)).toMatchObject({
        botId: checkpoint.botId,
        spawnedAtSeconds: checkpoint.exact,
      })
    }

    expect(state.pendingBotDeaths).toEqual([])
  })

  it('ends exactly at the 300-second hard cap with no grace period beyond it', () => {
    const started = advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed: 7 }, catalog)
    const beforeCap = advanceToElapsed(started, 299.9)

    expect(beforeCap.phase).toBe('RunActive')
    expect(beforeCap.runEndReason).toBeUndefined()

    const atCap = advanceToElapsed(beforeCap, 300)
    expect(atCap.phase).toBe('ResultsScreen')
    expect(atCap.runEndReason).toBe('time-cap')
    expect(atCap.score?.scoringElapsedSeconds).toBe(300)

    const beyondCap = advanceTrainingRun(atCap, { type: 'ADVANCE_TIME', deltaSeconds: 1 }, catalog)
    expect(beyondCap).toEqual(atCap)
  })

  it('applies no penalty for the first minute and scales it to gross score', () => {
    expect(getTimePenaltyPoints(0, 1000, catalog)).toBe(0)
    expect(getTimePenaltyPoints(60, 1000, catalog)).toBe(0)
    expect(getTimePenaltyPoints(165, 1000, catalog)).toBe(437)
    expect(getTimePenaltyPoints(300, 1000, catalog)).toBe(1000)
    expect(getTimePenaltyPoints(301, 1000, catalog)).toBe(1000)
  })

  it('uses the grace period when an active run has an older catalog definition', () => {
    const legacyCatalog = {
      ...catalog,
      runDefinitionsById: {
        ...catalog.runDefinitionsById,
        'training-mode-v1': {
          ...catalog.runDefinitionsById['training-mode-v1'],
          timePenaltyGracePeriodSeconds: undefined,
        },
      },
    } as unknown as CatalogIndex

    expect(getTimePenaltyPoints(45, 1000, legacyCatalog)).toBe(0)
  })

  it('resolves a queued Extract Now action before a same-tick bot death', () => {
    const started = advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed: 7 }, catalog)
    const beforeFirstDrop = advanceTrainingRun(started, { type: 'ADVANCE_TIME', deltaSeconds: 9 }, catalog)
    expect(beforeFirstDrop.lootSources).toHaveLength(1)

    const extractedOnDeathTick = advanceTrainingRun(
      beforeFirstDrop,
      { type: 'ADVANCE_TIME', deltaSeconds: 1, queuedAction: { type: 'EXTRACT_NOW' } },
      catalog,
    )

    expect(extractedOnDeathTick.phase).toBe('ResultsScreen')
    expect(extractedOnDeathTick.runEndReason).toBe('extract')
    expect(extractedOnDeathTick.lootSources).toHaveLength(1)
    expect(extractedOnDeathTick.lootSources[0]?.botId).toBe('bot-1')
    expect(extractedOnDeathTick.phaseHistory).toContain('RunActive:ExtractNow')
  })

  it('scores secured loot items but excludes holder container shells themselves', () => {
    let inventory = createEmptyInventoryState(catalog)
    const pockets = createItemInstance('pockets-standard', catalog, { id: 'pockets', ownerEntityId: 'player' })
    const backpack = createItemInstance('backpack-split', catalog, { id: 'backpack', ownerEntityId: 'player' })
    const pistol = createItemInstance('weapon-pistol-service', catalog, { id: 'pistol', ownerEntityId: 'player' })
    const ammo = createItemInstance('ammo-556-box', catalog, { id: 'ammo', ownerEntityId: 'player' })
    inventory = [pockets, backpack, pistol, ammo].reduce(
      (nextState, item) => addItemInstance(nextState, item, catalog),
      inventory,
    )

    const equippedPockets = equipItemToSlot(inventory, pockets.id, 'pockets', catalog)
    expect(equippedPockets.ok).toBe(true)
    const equippedBackpack = equipItemToSlot(equippedPockets.ok ? equippedPockets.state : inventory, backpack.id, 'backpack', catalog)
    expect(equippedBackpack.ok).toBe(true)
    const equippedPistol = equipItemToSlot(equippedBackpack.ok ? equippedBackpack.state : inventory, pistol.id, 'pistol', catalog)
    expect(equippedPistol.ok).toBe(true)

    const backpackStorage = getStorageUnitForItem(equippedPistol.ok ? equippedPistol.state : inventory, backpack.id)
    const placedAmmo = placeItemInStorage(
      equippedPistol.ok ? equippedPistol.state : inventory,
      {
        itemInstanceId: ammo.id,
        targetStorageUnitId: backpackStorage!.id,
        targetCompartmentId: 'bp-example-top',
        x: 0,
        y: 0,
      },
      catalog,
    )
    expect(placedAmmo.ok).toBe(true)

    const score = scoreTrainingRun(placedAmmo.ok ? placedAmmo.state : inventory, 120, catalog)
    expect(score.grossScore).toBe(
      catalog.itemDefinitionsById['abi-pistol_001']!.baseValue + catalog.itemDefinitionsById['abi-food_001']!.baseValue,
    )
  })

  it('scores every secured region, including nested secured containers, rather than only backpack contents', () => {
    let inventory = createEmptyInventoryState(catalog)
    const items = [
      createItemInstance('pockets-standard', catalog, { id: 'pockets', ownerEntityId: 'player' }),
      createItemInstance('vest-tactical-rig', catalog, { id: 'tactical', ownerEntityId: 'player' }),
      createItemInstance('vest-ballistic-compact', catalog, { id: 'ballistic', ownerEntityId: 'player' }),
      createItemInstance('backpack-split', catalog, { id: 'backpack', ownerEntityId: 'player' }),
      createItemInstance('backpack-split', catalog, { id: 'nested-backpack', ownerEntityId: 'player' }),
      createItemInstance('helmet-assault', catalog, { id: 'helmet', ownerEntityId: 'player' }),
      createItemInstance('weapon-pistol-service', catalog, { id: 'pistol', ownerEntityId: 'player' }),
      createItemInstance('ammo-556-box', catalog, { id: 'pocket-ammo', ownerEntityId: 'player' }),
      createItemInstance('consumable-ration', catalog, { id: 'tactical-ration', ownerEntityId: 'player' }),
      createItemInstance('misc-radio', catalog, { id: 'ballistic-radio', ownerEntityId: 'player' }),
      createItemInstance('ammo-556-box', catalog, { id: 'backpack-ammo', ownerEntityId: 'player' }),
      createItemInstance('medkit-field', catalog, { id: 'nested-medkit', ownerEntityId: 'player' }),
    ]
    inventory = items.reduce((nextState, item) => addItemInstance(nextState, item, catalog), inventory)

    inventory = expectSuccessfulEquip(inventory, 'pockets', 'pockets')
    inventory = expectSuccessfulEquip(inventory, 'tactical', 'tacticalVest')
    inventory = expectSuccessfulEquip(inventory, 'ballistic', 'ballisticVest')
    inventory = expectSuccessfulEquip(inventory, 'backpack', 'backpack')
    inventory = expectSuccessfulEquip(inventory, 'helmet', 'helmet')
    inventory = expectSuccessfulEquip(inventory, 'pistol', 'pistol')

    const pocketsStorage = getStorageUnitForItem(inventory, 'pockets')
    const tacticalStorage = getStorageUnitForItem(inventory, 'tactical')
    const ballisticStorage = getStorageUnitForItem(inventory, 'ballistic')
    const backpackStorage = getStorageUnitForItem(inventory, 'backpack')

    inventory = expectSuccessfulPlacement(inventory, {
      itemInstanceId: 'pocket-ammo',
      targetStorageUnitId: pocketsStorage!.id,
      targetCompartmentId: 'pockets-main',
      x: 0,
      y: 0,
    })
    inventory = expectSuccessfulPlacement(inventory, {
      itemInstanceId: 'tactical-ration',
      targetStorageUnitId: tacticalStorage!.id,
      targetCompartmentId: 'tactical-center',
      x: 0,
      y: 0,
    })
    inventory = expectSuccessfulPlacement(inventory, {
      itemInstanceId: 'ballistic-radio',
      targetStorageUnitId: ballisticStorage!.id,
      targetCompartmentId: 'ballistic-vest-main',
      x: 0,
      y: 0,
    })
    inventory = expectSuccessfulPlacement(inventory, {
      itemInstanceId: 'backpack-ammo',
      targetStorageUnitId: backpackStorage!.id,
      targetCompartmentId: 'bp-example-top',
      x: 0,
      y: 0,
    })
    inventory = expectSuccessfulPlacement(inventory, {
      itemInstanceId: 'nested-backpack',
      targetStorageUnitId: backpackStorage!.id,
      targetCompartmentId: 'bp-example-center',
      x: 0,
      y: 0,
    })

    const nestedBackpackStorage = getStorageUnitForItem(inventory, 'nested-backpack')
    inventory = expectSuccessfulPlacement(inventory, {
      itemInstanceId: 'nested-medkit',
      targetStorageUnitId: nestedBackpackStorage!.id,
      targetCompartmentId: 'bp-example-top',
      x: 0,
      y: 0,
    })

    const score = scoreTrainingRun(inventory, 120, catalog)
    expect(score.grossScore).toBeGreaterThan(0)
    expect(score.finalScore).toBe(score.grossScore - Math.floor((score.grossScore * 60) / 240))
  })

  it('does not count uncollected ground loot toward the final score', () => {
    const started = advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed: 7 }, catalog)
    const afterFirstDrop = advanceToElapsed(started, 5)

    expect(afterFirstDrop.lootSources).toHaveLength(1)

    const scoreBeforeDrop = scoreTrainingRun(started.inventory, 120, catalog)
    const scoreWithGroundLootPresent = scoreTrainingRun(afterFirstDrop.inventory, 120, catalog)

    expect(scoreWithGroundLootPresent).toMatchObject(scoreBeforeDrop)
  })

  it('does not count loose player-owned items unless they are actually secured in equipment or secured storage', () => {
    let inventory = createEmptyInventoryState(catalog)
    const looseRadio = createItemInstance('misc-radio', catalog, { id: 'loose-radio', ownerEntityId: 'player' })
    inventory = addItemInstance(inventory, looseRadio, catalog)

    const score = scoreTrainingRun(inventory, 120, catalog)
    expect(score.grossScore).toBe(0)
  })

  it('subtracts a gross-score percentage after the grace period and reaches zero at the cap', () => {
    const inventory = createFixedGrossScoreInventory()

    const cases = [0, 1, 60, 61, 165, 300, 450] as const
    const grossScore = scoreTrainingRun(inventory, 0, catalog).grossScore

    for (const elapsedSeconds of cases) {
      const score = scoreTrainingRun(inventory, elapsedSeconds, catalog)
      const penalty = getTimePenaltyPoints(elapsedSeconds, grossScore, catalog)
      expect(score.grossScore).toBe(grossScore)
      expect(score.timePenaltyPoints).toBe(penalty)
      expect(score.finalScore).toBe(grossScore - penalty)
    }

    expect(scoreTrainingRun(inventory, 0, catalog, grossScore).starRating).toBe(5)
    expect(scoreTrainingRun(inventory, 0, catalog, grossScore * 2).starRating).toBe(2)
  })

  it('uses floored elapsed time and caps the penalty at the five-minute round limit', () => {
    const expectedPenaltyByElapsedSecond = new Map([
      [60, 0],
      [61, 5],
      [165, 612],
      [299, 1394],
      [300, 1400],
      [301, 1400],
    ])

    for (const [elapsedSeconds, penaltyPoints] of expectedPenaltyByElapsedSecond) {
      expect(getTimePenaltyPoints(elapsedSeconds, 1400, catalog)).toBe(penaltyPoints)
    }
  })

  it('floors non-integer elapsed time before calculating the point penalty', () => {
    const cases = [
      { elapsedSeconds: 0.1, flooredSeconds: 0, penaltyPoints: 0 },
      { elapsedSeconds: 1.9, flooredSeconds: 1, penaltyPoints: 0 },
      { elapsedSeconds: 60.9, flooredSeconds: 60, penaltyPoints: 0 },
      { elapsedSeconds: 61.9, flooredSeconds: 61 },
      { elapsedSeconds: 165.9, flooredSeconds: 165 },
      { elapsedSeconds: 300.9, flooredSeconds: 300 },
    ] as const

    for (const testCase of cases) {
      const score = scoreTrainingRun(createFixedGrossScoreInventory(), testCase.elapsedSeconds, catalog)
      expect(score.scoringElapsedSeconds).toBe(testCase.flooredSeconds)
      expect(score.timePenaltyPoints).toBe(getTimePenaltyPoints(testCase.flooredSeconds, score.grossScore, catalog))
    }
  })

  it('drops a bot backpack as an empty lootable unit without fixed placements', () => {
    const started = advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed: 7 }, catalog)
    const afterFirstDrop = advanceToElapsed(started, 5)
    const lootSource = afterFirstDrop.lootSources[0]!
    const droppedBackpackId = lootSource.itemIds.find(
      (itemId) => afterFirstDrop.inventory.itemInstances[itemId]?.itemDefinitionId === 'abi-backpack_001',
    )

    expect(droppedBackpackId).toBeDefined()

    const droppedBackpackStorage = getStorageUnitForItem(afterFirstDrop.inventory, droppedBackpackId!)
    const nestedChildren = getChildItems(afterFirstDrop.inventory, droppedBackpackStorage!.id)

    expect(nestedChildren).toEqual([])
    expect(lootSource.itemIds).toContain(droppedBackpackId!)
  })

  it('drops a weapon and a backpack or tactical vest for every bot', () => {
    const started = createStartedRun()
    const afterAllDrops = advanceToElapsed(started, 40)
    const weaponCategories = new Set(['weapon_primary', 'weapon_secondary', 'weapon_pistol'])

    expect(afterAllDrops.lootSources).toHaveLength(5)
    for (const lootSource of afterAllDrops.lootSources) {
      const categories = lootSource.itemIds.map((itemId) => {
        const item = afterAllDrops.inventory.itemInstances[itemId]
        return item ? catalog.itemDefinitionsById[item.itemDefinitionId]?.category : undefined
      })

      expect(categories.some((category) => category !== undefined && weaponCategories.has(category))).toBe(true)
      expect(categories.some((category) => category === 'backpack' || category === 'vest_tactical')).toBe(true)
    }
  })

  it('limits every bot super drop to fifteen items', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const started = advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed }, catalog)
      const afterAllDrops = advanceTrainingRun(started, { type: 'ADVANCE_TIME', deltaSeconds: 600 }, catalog)

      expect(afterAllDrops.lootSources).not.toHaveLength(0)
      expect(afterAllDrops.lootSources.every((source) => source.itemIds.length <= 15)).toBe(true)
    }
  })

  it('drops an equipped player item into the reusable ground pile', () => {
    const started = createStartedRunWithPlayerDropFixtures()

    const dropped = dropItemToGround(started, 'player-pistol', 12)
    const lootSource = dropped.lootSources.find((source) => source.id === PLAYER_DROP_LOOT_SOURCE_ID)

    expect(lootSource).toMatchObject({
      id: PLAYER_DROP_LOOT_SOURCE_ID,
      botId: 'player-drop',
      label: 'Dropped Gear',
      spawnedAtSeconds: 12,
      itemIds: ['player-pistol'],
    })
    expect(dropped.inventory.itemInstances['player-pistol']).toMatchObject({
      ownerEntityId: PLAYER_DROP_LOOT_SOURCE_ID,
      equippedSlotId: undefined,
      parentStorageUnitId: undefined,
      parentCompartmentId: undefined,
      gridX: undefined,
      gridY: undefined,
    })
    expect(dropped.inventory.equipment.pistol).toBeNull()
  })

  it('drops a stored player item into ground loot without flattening it into a new container', () => {
    const started = createStartedRunWithPlayerDropFixtures()
    const backpackStorage = getStorageUnitForItem(started.inventory, 'player-backpack')

    const dropped = dropItemToGround(started, 'player-backpack-item-0', 18)

    expect(dropped.lootSources.find((source) => source.id === PLAYER_DROP_LOOT_SOURCE_ID)?.itemIds).toEqual([
      'player-backpack-item-0',
    ])
    expect(dropped.inventory.itemInstances['player-backpack-item-0']).toMatchObject({
      ownerEntityId: PLAYER_DROP_LOOT_SOURCE_ID,
      equippedSlotId: undefined,
      parentStorageUnitId: undefined,
      parentCompartmentId: undefined,
      gridX: undefined,
      gridY: undefined,
    })
    expect(getChildItems(dropped.inventory, backpackStorage!.id).map((child) => child.id)).toEqual(['player-backpack-item-1'])
  })

  it('drops a loaded player backpack with its nested contents still attached and ground-owned', () => {
    const started = createStartedRunWithPlayerDropFixtures()

    const dropped = dropItemToGround(started, 'player-backpack', 24)
    const droppedBackpackStorage = getStorageUnitForItem(dropped.inventory, 'player-backpack')
    const nestedChildren = getChildItems(dropped.inventory, droppedBackpackStorage!.id)

    expect(dropped.lootSources.find((source) => source.id === PLAYER_DROP_LOOT_SOURCE_ID)?.itemIds).toEqual([
      'player-backpack',
    ])
    expect(dropped.inventory.itemInstances['player-backpack']).toMatchObject({
      ownerEntityId: PLAYER_DROP_LOOT_SOURCE_ID,
      equippedSlotId: undefined,
      parentStorageUnitId: undefined,
      parentCompartmentId: undefined,
      gridX: undefined,
      gridY: undefined,
    })
    expect(dropped.inventory.equipment.backpack).toBeNull()
    expect(nestedChildren.map((child) => child.id).sort()).toEqual(['player-backpack-item-0', 'player-backpack-item-1'])
    nestedChildren.forEach((child) => {
      expect(child.ownerEntityId).toBe(PLAYER_DROP_LOOT_SOURCE_ID)
      expect(child.parentStorageUnitId).toBe(droppedBackpackStorage!.id)
    })
  })

  it('appends repeated player drops into the same reusable ground pile', () => {
    const started = createStartedRunWithPlayerDropFixtures()

    const afterFirstDrop = dropItemToGround(started, 'player-pistol', 5)
    const afterSecondDrop = dropItemToGround(afterFirstDrop, 'player-backpack-item-0', 30)
    const playerDropSources = afterSecondDrop.lootSources.filter((source) => source.id === PLAYER_DROP_LOOT_SOURCE_ID)

    expect(playerDropSources).toHaveLength(1)
    expect(playerDropSources[0]).toMatchObject({
      spawnedAtSeconds: 5,
      itemIds: ['player-pistol', 'player-backpack-item-0'],
    })
  })

  it('counts nested contents only when their container chain ends in player-owned secured storage', () => {
    let inventory = createEmptyInventoryState(catalog)
    const playerBackpack = createItemInstance('backpack-split', catalog, { id: 'player-backpack', ownerEntityId: 'player' })
    const nestedPlayerBackpack = createItemInstance('backpack-split', catalog, {
      id: 'nested-player-backpack',
      ownerEntityId: 'player',
    })
    const playerAmmo = createItemInstance('ammo-556-box', catalog, { id: 'player-ammo', ownerEntityId: 'player' })
    const groundBackpack = createItemInstance('backpack-split', catalog, { id: 'ground-backpack', ownerEntityId: 'loot-source-1' })
    const groundAmmo = createItemInstance('ammo-556-box', catalog, { id: 'ground-ammo', ownerEntityId: 'loot-source-1' })
    inventory = [playerBackpack, nestedPlayerBackpack, playerAmmo, groundBackpack, groundAmmo].reduce(
      (nextState, item) => addItemInstance(nextState, item, catalog),
      inventory,
    )

    inventory = expectSuccessfulEquip(inventory, playerBackpack.id, 'backpack')
    const playerBackpackStorage = getStorageUnitForItem(inventory, playerBackpack.id)
    inventory = expectSuccessfulPlacement(inventory, {
      itemInstanceId: nestedPlayerBackpack.id,
      targetStorageUnitId: playerBackpackStorage!.id,
      targetCompartmentId: 'bp-example-center',
      x: 0,
      y: 0,
    })

    const nestedPlayerBackpackStorage = getStorageUnitForItem(inventory, nestedPlayerBackpack.id)
    inventory = expectSuccessfulPlacement(inventory, {
      itemInstanceId: playerAmmo.id,
      targetStorageUnitId: nestedPlayerBackpackStorage!.id,
      targetCompartmentId: 'bp-example-top',
      x: 0,
      y: 0,
    })

    const groundBackpackStorage = getStorageUnitForItem(inventory, groundBackpack.id)
    inventory = expectSuccessfulPlacement(inventory, {
      itemInstanceId: groundAmmo.id,
      targetStorageUnitId: groundBackpackStorage!.id,
      targetCompartmentId: 'bp-example-top',
      x: 0,
      y: 0,
    })

    const score = scoreTrainingRun(inventory, 120, catalog)
    expect(score.grossScore).toBe(catalog.itemDefinitionsById['abi-food_001']!.baseValue)
  })

  it('keeps multiple loot drops alive simultaneously for the entire run when the player ignores them', () => {
    const started = advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed: 7 }, catalog)
    const afterFourthDrop = advanceToElapsed(started, 30)

    expect(afterFourthDrop.lootSources.map((source) => source.botId)).toEqual(['bot-1', 'bot-2', 'bot-3', 'bot-4'])

    const afterAllDrops = advanceToElapsed(afterFourthDrop, 40)
    expect(afterAllDrops.lootSources.map((source) => source.botId)).toEqual([
      'bot-1',
      'bot-2',
      'bot-3',
      'bot-4',
      'bot-5',
    ])

    const finished = advanceToElapsed(afterAllDrops, 300)
    expect(finished.lootSources.map((source) => source.botId)).toEqual([
      'bot-1',
      'bot-2',
      'bot-3',
      'bot-4',
      'bot-5',
    ])
  })

  it('does not seed dropped backpacks with fixed contents', () => {
    const started = advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed: 7 }, catalog)
    const afterFirstDrop = advanceTrainingRun(started, { type: 'ADVANCE_TIME', deltaSeconds: 5 }, catalog)
    const droppedBackpackId = afterFirstDrop.lootSources[0]?.itemIds.find((itemId) =>
      afterFirstDrop.inventory.itemInstances[itemId]?.itemDefinitionId === 'abi-backpack_001',
    )

    expect(droppedBackpackId).toBeDefined()
    const droppedBackpackStorage = getStorageUnitForItem(afterFirstDrop.inventory, droppedBackpackId!)
    expect(droppedBackpackStorage).toBeDefined()
    expect(getChildItems(afterFirstDrop.inventory, droppedBackpackStorage!.id)).toEqual([])
  })
})
