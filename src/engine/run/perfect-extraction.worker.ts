import createHighs from 'highs'
import wasmUrl from 'highs/runtime?url'
import type { CatalogIndex, InventoryState } from '../../data'
import { calculatePerfectExtraction } from './perfect-extraction'

self.onmessage = async ({ data }: MessageEvent<{ inventory: InventoryState; catalog: CatalogIndex }>) => {
  try {
    const solver = await createHighs({ locateFile: () => wasmUrl })
    const maximumPotentialScore = calculatePerfectExtraction(data.inventory, data.catalog, solver)
    self.postMessage({ maximumPotentialScore })
  } catch {
    self.postMessage({ error: true })
  }
}
