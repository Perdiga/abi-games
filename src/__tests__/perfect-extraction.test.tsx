import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

class TestWorker {
  static instances: TestWorker[] = []
  onmessage?: (event: MessageEvent) => void
  onerror?: () => void
  postMessage = vi.fn()
  terminate = vi.fn()

  constructor() {
    TestWorker.instances.push(this)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  TestWorker.instances = []
  vi.stubGlobal('Worker', TestWorker)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const start = () => {
  fireEvent.click(screen.getByRole('button', { name: /start run/i }))
  fireEvent.click(screen.getByRole('button', { name: /^começar$/i }))
}
const extract = () => fireEvent.click(screen.getByRole('button', { name: /extract now/i }))

describe('perfect extraction results', () => {
  it('starts optimization after the last bot dies and displays only the proven optimum', () => {
    render(<App startSeed={7} />)
    start()
    act(() => vi.advanceTimersByTime(24000))
    expect(TestWorker.instances).toHaveLength(0)
    act(() => vi.advanceTimersByTime(1000))
    expect(TestWorker.instances).toHaveLength(1)
    const worker = TestWorker.instances[0]!
    extract()
    expect(screen.getByText('Calculating perfect extraction…')).toBeInTheDocument()
    expect(screen.queryByText(/% of possible value/)).not.toBeInTheDocument()
    act(() => worker.onmessage?.(new MessageEvent('message', { data: { maximumPotentialScore: 100000 } })))
    expect(screen.getByText(`of $${(100000).toLocaleString()} possible`)).toBeInTheDocument()
    expect(screen.getByLabelText('0 out of 5 stars')).toBeInTheDocument()
    expect(worker.terminate).toHaveBeenCalled()
  })

  it('also calculates the full-round reference when extracting before all bots die', () => {
    render(<App startSeed={7} />)
    start()
    extract()
    const worker = TestWorker.instances[0]!
    const { inventory } = worker.postMessage.mock.calls[0]![0]
    expect(Object.values(inventory.itemInstances).some((item) => (item as { ownerEntityId: string }).ownerEntityId === 'bot-5')).toBe(true)
    expect(screen.getByText('Calculating perfect extraction…')).toBeInTheDocument()
    act(() => worker.onerror?.())
    expect(screen.getByText('Perfect extraction unavailable.')).toBeInTheDocument()
    expect(screen.queryByText(/% of possible value/)).not.toBeInTheDocument()
  })

  it('terminates the previous worker and rejects its late response after restarting', () => {
    render(<App startSeed={7} />)
    start()
    extract()
    const oldWorker = TestWorker.instances[0]!
    fireEvent.click(screen.getByRole('button', { name: /start another run/i }))
    fireEvent.click(screen.getByRole('button', { name: /^começar$/i }))
    expect(oldWorker.terminate).toHaveBeenCalled()
    act(() => oldWorker.onmessage?.(new MessageEvent('message', { data: { maximumPotentialScore: 999999 } })))
    extract()
    expect(screen.getByText('Calculating perfect extraction…')).toBeInTheDocument()
    expect(screen.queryByText(/999.?999/)).not.toBeInTheDocument()
  })
})
