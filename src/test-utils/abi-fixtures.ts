import { createCatalogIndex, type CatalogIndex } from '../data'

const legacyDefinitionIds: Readonly<Record<string, string>> = {
  'helmet-assault': 'abi-helmet_001',
  'visor-clear': 'abi-helmet_shield_001',
  'mask-respirator': 'abi-mask_001',
  'headset-comms': 'abi-headset_001',
  'weapon-pistol-service': 'abi-pistol_001',
  'vest-ballistic-compact': 'abi-chest_rig_002',
  'vest-tactical-rig': 'abi-chest_rig_001',
  'vest-tactical-ballistic': 'abi-ballistic_rig_001',
  'backpack-split': 'abi-backpack_018',
  'ammo-556-box': 'abi-food_001',
  'medkit-field': 'abi-medical_001',
  'consumable-ration': 'abi-food_002',
  'misc-radio': 'abi-food_003',
}

export const abiDefinitionId = (id: string) => legacyDefinitionIds[id] ?? id
export const abiCompartmentId = (id: string) =>
  id.startsWith('bp-example-')
    ? 'abi-backpack_018-slot-1'
    : id === 'ballistic-vest-main'
      ? 'abi-chest_rig_002-slot-1'
      : id === 'tactical-center'
        ? 'abi-chest_rig_001-slot-4'
        : id
export const abiPlacement = (compartmentId: string, x: number, y: number) => {
  if (compartmentId === 'bp-example-right') return { x: x + 4, y }
  if (compartmentId === 'bp-example-center') return { x: x + 1, y: y + 3 }
  if (compartmentId === 'bp-example-left') return { x, y: y + 3 }
  return { x, y }
}
export const abiStateId = (id: string) =>
  id === 'state-backpack-split-collapsed' ? 'state-abi-backpack_018-collapsed' : id

export const createAbiTestCatalog = (): CatalogIndex => {
  const catalog = createCatalogIndex()
  const helmet = catalog.itemDefinitionsById['abi-helmet_001']!
  const rig = catalog.itemDefinitionsById['abi-ballistic_rig_001']!
  const vest = catalog.itemDefinitionsById['abi-chest_rig_002']!
  catalog.itemDefinitionsById['abi-helmet_001'] = { ...helmet, tags: [...helmet.tags, 'blocks-headset', 'supports-face-shield'], shieldsCompatible: ['helmet_shield_001', 'abi-helmet_shield_001'] }
  catalog.itemDefinitionsById['abi-ballistic_rig_001'] = { ...rig, tags: [...rig.tags, 'ballistic-vest-integrated'] }
  catalog.itemDefinitionsById['abi-chest_rig_002'] = { ...vest, category: 'vest_ballistic', allowedEquipmentSlots: ['ballisticVest'], tags: [...vest.tags, 'ballistic-vest'] }
  const backpackState = catalog.itemStatesById['state-abi-backpack_018']!
  catalog.itemStatesById['state-abi-backpack_018'] = { ...backpackState, shapeMask: ['111', '111', '111'], boundingWidth: 3, boundingHeight: 3 }
  return catalog
}
