import { describe, expect, it } from 'vitest'
import { createCatalogIndex } from '../../data'
import { abiCompartmentId, abiDefinitionId, abiPlacement, createAbiTestCatalog } from '../../test-utils/abi-fixtures'
import {
  addStorageUnit,
  addItemInstance,
  changeItemState,
  createEmptyInventoryState,
  createItemInstance as createCatalogItemInstance,
  createVirtualStorageUnit,
  getStorageUnitForItem,
  placeItemInStorage as placeCatalogItemInStorage,
} from './index'

const catalog = createAbiTestCatalog()
const createItemInstance: typeof createCatalogItemInstance = (id, index, options) =>
  createCatalogItemInstance(abiDefinitionId(id), index, options)
const placeItemInStorage: typeof placeCatalogItemInStorage = (state, options, index) => {
  const position = abiPlacement(options.targetCompartmentId, options.x, options.y)
  return placeCatalogItemInStorage(state, { ...options, ...position, targetCompartmentId: abiCompartmentId(options.targetCompartmentId) }, index)
}

describe('inventory placement flows', () => {
  it('uses compartment-local coordinates when placing items', () => {
    let state = createEmptyInventoryState(catalog)
    const backpack = createItemInstance('backpack-split', catalog, { id: 'backpack', ownerEntityId: 'player' })
    const radio = createItemInstance('misc-radio', catalog, { id: 'radio', ownerEntityId: 'player' })
    state = addItemInstance(addItemInstance(state, backpack, catalog), radio, catalog)

    const storage = getStorageUnitForItem(state, backpack.id)
    const result = placeItemInStorage(
      state,
      {
        itemInstanceId: radio.id,
        targetStorageUnitId: storage!.id,
        targetCompartmentId: 'bp-example-center',
        x: 1,
        y: 1,
      },
      catalog,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.itemInstances[radio.id]?.gridX).toBe(2)
      expect(result.state.itemInstances[radio.id]?.gridY).toBe(4)
      expect(result.state.itemInstances[radio.id]?.parentCompartmentId).toBe('abi-backpack_018-slot-1')
    }
  })

  it('rejects 180° rotation through the inventory API', () => {
    let state = createEmptyInventoryState(catalog)
    const backpack = createItemInstance('backpack-split', catalog, { id: 'backpack', ownerEntityId: 'player' })
    const medkit = createItemInstance('medkit-field', catalog, { id: 'medkit', ownerEntityId: 'player' })
    state = addItemInstance(addItemInstance(state, backpack, catalog), medkit, catalog)

    const storage = getStorageUnitForItem(state, backpack.id)
    const result = placeItemInStorage(
      state,
      {
        itemInstanceId: medkit.id,
        targetStorageUnitId: storage!.id,
        targetCompartmentId: 'bp-example-top',
        x: 0,
        y: 0,
        rotation: 180,
      },
      catalog,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('0° and 90°')
    }
  })

  it('allows a collapsed backpack to be rotated', () => {
    let state = createEmptyInventoryState(catalog)
    const backpack = createItemInstance('backpack-split', catalog, {
      id: 'collapsed-backpack',
      ownerEntityId: 'player',
      stateId: 'state-abi-backpack_018-collapsed',
    })
    const storageUnit = createVirtualStorageUnit({
      id: 'test-storage',
      ownerEntityId: 'player',
      layoutId: 'layout-abi-backpack_018',
      label: 'Test storage',
    })
    state = addStorageUnit(state, storageUnit, true)
    state = addItemInstance(state, backpack, catalog)

    const rotated = placeItemInStorage(
      state,
      {
        itemInstanceId: backpack.id,
        targetStorageUnitId: storageUnit.id,
        targetCompartmentId: 'abi-backpack_018-slot-1',
        x: 0,
        y: 0,
        rotation: 90,
      },
      catalog,
    )

    expect(rotated.ok).toBe(true)
    if (rotated.ok) {
      expect(rotated.state.itemInstances[backpack.id]?.rotation).toBe(90)
    }
  })

  it('rejects placement into a closed container', () => {
    let state = createEmptyInventoryState(catalog)
    const backpack = createItemInstance('backpack-split', catalog, {
      id: 'closed-backpack',
      ownerEntityId: 'player',
      stateId: 'state-abi-backpack_018-collapsed',
    })
    const radio = createItemInstance('misc-radio', catalog, { id: 'radio', ownerEntityId: 'player' })
    const storageUnit = {
      id: 'closed-backpack::storage',
      itemInstanceId: backpack.id,
      kind: 'item' as const,
      label: 'Closed backpack storage',
      layoutId: 'layout-abi-backpack_018',
      ownerEntityId: 'player',
    }
    state = addItemInstance(addItemInstance(state, backpack, catalog), radio, catalog)
    state = addStorageUnit(state, storageUnit, true)

    const result = placeItemInStorage(
      state,
      {
        itemInstanceId: radio.id,
        targetStorageUnitId: storageUnit.id,
        targetCompartmentId: 'bp-example-top',
        x: 0,
        y: 0,
      },
      catalog,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('Open the target rig or backpack')
    }
  })

  it('creates the Universal B3 chest rig closed, without internal storage', () => {
    let state = createEmptyInventoryState(catalog)
    const rig = createCatalogItemInstance('abi-chest_rig_011', catalog, {
      id: 'universal-b3',
      ownerEntityId: 'player',
    })

    state = addItemInstance(state, rig, catalog)

    expect(catalog.itemStatesById[rig.stateId]?.tags).toContain('state-collapsed')
    expect(getStorageUnitForItem(state, rig.id)).toBeUndefined()
  })

  it('rejects opening a chest rig when its expanded dimensions do not fit', () => {
    const tightCatalog = createAbiTestCatalog()
    tightCatalog.layoutsById['layout-tight'] = {
      id: 'layout-tight',
      name: 'Tight storage',
      boundingWidth: 3,
      boundingHeight: 2,
      compartmentIds: ['tight-compartment'],
      supportsIrregularGeometry: false,
    }
    tightCatalog.compartmentsById['tight-compartment'] = {
      id: 'tight-compartment',
      layoutId: 'layout-tight',
      label: 'Tight compartment',
      originX: 0,
      originY: 0,
      shapeMask: ['111', '111'],
      boundingWidth: 3,
      boundingHeight: 2,
      sortOrder: 1,
    }

    let state = createEmptyInventoryState(tightCatalog)
    const rig = createCatalogItemInstance('abi-chest_rig_011', tightCatalog, {
      id: 'universal-b3',
      ownerEntityId: 'player',
    })
    const storageUnit = createVirtualStorageUnit({
      id: 'tight-storage',
      ownerEntityId: 'player',
      layoutId: 'layout-tight',
      label: 'Tight storage',
    })
    state = addStorageUnit(addItemInstance(state, rig, tightCatalog), storageUnit, true)
    const placed = placeCatalogItemInStorage(
      state,
      {
        itemInstanceId: rig.id,
        targetStorageUnitId: storageUnit.id,
        targetCompartmentId: 'tight-compartment',
        x: 0,
        y: 0,
      },
      tightCatalog,
    )
    expect(placed.ok).toBe(true)
    if (!placed.ok) return

    const opened = changeItemState(placed.state, rig.id, 'state-abi-chest_rig_011', tightCatalog)
    expect(opened.ok).toBe(false)
    if (!opened.ok) {
      expect(opened.reason).toContain('does not fit')
    }
  })

  it('rejects a rotated placement for non-rotatable items even when rotation would make the fit possible', () => {
    const customCatalog = createCatalogIndex()
    customCatalog.layoutsById['layout-test-rotation-only'] = {
      id: 'layout-test-rotation-only',
      name: 'Rotation-only slot',
      boundingWidth: 2,
      boundingHeight: 1,
      compartmentIds: ['test-rotation-only'],
      supportsIrregularGeometry: false,
    }
    customCatalog.compartmentsById['test-rotation-only'] = {
      id: 'test-rotation-only',
      layoutId: 'layout-test-rotation-only',
      label: 'rotation-only',
      originX: 0,
      originY: 0,
      shapeMask: ['11'],
      boundingWidth: 2,
      boundingHeight: 1,
      sortOrder: 1,
    }
    customCatalog.itemDefinitionsById['test-non-rotatable-rod'] = {
      id: 'test-non-rotatable-rod',
      name: 'Test Non-Rotatable Rod',
      category: 'container_misc',
      baseValue: 1,
      allowedEquipmentSlots: [],
      tags: ['test'],
      defaultStateId: 'state-test-non-rotatable-rod',
      allowRotation: false,
    }
    customCatalog.itemStatesById['state-test-non-rotatable-rod'] = {
      id: 'state-test-non-rotatable-rod',
      itemDefinitionId: 'test-non-rotatable-rod',
      label: 'default',
      shapeMask: ['1', '1'],
      boundingWidth: 1,
      boundingHeight: 2,
      equippable: false,
      storable: true,
      tags: ['default'],
    }

    let state = createEmptyInventoryState(customCatalog)
    const storageUnit = createVirtualStorageUnit({
      id: 'test-storage',
      ownerEntityId: 'player',
      layoutId: 'layout-test-rotation-only',
      label: 'Rotation-only storage',
    })
    const rod = createItemInstance('test-non-rotatable-rod', customCatalog, { id: 'rod', ownerEntityId: 'player' })
    state = addStorageUnit(state, storageUnit, true)
    state = addItemInstance(state, rod, customCatalog)

    const rotated = placeItemInStorage(
      state,
      {
        itemInstanceId: rod.id,
        targetStorageUnitId: storageUnit.id,
        targetCompartmentId: 'test-rotation-only',
        x: 0,
        y: 0,
        rotation: 90,
      },
      customCatalog,
    )

    expect(rotated.ok).toBe(false)
    if (!rotated.ok) {
      expect(rotated.reason).toContain('cannot be rotated')
    }
  })
})
