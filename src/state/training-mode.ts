import {
  createCatalogIndex,
  type CatalogIndex,
  type ContainerCompartmentDefinition,
  type ContainerLayoutDefinition,
  type EquipmentSlotDefinition,
  type EquipmentSlotId,
  type InventoryOperationFailure,
  type ItemDefinition,
  type ItemInstance,
  type ItemStateDefinition,
  type LootSource,
  type PerfectExtractionItem,
  type Rotation,
  type RuleViolation,
  type ScoreBreakdown,
  type StorageUnit,
  type TrainingRunPlayerAction,
  type TrainingRunState,
} from '../data'
import {
  advanceTrainingRun,
  canRotateItem,
  changeItemState,
  cloneInventoryState,
  createTrainingRunState,
  dropItemToGround,
  equipItemToSlot,
  getScoringElapsedSeconds,
  getStorageUnitForItem,
  isContainerShellDefinition,
  isScorableAsLoot,
  isSupportedRotationV1,
  placeItemInStorage,
  scoreTrainingRun,
} from '../engine'
import { type InventoryOperationResult } from '../data'

const defaultCatalog = createCatalogIndex()
const PLAYER_SECURED_SLOT_ORDER: readonly EquipmentSlotId[] = ['tacticalVest', 'ballisticVest', 'pockets', 'backpack']

const pushPhase = (phaseHistory: readonly string[], phase: string): string[] =>
  phaseHistory.at(-1) === phase ? [...phaseHistory] : [...phaseHistory, phase]

const inventoryActionUnavailableMessage = 'Inventory actions are only available while the run is active.'
const extractUnavailableMessage = 'Extract Now is only available while the run is active.'

const ok = (): TrainingModeActionValidation => ({ ok: true })
const fail = (
  reason: string,
  violations?: readonly RuleViolation[],
): InventoryOperationFailure => ({
  ok: false,
  reason,
  violations,
})

/**
 * UI contract:
 * - selectors return catalog-backed slot/container/item view models only; UI should not invent parallel layouts or rules
 * - nested containers are traversed through `containerStorageUnitId` + `selectStorageUnit`
 * - `validate*` helpers and the reducer share the same engine-backed legality checks
 */
export interface TrainingModeStoreState {
  catalog: CatalogIndex
  run: TrainingRunState
  lastError?: string
  lastViolations?: readonly RuleViolation[]
}

export type TrainingModeActionValidation =
  | { ok: true }
  | InventoryOperationFailure

export type TrainingModeAction =
  | { type: 'BEGIN_RUN'; seed?: number }
  | { type: 'RESOLVE_PERFECT_EXTRACTION'; inventory: TrainingRunState['inventory']; maximumPotentialScore?: number; items?: readonly PerfectExtractionItem[] }
  | { type: 'TICK'; deltaSeconds: number; queuedAction?: TrainingRunPlayerAction }
  | {
      type: 'MOVE_ITEM'
      itemInstanceId: string
      targetStorageUnitId: string
      targetCompartmentId: string
      x: number
      y: number
      rotation?: Rotation
    }
  | {
      type: 'EQUIP_ITEM'
      itemInstanceId: string
      targetSlotId: EquipmentSlotId
    }
  | {
      type: 'UNEQUIP_ITEM'
      itemInstanceId: string
      targetStorageUnitId: string
      targetCompartmentId: string
      x: number
      y: number
      rotation?: Rotation
    }
  | {
      type: 'SET_ITEM_ROTATION'
      itemInstanceId: string
      rotation: Rotation
    }
  | {
      type: 'SET_ITEM_STATE'
      itemInstanceId: string
      targetStateId: string
    }
  | {
      type: 'DROP_ITEM_TO_GROUND'
      itemInstanceId: string
    }
  | { type: 'EXTRACT_NOW' }

export interface TrainingModeItemView {
  itemInstanceId: string
  itemDefinitionId: string
  stateId: string
  name: string
  category: ItemDefinition['category']
  baseValue: number
  tags: readonly string[]
  shapeMask: readonly string[]
  boundingWidth: number
  boundingHeight: number
  rotation: Rotation
  allowRotation: boolean
  allowedEquipmentSlots: readonly EquipmentSlotId[]
  ownerEntityId: string
  currentDurability?: number
  equippedSlotId?: EquipmentSlotId
  parentStorageUnitId?: string
  parentCompartmentId?: string
  gridX?: number
  gridY?: number
  equippable: boolean
  storable: boolean
  uiStateLabel?: string
  containerLayoutId?: string
  containerStorageUnitId?: string
  availableStateIds: readonly string[]
  isHolderShell: boolean
  isScorable: boolean
}

export interface TrainingModeEquipmentSlotView {
  slotId: EquipmentSlotId
  label: string
  slotType: string
  maxItems: number
  acceptsCategories: readonly ItemDefinition['category'][]
  item?: TrainingModeItemView
}

export interface TrainingModeCompartmentView {
  compartmentId: string
  label: string
  originX: number
  originY: number
  shapeMask: readonly string[]
  boundingWidth: number
  boundingHeight: number
  acceptsTags?: readonly string[]
  sortOrder: number
  items: readonly TrainingModeItemView[]
}

export interface TrainingModeStorageUnitView {
  storageUnitId: string
  ownerEntityId: string
  kind: StorageUnit['kind']
  label: string
  layoutId: string
  layoutName: string
  boundingWidth: number
  boundingHeight: number
  sourceItemInstanceId?: string
  sourceItem?: TrainingModeItemView
  compartments: readonly TrainingModeCompartmentView[]
}

export interface TrainingModeLootSourceView {
  lootSourceId: string
  botId: string
  label: string
  spawnedAtSeconds: number
  topLevelItems: readonly TrainingModeItemView[]
}

export interface TrainingModeTimerView {
  durationSeconds: number
  elapsedSeconds: number
  remainingSeconds: number
  scoringElapsedSeconds: number
  currentTimePenaltyPoints: number
  nextBotDeathAtSeconds?: number
  formattedElapsed: string
  formattedRemaining: string
}

export interface TrainingModeStatusView {
  phase: TrainingRunState['phase']
  activePhase?: TrainingRunState['activePhase']
  runEndReason?: TrainingRunState['runEndReason']
  interactionStatus: 'active' | 'inactive'
  isInteractive: boolean
  canBeginRun: boolean
  canExtractNow: boolean
}

export const createTrainingModeStore = (catalog: CatalogIndex = defaultCatalog): TrainingModeStoreState => ({
  catalog,
  run: createTrainingRunState(catalog),
})

export const trainingModeReducer = (
  state: TrainingModeStoreState,
  action: TrainingModeAction,
): TrainingModeStoreState => {
  const catalog = state.catalog

  return applyTrainingModeAction(state, action, catalog)
}

export const applyTrainingModeAction = (
  state: TrainingModeStoreState,
  action: TrainingModeAction,
  catalog: CatalogIndex,
): TrainingModeStoreState => {
  switch (action.type) {
    case 'RESOLVE_PERFECT_EXTRACTION': {
      const perfectExtraction = state.run.perfectExtraction
      if (!perfectExtraction || perfectExtraction.inventory !== action.inventory || perfectExtraction.status !== 'pending') return state
      const maximumPotentialScore = action.maximumPotentialScore
      if (maximumPotentialScore === undefined || !Number.isFinite(maximumPotentialScore) || maximumPotentialScore < 0) {
        return { ...state, run: { ...state.run, perfectExtraction: { ...perfectExtraction, status: 'error' } } }
      }
      return {
        ...state,
        run: {
          ...state.run,
          maximumPotentialScore,
          perfectExtraction: { ...perfectExtraction, status: 'ready', items: action.items ?? [] },
          score: state.run.score
            ? scoreTrainingRun(state.run.inventory, state.run.elapsedSeconds, catalog, maximumPotentialScore)
            : undefined,
        },
      }
    }
    case 'BEGIN_RUN':
      return beginRunReducer(state, action.seed, catalog)
    case 'TICK':
      return tickReducer(state, action.deltaSeconds, action.queuedAction, catalog)
    case 'MOVE_ITEM':
      return reduceInventoryOperation(state, catalog, () =>
        placeItemInStorage(
          state.run.inventory,
          {
            itemInstanceId: action.itemInstanceId,
            targetStorageUnitId: action.targetStorageUnitId,
            targetCompartmentId: action.targetCompartmentId,
            x: action.x,
            y: action.y,
            rotation: action.rotation ?? state.run.inventory.itemInstances[action.itemInstanceId]?.rotation ?? 0,
          },
          catalog,
        ),
      )
    case 'EQUIP_ITEM':
      return equipItemReducer(state, action.itemInstanceId, action.targetSlotId, catalog)
    case 'UNEQUIP_ITEM':
      return reduceInventoryOperation(state, catalog, () =>
        placeItemInStorage(
          state.run.inventory,
          {
            itemInstanceId: action.itemInstanceId,
            targetStorageUnitId: action.targetStorageUnitId,
            targetCompartmentId: action.targetCompartmentId,
            x: action.x,
            y: action.y,
            rotation: action.rotation ?? state.run.inventory.itemInstances[action.itemInstanceId]?.rotation ?? 0,
          },
          catalog,
        ),
      )
    case 'SET_ITEM_ROTATION':
      return reduceInventoryOperation(state, catalog, () =>
        setItemRotationInInventory(state.run.inventory, action.itemInstanceId, action.rotation, catalog),
      )
    case 'SET_ITEM_STATE':
      return reduceInventoryOperation(state, catalog, () =>
        changeItemState(state.run.inventory, action.itemInstanceId, action.targetStateId, catalog),
      )
    case 'DROP_ITEM_TO_GROUND':
      return dropItemToGroundReducer(state, action.itemInstanceId, catalog)
    case 'EXTRACT_NOW':
      return extractNowReducer(state, catalog)
  }
}

export const beginTrainingRun = (
  seed?: number,
): Extract<TrainingModeAction, { type: 'BEGIN_RUN' }> => ({ type: 'BEGIN_RUN', seed })
export const tickTrainingMode = (
  deltaSeconds: number,
  queuedAction?: TrainingRunPlayerAction,
): Extract<TrainingModeAction, { type: 'TICK' }> => ({
  type: 'TICK',
  deltaSeconds,
  queuedAction,
})
export const moveTrainingItem = (
  itemInstanceId: string,
  targetStorageUnitId: string,
  targetCompartmentId: string,
  x: number,
  y: number,
  rotation?: Rotation,
): Extract<TrainingModeAction, { type: 'MOVE_ITEM' }> => ({
  type: 'MOVE_ITEM',
  itemInstanceId,
  targetStorageUnitId,
  targetCompartmentId,
  x,
  y,
  rotation,
})
export const equipTrainingItem = (
  itemInstanceId: string,
  targetSlotId: EquipmentSlotId,
): Extract<TrainingModeAction, { type: 'EQUIP_ITEM' }> => ({
  type: 'EQUIP_ITEM',
  itemInstanceId,
  targetSlotId,
})
export const unequipTrainingItem = (
  itemInstanceId: string,
  targetStorageUnitId: string,
  targetCompartmentId: string,
  x: number,
  y: number,
  rotation?: Rotation,
): Extract<TrainingModeAction, { type: 'UNEQUIP_ITEM' }> => ({
  type: 'UNEQUIP_ITEM',
  itemInstanceId,
  targetStorageUnitId,
  targetCompartmentId,
  x,
  y,
  rotation,
})
export const setTrainingItemRotation = (
  itemInstanceId: string,
  rotation: Rotation,
): Extract<TrainingModeAction, { type: 'SET_ITEM_ROTATION' }> => ({
  type: 'SET_ITEM_ROTATION',
  itemInstanceId,
  rotation,
})
export const setTrainingItemState = (
  itemInstanceId: string,
  targetStateId: string,
): Extract<TrainingModeAction, { type: 'SET_ITEM_STATE' }> => ({
  type: 'SET_ITEM_STATE',
  itemInstanceId,
  targetStateId,
})
export const dropTrainingItemToGround = (
  itemInstanceId: string,
): Extract<TrainingModeAction, { type: 'DROP_ITEM_TO_GROUND' }> => ({
  type: 'DROP_ITEM_TO_GROUND',
  itemInstanceId,
})
export const extractTrainingRunNow = (): Extract<TrainingModeAction, { type: 'EXTRACT_NOW' }> => ({
  type: 'EXTRACT_NOW',
})

export const validateMoveTrainingItem = (
  state: TrainingModeStoreState,
  action: Extract<TrainingModeAction, { type: 'MOVE_ITEM' }>,
  catalog = state.catalog,
): TrainingModeActionValidation =>
  validateInteractiveInventoryOperation(state, () =>
    placeItemInStorage(
      state.run.inventory,
      {
        itemInstanceId: action.itemInstanceId,
        targetStorageUnitId: action.targetStorageUnitId,
        targetCompartmentId: action.targetCompartmentId,
        x: action.x,
        y: action.y,
        rotation: action.rotation ?? state.run.inventory.itemInstances[action.itemInstanceId]?.rotation ?? 0,
      },
      catalog,
    ),
  )

export const validateEquipTrainingItem = (
  state: TrainingModeStoreState,
  action: Extract<TrainingModeAction, { type: 'EQUIP_ITEM' }>,
  catalog = state.catalog,
): TrainingModeActionValidation => {
  const backpackReadyRun = prepareBackpackForEquip(state.run, action.itemInstanceId, action.targetSlotId, catalog)
  if ('ok' in backpackReadyRun) return backpackReadyRun

  return validateInteractiveInventoryOperation(state, () =>
    equipItemToSlot(
      prepareEquipmentReplacement(backpackReadyRun, action.itemInstanceId, action.targetSlotId).inventory,
      action.itemInstanceId,
      action.targetSlotId,
      catalog,
    ),
  )
}

export const validateUnequipTrainingItem = (
  state: TrainingModeStoreState,
  action: Extract<TrainingModeAction, { type: 'UNEQUIP_ITEM' }>,
  catalog = state.catalog,
): TrainingModeActionValidation =>
  validateInteractiveInventoryOperation(state, () =>
    placeItemInStorage(
      state.run.inventory,
      {
        itemInstanceId: action.itemInstanceId,
        targetStorageUnitId: action.targetStorageUnitId,
        targetCompartmentId: action.targetCompartmentId,
        x: action.x,
        y: action.y,
        rotation: action.rotation ?? state.run.inventory.itemInstances[action.itemInstanceId]?.rotation ?? 0,
      },
      catalog,
    ),
  )

export const validateSetTrainingItemRotation = (
  state: TrainingModeStoreState,
  action: Extract<TrainingModeAction, { type: 'SET_ITEM_ROTATION' }>,
  catalog = state.catalog,
): TrainingModeActionValidation =>
  validateInteractiveInventoryOperation(state, () =>
    setItemRotationInInventory(state.run.inventory, action.itemInstanceId, action.rotation, catalog),
  )

export const validateSetTrainingItemState = (
  state: TrainingModeStoreState,
  action: Extract<TrainingModeAction, { type: 'SET_ITEM_STATE' }>,
  catalog = state.catalog,
): TrainingModeActionValidation =>
  validateInteractiveInventoryOperation(state, () =>
    changeItemState(state.run.inventory, action.itemInstanceId, action.targetStateId, catalog),
  )

export const validateDropTrainingItemToGround = (
  state: TrainingModeStoreState,
  action: Extract<TrainingModeAction, { type: 'DROP_ITEM_TO_GROUND' }>,
  catalog = state.catalog,
): TrainingModeActionValidation => {
  void catalog

  if (!isTrainingInteractionActive(state)) {
    return fail(inventoryActionUnavailableMessage)
  }

  return validateDroppablePlayerItem(state.run, action.itemInstanceId)
}

export const validateExtractTrainingRunNow = (
  state: TrainingModeStoreState,
): TrainingModeActionValidation => (isTrainingInteractionActive(state) ? ok() : fail(extractUnavailableMessage))

export const selectTrainingCatalog = (state: TrainingModeStoreState): CatalogIndex => state.catalog

export const selectTrainingStatus = (
  state: TrainingModeStoreState,
): TrainingModeStatusView => ({
  phase: state.run.phase,
  activePhase: state.run.activePhase,
  runEndReason: state.run.runEndReason,
  interactionStatus: state.run.phase === 'RunActive' ? 'active' : 'inactive',
  isInteractive: state.run.phase === 'RunActive',
  canBeginRun: state.run.phase === 'PreRun' || state.run.phase === 'ResultsScreen',
  canExtractNow: state.run.phase === 'RunActive',
})

export const selectTrainingTimer = (
  state: TrainingModeStoreState,
): TrainingModeTimerView => {
  const definition = state.catalog.runDefinitionsById[state.run.definitionId]
  const durationSeconds = definition?.durationSeconds ?? 0
  const elapsedSeconds = Math.min(state.run.elapsedSeconds, durationSeconds)
  const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds)
  const score = scoreTrainingRun(state.run.inventory, elapsedSeconds, state.catalog, state.run.maximumPotentialScore)

  return {
    durationSeconds,
    elapsedSeconds,
    remainingSeconds,
    scoringElapsedSeconds: getScoringElapsedSeconds(elapsedSeconds, state.catalog),
    currentTimePenaltyPoints: score.timePenaltyPoints,
    nextBotDeathAtSeconds: state.run.pendingBotDeaths[0]?.atSeconds,
    formattedElapsed: formatClock(elapsedSeconds),
    formattedRemaining: formatClock(remainingSeconds),
  }
}

export const selectPlayersRemaining = (
  state: TrainingModeStoreState,
): { remaining: number; total: number } => ({
  remaining: state.run.botRoster.filter((entry) => !entry.dropped).length,
  total: state.run.botRoster.length,
})

export const selectCurrentSecuredValue = (state: TrainingModeStoreState): number =>
  scoreTrainingRun(
    state.run.inventory,
    state.run.elapsedSeconds,
    state.catalog,
    state.run.maximumPotentialScore,
  ).grossScore

export const selectProjectedScoreBreakdown = (
  state: TrainingModeStoreState,
): ScoreBreakdown =>
  state.run.score ??
  scoreTrainingRun(
    state.run.inventory,
    state.run.phase === 'ResultsScreen'
      ? getScoringElapsedSeconds(state.run.elapsedSeconds, state.catalog)
      : state.run.elapsedSeconds,
    state.catalog,
    state.run.maximumPotentialScore,
  )

export const selectTrainingResults = (
  state: TrainingModeStoreState,
): ScoreBreakdown | undefined => state.run.score

export const selectEquipmentSlots = (
  state: TrainingModeStoreState,
): readonly TrainingModeEquipmentSlotView[] =>
  state.catalog.equipmentSlots.map((slot) => ({
    ...pickEquipmentSlotView(slot),
    item: state.run.inventory.equipment[slot.id]
      ? buildItemView(state, state.run.inventory.equipment[slot.id]!)
      : undefined,
  }))

export const selectPlayerStorageUnits = (
  state: TrainingModeStoreState,
): readonly TrainingModeStorageUnitView[] =>
  PLAYER_SECURED_SLOT_ORDER.flatMap((slotId) => {
    const itemInstanceId = state.run.inventory.equipment[slotId]
    const storageUnit = itemInstanceId ? getStorageUnitForItem(state.run.inventory, itemInstanceId) : undefined
    return storageUnit ? [buildStorageUnitView(state, storageUnit)] : []
  })

export const selectLootSources = (
  state: TrainingModeStoreState,
): readonly TrainingModeLootSourceView[] =>
  state.run.lootSources.map((lootSource) => buildLootSourceView(state, lootSource))

export const selectLootSourceStorageUnits = (
  state: TrainingModeStoreState,
  lootSourceId: string,
): readonly TrainingModeStorageUnitView[] =>
  (state.run.lootSources.find((lootSource) => lootSource.id === lootSourceId)?.itemIds ?? []).flatMap((itemId) => {
    const item = state.run.inventory.itemInstances[itemId]
    const storageUnit = getStorageUnitForItem(state.run.inventory, itemId)

    return item?.ownerEntityId === lootSourceId && storageUnit?.ownerEntityId === lootSourceId
      ? [buildStorageUnitView(state, storageUnit)]
      : []
  })

export const selectStorageUnit = (
  state: TrainingModeStoreState,
  storageUnitId: string,
): TrainingModeStorageUnitView | undefined => {
  const storageUnit = state.run.inventory.storageUnits[storageUnitId]
  return storageUnit ? buildStorageUnitView(state, storageUnit) : undefined
}

export const selectItem = (
  state: TrainingModeStoreState,
  itemInstanceId: string,
): TrainingModeItemView | undefined => buildItemView(state, itemInstanceId)

export const selectAvailableItemStates = (
  state: TrainingModeStoreState,
  itemInstanceId: string,
): readonly ItemStateDefinition[] => {
  const item = state.run.inventory.itemInstances[itemInstanceId]
  if (!item) {
    return []
  }

  return state.catalog.itemStates.filter((candidate) => candidate.itemDefinitionId === item.itemDefinitionId)
}

export const selectCatalogLayouts = (
  state: TrainingModeStoreState,
): readonly ContainerLayoutDefinition[] => state.catalog.containerLayouts

export const selectOperationFeedback = (
  state: TrainingModeStoreState,
): Pick<TrainingModeStoreState, 'lastError' | 'lastViolations'> => ({
  lastError: state.lastError,
  lastViolations: state.lastViolations,
})

const beginRunReducer = (
  state: TrainingModeStoreState,
  seed: number | undefined,
  catalog: CatalogIndex,
): TrainingModeStoreState => {
  const baseRun = state.run.phase === 'PreRun' ? state.run : createTrainingRunState(catalog)
  const nextRun = advanceTrainingRun(baseRun, { type: 'BEGIN_RUN', seed }, catalog)

  return {
    catalog,
    run: nextRun,
    lastError: undefined,
    lastViolations: undefined,
  }
}

const tickReducer = (
  state: TrainingModeStoreState,
  deltaSeconds: number,
  queuedAction: TrainingRunPlayerAction | undefined,
  catalog: CatalogIndex,
): TrainingModeStoreState => ({
  catalog,
  run: advanceTrainingRun(
    state.run,
    {
      type: 'ADVANCE_TIME',
      deltaSeconds,
      queuedAction,
    },
    catalog,
  ),
  lastError: undefined,
  lastViolations: undefined,
})

const extractNowReducer = (
  state: TrainingModeStoreState,
  catalog: CatalogIndex,
): TrainingModeStoreState => {
  if (!isTrainingInteractionActive(state)) {
    return withFailure(state, catalog, fail(extractUnavailableMessage))
  }

  return {
    catalog,
    run: advanceTrainingRun(state.run, { type: 'EXTRACT_NOW' }, catalog),
    lastError: undefined,
    lastViolations: undefined,
  }
}

const dropItemToGroundReducer = (
  state: TrainingModeStoreState,
  itemInstanceId: string,
  catalog: CatalogIndex,
): TrainingModeStoreState => {
  if (!isTrainingInteractionActive(state)) {
    return withFailure(state, catalog, fail(inventoryActionUnavailableMessage))
  }

  const validation = validateDroppablePlayerItem(state.run, itemInstanceId)
  if (!validation.ok) {
    return withFailure(state, catalog, validation)
  }

  return {
    catalog,
    run: {
      ...dropItemToGround(state.run, itemInstanceId, state.run.elapsedSeconds),
      activePhase: 'PlayerLooting',
      phaseHistory: pushPhase(state.run.phaseHistory, 'RunActive:PlayerLooting'),
    },
    lastError: undefined,
    lastViolations: undefined,
  }
}

const prepareEquipmentReplacement = (
  run: TrainingRunState,
  itemInstanceId: string,
  targetSlotId: EquipmentSlotId,
): TrainingRunState => {
  const currentOccupantId = run.inventory.equipment[targetSlotId]
  if (!currentOccupantId || currentOccupantId === itemInstanceId) return run

  // A face shield is attached to its helmet, so drop it before replacing that helmet.
  const withFaceShieldDropped = targetSlotId === 'helmet' && run.inventory.equipment.helmetFaceShield
    ? dropItemToGround(run, run.inventory.equipment.helmetFaceShield, run.elapsedSeconds)
    : run
  return dropItemToGround(withFaceShieldDropped, currentOccupantId, run.elapsedSeconds)
}

const prepareBackpackForEquip = (
  run: TrainingRunState,
  itemInstanceId: string,
  targetSlotId: EquipmentSlotId,
  catalog: CatalogIndex,
): TrainingRunState | InventoryOperationFailure => {
  if (targetSlotId !== 'backpack') return run

  const item = run.inventory.itemInstances[itemInstanceId]
  const itemState = item && catalog.itemStatesById[item.stateId]
  if (!item || !itemState?.tags.includes('state-collapsed')) return run

  const openState = catalog.itemStates.find(
    (candidate) => candidate.itemDefinitionId === item.itemDefinitionId && candidate.tags.includes('state-open'),
  )
  if (!openState) return run

  const opened = changeItemState(run.inventory, itemInstanceId, openState.id, catalog)
  return opened.ok ? { ...run, inventory: opened.state } : opened
}

const equipItemReducer = (
  state: TrainingModeStoreState,
  itemInstanceId: string,
  targetSlotId: EquipmentSlotId,
  catalog: CatalogIndex,
): TrainingModeStoreState => {
  if (!isTrainingInteractionActive(state)) {
    return withFailure(state, catalog, fail(inventoryActionUnavailableMessage))
  }

  const backpackReadyRun = prepareBackpackForEquip(state.run, itemInstanceId, targetSlotId, catalog)
  if ('ok' in backpackReadyRun) return withFailure(state, catalog, backpackReadyRun)

  const replacementReadyRun = prepareEquipmentReplacement(backpackReadyRun, itemInstanceId, targetSlotId)
  const result = equipItemToSlot(replacementReadyRun.inventory, itemInstanceId, targetSlotId, catalog)
  if (!result.ok) return withFailure(state, catalog, result)

  return {
    catalog,
    run: {
      ...replacementReadyRun,
      inventory: result.state,
      activePhase: 'PlayerLooting',
      phaseHistory: pushPhase(replacementReadyRun.phaseHistory, 'RunActive:PlayerLooting'),
    },
    lastError: undefined,
    lastViolations: undefined,
  }
}

const reduceInventoryOperation = (
  state: TrainingModeStoreState,
  catalog: CatalogIndex,
  runOperation: () => InventoryOperationResult,
): TrainingModeStoreState => {
  if (!isTrainingInteractionActive(state)) {
    return withFailure(state, catalog, fail(inventoryActionUnavailableMessage))
  }

  const result = runOperation()
  if (!result.ok) {
    return withFailure(state, catalog, result)
  }

  return {
    catalog,
    run: {
      ...state.run,
      inventory: result.state,
      activePhase: 'PlayerLooting',
      phaseHistory: pushPhase(state.run.phaseHistory, 'RunActive:PlayerLooting'),
    },
    lastError: undefined,
    lastViolations: undefined,
  }
}

const validateInteractiveInventoryOperation = (
  state: TrainingModeStoreState,
  runOperation: () => InventoryOperationResult,
): TrainingModeActionValidation => {
  if (!isTrainingInteractionActive(state)) {
    return fail(inventoryActionUnavailableMessage)
  }

  const result = runOperation()
  return result.ok ? ok() : result
}

const setItemRotationInInventory = (
  inventory: TrainingRunState['inventory'],
  itemInstanceId: string,
  rotation: Rotation,
  catalog: CatalogIndex,
): InventoryOperationResult => {
  const item = inventory.itemInstances[itemInstanceId]
  if (!item) {
    return fail(`Unknown item instance "${itemInstanceId}".`)
  }

  const definition = catalog.itemDefinitionsById[item.itemDefinitionId]
  const itemState = catalog.itemStatesById[item.stateId]
  if (!definition || !itemState) {
    return fail(`Unknown item definition "${item.itemDefinitionId}".`)
  }

  if (!isSupportedRotationV1(rotation)) {
    return fail('Only 0° and 90° rotations are supported in v1.')
  }

  if (!canRotateItem(definition, itemState) && rotation !== 0) {
    return fail(`Item "${definition.name}" cannot be rotated.`)
  }

  if (
    item.parentStorageUnitId &&
    item.parentCompartmentId &&
    item.gridX !== undefined &&
    item.gridY !== undefined
  ) {
    return placeItemInStorage(
      inventory,
      {
        itemInstanceId,
        targetStorageUnitId: item.parentStorageUnitId,
        targetCompartmentId: item.parentCompartmentId,
        x: item.gridX,
        y: item.gridY,
        rotation,
      },
      catalog,
    )
  }

  const nextInventory = cloneInventoryState(inventory)
  nextInventory.itemInstances[itemInstanceId] = {
    ...nextInventory.itemInstances[itemInstanceId]!,
    rotation,
  }

  return {
    ok: true,
    state: nextInventory,
  }
}

const validateDroppablePlayerItem = (
  run: TrainingRunState,
  itemInstanceId: string,
): TrainingModeActionValidation => {
  const item = run.inventory.itemInstances[itemInstanceId]

  if (!item) {
    return fail(`Unknown item instance "${itemInstanceId}".`)
  }

  if (item.ownerEntityId !== 'player') {
    return fail('Only items currently owned by the player can be dropped to the ground.')
  }

  if (item.equippedSlotId === undefined && item.parentStorageUnitId === undefined) {
    return fail('Only equipped items or items stored in player inventory can be dropped to the ground.')
  }

  return ok()
}

const withFailure = (
  state: TrainingModeStoreState,
  catalog: CatalogIndex,
  failure: InventoryOperationFailure,
): TrainingModeStoreState => ({
  catalog,
  run: state.run,
  lastError: failure.reason,
  lastViolations: failure.violations,
})

const buildLootSourceView = (
  state: TrainingModeStoreState,
  lootSource: LootSource,
): TrainingModeLootSourceView => ({
  lootSourceId: lootSource.id,
  botId: lootSource.botId,
  label: lootSource.label,
  spawnedAtSeconds: lootSource.spawnedAtSeconds,
  topLevelItems: lootSource.itemIds.flatMap((itemId) => {
    if (state.run.inventory.itemInstances[itemId]?.ownerEntityId !== lootSource.id) {
      return []
    }

    const item = buildItemView(state, itemId)
    return item ? [item] : []
  }),
})

const buildStorageUnitView = (
  state: TrainingModeStoreState,
  storageUnit: StorageUnit,
): TrainingModeStorageUnitView => {
  const layout = state.catalog.layoutsById[storageUnit.layoutId]
  const sourceItem = storageUnit.itemInstanceId ? buildItemView(state, storageUnit.itemInstanceId) : undefined

  return {
    storageUnitId: storageUnit.id,
    ownerEntityId: storageUnit.ownerEntityId,
    kind: storageUnit.kind,
    label: storageUnit.label,
    layoutId: storageUnit.layoutId,
    layoutName: layout?.name ?? storageUnit.layoutId,
    boundingWidth: layout?.boundingWidth ?? 0,
    boundingHeight: layout?.boundingHeight ?? 0,
    sourceItemInstanceId: storageUnit.itemInstanceId,
    sourceItem,
    compartments: getLayoutCompartments(state, layout).map((compartment) =>
      buildCompartmentView(state, storageUnit, compartment),
    ),
  }
}

const buildCompartmentView = (
  state: TrainingModeStoreState,
  storageUnit: StorageUnit,
  compartment: ContainerCompartmentDefinition,
): TrainingModeCompartmentView => ({
  compartmentId: compartment.id,
  label: compartment.label,
  originX: compartment.originX,
  originY: compartment.originY,
  shapeMask: compartment.shapeMask,
  boundingWidth: compartment.boundingWidth,
  boundingHeight: compartment.boundingHeight,
  acceptsTags: compartment.acceptsTags,
  sortOrder: compartment.sortOrder,
  items: Object.values(state.run.inventory.itemInstances)
    .filter(
      (item) =>
        item.parentStorageUnitId === storageUnit.id &&
        item.parentCompartmentId === compartment.id,
    )
    .sort(compareItemsForUi)
    .flatMap((item) => {
      const itemView = buildItemView(state, item.id)
      return itemView ? [itemView] : []
    }),
})

const buildItemView = (
  state: TrainingModeStoreState,
  itemInstanceId: string,
): TrainingModeItemView | undefined => {
  const item = state.run.inventory.itemInstances[itemInstanceId]
  if (!item) {
    return undefined
  }

  const definition = state.catalog.itemDefinitionsById[item.itemDefinitionId]
  const itemState = state.catalog.itemStatesById[item.stateId]
  if (!definition || !itemState) {
    return undefined
  }

  const storageUnit = getStorageUnitForItem(state.run.inventory, itemInstanceId)
  const availableStateIds = state.catalog.itemStates
    .filter((candidate) => candidate.itemDefinitionId === definition.id)
    .map((candidate) => candidate.id)

  return {
    itemInstanceId: item.id,
    itemDefinitionId: definition.id,
    stateId: item.stateId,
    name: definition.name,
    category: definition.category,
    baseValue: definition.baseValue,
    tags: definition.tags,
    shapeMask: itemState.shapeMask,
    boundingWidth: itemState.boundingWidth,
    boundingHeight: itemState.boundingHeight,
    rotation: item.rotation,
    allowRotation: canRotateItem(definition, itemState),
    allowedEquipmentSlots: definition.allowedEquipmentSlots,
    ownerEntityId: item.ownerEntityId,
    currentDurability: item.currentDurability,
    equippedSlotId: item.equippedSlotId,
    parentStorageUnitId: item.parentStorageUnitId,
    parentCompartmentId: item.parentCompartmentId,
    gridX: item.gridX,
    gridY: item.gridY,
    equippable: itemState.equippable,
    storable: itemState.storable,
    uiStateLabel: itemState.uiLabel,
    containerLayoutId: itemState.containerLayoutId,
    containerStorageUnitId: storageUnit?.id,
    availableStateIds,
    isHolderShell: isContainerShellDefinition(definition, state.catalog),
    isScorable: isScorableAsLoot(item, state.catalog),
  }
}

const getLayoutCompartments = (
  state: TrainingModeStoreState,
  layout: ContainerLayoutDefinition | undefined,
): readonly ContainerCompartmentDefinition[] =>
  !layout
    ? []
    : layout.compartmentIds
        .map((compartmentId) => state.catalog.compartmentsById[compartmentId])
        .filter((compartment): compartment is ContainerCompartmentDefinition => Boolean(compartment))
        .sort((left, right) => left.sortOrder - right.sortOrder)

const pickEquipmentSlotView = (
  slot: EquipmentSlotDefinition,
): Omit<TrainingModeEquipmentSlotView, 'item'> => ({
  slotId: slot.id,
  label: slot.label,
  slotType: slot.slotType,
  maxItems: slot.maxItems,
  acceptsCategories: slot.acceptsCategories,
})

const compareItemsForUi = (left: ItemInstance, right: ItemInstance): number =>
  (left.gridY ?? 0) - (right.gridY ?? 0) ||
  (left.gridX ?? 0) - (right.gridX ?? 0) ||
  left.id.localeCompare(right.id)

const isTrainingInteractionActive = (state: TrainingModeStoreState): boolean =>
  selectTrainingStatus(state).interactionStatus === 'active'

const formatClock = (seconds: number): string => {
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}
