import createHighs from 'highs'
import wasmUrl from 'highs/runtime?url'
import type { CatalogIndex, InventoryState } from '../../data'
import { calculatePerfectExtractionResult } from './perfect-extraction'

self.onmessage = async ({ data }: MessageEvent<{ inventory: InventoryState; catalog: CatalogIndex }>) => {
  try {
    const solver = await createHighs({ locateFile: () => wasmUrl })
    self.postMessage(calculatePerfectExtractionResult(data.inventory, data.catalog, solver))
  } catch {
    self.postMessage({ error: true })
  }
}
