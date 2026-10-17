import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { CompartmentGrid } from '../components/grids/CompartmentGrid'
import type { GridLayout } from '../components/grids/types'

const testLayout: GridLayout = {
  id: 'test-layout', label: 'Test Layout', width: 5, height: 3,
  regions: [
    { id: 'left', label: 'Left', originX: 0, originY: 0, shapeMask: ['110', '111'], accent: '#38bdf8' },
    { id: 'right', label: 'Right', originX: 3, originY: 0, shapeMask: ['11', '10'], accent: '#f59e0b' },
  ],
}

afterEach(() => { cleanup(); vi.useRealTimers() })

const startRun = () => {
  fireEvent.click(screen.getByRole('button', { name: /start run/i }))
  fireEvent.click(screen.getByRole('button', { name: /^começar$/i }))
  expect(screen.queryByTestId('start-screen')).not.toBeInTheDocument()
}

const advanceToFirstLootDrop = () => act(() => vi.advanceTimersByTime(5000))

describe('equipment screen shell', () => {
  it('shows the available training mode and planned future modes on the home screen', () => {
    render(<App startSeed={7} />)

    expect(screen.getByRole('heading', { name: /choose your run/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Stash Training' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Stash Race' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Daily Stash' })).toBeInTheDocument()
    expect(screen.getByText('Available')).toBeInTheDocument()
    expect(screen.getAllByText('Planned')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /start run/i })).toHaveLength(1)
  })

  it('renders a compartment-aware grid with the expected cell count', () => {
    render(<CompartmentGrid getPlacementValidation={() => null} items={[]} layout={testLayout} onItemSelect={() => { }} onPlaceItem={() => { }} selectedItem={null} selectedItemId={null} />)
    expect(screen.getAllByRole('gridcell')).toHaveLength(8)
  })

  it('starts with the player starter loadout and exposes the run HUD', () => {
    vi.useFakeTimers(); render(<App startSeed={7} tickIntervalMs={1000} />); startRun()
    expect(screen.getByTestId('secured-value')).toHaveTextContent('$0')
    expect(screen.getByTestId('players-remaining')).toHaveTextContent('5 / 5 players remaining')
    expect(screen.getByTestId('ground-loot-grid')).toBeInTheDocument()
    expect(screen.queryByTestId('slot-target-helmetFaceShield')).not.toBeInTheDocument()
  })

  it('opens face-shield options from a compatible helmet and equips the selected shield', () => {
    vi.useFakeTimers(); render(<App startSeed={7} tickIntervalMs={1000} />); startRun()
    act(() => vi.advanceTimersByTime(25000))

    const groundItems = screen.getAllByTestId(/^item-/)
    const helmet = groundItems.find((item) => /helmet|capacete/i.test(item.getAttribute('aria-label') ?? ''))
    const faceShield = groundItems.find((item) => /face shield|protetor facial|visor/i.test(item.getAttribute('aria-label') ?? ''))
    expect(helmet).toBeDefined()
    expect(faceShield).toBeDefined()
    const faceShieldTestId = faceShield!.getAttribute('data-testid')

    fireEvent.click(helmet!)
    fireEvent.click(document.querySelector('[data-slot-id="helmet"]')!)
    fireEvent.click(screen.getByTestId('slot-item-helmet'))

    const dialog = screen.getByRole('dialog', { name: /equip face shield/i })
    const shieldOption = within(dialog)
      .getAllByRole('button')
      .find((button) => button.classList.contains('equipment-screen__face-shield-option'))
    expect(shieldOption).toBeDefined()

    const shieldName = shieldOption!.querySelector('strong')?.textContent
    fireEvent.click(shieldOption!)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('slot-target-helmetFaceShield')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('slot-item-helmet'))
    const reopenedDialog = screen.getByRole('dialog', { name: /equip face shield/i })
    expect(within(reopenedDialog).getByText('Equipped')).toBeInTheDocument()
    expect(within(reopenedDialog).getByText(shieldName!)).toBeInTheDocument()

    fireEvent.click(within(reopenedDialog).getByRole('button', { name: /remove/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('ground-loot-grid')).getByTestId(faceShieldTestId!)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('slot-item-helmet'))
    const dialogAfterRemoval = screen.getByRole('dialog', { name: /equip face shield/i })
    expect(within(dialogAfterRemoval).queryByText('Equipped')).not.toBeInTheDocument()
    expect(within(dialogAfterRemoval).getAllByText(shieldName!).length).toBeGreaterThan(0)
  })

  it('adds ground loot when the first bot dies', () => {
    vi.useFakeTimers(); render(<App startSeed={7} tickIntervalMs={1000} />); startRun(); advanceToFirstLootDrop()
    expect(screen.getByTestId('players-remaining')).toHaveTextContent('4 / 5 players remaining')
    expect(screen.getByTestId('ground-loot-grid')).toBeInTheDocument()
    expect(screen.getByTestId('item-bot-1-backpack')).toBeInTheDocument()
  })

  it('updates the elapsed timer while the run is active', () => {
    vi.useFakeTimers(); render(<App startSeed={7} tickIntervalMs={1000} />); startRun()
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.getByText('04:57')).toBeInTheDocument()
  })

  it('keeps selection feedback when a ground-loot item is selected', () => {
    vi.useFakeTimers(); render(<App startSeed={7} tickIntervalMs={1000} />); startRun(); advanceToFirstLootDrop()
    const backpack = screen.getByTestId('item-bot-1-backpack'); fireEvent.click(backpack)
    expect(backpack).toHaveClass('ground-loot-panel__item-card--selected')
    expect(screen.getByTestId('slot-target-backpack')).toHaveClass('equipment-screen__slot--valid')
  })

  it('equips generated loot in a valid destination', () => {
    vi.useFakeTimers(); render(<App startSeed={7} tickIntervalMs={1000} />); startRun(); advanceToFirstLootDrop()
    fireEvent.click(screen.getByTestId('item-bot-1-backpack'))
    fireEvent.click(screen.getByTestId('slot-target-backpack'))
    expect(screen.queryByTestId('item-bot-1-backpack')).not.toBeInTheDocument()
    expect(screen.getByTestId('slot-item-backpack')).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: /backpack/i })).toBeInTheDocument()
    expect(screen.queryByTestId('storage-source-bot-1-backpack')).not.toBeInTheDocument()
  })

  it('transitions to results when extracting', () => {
    vi.useFakeTimers(); render(<App startSeed={7} tickIntervalMs={1000} />); startRun(); advanceToFirstLootDrop()
    fireEvent.click(screen.getByRole('button', { name: /extract now/i }))
    expect(screen.getByTestId('results-screen')).toBeInTheDocument()
    expect(screen.getByText(/Extraction successful/i)).toBeInTheDocument()
  })
})
