import { useEffect, type Dispatch } from 'react'
import type { PerfectExtractionItem } from '../data'
import type { TrainingModeAction, TrainingModeStoreState } from './training-mode'

export const usePerfectExtraction = (state: TrainingModeStoreState, dispatch: Dispatch<TrainingModeAction>): void => {
  const inventory = state.run.perfectExtraction?.inventory
  const catalog = state.catalog
  const canCalculate = state.run.pendingBotDeaths.length === 0 || state.run.phase === 'ResultsScreen'

  useEffect(() => {
    if (!inventory || !canCalculate) return
    let worker: Worker | undefined
    const fail = () => dispatch({ type: 'RESOLVE_PERFECT_EXTRACTION', inventory })
    try {
      worker = new Worker(new URL('../engine/run/perfect-extraction.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }: MessageEvent<{ maximumPotentialScore?: number; items?: readonly PerfectExtractionItem[] }>) => {
        dispatch({ type: 'RESOLVE_PERFECT_EXTRACTION', inventory, maximumPotentialScore: data.maximumPotentialScore, items: data.items })
        worker?.terminate()
      }
      worker.onerror = () => {
        fail()
        worker?.terminate()
      }
      worker.postMessage({ inventory, catalog })
    } catch {
      fail()
      worker?.terminate()
    }
    return () => worker?.terminate()
  }, [inventory, catalog, canCalculate, dispatch])
}
