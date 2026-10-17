import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import App from '../App'

const rulesPreferenceKey = 'abi-tetris:stash-training-rules-dismissed'
const storage = new Map<string, string>()

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
})

afterEach(() => {
  cleanup()
  storage.clear()
})

describe('run rules briefing', () => {
  it('shows the rules before a run and begins only after confirmation', () => {
    render(<App startSeed={7} />)

    fireEvent.click(screen.getByRole('button', { name: /start run/i }))
    expect(screen.getByRole('dialog', { name: /regras da operação/i })).toBeInTheDocument()
    expect(screen.getByTestId('start-screen')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^começar$/i }))
    expect(screen.queryByRole('dialog', { name: /regras da operação/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('start-screen')).not.toBeInTheDocument()
  })

  it('stores the preference to skip the briefing', () => {
    const firstRender = render(<App startSeed={7} />)
    fireEvent.click(screen.getByRole('button', { name: /start run/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /não mostrar novamente/i }))
    fireEvent.click(screen.getByRole('button', { name: /^começar$/i }))
    expect(window.localStorage.getItem(rulesPreferenceKey)).toBe('true')

    firstRender.unmount()
    render(<App startSeed={7} />)
    fireEvent.click(screen.getByRole('button', { name: /start run/i }))
    expect(screen.queryByRole('dialog', { name: /regras da operação/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('start-screen')).not.toBeInTheDocument()
  })
})
