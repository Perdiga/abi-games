import './EquipmentScreen.css'

import type { CSSProperties, Dispatch } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import operatorImage from '../../assets/operator.png'
import type { EquipmentSlotId, ItemCategory } from '../../data'
import {
  dropTrainingItemToGround,
  equipTrainingItem,
  extractTrainingRunNow,
  moveTrainingItem,
  selectCurrentSecuredValue,
  selectEquipmentSlots,
  selectLootSourceStorageUnits,
  selectLootSources,
  selectItem,
  selectOperationFeedback,
  selectPlayersRemaining,
  selectPlayerStorageUnits,
  selectStorageUnit,
  selectTrainingTimer,
  setTrainingItemRotation,
  setTrainingItemState,
  type TrainingModeAction,
  type TrainingModeActionValidation,
  type TrainingModeStorageUnitView,
  type TrainingModeStoreState,
  unequipTrainingItem,
  validateEquipTrainingItem,
  validateDropTrainingItemToGround,
  validateExtractTrainingRunNow,
  validateMoveTrainingItem,
  validateSetTrainingItemRotation,
  validateSetTrainingItemState,
  validateUnequipTrainingItem,
} from '../../state/training-mode'
import { CompartmentGrid } from '../grids/CompartmentGrid'
import { flattenStorageUnitTree } from '../grids/storageTree'
import type { CellTarget, InventoryItemRecord, PlacementTarget } from '../grids/types'
import { toGridLayout } from '../grids/types'
import { GroundLootPanel } from '../ground-loot/GroundLootPanel'
import {
  getItemCounterLabel,
  getItemDescriptor,
  getItemGlyph,
  getItemImageSrc,
  getItemStatusChip,
  getItemTint,
  getWeaponSlotBadge,
} from '../itemPresentation'
import { clsx } from '../utils/clsx'

const LEFT_RAIL_SLOT_IDS: readonly EquipmentSlotId[] = [
  'helmet',
  'mask',
  'primaryWeapon',
  'secondaryWeapon',
]
const RIGHT_RAIL_SLOT_IDS: readonly EquipmentSlotId[] = [
  'headset',
  'ballisticVest',
  'tacticalVest',
  'backpack',
  'pistol',
]

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  helmet: 'Helmet',
  face_shield: 'Face shield',
  mask: 'Mask',
  headset: 'Headset',
  weapon_primary: 'Primary weapon',
  weapon_secondary: 'Secondary weapon',
  weapon_pistol: 'Pistol',
  vest_tactical: 'Tactical vest',
  vest_ballistic: 'Ballistic vest',
  backpack: 'Backpack',
  ammo: 'Ammo',
  ammo_box: 'Ammo box',
  medkit: 'Medkit',
  consumable: 'Consumable',
  container_misc: 'Utility',
}

const toPlacementValidation = (
  validation: TrainingModeActionValidation | null,
): { valid: boolean; reason?: string } | null =>
  validation ? { valid: validation.ok, reason: validation.ok ? undefined : validation.reason } : null

const buildUnequipAction = (item: InventoryItemRecord, target: CellTarget) =>
  unequipTrainingItem(
    item.itemInstanceId,
    target.storageUnitId,
    target.compartmentId,
    target.x,
    target.y,
    item.rotation,
  )

const buildMoveAction = (item: InventoryItemRecord, target: CellTarget) =>
  moveTrainingItem(
    item.itemInstanceId,
    target.storageUnitId,
    target.compartmentId,
    target.x,
    target.y,
    item.rotation,
  )

const describePlacement = (target: PlacementTarget): string =>
  target.kind === 'container'
    ? `moved into ${target.compartmentId}`
    : `equipped in ${target.slotId}`

const getSlotToneClass = (slotId: EquipmentSlotId): string | null => {
  if (slotId === 'primaryWeapon' || slotId === 'secondaryWeapon') {
    return 'equipment-screen__slot--weapon'
  }

  if (slotId === 'pistol') {
    return 'equipment-screen__slot--sidearm'
  }

  if (slotId === 'headset') {
    return 'equipment-screen__slot--headset'
  }

  return null
}

const getSlotHelpLabel = (slot: { slotId: EquipmentSlotId; acceptsCategories: readonly ItemCategory[] }): string =>
  slot.slotId === 'secondaryWeapon'
    ? 'Secondary weapon'
    : slot.acceptsCategories.map((category) => CATEGORY_LABELS[category]).join(' / ')

interface EquipmentScreenProps {
  state: TrainingModeStoreState
  dispatch: Dispatch<TrainingModeAction>
}

interface SlotGroup {
  title: string
  slotIds: readonly EquipmentSlotId[]
  className?: string
}

export function EquipmentScreen({ state, dispatch }: EquipmentScreenProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [activeStorageUnitId, setActiveStorageUnitId] = useState<string | null>(null)
  const [isFaceShieldDialogOpen, setFaceShieldDialogOpen] = useState(false)
  const faceShieldDialogRef = useRef<HTMLDialogElement>(null)
  const [, setStatusMessage] = useState(
    'Select an item, then click any highlighted cell or compatible equipment slot to move it.',
  )

  const equipmentSlots = useMemo(() => selectEquipmentSlots(state), [state])
  const playerStorageUnits = useMemo(() => selectPlayerStorageUnits(state), [state])
  const timer = useMemo(() => selectTrainingTimer(state), [state])
  const playersRemaining = useMemo(() => selectPlayersRemaining(state), [state])
  const securedValue = useMemo(() => selectCurrentSecuredValue(state), [state])
  const operationFeedback = useMemo(() => selectOperationFeedback(state), [state])
  const selectedItem = useMemo(
    () => (selectedItemId ? selectItem(state, selectedItemId) ?? null : null),
    [state, selectedItemId],
  )
  const playerStorageTree = useMemo(
    () =>
      flattenStorageUnitTree(playerStorageUnits, (storageUnitId) => selectStorageUnit(state, storageUnitId)).filter(
        ({ storageUnit }) => storageUnit.sourceItem?.equippedSlotId !== 'pockets',
      ),
    [playerStorageUnits, state],
  )
  const activeStorageUnit = useMemo(
    () => playerStorageTree.find(({ storageUnit }) => storageUnit.storageUnitId === activeStorageUnitId)?.storageUnit,
    [activeStorageUnitId, playerStorageTree],
  )
  const visiblePlayerStorageUnits = useMemo(() => {
    const rootUnits = playerStorageTree.filter(({ depth }) => depth === 0)
    if (!activeStorageUnit) {
      return rootUnits
    }
    // When a nested backpack is active, keep non-backpack root units (e.g. tactical vest)
    // visible and replace only the backpack entry with the active storage unit.
    const nonBackpackRoots = rootUnits.filter(
      ({ storageUnit }) => storageUnit.sourceItem?.category !== 'backpack',
    )
    return [...nonBackpackRoots, { storageUnit: activeStorageUnit, depth: 0 }]
  }, [activeStorageUnit, playerStorageTree])
  const pocketsStorageUnit = useMemo(
    () => playerStorageUnits.find((storageUnit) => storageUnit.sourceItem?.equippedSlotId === 'pockets'),
    [playerStorageUnits],
  )
  const helmetSlot = equipmentSlots.find((slot) => slot.slotId === 'helmet')
  const equippedFaceShield = equipmentSlots.find((slot) => slot.slotId === 'helmetFaceShield')?.item
  const helmetSupportsFaceShield = Boolean(helmetSlot?.item?.tags.includes('supports-face-shield'))
  const faceShieldCandidates = useMemo(() => {
    const itemsById = new Map<string, InventoryItemRecord>()
    const addFaceShield = (item?: InventoryItemRecord) => {
      if (item?.category === 'face_shield') {
        itemsById.set(item.itemInstanceId, item)
      }
    }

    playerStorageTree.forEach(({ storageUnit }) => {
      addFaceShield(storageUnit.sourceItem)
      storageUnit.compartments.forEach((compartment) => compartment.items.forEach(addFaceShield))
    })
    pocketsStorageUnit?.compartments.forEach((compartment) => compartment.items.forEach(addFaceShield))

    selectLootSources(state).forEach((lootSource) => {
      lootSource.topLevelItems.forEach(addFaceShield)
      const lootStorageUnits = selectLootSourceStorageUnits(state, lootSource.lootSourceId)
      const lootTree = flattenStorageUnitTree(lootStorageUnits, (storageUnitId) => selectStorageUnit(state, storageUnitId))
      lootTree.forEach(({ storageUnit }) => {
        addFaceShield(storageUnit.sourceItem)
        storageUnit.compartments.forEach((compartment) => compartment.items.forEach(addFaceShield))
      })
    })

    return [...itemsById.values()].filter((item) =>
      validateEquipTrainingItem(state, equipTrainingItem(item.itemInstanceId, 'helmetFaceShield')).ok,
    )
  }, [playerStorageTree, pocketsStorageUnit, state])

  useEffect(() => {
    if (selectedItemId && !selectedItem) {
      setSelectedItemId(null)
    }
  }, [selectedItem, selectedItemId])

  useEffect(() => {
    if (activeStorageUnitId && !activeStorageUnit) {
      setActiveStorageUnitId(null)
    }
  }, [activeStorageUnit, activeStorageUnitId])

  useEffect(() => {
    const dialog = faceShieldDialogRef.current
    if (!dialog) {
      return
    }

    if (isFaceShieldDialogOpen && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal()
      } else {
        dialog.setAttribute('open', '')
      }
    } else if (!isFaceShieldDialogOpen && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close()
      } else {
        dialog.removeAttribute('open')
      }
    }
  }, [isFaceShieldDialogOpen])

  useEffect(() => {
    if (operationFeedback.lastError) {
      setStatusMessage(operationFeedback.lastError)
    }
  }, [operationFeedback.lastError])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      if (key !== 'r' && key !== 'f') {
        return
      }

      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      event.preventDefault()
      if (key === 'r') {
        handleRotateSelectedItem()
      } else if (draggedItemId && selectedItem?.category === 'backpack') {
        handleToggleSelectedBackpack()
      } else {
        handleMoveSelectedGroundItem()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  function getValidation(target: PlacementTarget) {
    if (!selectedItem) {
      return null
    }

    if (target.kind === 'equipment-slot') {
      return toPlacementValidation(
        validateEquipTrainingItem(state, equipTrainingItem(selectedItem.itemInstanceId, target.slotId)),
      )
    }

    return toPlacementValidation(
      selectedItem.equippedSlotId
        ? validateUnequipTrainingItem(state, buildUnequipAction(selectedItem, target))
        : validateMoveTrainingItem(state, buildMoveAction(selectedItem, target)),
    )
  }

  function getDropToGroundValidation(itemInstanceId: string | null) {
    if (!itemInstanceId) {
      return null
    }

    return toPlacementValidation(validateDropTrainingItemToGround(state, dropTrainingItemToGround(itemInstanceId)))
  }

  function handleItemSelect(itemId: string) {
    setSelectedItemId((current) => (current === itemId ? null : itemId))

    const clickedItem = selectItem(state, itemId)
    if (!clickedItem) {
      return
    }

    setStatusMessage(
      `Selected ${clickedItem.name}. Click a compatible slot or a valid highlighted cell to place it.`,
    )
  }

  function handleContainerOpen(storageUnitId: string) {
    setActiveStorageUnitId(storageUnitId)
    setSelectedItemId(null)
  }

  function handleStorageBack() {
    const parentStorageUnitId = activeStorageUnit?.sourceItem?.parentStorageUnitId
    setActiveStorageUnitId(parentStorageUnitId ?? null)
    setSelectedItemId(null)
  }

  function handlePlaceItem(target: PlacementTarget) {
    if (!selectedItem) {
      return
    }

    const validation = getValidation(target)
    if (!validation?.valid) {
      setStatusMessage(validation?.reason ?? 'Select an item before placing it.')
      return
    }

    dispatch(
      target.kind === 'equipment-slot'
        ? equipTrainingItem(selectedItem.itemInstanceId, target.slotId)
        : selectedItem.equippedSlotId
          ? buildUnequipAction(selectedItem, target)
          : buildMoveAction(selectedItem, target),
    )
    setStatusMessage(`${selectedItem.name} ${describePlacement(target)}.`)
    setSelectedItemId(null)
  }

  function handleEquipmentSlotClick(slotId: EquipmentSlotId) {
    if (slotId === 'helmet' && !selectedItem && helmetSupportsFaceShield) {
      setFaceShieldDialogOpen(true)
      return
    }

    handlePlaceItem({ kind: 'equipment-slot', slotId })
  }

  function handleEquipmentItemClick(slotId: EquipmentSlotId, item: InventoryItemRecord) {
    if (slotId === 'helmet' && item.tags.includes('supports-face-shield')) {
      setSelectedItemId(null)
      setFaceShieldDialogOpen(true)
      return
    }

    handleItemSelect(item.itemInstanceId)
  }

  function handleFaceShieldEquip(item: InventoryItemRecord) {
    const action = equipTrainingItem(item.itemInstanceId, 'helmetFaceShield')
    const validation = validateEquipTrainingItem(state, action)
    if (!validation.ok) {
      setStatusMessage(validation.reason ?? 'This face shield cannot be equipped.')
      return
    }

    dispatch(action)
    setSelectedItemId(null)
    setFaceShieldDialogOpen(false)
  }

  function handleFaceShieldRemove() {
    if (!equippedFaceShield) {
      return
    }

    const dropAction = dropTrainingItemToGround(equippedFaceShield.itemInstanceId)
    const dropValidation = validateDropTrainingItemToGround(state, dropAction)
    if (dropValidation.ok) {
      dispatch(dropAction)
      setSelectedItemId(null)
      setFaceShieldDialogOpen(false)
      setStatusMessage(`${equippedFaceShield.name} returned to the ground stash.`)
      return
    }

    setStatusMessage(dropValidation.reason ?? 'This face shield cannot be removed right now.')
  }

  function handleDropToGround(itemInstanceId = selectedItemId) {
    if (!itemInstanceId) {
      setStatusMessage('Select an item before dropping it to the ground.')
      return
    }

    const item = selectItem(state, itemInstanceId)
    const validation = getDropToGroundValidation(itemInstanceId)

    if (!validation?.valid) {
      setStatusMessage(validation?.reason ?? 'This item cannot be dropped to the ground.')
      return
    }

    if (!item) {
      setStatusMessage(`Unknown item instance "${itemInstanceId}".`)
      setSelectedItemId(null)
      return
    }

    dispatch(dropTrainingItemToGround(itemInstanceId))
    setStatusMessage(`${item.name} dropped to the ground.`)
    setSelectedItemId(null)
  }

  function handleRotateSelectedItem() {
    if (!selectedItem?.allowRotation) {
      return
    }

    const nextRotation = selectedItem.rotation === 90 ? 0 : 90
    const action = setTrainingItemRotation(selectedItem.itemInstanceId, nextRotation)
    const validation = toPlacementValidation(validateSetTrainingItemRotation(state, action))

    if (!validation?.valid) {
      setStatusMessage(validation?.reason ?? 'This item cannot rotate right now.')
      return
    }

    dispatch(action)
    setStatusMessage(`${selectedItem.name} rotated to ${nextRotation}°.`)
  }

  function handleToggleSelectedBackpack() {
    if (selectedItem?.category !== 'backpack') {
      return
    }

    const currentState = state.catalog.itemStatesById[selectedItem.stateId]
    const currentIsOpen = currentState?.tags.includes('state-open')
    const targetState = selectedItem.availableStateIds
      .map((stateId) => state.catalog.itemStatesById[stateId])
      .find((candidate) => candidate && candidate.tags.includes(currentIsOpen ? 'state-collapsed' : 'state-open'))

    if (!targetState) {
      setStatusMessage(`${selectedItem.name} cannot be opened or closed.`)
      return
    }

    const action = setTrainingItemState(selectedItem.itemInstanceId, targetState.id)
    const validation = toPlacementValidation(validateSetTrainingItemState(state, action))

    if (!validation?.valid) {
      setStatusMessage(validation?.reason ?? `This backpack cannot be ${currentIsOpen ? 'closed' : 'opened'} right now.`)
      return
    }

    dispatch(action)
    setStatusMessage(`${selectedItem.name} ${currentIsOpen ? 'closed' : 'opened'}.`)
  }

  function handleMoveSelectedGroundItem() {
    if (!selectedItem || !selectedItem.ownerEntityId.startsWith('loot-source-')) {
      return
    }

    const findFirstContainerTarget = (storageUnits: readonly TrainingModeStorageUnitView[]): CellTarget | null => {
      for (const storageUnit of storageUnits) {
        for (const compartment of storageUnit.compartments) {
          for (let y = 0; y < compartment.shapeMask.length; y += 1) {
            for (let x = 0; x < (compartment.shapeMask[y]?.length ?? 0); x += 1) {
              if (compartment.shapeMask[y]?.[x] !== '1') continue
              const target: CellTarget = {
                kind: 'container',
                storageUnitId: storageUnit.storageUnitId,
                compartmentId: compartment.compartmentId,
                x,
                y,
              }
              if (getValidation(target)?.valid) return target
            }
          }
        }
      }
      return null
    }

    const pocketTarget = pocketsStorageUnit ? findFirstContainerTarget([pocketsStorageUnit]) : null
    const equipmentTarget = equipmentSlots
      .filter((slot) => slot.slotId !== 'pockets' && slot.slotId !== 'backpack' && !slot.item)
      .map((slot) => ({ kind: 'equipment-slot' as const, slotId: slot.slotId }))
      .find((target) => getValidation(target)?.valid)
    const backpackSlotTarget = equipmentSlots
      .filter((slot) => slot.slotId === 'backpack')
      .map((slot) => ({ kind: 'equipment-slot' as const, slotId: slot.slotId }))
      .find((target) => getValidation(target)?.valid)
    const tacticalVestTarget = findFirstContainerTarget(
      playerStorageTree
        .filter(({ storageUnit }) => storageUnit.sourceItem?.category === 'vest_tactical')
        .map(({ storageUnit }) => storageUnit),
    )
    const backpackTarget = findFirstContainerTarget(
      playerStorageTree
        .filter(({ storageUnit }) => storageUnit.sourceItem?.category === 'backpack')
        .map(({ storageUnit }) => storageUnit),
    )
    const target = pocketTarget ?? equipmentTarget ?? backpackSlotTarget ?? tacticalVestTarget ?? backpackTarget

    if (!target) {
      setStatusMessage(`No valid destination found for ${selectedItem.name}.`)
      return
    }

    handlePlaceItem(target)
  }

  function handleExtractNow() {
    const validation = toPlacementValidation(validateExtractTrainingRunNow(state))
    if (!validation?.valid) {
      setStatusMessage(validation?.reason ?? 'Extraction is unavailable.')
      return
    }

    dispatch(extractTrainingRunNow())
  }

  const slotGroups: readonly SlotGroup[] = [
    {
      title: 'Operator rig',
      slotIds: LEFT_RAIL_SLOT_IDS,
      className: 'equipment-screen__slots equipment-screen__slots--operator',
    },
  ] as const
  const rightRailSlots = equipmentSlots.filter((slot) => RIGHT_RAIL_SLOT_IDS.includes(slot.slotId))

  return (
    <div className="equipment-screen">
      <div className="equipment-screen__shell">
        <header className="equipment-screen__panel equipment-screen__header">
          <div className="equipment-screen__header-copy">
            <h1 className="equipment-screen__title">Loadout staging</h1>
          </div>

          <div className="equipment-screen__hud-readout">
            <span className="equipment-screen__header-pill-label">Time remaining</span>
            <span className="equipment-screen__header-pill-value">{timer.formattedRemaining}</span>
            <span className="equipment-screen__header-pill-meta" data-testid="players-remaining">
              {playersRemaining.remaining} / {playersRemaining.total} players remaining
            </span>
          </div>

          <div className="equipment-screen__hud-readout equipment-screen__hud-readout--accent">
            <span className="equipment-screen__header-pill-label">Current score</span>
            <span className="equipment-screen__header-pill-value" data-testid="secured-value">
              ${Math.max(0, securedValue - timer.currentTimePenaltyPoints).toLocaleString()}
            </span>
            <span className="equipment-screen__header-pill-meta" data-testid="score-penalty">
              Secured ${securedValue.toLocaleString()} · −${timer.currentTimePenaltyPoints.toLocaleString()} time
            </span>
          </div>

          <button
            className=" equipment-screen__hud-readout equipment-screen__action equipment-screen__action--extract"
            onClick={handleExtractNow}
            type="button"
          >
            Extract Now
          </button>

        </header>

        <div className="equipment-screen__main">
          <aside className="equipment-screen__column">
            {slotGroups.map((group) => (
              <section key={group.title}>
                <div className={group.className ?? 'equipment-screen__slots'}>
                  {equipmentSlots
                    .filter((slot) => group.slotIds.includes(slot.slotId))
                    .map((slot) => {
                      const validation = getValidation({
                        kind: 'equipment-slot',
                        slotId: slot.slotId,
                      })

                      return (
                        <button
                          className={clsx(
                            'equipment-screen__slot',
                            getSlotToneClass(slot.slotId),
                            validation?.valid && 'equipment-screen__slot--valid',
                            validation && !validation.valid && 'equipment-screen__slot--invalid',
                          )}
                          data-slot-id={slot.slotId}
                          key={slot.slotId}
                          onClick={() => handleEquipmentSlotClick(slot.slotId)}
                          onDragOver={(event) => {
                            if (validation?.valid) {
                              event.preventDefault()
                            }
                          }}
                          onDrop={(event) => {
                            event.preventDefault()
                            handlePlaceItem({ kind: 'equipment-slot', slotId: slot.slotId })
                          }}
                          type="button"
                        >
                          <span className="equipment-screen__slot-frame-label">{slot.label}</span>
                          {slot.item ? (
                            <span
                              className={clsx(
                                'equipment-screen__slot-item',
                                selectedItemId === slot.item.itemInstanceId && 'equipment-screen__slot-item--selected',
                              )}
                              aria-label={slot.item.name}
                              data-testid={`slot-item-${slot.slotId}`}
                              draggable
                              onClick={(event) => {
                                event.stopPropagation()
                                handleEquipmentItemClick(slot.slotId, slot.item!)
                              }}
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'move'
                                event.dataTransfer.setData('text/plain', slot.item!.itemInstanceId)
                                handleItemSelect(slot.item!.itemInstanceId)
                                setDraggedItemId(slot.item!.itemInstanceId)
                              }}
                              onDragEnd={() => setDraggedItemId(null)}
                              role="button"
                              style={
                                {
                                  '--item-tint': getItemTint(slot.item),
                                } as CSSProperties
                              }
                              tabIndex={0}
                              title={slot.item.name}
                            >
                              <span className="equipment-screen__slot-item-nameplate">{slot.item.name}</span>
                              <span className="equipment-screen__slot-item-art" aria-hidden="true">
                                {getItemImageSrc(slot.item) ? (
                                  <img alt="" src={getItemImageSrc(slot.item) ?? undefined} />
                                ) : (
                                  getItemGlyph(slot.item)
                                )}
                              </span>
                              {getItemStatusChip(slot.item) ? (
                                <span className="equipment-screen__slot-item-chip equipment-screen__slot-item-chip--top-right">
                                  {getItemStatusChip(slot.item)}
                                </span>
                              ) : null}
                              {getWeaponSlotBadge(slot.slotId) ? (
                                <span className="equipment-screen__slot-item-chip equipment-screen__slot-item-chip--badge">
                                  {getWeaponSlotBadge(slot.slotId)}
                                </span>
                              ) : null}
                              <span className="equipment-screen__slot-item-chip equipment-screen__slot-item-chip--bottom-left">
                                {getItemDescriptor(slot.item)}
                              </span>
                              <span className="equipment-screen__slot-item-chip equipment-screen__slot-item-chip--bottom-right">
                                {getItemCounterLabel(slot.item)}
                              </span>
                            </span>
                          ) : (
                            <span className="equipment-screen__slot-empty">
                              <span className="equipment-screen__slot-empty-icon" aria-hidden="true">
                                +
                              </span>
                              <span className="equipment-screen__slot-help">
                                {getSlotHelpLabel(slot)}
                              </span>
                            </span>
                          )}
                        </button>
                      )
                    })}
                </div>
              </section>
            ))}
          </aside>

          <div className="equipment-screen__operator-area">
            <section className="equipment-screen__silhouette" aria-hidden="true">
              <div className="equipment-screen__mannequin">
                <div className="equipment-screen__operator-stage">
                  <img src={operatorImage} alt="" className="equipment-screen__operator-image" />
                </div>
              </div>
            </section>

            <section className="equipment-screen__column equipment-screen__operator-loadout">
              <section className="equipment-screen__operator-items">
                <section className="equipment-screen__pockets equipment-screen__panel" aria-label="Pockets">
                  <h3 className="equipment-screen__slot-frame-label equipment-screen__pockets-title">Pockets</h3>
                  {pocketsStorageUnit ? (
                    <CompartmentGrid
                      getPlacementValidation={(target) => getValidation(target)}
                      items={pocketsStorageUnit.compartments.flatMap((compartment) => compartment.items)}
                      equipment-screen__column equipment-screen__panel equipment-screen__silhouette layout={toGridLayout(pocketsStorageUnit)}
                      onItemSelect={handleItemSelect}
                      onItemDragChange={setDraggedItemId}
                      onContainerOpen={handleContainerOpen}
                      onPlaceItem={handlePlaceItem}
                      selectedItem={selectedItem}
                      selectedItemId={selectedItemId}
                    />
                  ) : null}
                </section>

                <div className="equipment-screen__slots equipment-screen__slots--quick">
                  {rightRailSlots.map((slot) => {
                    const validation = getValidation({
                      kind: 'equipment-slot',
                      slotId: slot.slotId,
                    })

                    return (
                      <button
                        className={clsx(
                          'equipment-screen__slot',
                          getSlotToneClass(slot.slotId),
                          validation?.valid && 'equipment-screen__slot--valid',
                          validation && !validation.valid && 'equipment-screen__slot--invalid',
                        )}
                        data-slot-id={slot.slotId}
                        data-testid={`slot-target-${slot.slotId}`}
                        key={slot.slotId}
                        onClick={() => handleEquipmentSlotClick(slot.slotId)}
                        onDragOver={(event) => {
                          if (validation?.valid) {
                            event.preventDefault()
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          handlePlaceItem({ kind: 'equipment-slot', slotId: slot.slotId })
                        }}
                        type="button"
                      >
                        <span className="equipment-screen__slot-frame-label">{slot.label}</span>
                        {slot.item ? (
                          <span
                            className={clsx(
                              'equipment-screen__slot-item',
                              selectedItemId === slot.item.itemInstanceId && 'equipment-screen__slot-item--selected',
                            )}
                            aria-label={slot.item.name}
                            data-testid={`slot-item-${slot.slotId}`}
                            draggable
                            onClick={(event) => {
                              event.stopPropagation()
                              handleEquipmentItemClick(slot.slotId, slot.item!)
                            }}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = 'move'
                              event.dataTransfer.setData('text/plain', slot.item!.itemInstanceId)
                              handleItemSelect(slot.item!.itemInstanceId)
                              setDraggedItemId(slot.item!.itemInstanceId)
                            }}
                            onDragEnd={() => setDraggedItemId(null)}
                            role="button"
                            style={{ '--item-tint': getItemTint(slot.item) } as CSSProperties}
                            tabIndex={0}
                            title={slot.item.name}
                          >
                            <span className="equipment-screen__slot-item-nameplate">{slot.item.name}</span>
                            <span className="equipment-screen__slot-item-art" aria-hidden="true">
                              {getItemImageSrc(slot.item) ? (
                                <img alt="" src={getItemImageSrc(slot.item) ?? undefined} />
                              ) : (
                                getItemGlyph(slot.item)
                              )}
                            </span>
                            {getItemStatusChip(slot.item) ? (
                              <span className="equipment-screen__slot-item-chip equipment-screen__slot-item-chip--top-right">
                                {getItemStatusChip(slot.item)}
                              </span>
                            ) : null}
                            <span className="equipment-screen__slot-item-chip equipment-screen__slot-item-chip--bottom-left">
                              {getItemDescriptor(slot.item)}
                            </span>
                            <span className="equipment-screen__slot-item-chip equipment-screen__slot-item-chip--bottom-right">
                              {getItemCounterLabel(slot.item)}
                            </span>
                          </span>
                        ) : (
                          <span className="equipment-screen__slot-empty">
                            <span className="equipment-screen__slot-empty-icon" aria-hidden="true">
                              +
                            </span>
                            <span className="equipment-screen__slot-help">
                              {getSlotHelpLabel(slot)}
                            </span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>

              <div className="equipment-screen__storage-stack">
                {activeStorageUnit?.sourceItem?.parentStorageUnitId ? (
                  <button className="equipment-screen__storage-back" onClick={handleStorageBack} type="button">
                    ← Back to outer backpack
                  </button>
                ) : null}
                {visiblePlayerStorageUnits.map(({ storageUnit, depth }) => (
                  <div
                    className={clsx(
                      'equipment-screen__storage-node',
                      storageUnit.sourceItem?.equippedSlotId === 'backpack' &&
                      'equipment-screen__storage-node--backpack',
                      storageUnit.sourceItem?.equippedSlotId === 'tacticalVest' &&
                      'equipment-screen__storage-node--tactical-vest',
                    )}
                    key={storageUnit.storageUnitId}
                    style={{ '--storage-depth': `${depth * 14}px` } as CSSProperties}
                  >
                    {storageUnit.sourceItem &&
                      storageUnit.sourceItem.equippedSlotId !== 'tacticalVest' &&
                      storageUnit.sourceItem.equippedSlotId !== 'backpack' ? (
                      <button
                        className={clsx(
                          'equipment-screen__storage-source',
                          selectedItemId === storageUnit.sourceItem.itemInstanceId &&
                          'equipment-screen__storage-source--selected',
                        )}
                        data-testid={`storage-source-${storageUnit.sourceItem.itemInstanceId}`}
                        onClick={() => handleItemSelect(storageUnit.sourceItem!.itemInstanceId)}
                        style={
                          {
                            '--item-tint': getItemTint(storageUnit.sourceItem),
                          } as CSSProperties
                        }
                        type="button"
                      >
                        <span className="equipment-screen__storage-source-nameplate">
                          {storageUnit.sourceItem.name}
                        </span>
                        <span className="equipment-screen__storage-source-art" aria-hidden="true">
                          {getItemImageSrc(storageUnit.sourceItem) ? (
                            <img alt="" src={getItemImageSrc(storageUnit.sourceItem) ?? undefined} />
                          ) : (
                            getItemGlyph(storageUnit.sourceItem)
                          )}
                        </span>
                        <span className="equipment-screen__storage-source-footer">
                          <strong>{storageUnit.layoutName}</strong>
                          <span>{getItemCounterLabel(storageUnit.sourceItem)}</span>
                        </span>
                      </button>
                    ) : null}

                    <CompartmentGrid
                      getPlacementValidation={(target) => getValidation(target)}
                      items={storageUnit.compartments.flatMap((compartment) => compartment.items)}
                      layout={toGridLayout(storageUnit)}
                      onItemSelect={handleItemSelect}
                      onItemDragChange={setDraggedItemId}
                      onContainerOpen={handleContainerOpen}
                      onPlaceItem={handlePlaceItem}
                      selectedItem={selectedItem}
                      selectedItemId={selectedItemId}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="equipment-screen__column equipment-screen__ground-column">
            <GroundLootPanel
              getPlacementValidation={(target) => getValidation(target)}
              onDropToGround={handleDropToGround}
              onItemDragChange={setDraggedItemId}
              onItemSelect={handleItemSelect}
              onPlaceItem={handlePlaceItem}
              selectedItem={selectedItem}
              selectedItemId={selectedItemId}
              state={state}
            />
          </aside>
        </div>

        <dialog
          aria-labelledby="face-shield-dialog-title"
          aria-modal="true"
          className="equipment-screen__face-shield-dialog"
          onCancel={(event) => {
            event.preventDefault()
            setFaceShieldDialogOpen(false)
          }}
          onClose={() => setFaceShieldDialogOpen(false)}
          ref={faceShieldDialogRef}
        >
          <div className="equipment-screen__face-shield-dialog-header">
            <div>
              <p className="equipment-screen__face-shield-dialog-kicker">Helmet attachment</p>
              <h2 id="face-shield-dialog-title">Equip face shield</h2>
            </div>
            <button onClick={() => setFaceShieldDialogOpen(false)} type="button">
              Close
            </button>
          </div>

          <p className="equipment-screen__face-shield-dialog-copy">
            {helmetSlot?.item ? `Compatible with ${helmetSlot.item.name}.` : 'Choose a compatible face shield.'}
          </p>

          {equippedFaceShield ? (
            <div className="equipment-screen__face-shield-current">
              <span>Equipped</span>
              <strong>{equippedFaceShield.name}</strong>
              <span>{getItemCounterLabel(equippedFaceShield)}</span>
              <button onClick={handleFaceShieldRemove} type="button">
                Remove
              </button>
            </div>
          ) : null}

          {faceShieldCandidates.length > 0 ? (
            <div className="equipment-screen__face-shield-options">
              {faceShieldCandidates.map((item) => (
                <button
                  className="equipment-screen__face-shield-option"
                  key={item.itemInstanceId}
                  onClick={() => handleFaceShieldEquip(item)}
                  style={{ '--item-tint': getItemTint(item) } as CSSProperties}
                  type="button"
                >
                  <span className="equipment-screen__face-shield-art" aria-hidden="true">
                    {getItemImageSrc(item) ? <img alt="" src={getItemImageSrc(item) ?? undefined} /> : getItemGlyph(item)}
                  </span>
                  <span className="equipment-screen__face-shield-option-copy">
                    <strong>{item.name}</strong>
                    <span>{getItemDescriptor(item)}</span>
                  </span>
                  <span className="equipment-screen__face-shield-option-count">{getItemCounterLabel(item)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="equipment-screen__face-shield-empty">No compatible face shields available.</p>
          )}
        </dialog>
      </div>
    </div>
  )
}
