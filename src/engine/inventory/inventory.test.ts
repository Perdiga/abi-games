import { describe, expect, it } from 'vitest'
import { createCatalogIndex } from '../../data'
import { abiCompartmentId, abiDefinitionId, abiPlacement, createAbiTestCatalog } from '../../test-utils/abi-fixtures'
import {
  addStorageUnit,
  addItemInstance,
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
