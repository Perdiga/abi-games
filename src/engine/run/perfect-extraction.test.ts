import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import createHighs, { type LegacyHighs } from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'
import { createCatalogIndex, type CatalogIndex, type ItemCategory, type ShapeMask } from '../../data'
import { addItemInstance, createEmptyInventoryState, createItemInstance, equipItemToSlot, getStorageUnitForItem, placeItemInStorage } from '../inventory'
import { advanceTrainingRun, createTrainingRunState, scoreTrainingRun } from './index'
import { calculatePerfectExtraction } from './perfect-extraction'

interface FixtureItem {
  id: string
  value?: number
  shape?: ShapeMask
  category?: ItemCategory
  compartments?: ShapeMask[]
  tags?: string[]
  rotate?: boolean
  count?: number
}

const fixture = (items: FixtureItem[]) => {
  const base = createCatalogIndex()
  const definitions = items.map((item) => ({
    id: item.id,
    name: item.id,
    category: item.category ?? 'consumable',
    baseValue: item.value ?? 0,
    allowedEquipmentSlots: [],
    tags: item.tags ?? [],
    defaultStateId: `state-${item.id}`,
    allowRotation: item.rotate ?? false,
  }))
  const states = items.map((item) => ({
    id: `state-${item.id}`,
    itemDefinitionId: item.id,
    label: 'default',
    shapeMask: item.shape ?? ['1'],
    boundingWidth: item.shape?.[0]?.length ?? 1,
    boundingHeight: item.shape?.length ?? 1,
    equippable: true,
    storable: item.id !== 'pockets',
    containerLayoutId: item.compartments ? `layout-${item.id}` : undefined,
    tags: [],
  }))
  const compartments = items.flatMap((item) => (item.compartments ?? []).map((shapeMask, index) => ({
    id: item.id === 'pockets' ? 'pockets-main' : `${item.id}-compartment-${index}`,
    layoutId: `layout-${item.id}`,
    label: `${item.id}-${index}`,
    originX: 0,
    originY: 0,
    shapeMask,
    boundingWidth: shapeMask[0]!.length,
    boundingHeight: shapeMask.length,
    sortOrder: index,
  })))
  const layouts = items.filter((item) => item.compartments).map((item) => ({
    id: `layout-${item.id}`,
    name: item.id,
    boundingWidth: Math.max(...item.compartments!.map((mask) => mask[0]!.length)),
    boundingHeight: Math.max(...item.compartments!.map((mask) => mask.length)),
    compartmentIds: compartments.filter((compartment) => compartment.layoutId === `layout-${item.id}`).map((compartment) => compartment.id),
    supportsIrregularGeometry: true,
  }))
  const catalog: CatalogIndex = {
    ...base,
    itemDefinitions: definitions,
    itemDefinitionsById: Object.fromEntries(definitions.map((definition) => [definition.id, definition])),
    itemStates: states,
    itemStatesById: Object.fromEntries(states.map((state) => [state.id, state])),
    containerLayouts: layouts,
    layoutsById: Object.fromEntries(layouts.map((layout) => [layout.id, layout])),
    containerCompartments: compartments,
    compartmentsById: Object.fromEntries(compartments.map((compartment) => [compartment.id, compartment])),
  }
  let inventory = createEmptyInventoryState(catalog)
  for (const item of items) {
    for (let copy = 0; copy < (item.count ?? 1); copy += 1) {
      inventory = addItemInstance(inventory, createItemInstance(item.id, catalog, { id: `${item.id}-${copy}`, ownerEntityId: 'bot' }), catalog)
    }
  }
  return { catalog, inventory }
}

let solver: LegacyHighs
beforeAll(async () => {
  const require = createRequire(import.meta.url)
  solver = await createHighs({ wasmBinary: await readFile(require.resolve('highs/runtime')) })
})

describe('perfect extraction optimization', () => {
  it('maximizes carried value instead of summing all loot or choosing the most valuable item first', () => {
    const { inventory, catalog } = fixture([
      { id: 'pack', category: 'backpack', value: 999, shape: ['111', '111', '111'], compartments: [['11', '11']] },
      { id: 'large', value: 30, shape: ['11', '11'] },
      { id: 'small', value: 9, count: 4 },
    ])
    const before = structuredClone(inventory)
    const maximum = calculatePerfectExtraction(inventory, catalog, solver)
    expect(maximum).toBe(36)
    expect(inventory).toEqual(before)
    const equipped = equipItemToSlot(inventory, 'pack-0', 'backpack', catalog)
    expect(equipped.ok).toBe(true)
    if (!equipped.ok) return
    let carried = equipped.state
    for (let index = 0; index < 4; index += 1) {
      const placed = placeItemInStorage(carried, {
        itemInstanceId: `small-${index}`,
        targetStorageUnitId: getStorageUnitForItem(carried, 'pack-0')!.id,
        targetCompartmentId: 'pack-compartment-0',
        x: index % 2,
        y: Math.floor(index / 2),
      }, catalog)
      expect(placed.ok).toBe(true)
      if (!placed.ok) return
      carried = placed.state
    }
    expect(scoreTrainingRun(carried, 25, catalog, maximum)).toMatchObject({ grossScore: 36, maximumPotentialScore: 36, starRating: 5 })
  })

  it('respects irregular geometry and pockets limited to 1x1', () => {
    const { inventory, catalog } = fixture([
      { id: 'pockets', category: 'container_misc', compartments: [['1111']] },
      { id: 'pack', category: 'backpack', shape: ['111', '111', '111'], compartments: [['10', '11']] },
      { id: 'rotated', value: 20, shape: ['11'], rotate: true },
      { id: 'too-wide', value: 100, shape: ['111'] },
      { id: 'small', value: 3, count: 5 },
    ])
    expect(calculatePerfectExtraction(inventory, catalog, solver)).toBe(35)
    const horizontal = catalog.itemStatesById['state-rotated']!
    horizontal.shapeMask = ['111']
    horizontal.boundingWidth = 3
    expect(calculatePerfectExtraction(inventory, catalog, solver)).toBe(15)
  })

  it('does not merge adjacent compartments into a single storage grid', () => {
    const { inventory, catalog } = fixture([
      { id: 'rig', category: 'vest_tactical', shape: ['111', '111'], compartments: [['1'], ['1']] },
      { id: 'wide', value: 100, shape: ['11'] },
      { id: 'small', value: 4, count: 3 },
    ])
    expect(calculatePerfectExtraction(inventory, catalog, solver)).toBe(8)
  })

  it('uses rotation only when allowed by the item definition', () => {
    const { inventory, catalog } = fixture([
      { id: 'pack', category: 'backpack', shape: ['111', '111'], compartments: [['1', '1', '1']] },
      { id: 'wide', value: 20, shape: ['111'], rotate: true },
    ])
    expect(calculatePerfectExtraction(inventory, catalog, solver)).toBe(20)
    catalog.itemDefinitionsById.wide!.allowRotation = false
    expect(calculatePerfectExtraction(inventory, catalog, solver)).toBe(0)
  })

  it('does not combine an integrated ballistic rig with separate armor', () => {
    const { inventory, catalog } = fixture([
      { id: 'integrated', category: 'vest_tactical', shape: ['111', '111'], compartments: [['1']], tags: ['ballistic-vest-integrated'] },
      { id: 'armor', category: 'vest_ballistic', shape: ['111', '111'], compartments: [['11']], tags: ['ballistic-vest'] },
      { id: 'small', value: 10, count: 4 },
    ])
    expect(calculatePerfectExtraction(inventory, catalog, solver)).toBe(20)
  })

  it('can reopen an empty collapsed container instead of using its current footprint as usable storage', () => {
    const { inventory, catalog } = fixture([
      { id: 'pack', category: 'backpack', shape: ['111', '111'], compartments: [['111']] },
      { id: 'small', value: 10, count: 4 },
    ])
    const collapsed = { ...catalog.itemStates[0]!, id: 'collapsed', containerLayoutId: undefined, equippable: false, shapeMask: ['1'], boundingWidth: 1, boundingHeight: 1 }
    catalog.itemStates = [...catalog.itemStates, collapsed]
    catalog.itemStatesById.collapsed = collapsed
    inventory.itemInstances['pack-0']!.stateId = 'collapsed'
    expect(calculatePerfectExtraction(inventory, catalog, solver)).toBe(30)
  })

  it('chooses a compatible equipment set and can store incompatible spare equipment', () => {
    const { inventory, catalog } = fixture([
      { id: 'helmet', category: 'helmet', value: 20, tags: ['supports-face-shield', 'blocks-headset'] },
      { id: 'headset', category: 'headset', value: 30 },
      { id: 'shield', category: 'face_shield', value: 40 },
      { id: 'mask', category: 'mask', value: 50 },
    ])
    expect(calculatePerfectExtraction(inventory, catalog, solver)).toBe(80)
    const withStorage = fixture([
      { id: 'pockets', category: 'container_misc', compartments: [['1111']] },
      { id: 'helmet', category: 'helmet', value: 20, tags: ['supports-face-shield', 'blocks-headset'] },
      { id: 'headset', category: 'headset', value: 30 },
      { id: 'shield', category: 'face_shield', value: 40 },
      { id: 'mask', category: 'mask', value: 50 },
    ])
    expect(calculatePerfectExtraction(withStorage.inventory, withStorage.catalog, solver)).toBe(140)
  })

  it('counts duplicate instances but never equips the same gun in two weapon slots', () => {
    const single = fixture([{ id: 'gun', category: 'weapon_primary', value: 100 }])
    expect(calculatePerfectExtraction(single.inventory, single.catalog, solver)).toBe(100)
    const multiple = fixture([{ id: 'gun', category: 'weapon_primary', value: 100, count: 3 }])
    expect(calculatePerfectExtraction(multiple.inventory, multiple.catalog, solver)).toBe(200)
  })

  it('optimizes storage capacity as well as equipped item prices', () => {
    const { inventory, catalog } = fixture([
      { id: 'small-pack', category: 'backpack', value: 10000, shape: ['111', '111'], compartments: [['1']] },
      { id: 'large-pack', category: 'backpack', value: 1, shape: ['111', '111'], compartments: [['111']] },
      { id: 'small', value: 10, count: 4 },
    ])
    expect(calculatePerfectExtraction(inventory, catalog, solver)).toBe(30)
  })

  it('supports nested containers, prevents storage cycles and enforces backpack depth', () => {
    const { inventory, catalog } = fixture([
      { id: 'pack', category: 'backpack', shape: ['11'], compartments: [['111']], count: 4 },
      { id: 'small', value: 10, count: 8 },
    ])
    expect(calculatePerfectExtraction(inventory, catalog, solver)).toBe(50)
    const withoutRoots = { ...catalog, equipmentSlots: [] }
    expect(calculatePerfectExtraction(inventory, withoutRoots, solver)).toBe(0)
  })

  it('requires a compatible host helmet before equipping a face shield', () => {
    const { inventory, catalog } = fixture([
      { id: 'shield', category: 'face_shield', value: 80 },
      { id: 'helmet', category: 'helmet', value: 10 },
    ])
    expect(calculatePerfectExtraction(inventory, catalog, solver)).toBe(10)
  })

  it('never presents a time-limited or otherwise unproven result as perfect', () => {
    const { inventory, catalog } = fixture([{ id: 'gun', category: 'weapon_primary', value: 100 }])
    const limited: LegacyHighs = { solve: () => ({ Status: 'Time limit reached', ObjectiveValue: 0, Columns: {}, Rows: [] }) }
    expect(() => calculatePerfectExtraction(inventory, catalog, limited)).toThrow('could not be proven')
  })

  it.each([1, 7, 42, 123, 2026])('solves a complete round with seed %i using the actual catalog', (seed) => {
    const catalog = createCatalogIndex()
    const started = advanceTrainingRun(createTrainingRunState(catalog), { type: 'BEGIN_RUN', seed }, catalog)
    const totalLoot = Object.values(started.inventory.itemInstances).reduce((sum, item) => {
      const definition = catalog.itemDefinitionsById[item.itemDefinitionId]!
      return sum + (catalog.itemStates.some((state) => state.itemDefinitionId === definition.id && state.containerLayoutId) || definition.tags.includes('holder-shell') ? 0 : definition.baseValue)
    }, 0)
    const maximum = calculatePerfectExtraction(started.inventory, catalog, solver)
    expect(maximum).toBeGreaterThan(0)
    expect(maximum).toBeLessThanOrEqual(totalLoot)
    if (seed === 7) expect(maximum).toBeLessThan(totalLoot)
  }, 130000)
})
