import './GroundLootPanel.css'

import type { CSSProperties } from 'react'
import { useMemo } from 'react'

import {
  selectLootSourceStorageUnits,
  selectLootSources,
  selectStorageUnit,
  type TrainingModeStoreState,
} from '../../state/training-mode'
import { getItemBounds } from '../grids/gridGeometry'
import { flattenStorageUnitTree } from '../grids/storageTree'
import type { CellTarget, InventoryItemRecord } from '../grids/types'
import { getItemGlyph, getItemImageSrc, getItemTint } from '../itemPresentation'
import { clsx } from '../utils/clsx'

interface GroundLootPanelProps {
  state: TrainingModeStoreState
  selectedItemId: string | null
  selectedItem: InventoryItemRecord | null
  onDropToGround: (itemId?: string) => void
  onItemDragChange?: (itemId: string | null) => void
  onItemSelect: (itemId: string) => void
  onPlaceItem: (target: CellTarget) => void
  getPlacementValidation: (target: CellTarget) => { valid: boolean; reason?: string } | null
}

const formatValueLabel = (baseValue: number) => `Approx. value $${baseValue.toLocaleString()}`

const setTooltipSide = (tile: HTMLDivElement) => {
  const grid = tile.parentElement
  if (!grid) {
    return
  }

  const tileBounds = tile.getBoundingClientRect()
  const gridBounds = grid.getBoundingClientRect()
  const gridLeft = gridBounds.left + grid.clientLeft
  const gridRight = gridLeft + grid.clientWidth
  const minSideSpace = 244
  const side =
    gridRight - tileBounds.right >= minSideSpace
      ? 'right'
      : tileBounds.left - gridLeft >= minSideSpace
        ? 'left'
        : 'center'

  tile.dataset.tooltipSide = side
}

export function GroundLootPanel(props: GroundLootPanelProps) {
  const { state, selectedItemId, onDropToGround, onItemDragChange, onItemSelect } = props
  const lootSources = useMemo(() => selectLootSources(state), [state])

  const groundLootItems = useMemo(() => {
    const seen = new Set<string>()
    const items: InventoryItemRecord[] = []

    const pushItem = (item?: InventoryItemRecord) => {
      if (!item || seen.has(item.itemInstanceId)) {
        return
      }

      seen.add(item.itemInstanceId)
      items.push(item)
    }

    lootSources.forEach((lootSource) => {
      lootSource.topLevelItems.forEach(pushItem)

      const rootStorageUnits = selectLootSourceStorageUnits(state, lootSource.lootSourceId)
      const storageTree = flattenStorageUnitTree(rootStorageUnits, (storageUnitId) => selectStorageUnit(state, storageUnitId))

      storageTree.forEach(({ storageUnit }) => {
        pushItem(storageUnit.sourceItem)
        storageUnit.compartments.forEach((compartment) => {
          compartment.items.forEach(pushItem)
        })
      })
    })

    return items
  }, [lootSources, state])

  return (
    <section className="ground-loot-panel__stash">
      <header className="ground-loot-panel__header">
        <div>
          <p className="ground-loot-panel__kicker">Ground stash</p>
        </div>
        <span className="ground-loot-panel__badge">{groundLootItems.length} items</span>
      </header>

      <div
        className={clsx('ground-loot-panel__grid', groundLootItems.length === 0 && 'ground-loot-panel__grid--empty')}
        data-testid="ground-loot-grid"
        onDragOver={(event) => {
          event.preventDefault()
        }}
        onDrop={(event) => {
          event.preventDefault()
          const itemInstanceId = event.dataTransfer.getData('text/plain') || selectedItemId || undefined
          onDropToGround(itemInstanceId)
        }}
      >
        {groundLootItems.length === 0 ? (
          <div className="ground-loot-panel__empty-state">
            <p className="ground-loot-panel__empty-title">Loot feed offline</p>
            <p className="ground-loot-panel__empty-copy">Loot drops will pack into this unified grid as bots die.</p>
          </div>
        ) : (
          groundLootItems.map((item) => {
            const tooltipId = `ground-loot-tooltip-${item.itemInstanceId}`
            const bounds = getItemBounds(item)

            return (
              <div
                className="ground-loot-panel__tile"
                key={item.itemInstanceId}
                onFocusCapture={(event) => setTooltipSide(event.currentTarget)}
                onPointerEnter={(event) => setTooltipSide(event.currentTarget)}
                style={
                  {
                    '--loot-item-columns': String(bounds.width),
                    '--loot-item-rows': String(bounds.height),
                  } as CSSProperties
                }
              >
                <button
                  aria-label={item.name}
                  aria-describedby={tooltipId}
                  className={clsx(
                    'ground-loot-panel__item-card',
                    selectedItemId === item.itemInstanceId && 'ground-loot-panel__item-card--selected',
                  )}
                  data-testid={`item-${item.itemInstanceId}`}
                  draggable
                  onClick={() => onItemSelect(item.itemInstanceId)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', item.itemInstanceId)
                    onItemSelect(item.itemInstanceId)
                    onItemDragChange?.(item.itemInstanceId)
                  }}
                  onDragEnd={() => onItemDragChange?.(null)}
                  style={{ '--item-tint': getItemTint(item) } as CSSProperties}
                  type="button"
                >
                  <span className="ground-loot-panel__item-art" aria-hidden="true">
                    {getItemImageSrc(item) ? (
                      <img
                        alt=""
                        src={getItemImageSrc(item) ?? undefined}
                        style={item.rotation === 90 ? { transform: 'rotate(90deg)' } : undefined}
                      />
                    ) : (
                      getItemGlyph(item)
                    )}
                  </span>
                </button>

                <div className="ground-loot-panel__tooltip" id={tooltipId} role="tooltip">
                  <p className="ground-loot-panel__tooltip-title">{item.name}</p>
                  <p className="ground-loot-panel__tooltip-row">
                    <span aria-hidden="true">{getItemGlyph(item)}</span>
                    <span>{formatValueLabel(item.baseValue)}</span>
                  </p>
                  <p className="ground-loot-panel__tooltip-hint">Click or drag to move</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
