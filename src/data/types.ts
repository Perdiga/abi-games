export type Rotation = 0 | 90 | 180 | 270
export type ShapeMask = readonly string[]

export type ItemCategory =
  | 'helmet'
  | 'face_shield'
  | 'mask'
  | 'headset'
  | 'weapon_primary'
  | 'weapon_secondary'
  | 'weapon_pistol'
  | 'vest_tactical'
  | 'vest_ballistic'
  | 'backpack'
  | 'ammo'
  | 'ammo_box'
  | 'medkit'
  | 'consumable'
  | 'container_misc'

export type EquipmentSlotId =
  | 'helmet'
  | 'helmetFaceShield'
  | 'mask'
  | 'headset'
  | 'primaryWeapon'
  | 'secondaryWeapon'
  | 'pistol'
  | 'tacticalVest'
  | 'ballisticVest'
  | 'backpack'
  | 'pockets'

export interface ContainerLayoutDefinition {
  id: string
  name: string
  boundingWidth: number
  boundingHeight: number
  compartmentIds: readonly string[]
  supportsIrregularGeometry: boolean
}

export interface ContainerCompartmentDefinition {
  id: string
  layoutId: string
  label: string
  originX: number
  originY: number
  shapeMask: ShapeMask
  boundingWidth: number
  boundingHeight: number
  acceptsTags?: readonly string[]
  sortOrder: number
}

export interface ItemStateDefinition {
  id: string
  itemDefinitionId: string
  label: string
  shapeMask: ShapeMask
  boundingWidth: number
  boundingHeight: number
  equippable: boolean
  storable: boolean
  containerLayoutId?: string
  uiLabel?: string
  tags: readonly string[]
}

export interface ItemDefinition {
  id: string
  name: string
  category: ItemCategory
  subtype?: string
  baseValue: number
  durabilityType?: string
  maxDurability?: number
  allowedEquipmentSlots: readonly EquipmentSlotId[]
  tags: readonly string[]
  defaultStateId: string
  allowRotation: boolean
  shieldsCompatible?: readonly string[]
}

export interface EquipmentSlotDefinition {
  id: EquipmentSlotId
  label: string
  slotType: string
  maxItems: number
  acceptsCategories: readonly ItemCategory[]
}

export interface ItemInstance {
  id: string
  itemDefinitionId: string
  stateId: string
  rotation: Rotation
  currentDurability?: number
  ownerEntityId: string
  parentStorageUnitId?: string
  parentCompartmentId?: string
  gridX?: number
  gridY?: number
  equippedSlotId?: EquipmentSlotId
}

export interface StorageUnit {
  id: string
  ownerEntityId: string
  kind: 'virtual' | 'item'
  layoutId: string
  label: string
  itemInstanceId?: string
}

export interface InventoryState {
  itemInstances: Record<string, ItemInstance>
  storageUnits: Record<string, StorageUnit>
  equipment: Partial<Record<EquipmentSlotId, string | null>>
  rootStorageUnitIds: string[]
  lastError?: string
}

export type InventoryAction =
  | { type: 'equip'; itemInstanceId: string; targetSlotId: EquipmentSlotId }
  | {
      type: 'move'
      itemInstanceId: string
      targetStorageUnitId: string
      targetCompartmentId: string
      x: number
      y: number
      rotation: Rotation
    }
  | { type: 'change-state'; itemInstanceId: string; targetStateId: string }

export interface RuleViolation {
  ruleId: string
  message: string
}

export type RuleDefinition =
  | {
      id: string
      priority: number
      kind: 'requires-compatible-face-shield'
      subjectSlots: readonly EquipmentSlotId[]
      requiredHostSlot: EquipmentSlotId
      effect: 'deny'
      message: string
    }
  | {
      id: string
      priority: number
      kind: 'requires-equipped-tag'
      subjectSlots: readonly EquipmentSlotId[]
      subjectTags?: readonly string[]
      requiredHostSlot: EquipmentSlotId
      requiredHostTags: readonly string[]
      effect: 'deny'
      message: string
    }
  | {
      id: string
      priority: number
      kind: 'paired-slot-tag-conflict'
      subjectSlots: readonly EquipmentSlotId[]
      otherSlots: readonly EquipmentSlotId[]
      subjectTags?: readonly string[]
      otherTags: readonly string[]
      effect: 'deny'
      message: string
    }
  | {
      id: string
      priority: number
      kind: 'container-depth-limit'
      subjectCategories: readonly ItemCategory[]
      maxDepth: number
      effect: 'deny'
      message: string
    }
  | {
      id: string
      priority: number
      kind: 'state-requires-empty-container'
      subjectCategories: readonly ItemCategory[]
      targetStateTags: readonly string[]
      effect: 'deny'
      message: string
    }
  | {
      id: string
      priority: number
      kind: 'equippable-state-required'
      subjectSlots: readonly EquipmentSlotId[]
      effect: 'deny'
      message: string
    }
  | {
      id: string
      priority: number
      kind: 'equipped-state-requires-equippable'
      subjectCategories: readonly ItemCategory[]
      effect: 'deny'
      message: string
    }

export interface RunDefinition {
  id: string
  durationSeconds: number
  botDeathSchedule: readonly number[]
  timePenaltyGracePeriodSeconds: number
  lootGenerationMode: 'randomized_from_pool'
}

export interface CatalogData {
  itemDefinitions: readonly ItemDefinition[]
  itemStates: readonly ItemStateDefinition[]
  containerLayouts: readonly ContainerLayoutDefinition[]
  containerCompartments: readonly ContainerCompartmentDefinition[]
  equipmentSlots: readonly EquipmentSlotDefinition[]
  ruleDefinitions: readonly RuleDefinition[]
  runDefinitions: readonly RunDefinition[]
}

export interface CatalogIndex extends CatalogData {
  itemDefinitionsById: Record<string, ItemDefinition>
  itemStatesById: Record<string, ItemStateDefinition>
  layoutsById: Record<string, ContainerLayoutDefinition>
  compartmentsById: Record<string, ContainerCompartmentDefinition>
  equipmentSlotsById: Record<EquipmentSlotId, EquipmentSlotDefinition>
  runDefinitionsById: Record<string, RunDefinition>
  rulesByPriority: readonly RuleDefinition[]
}

export interface InventoryOperationSuccess {
  ok: true
  state: InventoryState
}

export interface InventoryOperationFailure {
  ok: false
  reason: string
  violations?: readonly RuleViolation[]
}

export type InventoryOperationResult = InventoryOperationSuccess | InventoryOperationFailure

export interface LootSource {
  id: string
  botId: string
  label: string
  spawnedAtSeconds: number
  itemIds: string[]
}

export interface BotScheduleEntry {
  botId: string
  atSeconds: number
}

export interface ScoreBreakdown {
  grossScore: number
  maximumPotentialScore: number
  starRating: number
  elapsedSeconds: number
  scoringElapsedSeconds: number
  timePenaltyPoints: number
  finalScore: number
}

export interface BotRosterEntry {
  botId: string
  topLevelItemIds: string[]
  dropped: boolean
}

export interface PerfectExtractionItem {
  itemDefinitionId: string
  count: number
}

export interface TrainingRunState {
  definitionId: string
  phase: 'PreRun' | 'LoadRunData' | 'RunActive' | 'RunEnd' | 'ScoreRun' | 'ResultsScreen'
  activePhase?: 'AwaitNextBotDeath' | 'SpawnLootDrop' | 'PlayerLooting' | 'ExtractNow'
  elapsedSeconds: number
  maximumPotentialScore: number
  runEndReason?: 'extract' | 'time-cap'
  perfectExtraction?: {
    inventory: InventoryState
    status: 'pending' | 'ready' | 'error'
    items?: readonly PerfectExtractionItem[]
  }
  inventory: InventoryState
  botRoster: BotRosterEntry[]
  pendingBotDeaths: BotScheduleEntry[]
  lootSources: LootSource[]
  score?: ScoreBreakdown
  phaseHistory: string[]
}

export type TrainingRunPlayerAction = { type: 'EXTRACT_NOW' }

export type TrainingRunEvent =
  | { type: 'BEGIN_RUN'; seed?: number }
  | { type: 'ADVANCE_TIME'; deltaSeconds: number; queuedAction?: TrainingRunPlayerAction }
  | TrainingRunPlayerAction

export interface BotLoadoutTemplate {
  id: string
  equipment: Partial<Record<EquipmentSlotId, string>>
  loot: readonly string[]
}
