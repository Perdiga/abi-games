import {
  createCatalogIndex,
  type CatalogIndex,
  type EquipmentSlotId,
  type InventoryAction,
  type InventoryOperationFailure,
  type InventoryOperationResult,
  type InventoryState,
  type ItemDefinition,
  type ItemInstance,
  type ItemStateDefinition,
  type Rotation,
  type StorageUnit,
} from '../../data'
import { isSupportedRotationV1, validatePlacement, type CellCoordinate } from '../geometry'
import { evaluateRules } from '../rules'

let generatedItemInstanceCounter = 0

const defaultCatalog = createCatalogIndex()

const fail = (reason: string, violations?: InventoryOperationFailure['violations']): InventoryOperationFailure => ({
  ok: false,
  reason,
  violations,
})

export const canRotateItem = (definition: ItemDefinition, itemState: ItemStateDefinition): boolean =>
  definition.allowRotation ||
  (definition.category === 'backpack' && itemState.tags.includes('state-collapsed'))

export const createEmptyInventoryState = (catalog: CatalogIndex = defaultCatalog): InventoryState => ({
  itemInstances: {},
  storageUnits: {},
  equipment: Object.fromEntries(catalog.equipmentSlots.map((slot) => [slot.id, null])),
  rootStorageUnitIds: [],
})

export const cloneInventoryState = (state: InventoryState): InventoryState => ({
  itemInstances: Object.fromEntries(Object.entries(state.itemInstances).map(([id, item]) => [id, { ...item }])),
  storageUnits: Object.fromEntries(Object.entries(state.storageUnits).map(([id, unit]) => [id, { ...unit }])),
  equipment: { ...state.equipment },
  rootStorageUnitIds: [...state.rootStorageUnitIds],
  lastError: state.lastError,
})

export const createVirtualStorageUnit = ({
  id,
  ownerEntityId,
  layoutId,
  label,
}: {
  id: string
  ownerEntityId: string
  layoutId: string
  label: string
}): StorageUnit => ({
  id,
  ownerEntityId,
  layoutId,
  label,
  kind: 'virtual',
})

export const createItemInstance = (
  definitionId: string,
  catalog: CatalogIndex = defaultCatalog,
  overrides: Partial<ItemInstance> = {},
): ItemInstance => {
  const definition = requireDefinition(definitionId, catalog)

  return {
    id: overrides.id ?? `${definitionId}-instance-${generatedItemInstanceCounter++}`,
    itemDefinitionId: definition.id,
    stateId: overrides.stateId ?? definition.defaultStateId,
    rotation: overrides.rotation ?? 0,
    ownerEntityId: overrides.ownerEntityId ?? 'unassigned',
    currentDurability: overrides.currentDurability ?? definition.maxDurability,
    parentStorageUnitId: overrides.parentStorageUnitId,
    parentCompartmentId: overrides.parentCompartmentId,
    gridX: overrides.gridX,
    gridY: overrides.gridY,
    equippedSlotId: overrides.equippedSlotId,
  }
}

export const addStorageUnit = (state: InventoryState, storageUnit: StorageUnit, isRoot = false): InventoryState => {
  const nextState = cloneInventoryState(state)
  nextState.storageUnits[storageUnit.id] = { ...storageUnit }

  if (isRoot && !nextState.rootStorageUnitIds.includes(storageUnit.id)) {
    nextState.rootStorageUnitIds.push(storageUnit.id)
  }

  return nextState
}

export const addItemInstance = (
  state: InventoryState,
  item: ItemInstance,
  catalog: CatalogIndex = defaultCatalog,
): InventoryState => {
  const nextState = cloneInventoryState(state)
  nextState.itemInstances[item.id] = { ...item }
  ensureStorageUnitForItem(nextState, item.id, catalog)
  return nextState
}

export const equipItemToSlot = (
  state: InventoryState,
  itemInstanceId: string,
  targetSlotId: EquipmentSlotId,
  catalog: CatalogIndex = defaultCatalog,
): InventoryOperationResult => validateAndApplyAction(state, { type: 'equip', itemInstanceId, targetSlotId }, catalog)

export const placeItemInStorage = (
  state: InventoryState,
  options: {
    itemInstanceId: string
    targetStorageUnitId: string
    targetCompartmentId: string
    x: number
    y: number
    rotation?: Rotation
  },
  catalog: CatalogIndex = defaultCatalog,
): InventoryOperationResult =>
  validateAndApplyAction(
    state,
    {
      type: 'move',
      itemInstanceId: options.itemInstanceId,
      targetStorageUnitId: options.targetStorageUnitId,
      targetCompartmentId: options.targetCompartmentId,
      x: options.x,
      y: options.y,
      rotation: options.rotation ?? 0,
    },
    catalog,
  )

export const changeItemState = (
  state: InventoryState,
  itemInstanceId: string,
  targetStateId: string,
  catalog: CatalogIndex = defaultCatalog,
): InventoryOperationResult =>
  validateAndApplyAction(state, { type: 'change-state', itemInstanceId, targetStateId }, catalog)

export const getStorageUnitForItem = (state: InventoryState, itemInstanceId: string): StorageUnit | undefined =>
  Object.values(state.storageUnits).find((storageUnit) => storageUnit.itemInstanceId === itemInstanceId)

export const getChildItems = (state: InventoryState, storageUnitId: string): ItemInstance[] =>
  Object.values(state.itemInstances)
    .filter((item) => item.parentStorageUnitId === storageUnitId)
    .sort((left, right) => left.id.localeCompare(right.id))

export const getContainedItemIdsDeep = (state: InventoryState, itemInstanceId: string): string[] => {
  const storageUnit = getStorageUnitForItem(state, itemInstanceId)

  if (!storageUnit) {
    return []
  }

  const descendants: string[] = []

  for (const child of getChildItems(state, storageUnit.id)) {
    descendants.push(child.id)
    descendants.push(...getContainedItemIdsDeep(state, child.id))
  }

  return descendants
}

export const getProjectedBackpackDepth = (
  state: InventoryState,
  catalog: CatalogIndex,
  itemInstanceId: string,
  action: InventoryAction,
): number => {
  const definition = getItemDefinitionForInstance(state, catalog, itemInstanceId)

  if (!definition || definition.category !== 'backpack') {
    return 0
  }

  if (action.type === 'equip') {
    return 1
  }

  if (action.type !== 'move') {
    return getCurrentBackpackDepth(state, catalog, itemInstanceId)
  }

  const targetStorageUnit = state.storageUnits[action.targetStorageUnitId]

  if (!targetStorageUnit?.itemInstanceId) {
    return 1
  }

  const parentDefinition = getItemDefinitionForInstance(state, catalog, targetStorageUnit.itemInstanceId)
  return parentDefinition?.category === 'backpack'
    ? getCurrentBackpackDepth(state, catalog, targetStorageUnit.itemInstanceId) + 1
    : 1
}

export const getCurrentBackpackDepth = (
  state: InventoryState,
  catalog: CatalogIndex,
  itemInstanceId: string,
): number => {
  const definition = getItemDefinitionForInstance(state, catalog, itemInstanceId)

  if (!definition || definition.category !== 'backpack') {
    return 0
  }

  const item = state.itemInstances[itemInstanceId]

  if (!item) {
    return 0
  }

  if (!item.parentStorageUnitId) {
    return 1
  }

  const parentStorageUnit = state.storageUnits[item.parentStorageUnitId]

  if (!parentStorageUnit?.itemInstanceId) {
    return 1
  }

  const parentDefinition = getItemDefinitionForInstance(state, catalog, parentStorageUnit.itemInstanceId)
  return parentDefinition?.category === 'backpack'
    ? getCurrentBackpackDepth(state, catalog, parentStorageUnit.itemInstanceId) + 1
    : 1
}

export const isContainerShellDefinition = (
  definition: ItemDefinition,
  catalog: CatalogIndex = defaultCatalog,
): boolean =>
  definition.tags.includes('holder-shell') ||
  Object.values(catalog.itemStatesById).some(
    (stateDefinition) =>
      stateDefinition.itemDefinitionId === definition.id && stateDefinition.containerLayoutId !== undefined,
  )

export const isContainerShellItem = (
  item: ItemInstance,
  catalog: CatalogIndex = defaultCatalog,
): boolean => {
  const definition = catalog.itemDefinitionsById[item.itemDefinitionId]
  return Boolean(definition && isContainerShellDefinition(definition, catalog))
}

export const isScorableAsLoot = (item: ItemInstance, catalog: CatalogIndex = defaultCatalog): boolean =>
  !isContainerShellItem(item, catalog)

export const collectSecuredItemIds = (state: InventoryState, ownerEntityId = 'player'): string[] =>
  Array.from(collectSecuredItemIdSet(state, ownerEntityId)).sort()

export const collectSecuredScorableItemIds = (state: InventoryState, catalog: CatalogIndex = defaultCatalog): string[] =>
  collectSecuredItemIds(state, 'player').filter((itemId) => {
    const item = state.itemInstances[itemId]
    return Boolean(item && isScorableAsLoot(item, catalog))
  })

export const transferItemOwnership = (
  state: InventoryState,
  itemInstanceId: string,
  ownerEntityId: string,
): InventoryState => {
  const nextState = cloneInventoryState(state)
  assignOwnerRecursively(nextState, itemInstanceId, ownerEntityId)
  return nextState
}

const validateAndApplyAction = (
  state: InventoryState,
  action: InventoryAction,
  catalog: CatalogIndex,
): InventoryOperationResult => {
  const item = state.itemInstances[action.itemInstanceId]

  if (!item) {
    return fail(`Unknown item instance "${action.itemInstanceId}".`)
  }

  const violations = evaluateRules(action, createRuleContext(state, catalog))

  if (violations.length > 0) {
    return fail(violations[0]!.message, violations)
  }

  switch (action.type) {
    case 'equip':
      return applyEquip(state, action.itemInstanceId, action.targetSlotId, catalog)
    case 'move':
      return applyMove(state, action, catalog)
    case 'change-state':
      return applyStateChange(state, action.itemInstanceId, action.targetStateId, catalog)
  }
}

const applyEquip = (
  state: InventoryState,
  itemInstanceId: string,
  targetSlotId: EquipmentSlotId,
  catalog: CatalogIndex,
): InventoryOperationResult => {
  const item = state.itemInstances[itemInstanceId]
  const definition = getItemDefinitionForInstance(state, catalog, itemInstanceId)

  if (!item || !definition) {
    return fail(`Unknown item instance "${itemInstanceId}".`)
  }

  const slot = catalog.equipmentSlotsById[targetSlotId]

  if (!slot.acceptsCategories.includes(definition.category)) {
    return fail(`Slot "${targetSlotId}" does not accept category "${definition.category}".`)
  }

  const currentOccupant = state.equipment[targetSlotId]

  if (currentOccupant && currentOccupant !== itemInstanceId) {
    return fail(`Slot "${targetSlotId}" is already occupied.`)
  }

  const nextState = cloneInventoryState(state)
  detachItem(nextState, itemInstanceId)
  nextState.itemInstances[itemInstanceId] = {
    ...nextState.itemInstances[itemInstanceId]!,
    ownerEntityId: 'player',
    equippedSlotId: targetSlotId,
  }
  nextState.equipment[targetSlotId] = itemInstanceId
  assignOwnerRecursively(nextState, itemInstanceId, 'player')
  return { ok: true, state: nextState }
}

const applyMove = (
  state: InventoryState,
  action: Extract<InventoryAction, { type: 'move' }>,
  catalog: CatalogIndex,
): InventoryOperationResult => {
  const item = state.itemInstances[action.itemInstanceId]
  const definition = getItemDefinitionForInstance(state, catalog, action.itemInstanceId)
  const itemState = item ? catalog.itemStatesById[item.stateId] : undefined
  const targetStorageUnit = state.storageUnits[action.targetStorageUnitId]
  const targetCompartment = catalog.compartmentsById[action.targetCompartmentId]

  if (!item || !definition || !itemState) {
    return fail(`Unknown item instance "${action.itemInstanceId}".`)
  }

  if (item.equippedSlotId === 'helmet' && state.equipment.helmetFaceShield) {
    return fail('Remove the face shield before removing its compatible helmet.')
  }

  if (!targetStorageUnit) {
    return fail(`Unknown target storage "${action.targetStorageUnitId}".`)
  }

  if (targetStorageUnit.itemInstanceId) {
    const targetContainer = state.itemInstances[targetStorageUnit.itemInstanceId]
    const targetContainerState = targetContainer ? catalog.itemStatesById[targetContainer.stateId] : undefined

    if (!targetContainerState?.containerLayoutId || targetContainerState.containerLayoutId !== targetStorageUnit.layoutId) {
      return fail('Open the target rig or backpack before placing items inside it.')
    }
  }

  if (!targetCompartment || targetCompartment.layoutId !== targetStorageUnit.layoutId) {
    return fail('That compartment does not belong to the selected container.')
  }

  if (!isSupportedRotationV1(action.rotation)) {
    return fail('Only 0° and 90° rotations are supported in v1.')
  }

  if (!canRotateItem(definition, itemState) && action.rotation !== 0) {
    return fail(`Item "${definition.name}" cannot be rotated.`)
  }

  if (!itemState.storable) {
    return fail(`Item "${definition.name}" cannot be stored in its current state.`)
  }

  if (
    targetCompartment.id === 'pockets-main' &&
    (itemState.boundingWidth !== 1 || itemState.boundingHeight !== 1)
  ) {
    return fail('Pockets only accept 1×1 items.')
  }

  if (wouldCreateStorageCycle(state, action.itemInstanceId, action.targetStorageUnitId)) {
    return fail('Items cannot be moved into themselves or their own descendants.')
  }

  const occupiedCells = getOccupiedCellsForCompartment(
    state,
    targetStorageUnit.id,
    action.targetCompartmentId,
    catalog,
    action.itemInstanceId,
  )
  const placement = validatePlacement({
    itemMask: itemState.shapeMask,
    rotation: action.rotation,
    compartment: targetCompartment,
    position: { x: action.x, y: action.y },
    occupiedCells,
    layout: catalog.layoutsById[targetStorageUnit.layoutId],
  })

  if (!placement.isValid) {
    return fail(`Invalid placement: ${placement.reasons.join(', ')}.`)
  }

  const nextState = cloneInventoryState(state)
  detachItem(nextState, action.itemInstanceId)
  nextState.itemInstances[action.itemInstanceId] = {
    ...nextState.itemInstances[action.itemInstanceId]!,
    ownerEntityId: targetStorageUnit.ownerEntityId,
    parentStorageUnitId: targetStorageUnit.id,
    parentCompartmentId: action.targetCompartmentId,
    gridX: action.x,
    gridY: action.y,
    rotation: action.rotation,
  }
  assignOwnerRecursively(nextState, action.itemInstanceId, targetStorageUnit.ownerEntityId)
  return { ok: true, state: nextState }
}

const applyStateChange = (
  state: InventoryState,
  itemInstanceId: string,
  targetStateId: string,
  catalog: CatalogIndex,
): InventoryOperationResult => {
  const item = state.itemInstances[itemInstanceId]
  const targetState = catalog.itemStatesById[targetStateId]

  if (!item || !targetState) {
    return fail(`Unknown state change target "${targetStateId}".`)
  }

  const storageUnit = getStorageUnitForItem(state, itemInstanceId)

  if (storageUnit && !targetState.containerLayoutId && getChildItems(state, storageUnit.id).length > 0) {
    return fail('Collapsed or rolled storage states require the container to be completely empty in v1.')
  }

  if (
    item.parentStorageUnitId &&
    item.parentCompartmentId &&
    item.gridX !== undefined &&
    item.gridY !== undefined
  ) {
    const parentStorageUnit = state.storageUnits[item.parentStorageUnitId]
    const parentCompartment = catalog.compartmentsById[item.parentCompartmentId]

    if (!parentStorageUnit || !parentCompartment || parentCompartment.layoutId !== parentStorageUnit.layoutId) {
      return fail('The item does not have a valid parent storage location.')
    }

    const placement = validatePlacement({
      itemMask: targetState.shapeMask,
      rotation: item.rotation,
      compartment: parentCompartment,
      position: { x: item.gridX, y: item.gridY },
      occupiedCells: getOccupiedCellsForCompartment(
        state,
        parentStorageUnit.id,
        parentCompartment.id,
        catalog,
        itemInstanceId,
      ),
      layout: catalog.layoutsById[parentStorageUnit.layoutId],
    })

    if (!placement.isValid) {
      return fail(`State change does not fit in the parent container: ${placement.reasons.join(', ')}.`)
    }
  }

  const nextState = cloneInventoryState(state)
  nextState.itemInstances[itemInstanceId] = {
    ...nextState.itemInstances[itemInstanceId]!,
    stateId: targetStateId,
  }

  if (storageUnit && targetState.containerLayoutId) {
    nextState.storageUnits[storageUnit.id] = {
      ...nextState.storageUnits[storageUnit.id]!,
      layoutId: targetState.containerLayoutId,
    }
  }

  if (storageUnit && !targetState.containerLayoutId) {
    delete nextState.storageUnits[storageUnit.id]
  }

  ensureStorageUnitForItem(nextState, itemInstanceId, catalog)
  return { ok: true, state: nextState }
}

const createRuleContext = (state: InventoryState, catalog: CatalogIndex) => ({
  catalog,
  getItem: (instanceId: string) => state.itemInstances[instanceId],
  getItemDefinition: (instanceId: string) => getItemDefinitionForInstance(state, catalog, instanceId),
  getItemState: (instanceId: string) => {
    const item = state.itemInstances[instanceId]
    return item ? catalog.itemStatesById[item.stateId] : undefined
  },
  getEquippedItem: (slotId: string) => {
    const itemId = state.equipment[slotId as EquipmentSlotId]
    return itemId ? state.itemInstances[itemId] : undefined
  },
  getProjectedBackpackDepth: (instanceId: string, action: InventoryAction) =>
    getProjectedBackpackDepth(state, catalog, instanceId, action),
  containerItemCount: (instanceId: string) => getContainedItemIdsDeep(state, instanceId).length,
  isEquipped: (instanceId: string) => Boolean(state.itemInstances[instanceId]?.equippedSlotId),
  getTargetState: (targetStateId: string) => catalog.itemStatesById[targetStateId],
})

const getOccupiedCellsForCompartment = (
  state: InventoryState,
  storageUnitId: string,
  compartmentId: string,
  catalog: CatalogIndex,
  excludeItemId?: string,
): CellCoordinate[] =>
  Object.values(state.itemInstances)
    .filter(
      (item) =>
        item.parentStorageUnitId === storageUnitId &&
        item.parentCompartmentId === compartmentId &&
        item.id !== excludeItemId,
    )
    .flatMap((item) => {
      const itemState = catalog.itemStatesById[item.stateId]

      if (item.gridX === undefined || item.gridY === undefined || !itemState) {
        return []
      }

      return validatePlacement({
        itemMask: itemState.shapeMask,
        rotation: item.rotation,
        compartment: catalog.compartmentsById[compartmentId]!,
        position: { x: item.gridX, y: item.gridY },
      }).occupiedCells
    })

const detachItem = (state: InventoryState, itemInstanceId: string): void => {
  const item = state.itemInstances[itemInstanceId]

  if (!item) {
    return
  }

  if (item.equippedSlotId) {
    state.equipment[item.equippedSlotId] = null
  }

  state.itemInstances[itemInstanceId] = {
    ...item,
    equippedSlotId: undefined,
    parentStorageUnitId: undefined,
    parentCompartmentId: undefined,
    gridX: undefined,
    gridY: undefined,
  }
}

const wouldCreateStorageCycle = (
  state: InventoryState,
  itemInstanceId: string,
  targetStorageUnitId: string,
): boolean => {
  const ownStorageUnit = getStorageUnitForItem(state, itemInstanceId)

  if (!ownStorageUnit) {
    return false
  }

  if (ownStorageUnit.id === targetStorageUnitId) {
    return true
  }

  return getContainedItemIdsDeep(state, itemInstanceId)
    .map((descendantItemId) => getStorageUnitForItem(state, descendantItemId)?.id)
    .some((storageUnitId) => storageUnitId === targetStorageUnitId)
}

const assignOwnerRecursively = (state: InventoryState, itemInstanceId: string, ownerEntityId: string): void => {
  const item = state.itemInstances[itemInstanceId]

  if (!item) {
    return
  }

  state.itemInstances[itemInstanceId] = { ...item, ownerEntityId }
  const storageUnit = getStorageUnitForItem(state, itemInstanceId)

  if (storageUnit) {
    state.storageUnits[storageUnit.id] = { ...storageUnit, ownerEntityId }
    for (const child of getChildItems(state, storageUnit.id)) {
      assignOwnerRecursively(state, child.id, ownerEntityId)
    }
  }
}

const collectSecuredItemIdSet = (state: InventoryState, ownerEntityId: string): Set<string> => {
  const secured = new Set<string>()

  for (const itemInstanceId of Object.values(state.equipment)) {
    if (!itemInstanceId) {
      continue
    }

    collectSecuredSubtreeItemIds(state, itemInstanceId, ownerEntityId, secured)
  }

  return secured
}

const collectSecuredSubtreeItemIds = (
  state: InventoryState,
  itemInstanceId: string,
  ownerEntityId: string,
  secured: Set<string>,
): void => {
  const item = state.itemInstances[itemInstanceId]
  if (!item || item.ownerEntityId !== ownerEntityId || secured.has(itemInstanceId)) {
    return
  }

  secured.add(itemInstanceId)
  const storageUnit = getStorageUnitForItem(state, itemInstanceId)
  if (!storageUnit) {
    return
  }

  for (const child of getChildItems(state, storageUnit.id)) {
    collectSecuredSubtreeItemIds(state, child.id, ownerEntityId, secured)
  }
}

const ensureStorageUnitForItem = (state: InventoryState, itemInstanceId: string, catalog: CatalogIndex): void => {
  const item = state.itemInstances[itemInstanceId]

  if (!item) {
    return
  }

  const stateDefinition = catalog.itemStatesById[item.stateId]
  const existingStorageUnit = getStorageUnitForItem(state, itemInstanceId)

  if (stateDefinition?.containerLayoutId) {
    const storageUnitId = existingStorageUnit?.id ?? `${itemInstanceId}::storage`
    state.storageUnits[storageUnitId] = {
      id: storageUnitId,
      itemInstanceId,
      kind: 'item',
      layoutId: stateDefinition.containerLayoutId,
      ownerEntityId: item.ownerEntityId,
      label: `${item.itemDefinitionId} storage`,
    }
    return
  }

  if (existingStorageUnit) {
    delete state.storageUnits[existingStorageUnit.id]
  }
}

const requireDefinition = (definitionId: string, catalog: CatalogIndex): ItemDefinition => {
  const definition = catalog.itemDefinitionsById[definitionId]

  if (!definition) {
    throw new Error(`Unknown item definition "${definitionId}".`)
  }

  return definition
}

const getItemDefinitionForInstance = (
  state: InventoryState,
  catalog: CatalogIndex,
  itemInstanceId: string,
): ItemDefinition | undefined => {
  const item = state.itemInstances[itemInstanceId]
  return item ? catalog.itemDefinitionsById[item.itemDefinitionId] : undefined
}
