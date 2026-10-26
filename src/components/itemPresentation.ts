import type { EquipmentSlotId, ItemCategory, ItemRarity } from '../data'
import { abiAssetById } from '../data/abi-assets.generated'
import type { InventoryItemRecord } from './grids/types'

const CATEGORY_SHORT_LABELS: Record<ItemCategory, string> = {
  helmet: 'HEAD',
  face_shield: 'SHIELD',
  mask: 'MASK',
  headset: 'COMMS',
  weapon_primary: 'PRIMARY',
  weapon_secondary: 'SECOND',
  weapon_pistol: 'SIDEARM',
  vest_tactical: 'RIG',
  vest_ballistic: 'ARMOR',
  backpack: 'PACK',
  ammo: 'AMMO',
  ammo_box: 'BOX',
  medkit: 'MED',
  consumable: 'UTIL',
  container_misc: 'KIT',
}

const CATEGORY_GLYPHS: Record<ItemCategory, string> = {
  helmet: '◖',
  face_shield: '▣',
  mask: '◌',
  headset: '◉',
  weapon_primary: '⌁',
  weapon_secondary: '≣',
  weapon_pistol: '⊣',
  vest_tactical: '▥',
  vest_ballistic: '▦',
  backpack: '▤',
  ammo: '•',
  ammo_box: '⋰',
  medkit: '+',
  consumable: '◍',
  container_misc: '⌂',
}

const RARITY_TINTS: Record<ItemRarity, string> = {
  common: '#696764',
  rare: '#356E8F',
  epic: '#7553A6',
  legendary: '#B37224',
  mythic: '#311410',
}

const WEAPON_SLOT_BADGES: Partial<Record<EquipmentSlotId, string>> = {
  primaryWeapon: '1',
  secondaryWeapon: '2',
  pistol: '3',
}

export const getItemTint = (item: InventoryItemRecord): string => RARITY_TINTS[item.rarity ?? 'common']

export const getItemGlyph = (item: InventoryItemRecord): string =>
  CATEGORY_GLYPHS[item.category] ?? item.name.slice(0, 1)

export const getItemImageSrc = (item: InventoryItemRecord): string | null => {
  const assetId = item.itemDefinitionId.startsWith('abi-') ? item.itemDefinitionId.slice(4) : item.itemDefinitionId
  return abiAssetById[assetId]?.assetPath ?? null
}

export const getItemDescriptor = (item: InventoryItemRecord): string =>
  item.uiStateLabel?.toUpperCase() ?? CATEGORY_SHORT_LABELS[item.category]

export const getItemStatusChip = (item: InventoryItemRecord): string | null =>
  item.currentDurability !== undefined ? `♥${item.currentDurability}` : item.uiStateLabel?.toUpperCase() ?? null

export const getItemCounterLabel = (item: InventoryItemRecord): string =>
  item.currentDurability !== undefined ? `${item.currentDurability}` : `${item.boundingWidth}×${item.boundingHeight}`

export const getWeaponSlotBadge = (slotId: EquipmentSlotId): string | null => WEAPON_SLOT_BADGES[slotId] ?? null
