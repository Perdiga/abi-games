import {
  createCatalogIndex,
  playerStarterLoadout,
  TRAINING_TIME_PENALTY_GRACE_PERIOD_SECONDS,
  trainingBotLoadoutPool,
  type BotLoadoutTemplate,
  type BotRosterEntry,
  type CatalogIndex,
  type EquipmentSlotId,
  type InventoryState,
  type LootSource,
  type ScoreBreakdown,
  type TrainingRunEvent,
  type TrainingRunPlayerAction,
  type TrainingRunState,
} from '../../data'
import {
  addItemInstance,
  cloneInventoryState,
  collectSecuredScorableItemIds,
  createEmptyInventoryState,
  createItemInstance,
  equipItemToSlot,
  getChildItems,
  getStorageUnitForItem,
} from '../inventory'

const defaultCatalog = createCatalogIndex()
const MAX_BOT_DROP_ITEMS = 15
const MIN_RANDOM_BOT_LOOT_ITEMS = 3

const createSeededRng = (seed: number) => {
  let value = seed >>> 0

  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

const pushPhase = (phaseHistory: string[], phase: string): string[] =>
  phaseHistory.at(-1) === phase ? phaseHistory : [...phaseHistory, phase]

export const PLAYER_DROP_LOOT_SOURCE_ID = 'loot-source-player-drop'

export const createTrainingRunState = (catalog: CatalogIndex = defaultCatalog): TrainingRunState => ({
  definitionId: 'training-mode-v1',
  phase: 'PreRun',
  elapsedSeconds: 0,
  maximumPotentialScore: 0,
  inventory: createEmptyInventoryState(catalog),
  botRoster: [],
  pendingBotDeaths: [],
  lootSources: [],
  phaseHistory: ['PreRun'],
})

export const advanceTrainingRun = (
  state: TrainingRunState,
  event: TrainingRunEvent,
  catalog: CatalogIndex = defaultCatalog,
): TrainingRunState => {
  switch (event.type) {
    case 'BEGIN_RUN':
      if (state.phase !== 'PreRun') {
        return state
      }

      // Resolve drops scheduled for second zero as part of starting the run.
      {
        const startedRun = advanceRunTime(loadRunData(state, catalog, event.seed), 0, catalog)
        return {
          ...startedRun,
          perfectExtraction: startedRun.perfectExtraction
            ? { ...startedRun.perfectExtraction, inventory: startedRun.inventory }
            : undefined,
        }
      }
    case 'ADVANCE_TIME':
      return event.deltaSeconds <= 0 ? state : advanceRunTime(state, event.deltaSeconds, catalog, event.queuedAction)
    case 'EXTRACT_NOW':
      return resolvePlayerAction(state, event, catalog)
  }
}

export const getScoringElapsedSeconds = (
  elapsedSeconds: number,
  catalog: CatalogIndex = defaultCatalog,
): number => Math.min(catalog.runDefinitionsById['training-mode-v1'].durationSeconds, Math.max(0, Math.floor(elapsedSeconds)))

export const getTimePenaltyPoints = (
  elapsedSeconds: number,
  grossScore: number,
  catalog: CatalogIndex = defaultCatalog,
): number => {
  const definition = catalog.runDefinitionsById['training-mode-v1']
  const scoringElapsedSeconds = getScoringElapsedSeconds(elapsedSeconds, catalog)
  const gracePeriodSeconds = Math.min(
    definition.durationSeconds,
    definition.timePenaltyGracePeriodSeconds ?? TRAINING_TIME_PENALTY_GRACE_PERIOD_SECONDS,
  )
  const penaltyWindowSeconds = definition.durationSeconds - gracePeriodSeconds

  if (penaltyWindowSeconds <= 0 || grossScore <= 0) {
    return 0
  }

  const penalizedSeconds = Math.max(0, scoringElapsedSeconds - gracePeriodSeconds)
  return Math.floor((grossScore * penalizedSeconds) / penaltyWindowSeconds)
}

export const scoreTrainingRun = (
  inventory: InventoryState,
  elapsedSeconds: number,
  catalog: CatalogIndex = defaultCatalog,
  maximumPotentialScore?: number,
): ScoreBreakdown => {
  const grossScore = collectSecuredScorableItemIds(inventory, catalog).reduce((score, itemId) => {
    const item = inventory.itemInstances[itemId]
    const definition = item ? catalog.itemDefinitionsById[item.itemDefinitionId] : undefined
    return score + (definition?.baseValue ?? 0)
  }, 0)
  const extractionMaximum = Math.max(grossScore, maximumPotentialScore ?? grossScore)
  const scoringElapsedSeconds = getScoringElapsedSeconds(elapsedSeconds, catalog)
  const timePenaltyPoints = getTimePenaltyPoints(scoringElapsedSeconds, grossScore, catalog)
  const finalScore = Math.max(0, grossScore - timePenaltyPoints)
  const starRating =
    extractionMaximum > 0 ? Math.min(5, Math.floor((grossScore * 5) / extractionMaximum)) : 0

  return {
    grossScore,
    maximumPotentialScore: extractionMaximum,
    starRating,
    elapsedSeconds,
    scoringElapsedSeconds,
    timePenaltyPoints,
    finalScore,
  }
}

const loadRunData = (
  state: TrainingRunState,
  catalog: CatalogIndex,
  seed = Date.now(),
): TrainingRunState => {
  const definition = catalog.runDefinitionsById[state.definitionId]
  const rng = createSeededRng(seed)
  let inventory = createEmptyInventoryState(catalog)
  const playerLoadout = seedLoadout(inventory, playerStarterLoadout, 'player', catalog, 'player')
  inventory = playerLoadout.inventory

  const botRoster: BotRosterEntry[] = []

  definition.botDeathSchedule.forEach((_, index) => {
    const botId = `bot-${index + 1}`
    const template = createRandomBotLoadout(catalog, rng, botId)
    const seeded = seedLoadout(inventory, template, botId, catalog, botId)
    inventory = seeded.inventory
    botRoster.push({ botId, topLevelItemIds: seeded.topLevelItemIds, dropped: false })
  })

  return {
    ...state,
    phase: 'RunActive',
    activePhase: 'AwaitNextBotDeath',
    inventory,
    maximumPotentialScore: 0,
    perfectExtraction: { inventory, status: 'pending' },
    botRoster,
    pendingBotDeaths: definition.botDeathSchedule.map((atSeconds, index) => ({
      botId: `bot-${index + 1}`,
      atSeconds,
    })),
    lootSources: [],
    phaseHistory: ['PreRun', 'LoadRunData', 'RunActive:AwaitNextBotDeath'],
  }
}

const createRandomBotLoadout = (
  catalog: CatalogIndex,
  rng: () => number,
  botId: string,
): BotLoadoutTemplate => {
  const backpackDefinitionId =
    trainingBotLoadoutPool[0]?.equipment.backpack ??
    catalog.itemDefinitions.find((definition) => definition.category === 'backpack')?.id
  const availableDefinitionIds = catalog.itemDefinitions.map((definition) => definition.id)
  const loot: string[] = []

  if (backpackDefinitionId) {
    availableDefinitionIds.splice(availableDefinitionIds.indexOf(backpackDefinitionId), 1)
  }

  const weaponDefinitionIds = availableDefinitionIds.filter((itemDefinitionId) => {
    const category = catalog.itemDefinitionsById[itemDefinitionId]?.category
    return category === 'weapon_primary' || category === 'weapon_secondary' || category === 'weapon_pistol'
  })
  if (weaponDefinitionIds.length > 0) {
    const weaponDefinitionId = weaponDefinitionIds[Math.floor(rng() * weaponDefinitionIds.length)]!
    availableDefinitionIds.splice(availableDefinitionIds.indexOf(weaponDefinitionId), 1)
    loot.push(weaponDefinitionId)
  }

  const equippedItemCount = backpackDefinitionId ? 1 : 0
  const maximumLootItems = Math.min(MAX_BOT_DROP_ITEMS - equippedItemCount, availableDefinitionIds.length + loot.length)
  const minimumLootItems = Math.min(MIN_RANDOM_BOT_LOOT_ITEMS, maximumLootItems)
  const itemCount = minimumLootItems + Math.floor(rng() * (maximumLootItems - minimumLootItems + 1))

  while (loot.length < itemCount) {
    const itemIndex = Math.floor(rng() * availableDefinitionIds.length)
    loot.push(availableDefinitionIds.splice(itemIndex, 1)[0]!)
  }

  return {
    id: `random-${botId}`,
    equipment: backpackDefinitionId ? { backpack: backpackDefinitionId } : {},
    loot,
  }
}

const advanceRunTime = (
  state: TrainingRunState,
  deltaSeconds: number,
  catalog: CatalogIndex,
  queuedAction?: TrainingRunPlayerAction,
): TrainingRunState => {
  if (state.phase !== 'RunActive') {
    return state
  }

  const definition = catalog.runDefinitionsById[state.definitionId]
  const nextElapsed = Math.min(definition.durationSeconds, state.elapsedSeconds + deltaSeconds)
  let nextState: TrainingRunState = {
    ...state,
    elapsedSeconds: nextElapsed,
    activePhase: 'AwaitNextBotDeath',
    phaseHistory: pushPhase(state.phaseHistory, 'RunActive:AwaitNextBotDeath'),
  }

  if (queuedAction) {
    nextState = resolvePlayerAction(nextState, queuedAction, catalog)
    if (nextState.phase !== 'RunActive') {
      return nextState
    }
  }

  while (nextState.pendingBotDeaths[0] && nextState.pendingBotDeaths[0]!.atSeconds <= nextElapsed) {
    nextState = spawnLootDrop(nextState, nextState.pendingBotDeaths[0]!.botId)
  }

  if (nextElapsed >= definition.durationSeconds) {
    return finalizeRun(nextState, 'time-cap', definition.durationSeconds, catalog)
  }

  return nextState
}

const resolvePlayerAction = (
  state: TrainingRunState,
  action: TrainingRunPlayerAction,
  catalog: CatalogIndex,
): TrainingRunState => {
  if (state.phase !== 'RunActive') {
    return state
  }

  switch (action.type) {
    case 'EXTRACT_NOW':
      return finalizeRun(
        {
          ...state,
          activePhase: 'ExtractNow',
          phaseHistory: pushPhase(state.phaseHistory, 'RunActive:ExtractNow'),
        },
        'extract',
        state.elapsedSeconds,
        catalog,
      )
  }
}

const finalizeRun = (
  state: TrainingRunState,
  runEndReason: 'extract' | 'time-cap',
  scoringElapsedSeconds: number,
  catalog: CatalogIndex,
): TrainingRunState => {
  const score = scoreTrainingRun(state.inventory, scoringElapsedSeconds, catalog, state.maximumPotentialScore)

  return {
    ...state,
    phase: 'ResultsScreen',
    activePhase: undefined,
    runEndReason,
    score,
    phaseHistory: [...state.phaseHistory, 'RunEnd', 'ScoreRun', 'ResultsScreen'],
  }
}

const spawnLootDrop = (state: TrainingRunState, botId: string): TrainingRunState => {
  const rosterEntry = state.botRoster.find((entry) => entry.botId === botId)

  if (!rosterEntry || rosterEntry.dropped) {
    return state
  }

  const inventory = cloneInventoryState(state.inventory)
  const lootSourceId = `loot-source-${botId}`
  const droppedItemIds: string[] = []
  const spawnedAtSeconds = state.pendingBotDeaths[0]?.atSeconds ?? state.elapsedSeconds

  for (const itemId of rosterEntry.topLevelItemIds) {
    const item = inventory.itemInstances[itemId]

    if (!item) {
      continue
    }

    droppedItemIds.push(itemId)
    inventory.itemInstances[itemId] = {
      ...item,
      ownerEntityId: lootSourceId,
      equippedSlotId: undefined,
      parentStorageUnitId: undefined,
      parentCompartmentId: undefined,
      gridX: undefined,
      gridY: undefined,
    }
    reassignSubtreeOwners(inventory, itemId, lootSourceId)
  }

  const lootSource: LootSource = {
    id: lootSourceId,
    botId,
    label: `Loot from ${botId}`,
    spawnedAtSeconds,
    itemIds: droppedItemIds,
  }

  return {
    ...state,
    inventory,
    lootSources: [...state.lootSources, lootSource],
    botRoster: state.botRoster.map((entry) => (entry.botId === botId ? { ...entry, dropped: true } : entry)),
    pendingBotDeaths: state.pendingBotDeaths.slice(1),
    activePhase: 'PlayerLooting',
    phaseHistory: pushPhase(pushPhase(state.phaseHistory, 'RunActive:SpawnLootDrop'), 'RunActive:PlayerLooting'),
  }
}

export const dropItemToGround = (
  state: TrainingRunState,
  itemInstanceId: string,
  currentElapsedSeconds: number,
): TrainingRunState => {
  const item = state.inventory.itemInstances[itemInstanceId]

  if (
    !item ||
    item.ownerEntityId !== 'player' ||
    (item.equippedSlotId === undefined && item.parentStorageUnitId === undefined)
  ) {
    return state
  }

  const inventory = cloneInventoryState(state.inventory)
  const previousEquippedSlotId = item.equippedSlotId
  inventory.itemInstances[itemInstanceId] = {
    ...inventory.itemInstances[itemInstanceId]!,
    ownerEntityId: PLAYER_DROP_LOOT_SOURCE_ID,
    equippedSlotId: undefined,
    parentStorageUnitId: undefined,
    parentCompartmentId: undefined,
    gridX: undefined,
    gridY: undefined,
  }
  if (previousEquippedSlotId) {
    inventory.equipment[previousEquippedSlotId] = null
  }
  reassignSubtreeOwners(inventory, itemInstanceId, PLAYER_DROP_LOOT_SOURCE_ID)

  const existingLootSource = state.lootSources.find((lootSource) => lootSource.id === PLAYER_DROP_LOOT_SOURCE_ID)
  const lootSources = existingLootSource
    ? state.lootSources.map((lootSource) =>
        lootSource.id === PLAYER_DROP_LOOT_SOURCE_ID
          ? { ...lootSource, itemIds: [...lootSource.itemIds, itemInstanceId] }
          : lootSource,
      )
    : [
        ...state.lootSources,
        {
          id: PLAYER_DROP_LOOT_SOURCE_ID,
          botId: 'player-drop',
          label: 'Dropped Gear',
          spawnedAtSeconds: currentElapsedSeconds,
          itemIds: [itemInstanceId],
        },
      ]

  return {
    ...state,
    inventory,
    lootSources,
  }
}

const reassignSubtreeOwners = (inventory: InventoryState, itemInstanceId: string, ownerEntityId: string): void => {
  const item = inventory.itemInstances[itemInstanceId]

  if (!item) {
    return
  }

  inventory.itemInstances[itemInstanceId] = { ...item, ownerEntityId }
  const storageUnit = getStorageUnitForItem(inventory, itemInstanceId)

  if (storageUnit) {
    inventory.storageUnits[storageUnit.id] = { ...storageUnit, ownerEntityId }
    getChildItems(inventory, storageUnit.id).forEach((child) => reassignSubtreeOwners(inventory, child.id, ownerEntityId))
  }
}

const seedLoadout = (
  startingInventory: InventoryState,
  template: {
    equipment: Partial<Record<EquipmentSlotId, string>>
    loot?: readonly string[]
  },
  ownerEntityId: string,
  catalog: CatalogIndex,
  idPrefix: string,
): { inventory: InventoryState; topLevelItemIds: string[] } => {
  let inventory = startingInventory
  const topLevelItemIds: string[] = []
  for (const [slotId, definitionId] of Object.entries(template.equipment) as Array<[EquipmentSlotId, string]>) {
    const item = createItemInstance(definitionId, catalog, {
      id: `${idPrefix}-${slotId}`,
      ownerEntityId,
    })
    inventory = addItemInstance(inventory, item, catalog)
    topLevelItemIds.push(item.id)
    if (ownerEntityId !== 'player') {
      continue
    }

    const equipped = equipItemToSlot(inventory, item.id, slotId, catalog)

    if (equipped.ok) {
      inventory = equipped.state
    }
  }

  template.loot?.forEach((definitionId, index) => {
    const item = createItemInstance(definitionId, catalog, {
      id: `${idPrefix}-loot-${index}`,
      ownerEntityId,
    })
    inventory = addItemInstance(inventory, item, catalog)
    topLevelItemIds.push(item.id)
  })

  return { inventory, topLevelItemIds }
}
