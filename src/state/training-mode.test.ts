import { describe, expect, it } from 'vitest'
import { createCatalogIndex } from '../data'
import {
  beginTrainingRun,
  createTrainingModeStore,
  dropTrainingItemToGround,
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
