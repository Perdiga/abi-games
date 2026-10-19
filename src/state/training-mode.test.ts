import { describe, expect, it } from 'vitest'
import { createCatalogIndex } from '../data'
import { addItemInstance, createItemInstance, equipItemToSlot } from '../engine/inventory'
import {
  beginTrainingRun,
  createTrainingModeStore,
  dropTrainingItemToGround,
  equipTrainingItem,
  extractTrainingRunNow,
  moveTrainingItem,
  selectCurrentSecuredValue,
  selectEquipmentSlots,
  selectPlayerStorageUnits,
  selectProjectedScoreBreakdown,
  selectTrainingStatus,
  trainingModeReducer,
  validateDropTrainingItemToGround,
  validateMoveTrainingItem,
} from './training-mode'

const catalog = createCatalogIndex()

describe('training mode store validators', () => {
  it('updates the extraction reference and stars when optimization finishes after the results screen opens', () => {
    let state = trainingModeReducer(createTrainingModeStore(catalog), beginTrainingRun(7))
    const snapshot = state.run.perfectExtraction!.inventory
    const pistol = createItemInstance('weapon-pistol-service', catalog, { id: 'secured-pistol', ownerEntityId: 'player' })
    const inventory = addItemInstance(state.run.inventory, pistol, catalog)
    const equipped = equipItemToSlot(inventory, pistol.id, 'pistol', catalog)
    expect(equipped.ok).toBe(true)
    if (!equipped.ok) return
    state = { ...state, run: { ...state.run, inventory: equipped.state, elapsedSeconds: 165 } }
    state = trainingModeReducer(state, extractTrainingRunNow())
    const before = state.run.score!
    const maximum = before.grossScore * 2
    state = trainingModeReducer(state, { type: 'RESOLVE_PERFECT_EXTRACTION', inventory: snapshot, maximumPotentialScore: maximum })
    expect(state.run.perfectExtraction?.status).toBe('ready')
    expect(state.run.score).toMatchObject({ ...before, maximumPotentialScore: maximum, starRating: 2 })
    expect(state.run.perfectExtraction?.inventory).toBe(snapshot)
  })

  it('ignores optimization results belonging to a previous run', () => {
    const first = trainingModeReducer(createTrainingModeStore(catalog), beginTrainingRun(7))
    const extracted = trainingModeReducer(first, extractTrainingRunNow())
    const restarted = trainingModeReducer(extracted, beginTrainingRun(42))
    expect(trainingModeReducer(restarted, {
      type: 'RESOLVE_PERFECT_EXTRACTION', inventory: first.run.perfectExtraction!.inventory, maximumPotentialScore: 999999,
    })).toBe(restarted)
  })

  it('marks failed optimization as unavailable rather than inventing a perfect value', () => {
    const state = trainingModeReducer(createTrainingModeStore(catalog), beginTrainingRun(7))
    const failed = trainingModeReducer(state, { type: 'RESOLVE_PERFECT_EXTRACTION', inventory: state.run.perfectExtraction!.inventory })
    expect(failed.run.perfectExtraction?.status).toBe('error')
    expect(failed.run.maximumPotentialScore).toBe(0)
  })

  it('starts a run with the player starter loadout, no secured storage, and zero projected score', () => {
    let state = createTrainingModeStore(catalog)
    state = trainingModeReducer(state, beginTrainingRun(7))

    expect(selectEquipmentSlots(state).find((slot) => slot.slotId === 'pockets')?.item).toBeDefined()
    expect(selectEquipmentSlots(state).filter((slot) => slot.slotId !== 'pockets').every((slot) => slot.item === undefined)).toBe(true)
    expect(selectPlayerStorageUnits(state)).toHaveLength(1)
    expect(selectCurrentSecuredValue(state)).toBe(0)
    expect(selectProjectedScoreBreakdown(state)).toMatchObject({
      grossScore: 0,
      finalScore: 0,
      starRating: 0,
    })
  })

  it('replaces an occupied equipment slot and moves its previous item to ground loot', () => {
    let state = trainingModeReducer(createTrainingModeStore(catalog), beginTrainingRun(7))
    const firstPistol = createItemInstance('weapon-pistol-service', catalog, { id: 'first-pistol', ownerEntityId: 'player' })
    const secondPistol = createItemInstance('weapon-pistol-service', catalog, { id: 'second-pistol', ownerEntityId: 'player' })
    const inventory = addItemInstance(addItemInstance(state.run.inventory, firstPistol, catalog), secondPistol, catalog)
    state = { ...state, run: { ...state.run, inventory } }

    state = trainingModeReducer(state, equipTrainingItem(firstPistol.id, 'pistol'))
    state = trainingModeReducer(state, equipTrainingItem(secondPistol.id, 'pistol'))

    expect(state.run.inventory.equipment.pistol).toBe(secondPistol.id)
    expect(state.run.lootSources.find((source) => source.id === 'loot-source-player-drop')?.itemIds).toContain(firstPistol.id)
    expect(state.run.inventory.itemInstances[firstPistol.id]?.ownerEntityId).toBe('loot-source-player-drop')
  })

  it('marks the run inactive and rejects inventory validation after extraction', () => {
    let state = createTrainingModeStore(catalog)
    state = trainingModeReducer(state, beginTrainingRun(7))
    state = trainingModeReducer(state, extractTrainingRunNow())

    expect(selectTrainingStatus(state)).toMatchObject({
      phase: 'ResultsScreen',
      interactionStatus: 'inactive',
      isInteractive: false,
    })

    const validation = validateMoveTrainingItem(
      state,
      moveTrainingItem('any-item', 'any-storage', 'any-compartment', 0, 0),
      catalog,
    )

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.reason).toContain('only available while the run is active')
    }
  })

  it('marks the run inactive and rejects inventory validation after the 600-second hard cap', () => {
    let state = createTrainingModeStore(catalog)
    state = trainingModeReducer(state, beginTrainingRun(7))
    state = trainingModeReducer(state, { type: 'TICK', deltaSeconds: 600 })

    expect(selectTrainingStatus(state)).toMatchObject({
      phase: 'ResultsScreen',
      runEndReason: 'time-cap',
      interactionStatus: 'inactive',
      isInteractive: false,
    })

    const validation = validateMoveTrainingItem(
      state,
      moveTrainingItem('any-item', 'any-storage', 'any-compartment', 0, 0),
      catalog,
    )

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.reason).toContain('only available while the run is active')
    }
  })

  it('rejects dropping an item that is already in ground loot with a clear reason', () => {
    let state = createTrainingModeStore(catalog)
    state = trainingModeReducer(state, beginTrainingRun(7))
    state = trainingModeReducer(state, { type: 'TICK', deltaSeconds: 5 })

    const groundItemId = state.run.lootSources[0]?.itemIds[0]
    expect(groundItemId).toBeDefined()

    const validation = validateDropTrainingItemToGround(state, dropTrainingItemToGround(groundItemId!), catalog)

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.reason).toContain('currently owned by the player')
    }
  })
})
