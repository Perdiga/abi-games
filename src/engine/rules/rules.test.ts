import { describe, expect, it } from 'vitest'
import { abiCompartmentId, abiDefinitionId, abiPlacement, abiStateId, createAbiTestCatalog } from '../../test-utils/abi-fixtures'
import {
  addItemInstance,
  changeItemState as changeCatalogItemState,
  createEmptyInventoryState,
  createItemInstance as createCatalogItemInstance,
  equipItemToSlot,
  getStorageUnitForItem,
  placeItemInStorage as placeCatalogItemInStorage,
} from '../inventory'

const catalog = createAbiTestCatalog()
const createItemInstance: typeof createCatalogItemInstance = (id, index, options) =>
  createCatalogItemInstance(abiDefinitionId(id), index, options)
const placeItemInStorage: typeof placeCatalogItemInStorage = (state, options, index) => {
  const position = abiPlacement(options.targetCompartmentId, options.x, options.y)
  return placeCatalogItemInStorage(state, { ...options, ...position, targetCompartmentId: abiCompartmentId(options.targetCompartmentId) }, index)
}
const changeItemState: typeof changeCatalogItemState = (state, id, stateId, index) =>
  changeCatalogItemState(state, id, abiStateId(stateId), index)

const createPlayerInventory = () => createEmptyInventoryState(catalog)

describe('equipment rules', () => {
  it('requires a compatible helmet before equipping a face shield', () => {
    let state = createPlayerInventory()
    const visor = createItemInstance('visor-clear', catalog, { id: 'visor', ownerEntityId: 'player' })
    state = addItemInstance(state, visor, catalog)

    const result = equipItemToSlot(state, visor.id, 'helmetFaceShield', catalog)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('compatible helmet')
    }
  })

  it('requires a compatible helmet before equipping a database face shield', () => {
    let state = createPlayerInventory()
    const shield = createItemInstance('abi-helmet_shield_001', catalog, {
      id: 'database-face-shield',
      ownerEntityId: 'player',
    })
    state = addItemInstance(state, shield, catalog)

    const result = equipItemToSlot(state, shield.id, 'helmetFaceShield', catalog)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('compatible helmet')
    }
  })

  it('allows a database face shield on a database helmet', () => {
    let state = createPlayerInventory()
    const helmet = createItemInstance('abi-helmet_001', catalog, { id: 'database-helmet', ownerEntityId: 'player' })
    const shield = createItemInstance('abi-helmet_shield_001', catalog, {
      id: 'database-face-shield',
      ownerEntityId: 'player',
    })

    state = addItemInstance(addItemInstance(state, helmet, catalog), shield, catalog)
    const helmetEquip = equipItemToSlot(state, helmet.id, 'helmet', catalog)
    expect(helmetEquip.ok).toBe(true)

    const shieldEquip = equipItemToSlot(
      helmetEquip.ok ? helmetEquip.state : state,
      shield.id,
      'helmetFaceShield',
      catalog,
    )
    expect(shieldEquip.ok).toBe(true)
  })

  it('allows equipping a compatible face shield specified in shieldsCompatible', () => {
    let state = createPlayerInventory()
    const helmet = createItemInstance('abi-helmet_012', catalog, { id: 'helmet-f70', ownerEntityId: 'player' })
    const compatibleShield = createItemInstance('abi-helmet_shield_001', catalog, {
      id: 'shield-dk5',
      ownerEntityId: 'player',
    })

    state = addItemInstance(addItemInstance(state, helmet, catalog), compatibleShield, catalog)
    const helmetEquip = equipItemToSlot(state, helmet.id, 'helmet', catalog)
    expect(helmetEquip.ok).toBe(true)

    const shieldEquip = equipItemToSlot(
      helmetEquip.ok ? helmetEquip.state : state,
      compatibleShield.id,
      'helmetFaceShield',
      catalog,
    )
    expect(shieldEquip.ok).toBe(true)
  })

  it('prevents equipping an incompatible face shield when helmet supports other shields', () => {
    let state = createPlayerInventory()
    const helmet = createItemInstance('abi-helmet_012', catalog, { id: 'helmet-f70', ownerEntityId: 'player' })
    const incompatibleShield = createItemInstance('abi-helmet_shield_002', catalog, {
      id: 'shield-sh',
      ownerEntityId: 'player',
    })

    state = addItemInstance(addItemInstance(state, helmet, catalog), incompatibleShield, catalog)
    const helmetEquip = equipItemToSlot(state, helmet.id, 'helmet', catalog)
    expect(helmetEquip.ok).toBe(true)

    const shieldEquip = equipItemToSlot(
      helmetEquip.ok ? helmetEquip.state : state,
      incompatibleShield.id,
      'helmetFaceShield',
      catalog,
    )
    expect(shieldEquip.ok).toBe(false)
    if (!shieldEquip.ok) {
      expect(shieldEquip.reason).toContain('compatible helmet')
    }
  })

  it('prevents equipping a face shield on a helmet that has an empty shieldsCompatible list', () => {
    let state = createPlayerInventory()
    const helmet = createItemInstance('abi-helmet_002', catalog, { id: 'helmet-no-shields', ownerEntityId: 'player' })
    const shield = createItemInstance('abi-helmet_shield_001', catalog, {
      id: 'shield-dk5',
      ownerEntityId: 'player',
    })

    state = addItemInstance(addItemInstance(state, helmet, catalog), shield, catalog)
    const helmetEquip = equipItemToSlot(state, helmet.id, 'helmet', catalog)
    expect(helmetEquip.ok).toBe(true)

    const shieldEquip = equipItemToSlot(
      helmetEquip.ok ? helmetEquip.state : state,
      shield.id,
      'helmetFaceShield',
      catalog,
    )
    expect(shieldEquip.ok).toBe(false)
    if (!shieldEquip.ok) {
      expect(shieldEquip.reason).toContain('compatible helmet')
    }
  })
  it('does not allow removing a helmet while its face shield is equipped', () => {
    let state = createPlayerInventory()
    const backpack = createItemInstance('backpack-split', catalog, { id: 'backpack', ownerEntityId: 'player' })
    const helmet = createItemInstance('helmet-assault', catalog, { id: 'helmet', ownerEntityId: 'player' })
    const shield = createItemInstance('visor-clear', catalog, { id: 'shield', ownerEntityId: 'player' })
    state = addItemInstance(addItemInstance(addItemInstance(state, backpack, catalog), helmet, catalog), shield, catalog)

    const helmetEquip = equipItemToSlot(state, helmet.id, 'helmet', catalog)
    expect(helmetEquip.ok).toBe(true)
    const shieldEquip = equipItemToSlot(helmetEquip.ok ? helmetEquip.state : state, shield.id, 'helmetFaceShield', catalog)
    expect(shieldEquip.ok).toBe(true)

    const storage = getStorageUnitForItem(shieldEquip.ok ? shieldEquip.state : state, backpack.id)
    const removal = placeItemInStorage(
      shieldEquip.ok ? shieldEquip.state : state,
      {
        itemInstanceId: helmet.id,
        targetStorageUnitId: storage!.id,
        targetCompartmentId: 'bp-example-center',
        x: 0,
        y: 0,
      },
      catalog,
    )

    expect(removal.ok).toBe(false)
    if (!removal.ok) {
      expect(removal.reason).toContain('Remove the face shield')
    }
  })

  it('prevents masks and face shields from coexisting', () => {
    let state = createPlayerInventory()
    const helmet = createItemInstance('helmet-assault', catalog, { id: 'helmet', ownerEntityId: 'player' })
    const visor = createItemInstance('visor-clear', catalog, { id: 'visor', ownerEntityId: 'player' })
    const mask = createItemInstance('mask-respirator', catalog, { id: 'mask', ownerEntityId: 'player' })
    state = addItemInstance(addItemInstance(addItemInstance(state, helmet, catalog), visor, catalog), mask, catalog)

    const helmetEquip = equipItemToSlot(state, helmet.id, 'helmet', catalog)
    expect(helmetEquip.ok).toBe(true)
    const shieldEquip = equipItemToSlot(helmetEquip.ok ? helmetEquip.state : state, visor.id, 'helmetFaceShield', catalog)
    expect(shieldEquip.ok).toBe(true)
    const maskEquip = equipItemToSlot(shieldEquip.ok ? shieldEquip.state : state, mask.id, 'mask', catalog)

    expect(maskEquip.ok).toBe(false)
  })

  it('blocks shield attachment when a conflicting mask is already equipped', () => {
    let state = createPlayerInventory()
    const helmet = createItemInstance('helmet-assault', catalog, { id: 'helmet', ownerEntityId: 'player' })
    const visor = createItemInstance('visor-clear', catalog, { id: 'visor', ownerEntityId: 'player' })
    const mask = createItemInstance('mask-respirator', catalog, { id: 'mask', ownerEntityId: 'player' })
    state = addItemInstance(addItemInstance(addItemInstance(state, helmet, catalog), visor, catalog), mask, catalog)

    const helmetEquip = equipItemToSlot(state, helmet.id, 'helmet', catalog)
    expect(helmetEquip.ok).toBe(true)
    const maskEquip = equipItemToSlot(helmetEquip.ok ? helmetEquip.state : state, mask.id, 'mask', catalog)
    expect(maskEquip.ok).toBe(true)
    const shieldEquip = equipItemToSlot(maskEquip.ok ? maskEquip.state : state, visor.id, 'helmetFaceShield', catalog)

    expect(shieldEquip.ok).toBe(false)
    if (!shieldEquip.ok) {
      expect(shieldEquip.reason).toContain('blocks the mask slot')
    }
    expect((maskEquip.ok ? maskEquip.state : state).equipment.mask).toBe(mask.id)
  })

  it('prevents headsets when the equipped helmet blocks them', () => {
    let state = createPlayerInventory()
    const helmet = createItemInstance('helmet-assault', catalog, { id: 'helmet', ownerEntityId: 'player' })
    const headset = createItemInstance('headset-comms', catalog, { id: 'headset', ownerEntityId: 'player' })
    state = addItemInstance(addItemInstance(state, helmet, catalog), headset, catalog)

    const helmetEquip = equipItemToSlot(state, helmet.id, 'helmet', catalog)
    expect(helmetEquip.ok).toBe(true)
    const headsetEquip = equipItemToSlot(helmetEquip.ok ? helmetEquip.state : state, headset.id, 'headset', catalog)
    expect(headsetEquip.ok).toBe(false)
  })

  it('prevents equipping a database mask while a database face shield is equipped', () => {
    let state = createPlayerInventory()
    const helmet = createItemInstance('abi-helmet_001', catalog, { id: 'helmet', ownerEntityId: 'player' })
    const shield = createItemInstance('abi-helmet_shield_001', catalog, { id: 'shield', ownerEntityId: 'player' })
    const mask = createItemInstance('abi-mask_001', catalog, { id: 'mask', ownerEntityId: 'player' })
    state = addItemInstance(addItemInstance(addItemInstance(state, helmet, catalog), shield, catalog), mask, catalog)

    const helmetEquip = equipItemToSlot(state, helmet.id, 'helmet', catalog)
    const shieldEquip = equipItemToSlot(helmetEquip.ok ? helmetEquip.state : state, shield.id, 'helmetFaceShield', catalog)
    expect(shieldEquip.ok).toBe(true)

    const maskEquip = equipItemToSlot(shieldEquip.ok ? shieldEquip.state : state, mask.id, 'mask', catalog)
    expect(maskEquip.ok).toBe(false)
    if (!maskEquip.ok) {
      expect(maskEquip.reason).toContain('Masks and face shields cannot be worn together')
    }
  })

  it('allows equipping a headset without a helmet', () => {
    let state = createPlayerInventory()
    const headset = createItemInstance('abi-headset_001', catalog, { id: 'database-headset', ownerEntityId: 'player' })
    state = addItemInstance(state, headset, catalog)

    const result = equipItemToSlot(state, headset.id, 'headset', catalog)
    expect(result.ok).toBe(true)
  })

  it('prevents equipping a helmet that blocks an already-equipped headset', () => {
    let state = createPlayerInventory()
    const helmet = createItemInstance('helmet-assault', catalog, { id: 'helmet', ownerEntityId: 'player' })
    const headset = createItemInstance('headset-comms', catalog, { id: 'headset', ownerEntityId: 'player' })
    state = addItemInstance(addItemInstance(state, helmet, catalog), headset, catalog)

    const headsetEquip = equipItemToSlot(state, headset.id, 'headset', catalog)
    expect(headsetEquip.ok).toBe(true)
    const helmetEquip = equipItemToSlot(headsetEquip.ok ? headsetEquip.state : state, helmet.id, 'helmet', catalog)

    expect(helmetEquip.ok).toBe(false)
    if (!helmetEquip.ok) {
      expect(helmetEquip.reason).toContain('Remove the headset')
    }
  })

  it('blocks combining an integrated ballistic tactical vest with a separate ballistic vest', () => {
    let state = createPlayerInventory()
    const tactical = createItemInstance('vest-tactical-ballistic', catalog, {
      id: 'tactical-ballistic',
      ownerEntityId: 'player',
    })
    const ballistic = createItemInstance('vest-ballistic-compact', catalog, {
      id: 'ballistic-vest',
      ownerEntityId: 'player',
    })
    state = addItemInstance(addItemInstance(state, tactical, catalog), ballistic, catalog)

    const tacticalEquip = equipItemToSlot(state, tactical.id, 'tacticalVest', catalog)
    expect(tacticalEquip.ok).toBe(true)
    const ballisticEquip = equipItemToSlot(
      tacticalEquip.ok ? tacticalEquip.state : state,
      ballistic.id,
      'ballisticVest',
      catalog,
    )

    expect(ballisticEquip.ok).toBe(false)
  })

  it('blocks a ballistic tactical vest when a separate ballistic vest is already equipped', () => {
    let state = createPlayerInventory()
    const tactical = createItemInstance('vest-tactical-ballistic', catalog, {
      id: 'tactical-ballistic',
      ownerEntityId: 'player',
    })
    const ballistic = createItemInstance('vest-ballistic-compact', catalog, {
      id: 'ballistic-vest',
      ownerEntityId: 'player',
    })
    state = addItemInstance(addItemInstance(state, tactical, catalog), ballistic, catalog)

    const ballisticEquip = equipItemToSlot(state, ballistic.id, 'ballisticVest', catalog)
    expect(ballisticEquip.ok).toBe(true)
    const tacticalEquip = equipItemToSlot(
      ballisticEquip.ok ? ballisticEquip.state : state,
      tactical.id,
      'tacticalVest',
      catalog,
    )

    expect(tacticalEquip.ok).toBe(false)
    if (!tacticalEquip.ok) {
      expect(tacticalEquip.reason).toContain('separate ballistic vest blocks ballistic tactical vest')
    }
    expect((ballisticEquip.ok ? ballisticEquip.state : state).equipment.ballisticVest).toBe(ballistic.id)
  })

  it('enforces the backpack nesting depth limit of three', () => {
    let state = createPlayerInventory()
    const backpacks = ['bp-1', 'bp-2', 'bp-3', 'bp-4'].map((id) =>
      createItemInstance('backpack-split', catalog, { id, ownerEntityId: 'player' }),
    )
    state = backpacks.reduce((nextState, backpack) => addItemInstance(nextState, backpack, catalog), state)

    const worn = equipItemToSlot(state, 'bp-1', 'backpack', catalog)
    expect(worn.ok).toBe(true)
    const storage1 = getStorageUnitForItem(worn.ok ? worn.state : state, 'bp-1')
    const nested2 = placeItemInStorage(
      worn.ok ? worn.state : state,
      { itemInstanceId: 'bp-2', targetStorageUnitId: storage1!.id, targetCompartmentId: 'bp-example-top', x: 0, y: 0 },
      catalog,
    )
    expect(nested2.ok).toBe(true)

    const storage2 = getStorageUnitForItem(nested2.ok ? nested2.state : state, 'bp-2')
    const nested3 = placeItemInStorage(
      nested2.ok ? nested2.state : state,
      { itemInstanceId: 'bp-3', targetStorageUnitId: storage2!.id, targetCompartmentId: 'bp-example-top', x: 0, y: 0 },
      catalog,
    )
    expect(nested3.ok).toBe(true)

    const storage3 = getStorageUnitForItem(nested3.ok ? nested3.state : state, 'bp-3')
    const nested4 = placeItemInStorage(
      nested3.ok ? nested3.state : state,
      { itemInstanceId: 'bp-4', targetStorageUnitId: storage3!.id, targetCompartmentId: 'bp-example-top', x: 0, y: 0 },
      catalog,
    )

    expect(nested4.ok).toBe(false)
  })

  it('denies collapsing a container with one item inside', () => {
    let state = createPlayerInventory()
    const backpack = createItemInstance('backpack-split', catalog, { id: 'bp', ownerEntityId: 'player' })
    const ammo = createItemInstance('ammo-556-box', catalog, { id: 'ammo', ownerEntityId: 'player' })
    state = addItemInstance(addItemInstance(state, backpack, catalog), ammo, catalog)

    const worn = equipItemToSlot(state, backpack.id, 'backpack', catalog)
    expect(worn.ok).toBe(true)
    const storage = getStorageUnitForItem(worn.ok ? worn.state : state, backpack.id)
    const placed = placeItemInStorage(
      worn.ok ? worn.state : state,
      { itemInstanceId: ammo.id, targetStorageUnitId: storage!.id, targetCompartmentId: 'bp-example-top', x: 0, y: 0 },
      catalog,
    )
    expect(placed.ok).toBe(true)

    const collapsed = changeItemState(placed.ok ? placed.state : state, backpack.id, 'state-backpack-split-collapsed', catalog)
    expect(collapsed.ok).toBe(false)
  })

  it('prevents equipped containers from switching into a non-equippable state', () => {
    let state = createPlayerInventory()
    const backpack = createItemInstance('backpack-split', catalog, { id: 'bp', ownerEntityId: 'player' })
    state = addItemInstance(state, backpack, catalog)

    const worn = equipItemToSlot(state, backpack.id, 'backpack', catalog)
    expect(worn.ok).toBe(true)

    const collapsed = changeItemState(worn.ok ? worn.state : state, backpack.id, 'state-backpack-split-collapsed', catalog)
    expect(collapsed.ok).toBe(false)
  })

  it('allows an empty container to collapse when the target state is legal, but keeps that collapsed state non-equippable', () => {
    let state = createPlayerInventory()
    const backpack = createItemInstance('backpack-split', catalog, { id: 'bp', ownerEntityId: 'player' })
    state = addItemInstance(state, backpack, catalog)

    const collapsed = changeItemState(state, backpack.id, 'state-backpack-split-collapsed', catalog)

    expect(collapsed.ok).toBe(true)
    if (collapsed.ok) {
      expect(collapsed.state.itemInstances[backpack.id]?.stateId).toBe('state-abi-backpack_018-collapsed')
      expect(getStorageUnitForItem(collapsed.state, backpack.id)).toBeUndefined()

      const equipCollapsed = equipItemToSlot(collapsed.state, backpack.id, 'backpack', catalog)
      expect(equipCollapsed.ok).toBe(false)
      if (!equipCollapsed.ok) {
        expect(equipCollapsed.reason).toContain('equippable state')
      }
    }
  })

  it('only opens a stored bag when its open size fits in the parent backpack', () => {
    let state = createPlayerInventory()
    const parent = createItemInstance('backpack-split', catalog, { id: 'parent', ownerEntityId: 'player' })
    const child = createItemInstance('abi-backpack_001', catalog, {
      id: 'child',
      ownerEntityId: 'player',
      stateId: 'state-abi-backpack_001-collapsed',
    })
    state = addItemInstance(addItemInstance(state, parent, catalog), child, catalog)

    expect(getStorageUnitForItem(state, child.id)).toBeUndefined()

    const parentEquip = equipItemToSlot(state, parent.id, 'backpack', catalog)
    expect(parentEquip.ok).toBe(true)
    const parentStorage = getStorageUnitForItem(parentEquip.ok ? parentEquip.state : state, parent.id)
    const placed = placeItemInStorage(
      parentEquip.ok ? parentEquip.state : state,
      { itemInstanceId: child.id, targetStorageUnitId: parentStorage!.id, targetCompartmentId: 'bp-example-left', x: 0, y: 0 },
      catalog,
    )
    expect(placed.ok).toBe(true)

    const opened = changeItemState(placed.ok ? placed.state : state, child.id, 'state-abi-backpack_001', catalog)
    expect(opened.ok).toBe(true)
  })
})
