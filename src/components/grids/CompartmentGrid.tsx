import './CompartmentGrid.css'

import type { CSSProperties } from 'react'

import {
  getItemGlyph,
  getItemImageSrc,
  getItemTint,
} from '../itemPresentation'
import { clsx } from '../utils/clsx'
import { getItemBounds, getRegionById, getRegionCellSet } from './gridGeometry'
import type { CellTarget, GridLayout, InventoryItemRecord } from './types'

interface PlacementValidation {
  valid: boolean
  reason?: string
}

interface CompartmentGridProps {
  layout: GridLayout
  items: readonly InventoryItemRecord[]
  selectedItemId: string | null
  selectedItem: InventoryItemRecord | null
  onItemSelect: (itemId: string) => void
  onContainerOpen?: (storageUnitId: string) => void
  onPlaceItem: (target: CellTarget) => void
  getPlacementValidation?: (target: CellTarget) => PlacementValidation | null
}

export function CompartmentGrid({
  layout,
  items,
  selectedItemId,
  selectedItem,
  onItemSelect,
  onContainerOpen,
  onPlaceItem,
  getPlacementValidation,
}: CompartmentGridProps) {
  const hasSlotDividers = layout.testId === 'pockets'
  const columnGroupStarts = new Set(layout.regions.map((region) => region.originX).filter((origin) => origin > 0))
  const rowGroupStarts = new Set(layout.regions.map((region) => region.originY).filter((origin) => origin > 0))
  const getGroupOffset = (starts: Set<number>, origin: number) =>
    [...starts].filter((start) => start <= origin).length

  return (
    <section className={clsx('inventory-panel', layout.regions.length > 1 && 'inventory-panel--grouped')}>
      <div
        aria-label={layout.label}
        className={clsx(
          'compartment-grid',
          layout.regions.length > 1 && 'compartment-grid--grouped',
          hasSlotDividers && 'compartment-grid--slot-divided',
        )}
        data-testid={`grid-${layout.testId ?? layout.id}`}
        role="grid"
        style={
          {
            '--grid-columns': String(layout.width),
            '--grid-rows': String(layout.height),
            '--column-group-gaps': String(columnGroupStarts.size),
            '--row-group-gaps': String(rowGroupStarts.size),
            '--column-slot-gaps': String(hasSlotDividers ? layout.width - 1 : 0),
          } as CSSProperties
        }
      >
        {layout.regions.map((region) => {
          const validCells = getRegionCellSet(region)
          const regionCells = Array.from(validCells, (value) => {
            const [x, y] = value.split(':').map(Number)
            return { x, y }
          })
          const columnOffset = getGroupOffset(columnGroupStarts, region.originX)
          const rowOffset = getGroupOffset(rowGroupStarts, region.originY)

          return (
            <div key={region.id}>
              {regionCells.map((cell) => {
                const target: CellTarget = {
                  kind: 'container',
                  storageUnitId: layout.id,
                  compartmentId: region.id,
                  x: cell.x,
                  y: cell.y,
                }

                const validation = selectedItem === null ? null : getPlacementValidation?.(target) ?? null

                const isSelectedOrigin =
                  selectedItem?.parentStorageUnitId === layout.id &&
                  selectedItem?.parentCompartmentId === region.id &&
                  selectedItem?.gridX === cell.x &&
                  selectedItem?.gridY === cell.y

                return (
                  <div
                    aria-label={`${layout.label} ${region.label} cell ${cell.x + 1}, ${cell.y + 1}`}
                    className={clsx(
                      'compartment-grid__cell',
                      validation?.valid && 'compartment-grid__cell--valid',
                      validation && !validation.valid && 'compartment-grid__cell--invalid',
                      isSelectedOrigin && 'compartment-grid__cell--valid',
                    )}
                    data-testid={`cell-${layout.testId ?? layout.id}-${region.id}-${cell.x}-${cell.y}`}
                    key={`${region.id}-${cell.x}-${cell.y}`}
                    onClick={() => onPlaceItem(target)}
                    onDragOver={(event) => {
                      if (validation?.valid) {
                        event.preventDefault()
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      onPlaceItem(target)
                    }}
                    role="gridcell"
                    style={
                      {
                        '--region-fill': `color-mix(in srgb, ${region.accent} 10%, #141519)`,
                        left: `calc(${region.originX + cell.x} * var(--cell-size) + ${hasSlotDividers ? region.originX + cell.x : columnOffset
                          } * var(--group-gap))`,
                        top: `calc(${region.originY + cell.y} * var(--cell-size) + ${rowOffset} * var(--group-gap))`,
                        width: 'var(--cell-size)',
                        height: 'var(--cell-size)',
                      } as CSSProperties
                    }
                    tabIndex={0}
                  />
                )
              })}
            </div>
          )
        })}

        {items.map((record) => {
          const region = record.parentCompartmentId ? getRegionById(layout, record.parentCompartmentId) : undefined
          if (!region) {
            return null
          }

          const bounds = getItemBounds(record)
          const columnOffset = getGroupOffset(columnGroupStarts, region.originX)
          const rowOffset = getGroupOffset(rowGroupStarts, region.originY)
          return (
            <button
              className={clsx(
                'compartment-grid__item',
                selectedItemId === record.itemInstanceId && 'compartment-grid__item--selected',
              )}
              data-testid={`item-${record.itemInstanceId}`}
              draggable
              key={record.itemInstanceId}
              onClick={() => {
                if (record.containerStorageUnitId && onContainerOpen) {
                  onContainerOpen(record.containerStorageUnitId)
                  return
                }

                onItemSelect(record.itemInstanceId)
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', record.itemInstanceId)
                onItemSelect(record.itemInstanceId)
              }}
              style={
                {
                  '--item-tint': getItemTint(record),
                  left: `calc(${region.originX + (record.gridX ?? 0)} * var(--cell-size) + ${hasSlotDividers ? region.originX + (record.gridX ?? 0) : columnOffset
                    } * var(--group-gap))`,
                  top: `calc(${region.originY + (record.gridY ?? 0)} * var(--cell-size) + ${rowOffset} * var(--group-gap))`,
                  width: `calc(${bounds.width} * var(--cell-size))`,
                  height: `calc(${bounds.height} * var(--cell-size))`,
                } as CSSProperties
              }
              type="button"
            >
              <span className="compartment-grid__item-art" aria-hidden="true">
                {getItemImageSrc(record) ? <img alt="" src={getItemImageSrc(record) ?? undefined} /> : getItemGlyph(record)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
