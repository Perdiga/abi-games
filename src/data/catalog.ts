import type {
  BotLoadoutTemplate,
  CatalogIndex,
  ContainerCompartmentDefinition,
  ContainerLayoutDefinition,
  EquipmentSlotDefinition,
  EquipmentSlotId,
  ItemDefinition,
  ItemRarity,
  ItemStateDefinition,
  RuleDefinition,
  RunDefinition,
  ShapeMask,
} from './types'
import { abiAssetItems, type AbiAssetItem } from './abi-assets.generated'

const measureMask = (shapeMask: ShapeMask) => ({
  boundingWidth: shapeMask[0]?.length ?? 0,
  boundingHeight: shapeMask.length,
})

const compartment = (
  definition: Omit<ContainerCompartmentDefinition, 'boundingWidth' | 'boundingHeight'>,
): ContainerCompartmentDefinition => ({
  ...definition,
  ...measureMask(definition.shapeMask),
})

const itemState = (
  definition: Omit<ItemStateDefinition, 'boundingWidth' | 'boundingHeight'>,
): ItemStateDefinition => ({
  ...definition,
  ...measureMask(definition.shapeMask),
})

export const equipmentSlots: readonly EquipmentSlotDefinition[] = [
  { id: 'helmet', label: 'Helmet', slotType: 'head', maxItems: 1, acceptsCategories: ['helmet'] },
  {
    id: 'helmetFaceShield',
    label: 'Face Shield',
    slotType: 'head-attachment',
    maxItems: 1,
    acceptsCategories: ['face_shield'],
  },
  { id: 'mask', label: 'Mask', slotType: 'face', maxItems: 1, acceptsCategories: ['mask'] },
  { id: 'headset', label: 'Headset', slotType: 'ears', maxItems: 1, acceptsCategories: ['headset'] },
  {
    id: 'primaryWeapon',
    label: 'Primary Weapon',
    slotType: 'weapon',
    maxItems: 1,
    acceptsCategories: ['weapon_primary'],
  },
  {
    id: 'secondaryWeapon',
    label: 'Secondary Weapon',
    slotType: 'weapon',
    maxItems: 1,
    acceptsCategories: ['weapon_primary', 'weapon_secondary'],
  },
  { id: 'pistol', label: 'Pistol', slotType: 'weapon', maxItems: 1, acceptsCategories: ['weapon_pistol'] },
  {
    id: 'tacticalVest',
    label: 'Tactical Vest',
    slotType: 'torso',
    maxItems: 1,
    acceptsCategories: ['vest_tactical'],
  },
  {
    id: 'ballisticVest',
    label: 'Ballistic Vest',
    slotType: 'torso',
    maxItems: 1,
    acceptsCategories: ['vest_ballistic'],
  },
  {
    id: 'backpack',
    label: 'Backpack',
    slotType: 'back',
    maxItems: 1,
    acceptsCategories: ['backpack'],
  },
  {
    id: 'pockets',
    label: 'Pockets',
    slotType: 'utility-container',
    maxItems: 1,
    acceptsCategories: ['container_misc'],
  },
] as const

const baseContainerLayouts: readonly ContainerLayoutDefinition[] = [
  {
    id: 'layout-player-pockets',
    name: 'Player pockets',
    boundingWidth: 4,
    boundingHeight: 1,
    compartmentIds: ['pockets-main'],
    supportsIrregularGeometry: true,
  },
  {
    id: 'layout-ballistic-vest-compact',
    name: 'Compact ballistic vest',
    boundingWidth: 3,
    boundingHeight: 3,
    compartmentIds: ['ballistic-vest-main'],
    supportsIrregularGeometry: true,
  },
  {
    id: 'layout-tactical-rig',
    name: 'Tactical rig',
    boundingWidth: 4,
    boundingHeight: 3,
    compartmentIds: ['tactical-left', 'tactical-center', 'tactical-right'],
    supportsIrregularGeometry: true,
  },
  {
    id: 'layout-ballistic-rig',
    name: 'Ballistic tactical rig',
    boundingWidth: 4,
    boundingHeight: 3,
    compartmentIds: ['ballistic-rig-left', 'ballistic-rig-core', 'ballistic-rig-right'],
    supportsIrregularGeometry: true,
  },
  {
    id: 'layout-backpack-split',
    name: 'Split backpack example',
    boundingWidth: 5,
    boundingHeight: 6,
    compartmentIds: ['bp-example-top', 'bp-example-left', 'bp-example-center', 'bp-example-right'],
    supportsIrregularGeometry: true,
  },
] as const

const baseContainerCompartments: readonly ContainerCompartmentDefinition[] = [
  compartment({
    id: 'pockets-main',
    layoutId: 'layout-player-pockets',
    label: 'main',
    originX: 0,
    originY: 0,
    shapeMask: ['1111'],
    sortOrder: 1,
  }),
  compartment({
    id: 'ballistic-vest-main',
    layoutId: 'layout-ballistic-vest-compact',
    label: 'core',
    originX: 0,
    originY: 0,
    shapeMask: ['111', '111', '111'],
    sortOrder: 1,
  }),
  compartment({
    id: 'tactical-left',
    layoutId: 'layout-tactical-rig',
    label: 'left-pouch',
    originX: 0,
    originY: 0,
    shapeMask: ['1', '1', '1'],
    sortOrder: 1,
  }),
  compartment({
    id: 'tactical-center',
    layoutId: 'layout-tactical-rig',
    label: 'center',
    originX: 1,
    originY: 0,
    shapeMask: ['11', '11', '11'],
    sortOrder: 2,
  }),
  compartment({
    id: 'tactical-right',
    layoutId: 'layout-tactical-rig',
    label: 'right-pouch',
    originX: 3,
    originY: 0,
    shapeMask: ['1', '1', '1'],
    sortOrder: 3,
  }),
  compartment({
    id: 'ballistic-rig-left',
    layoutId: 'layout-ballistic-rig',
    label: 'left-pouch',
    originX: 0,
    originY: 0,
    shapeMask: ['1', '1', '1'],
    sortOrder: 1,
  }),
  compartment({
    id: 'ballistic-rig-core',
    layoutId: 'layout-ballistic-rig',
    label: 'core',
    originX: 1,
    originY: 0,
    shapeMask: ['11', '11', '11'],
    sortOrder: 2,
  }),
  compartment({
    id: 'ballistic-rig-right',
    layoutId: 'layout-ballistic-rig',
    label: 'right-pouch',
    originX: 3,
    originY: 0,
    shapeMask: ['1', '1', '1'],
    sortOrder: 3,
  }),
  compartment({
    id: 'bp-example-top',
    layoutId: 'layout-backpack-split',
    label: 'top',
    originX: 1,
    originY: 0,
    shapeMask: ['111', '111', '111'],
    sortOrder: 1,
  }),
  compartment({
    id: 'bp-example-left',
    layoutId: 'layout-backpack-split',
    label: 'left-pouch',
    originX: 0,
    originY: 3,
    shapeMask: ['1', '1', '1'],
    sortOrder: 2,
  }),
  compartment({
    id: 'bp-example-center',
    layoutId: 'layout-backpack-split',
    label: 'main-lower',
    originX: 1,
    originY: 3,
    shapeMask: ['111', '111', '111'],
    sortOrder: 3,
  }),
  compartment({
    id: 'bp-example-right',
    layoutId: 'layout-backpack-split',
    label: 'right-pouch',
    originX: 4,
    originY: 3,
    shapeMask: ['1', '1', '1'],
    sortOrder: 4,
  }),
] as const

const baseItemStates: readonly ItemStateDefinition[] = [
  itemState({
    id: 'state-pockets-open',
    itemDefinitionId: 'pockets-standard',
    label: 'worn-open',
    shapeMask: ['11', '11'],
    equippable: true,
    storable: false,
    containerLayoutId: 'layout-player-pockets',
    uiLabel: 'Open',
    tags: ['state-open', 'state-worn'],
  })
] as const

const baseItemDefinitions: readonly ItemDefinition[] = [
  {
    id: 'pockets-standard',
    name: 'Placeholder Standard Pockets',
    category: 'container_misc',
    rarity: 'common',
    baseValue: 0,
    allowedEquipmentSlots: ['pockets'],
    tags: ['holder-shell', 'pocket-holder'],
    defaultStateId: 'state-pockets-open',
    allowRotation: false,
  }
] as const

type ExternalItemConfig = {
  category: ItemDefinition['category']
  allowedEquipmentSlots: ItemDefinition['allowedEquipmentSlots']
}

const EXTERNAL_ITEM_CONFIG: Readonly<Record<string, ExternalItemConfig>> = {
  backpack: { category: 'backpack', allowedEquipmentSlots: ['backpack'] },
  ballistic_rig: { category: 'vest_tactical', allowedEquipmentSlots: ['tacticalVest'] },
  ballistic_vest: { category: 'vest_ballistic', allowedEquipmentSlots: ['ballisticVest'] },
  chest_rig: { category: 'vest_tactical', allowedEquipmentSlots: ['tacticalVest'] },
  food: { category: 'consumable', allowedEquipmentSlots: [] },
  headset: { category: 'headset', allowedEquipmentSlots: ['headset'] },
  helmet: { category: 'helmet', allowedEquipmentSlots: ['helmet'] },
  helmet_shield: { category: 'face_shield', allowedEquipmentSlots: ['helmetFaceShield'] },
  key: { category: 'container_misc', allowedEquipmentSlots: [] },
  mask: { category: 'mask', allowedEquipmentSlots: ['mask'] },
  medical: { category: 'medkit', allowedEquipmentSlots: [] },
  pistol: { category: 'weapon_pistol', allowedEquipmentSlots: ['pistol'] },
  throwable: { category: 'container_misc', allowedEquipmentSlots: [] },
  varieties: { category: 'container_misc', allowedEquipmentSlots: [] },
  weapons: { category: 'weapon_primary', allowedEquipmentSlots: ['primaryWeapon', 'secondaryWeapon'] },
}

const getExternalItemConfig = (item: AbiAssetItem): ExternalItemConfig =>
  EXTERNAL_ITEM_CONFIG[item.type] ?? { category: 'container_misc', allowedEquipmentSlots: [] }

const RARITIES: readonly ItemRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic']

const getItemRarity = (rarity: string | null | undefined): ItemRarity =>
  RARITIES.includes(rarity as ItemRarity) ? (rarity as ItemRarity) : 'common'

const toShapeMask = (item: AbiAssetItem, open = false): ShapeMask => {
  const width = Math.max(1, Math.min((open ? item.widthSlotsOpen : item.widthSlots) ?? item.widthSlots ?? 1, 6))
  const height = Math.max(1, Math.min((open ? item.heightSlotsOpen : item.heightSlots) ?? item.heightSlots ?? 1, 6))
  return Array.from({ length: height }, () => '1'.repeat(width))
}

type SlotMatrix = readonly (readonly (number | null)[])[]

const parseSlotMatrix = (item: AbiAssetItem): SlotMatrix | null => {
  if (!item.slots) return null

  try {
    const value: unknown = JSON.parse(item.slots)
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every((row) => Array.isArray(row) && row.every((cell) => cell === null || Number.isInteger(cell)))
    ) {
      return null
    }

    return value as SlotMatrix
  } catch {
    return null
  }
}

const externalLayoutIdFor = (item: AbiAssetItem): string | undefined =>
  parseSlotMatrix(item) ? `layout-abi-${item.id}` : undefined

const hasOpenBackpackState = (item: AbiAssetItem): boolean =>
  item.type === 'backpack' &&
  item.widthSlotsOpen !== null &&
  item.heightSlotsOpen !== null &&
  externalLayoutIdFor(item) !== undefined

const externalItemTags = (item: AbiAssetItem, containerLayoutId: string | undefined): readonly string[] => [
  'abi-asset',
  ...(containerLayoutId ? ['holder-shell'] : []),
  ...(item.type === 'helmet' && item.shieldsCompatible && item.shieldsCompatible.length > 0 ? ['supports-face-shield'] : []),
]

const externalContainerLayouts: readonly ContainerLayoutDefinition[] = abiAssetItems.flatMap((item) => {
  const slots = parseSlotMatrix(item)
  if (!slots) return []

  return [
    {
      id: `layout-abi-${item.id}`,
      name: item.name,
      boundingWidth: Math.max(...slots.map((row) => row.length)),
      boundingHeight: slots.length,
      compartmentIds: [...new Set(slots.flat().filter((slot): slot is number => slot !== null))]
        .sort((left, right) => left - right)
        .map((slot) => `abi-${item.id}-slot-${slot}`),
      supportsIrregularGeometry: true,
    },
  ]
})

const externalContainerCompartments: readonly ContainerCompartmentDefinition[] = abiAssetItems.flatMap((item) => {
  const slots = parseSlotMatrix(item)
  if (!slots) return []

  return [...new Set(slots.flat().filter((slot): slot is number => slot !== null))]
    .sort((left, right) => left - right)
    .map((slot, index) => {
      const cells = slots.flatMap((row, y) =>
        row.flatMap((value, x) => (value === slot ? [{ x, y }] : [])),
      )
      const originX = Math.min(...cells.map((cell) => cell.x))
      const originY = Math.min(...cells.map((cell) => cell.y))
      const maxX = Math.max(...cells.map((cell) => cell.x))
      const maxY = Math.max(...cells.map((cell) => cell.y))
      const cellSet = new Set(cells.map((cell) => `${cell.x},${cell.y}`))

      return compartment({
        id: `abi-${item.id}-slot-${slot}`,
        layoutId: `layout-abi-${item.id}`,
        label: `slot ${slot}`,
        originX,
        originY,
        shapeMask: Array.from({ length: maxY - originY + 1 }, (_, y) =>
          Array.from({ length: maxX - originX + 1 }, (_, x) => cellSet.has(`${originX + x},${originY + y}`) ? '1' : '0').join(''),
        ),
        sortOrder: index + 1,
      })
    })
})

const externalItemDefinitions: readonly ItemDefinition[] = abiAssetItems.map((item) => {
  const config = getExternalItemConfig(item)
  const containerLayoutId = externalLayoutIdFor(item)
  return {
    id: `abi-${item.id}`,
    name: item.name,
    category: config.category,
    rarity: getItemRarity(item.rarity),
    baseValue: item.price ?? 0,
    allowedEquipmentSlots: config.allowedEquipmentSlots,
    tags: externalItemTags(item, containerLayoutId),
    defaultStateId: `state-abi-${item.id}`,
    allowRotation: !containerLayoutId,
    shieldsCompatible: item.shieldsCompatible ?? undefined,
  }
})

const externalItemStates: readonly ItemStateDefinition[] = abiAssetItems.flatMap((item) => {
  const containerLayoutId = externalLayoutIdFor(item)
  const isOpenBackpack = hasOpenBackpackState(item)
  const openState = itemState({
    id: `state-abi-${item.id}`,
    itemDefinitionId: `abi-${item.id}`,
    label: isOpenBackpack ? 'open' : 'default',
    shapeMask: toShapeMask(item, isOpenBackpack),
    equippable: true,
    storable: true,
    containerLayoutId,
    uiLabel: isOpenBackpack ? 'Open' : undefined,
    tags: isOpenBackpack ? ['state-open', 'default'] : ['default'],
  })

  if (!isOpenBackpack) {
    return [openState]
  }

  return [
    openState,
    itemState({
      id: `state-abi-${item.id}-collapsed`,
      itemDefinitionId: `abi-${item.id}`,
      label: 'collapsed',
      shapeMask: toShapeMask(item),
      equippable: false,
      storable: true,
      uiLabel: 'Collapsed',
      tags: ['state-collapsed'],
    }),
  ]
})

export const itemDefinitions: readonly ItemDefinition[] = [...baseItemDefinitions, ...externalItemDefinitions]
export const itemStates: readonly ItemStateDefinition[] = [...baseItemStates, ...externalItemStates]
export const containerLayouts: readonly ContainerLayoutDefinition[] = [...baseContainerLayouts, ...externalContainerLayouts]
export const containerCompartments: readonly ContainerCompartmentDefinition[] = [
  ...baseContainerCompartments,
  ...externalContainerCompartments,
]

export const ruleDefinitions: readonly RuleDefinition[] = [
  {
    id: 'rule-face-shield-requires-helmet-support',
    priority: 100,
    kind: 'requires-compatible-face-shield',
    subjectSlots: ['helmetFaceShield'],
    requiredHostSlot: 'helmet',
    effect: 'deny',
    message: 'A face shield needs a compatible helmet.',
  },
  {
    id: 'rule-mask-blocks-face-shield',
    priority: 95,
    kind: 'paired-slot-tag-conflict',
    subjectSlots: ['mask'],
    otherSlots: ['helmetFaceShield'],
    otherTags: [],
    effect: 'deny',
    message: 'Masks and face shields cannot be worn together.',
  },
  {
    id: 'rule-face-shield-blocks-mask',
    priority: 94,
    kind: 'paired-slot-tag-conflict',
    subjectSlots: ['helmetFaceShield'],
    otherSlots: ['mask'],
    otherTags: [],
    effect: 'deny',
    message: 'Cannot equip a face shield while a conflicting mask is equipped; a face shield blocks the mask slot.',
  },
  {
    id: 'rule-helmet-blocks-headset',
    priority: 90,
    kind: 'paired-slot-tag-conflict',
    subjectSlots: ['headset'],
    otherSlots: ['helmet'],
    otherTags: ['blocks-headset'],
    effect: 'deny',
    message: 'This helmet blocks headset use.',
  },
  {
    id: 'rule-headset-blocks-helmet',
    priority: 89,
    kind: 'paired-slot-tag-conflict',
    subjectSlots: ['helmet'],
    subjectTags: ['blocks-headset'],
    otherSlots: ['headset'],
    otherTags: [],
    effect: 'deny',
    message: 'Remove the headset before equipping a helmet that blocks it.',
  },
  {
    id: 'rule-ballistic-rig-blocks-separate-vest',
    priority: 85,
    kind: 'paired-slot-tag-conflict',
    subjectSlots: ['ballisticVest'],
    otherSlots: ['tacticalVest'],
    otherTags: ['ballistic-vest-integrated'],
    effect: 'deny',
    message: 'An integrated ballistic tactical vest blocks a separate ballistic vest.',
  },
  {
    id: 'rule-separate-vest-blocks-ballistic-rig',
    priority: 84,
    kind: 'paired-slot-tag-conflict',
    subjectSlots: ['tacticalVest'],
    otherSlots: ['ballisticVest'],
    subjectTags: ['ballistic-vest-integrated'],
    otherTags: ['ballistic-vest'],
    effect: 'deny',
    message: 'A separate ballistic vest blocks ballistic tactical vest use.',
  },
  {
    id: 'rule-backpack-depth-limit',
    priority: 80,
    kind: 'container-depth-limit',
    subjectCategories: ['backpack'],
    maxDepth: 3,
    effect: 'deny',
    message: 'Backpack nesting cannot exceed depth 3, counting the worn backpack as level 1.',
  },
  {
    id: 'rule-container-collapse-requires-empty',
    priority: 75,
    kind: 'state-requires-empty-container',
    subjectCategories: ['backpack', 'vest_tactical', 'vest_ballistic'],
    targetStateTags: ['state-collapsed'],
    effect: 'deny',
    message: 'Collapsed or rolled storage states require the container to be completely empty in v1.',
  },
  {
    id: 'rule-equipped-containers-need-equippable-state',
    priority: 70,
    kind: 'equippable-state-required',
    subjectSlots: ['tacticalVest', 'ballisticVest', 'backpack', 'pockets'],
    effect: 'deny',
    message: 'Equipped containers must use an equippable state.',
  },
  {
    id: 'rule-equipped-container-target-state-must-be-equippable',
    priority: 65,
    kind: 'equipped-state-requires-equippable',
    subjectCategories: ['backpack', 'vest_tactical', 'vest_ballistic', 'container_misc'],
    effect: 'deny',
    message: 'Equipped containers cannot switch into a non-equippable state.',
  },
] as const

export const TRAINING_TIME_PENALTY_GRACE_PERIOD_SECONDS = 60

export const runDefinitions: readonly RunDefinition[] = [
  {
    id: 'training-mode-v1',
    durationSeconds: 300,
    botDeathSchedule: [0, 10, 20, 30, 40],
    timePenaltyGracePeriodSeconds: TRAINING_TIME_PENALTY_GRACE_PERIOD_SECONDS,
    lootGenerationMode: 'randomized_from_pool',
  },
] as const

const externalDefinitionIdForType = (type: string): string => {
  const item = abiAssetItems.find((candidate) => candidate.type === type)
  return item ? `abi-${item.id}` : ''
}

const externalHelmetDefinitionId = externalDefinitionIdForType('helmet')
const externalHeadsetDefinitionId = externalDefinitionIdForType('headset')
const externalBallisticVestDefinitionId = externalDefinitionIdForType('ballistic_vest')
const externalTacticalVestDefinitionId =
  externalDefinitionIdForType('chest_rig') ?? externalDefinitionIdForType('ballistic_rig')
const externalBackpackDefinitionId = externalDefinitionIdForType('backpack')
const externalMaskDefinitionId = externalDefinitionIdForType('mask')
const externalPistolDefinitionId = externalDefinitionIdForType('pistol')
const externalWeaponDefinitionId = externalDefinitionIdForType('weapons')
const externalFoodDefinitionId = externalDefinitionIdForType('food')
const externalMedicalDefinitionId = externalDefinitionIdForType('medical')
const externalThrowableDefinitionId = externalDefinitionIdForType('throwable')
const externalVarietyDefinitionId = externalDefinitionIdForType('varieties')
const externalKeyDefinitionId = externalDefinitionIdForType('key')

export const trainingBotLoadoutPool: readonly BotLoadoutTemplate[] = [
  {
    id: 'rifleman',
    equipment: {
      helmet: externalHelmetDefinitionId,
      primaryWeapon: externalWeaponDefinitionId,
      tacticalVest: externalTacticalVestDefinitionId,
      backpack: externalBackpackDefinitionId,
      pistol: externalPistolDefinitionId,
    },
    loot: [externalFoodDefinitionId, externalMedicalDefinitionId],
  },
  {
    id: 'shotgunner',
    equipment: {
      mask: externalMaskDefinitionId,
      secondaryWeapon: externalWeaponDefinitionId,
      tacticalVest: externalTacticalVestDefinitionId,
      backpack: externalBackpackDefinitionId,
    },
    loot: [externalThrowableDefinitionId, externalVarietyDefinitionId],
  },
  {
    id: 'support',
    equipment: {
      helmet: externalHelmetDefinitionId,
      pistol: externalPistolDefinitionId,
      ballisticVest: externalBallisticVestDefinitionId,
      backpack: externalBackpackDefinitionId,
      headset: externalHeadsetDefinitionId,
    },
    loot: [externalKeyDefinitionId],
  },
] as const

export const playerStarterLoadout = {
  equipment: { pockets: 'pockets-standard' } as Partial<Record<EquipmentSlotId, string>>,
} as const

export const createCatalogIndex = (): CatalogIndex => {
  const itemDefinitionsById = Object.fromEntries(itemDefinitions.map((definition) => [definition.id, definition]))
  const itemStatesById = Object.fromEntries(itemStates.map((definition) => [definition.id, definition]))
  const layoutsById = Object.fromEntries(containerLayouts.map((layout) => [layout.id, layout]))
  const compartmentsById = Object.fromEntries(
    containerCompartments.map((compartmentDefinition) => [compartmentDefinition.id, compartmentDefinition]),
  )
  const equipmentSlotsById = Object.fromEntries(
    equipmentSlots.map((definition) => [definition.id, definition]),
  ) as Record<EquipmentSlotId, EquipmentSlotDefinition>
  const runDefinitionsById = Object.fromEntries(runDefinitions.map((definition) => [definition.id, definition]))

  return {
    itemDefinitions,
    itemStates,
    containerLayouts,
    containerCompartments,
    equipmentSlots,
    ruleDefinitions,
    runDefinitions,
    itemDefinitionsById,
    itemStatesById,
    layoutsById,
    compartmentsById,
    equipmentSlotsById,
    runDefinitionsById,
    rulesByPriority: [...ruleDefinitions].sort((left, right) => right.priority - left.priority),
  }
}
