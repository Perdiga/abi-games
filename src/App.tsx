import './App.css'
import { useEffect, useMemo, useReducer } from 'react'

import { EquipmentScreen } from './components/equipment-screen/EquipmentScreen'
import {
  beginTrainingRun,
  createTrainingModeStore,
  selectTrainingResults,
  selectTrainingStatus,
  selectTrainingTimer,
  tickTrainingMode,
  trainingModeReducer,
} from './state/training-mode'

export interface AppProps {
  startSeed?: number
  tickIntervalMs?: number
}

function App({ startSeed, tickIntervalMs = 1000 }: AppProps) {
  const [state, dispatch] = useReducer(trainingModeReducer, createTrainingModeStore())
  const status = useMemo(() => selectTrainingStatus(state), [state])
  const timer = useMemo(() => selectTrainingTimer(state), [state])
  const results = useMemo(() => selectTrainingResults(state), [state])

  useEffect(() => {
    if (!status.isInteractive) {
      return
    }

    const intervalId = window.setInterval(() => {
      dispatch(tickTrainingMode(1))
    }, tickIntervalMs)

    return () => window.clearInterval(intervalId)
  }, [status.isInteractive, tickIntervalMs])

  const extractedPercentage =
    results && results.maximumPotentialScore > 0
      ? Math.min(100, Math.round((results.grossScore / results.maximumPotentialScore) * 100))
      : 0

  return (
    <main className="app-shell">
      {status.phase === 'RunActive' ? (
        <EquipmentScreen dispatch={dispatch} state={state} />
      ) : status.phase === 'ResultsScreen' && results ? (
        <section
          className={`app-results-screen app-results-screen--${status.runEndReason === 'extract' ? 'extracted' : 'time-cap'}`}
          data-testid="results-screen"
        >
          <header className="app-results-screen__header">
            <div>
              <p className="app-card__kicker">After-action report / Stash Training</p>
              <h1>{status.runEndReason === 'extract' ? 'Extraction successful' : 'Time cap reached'}</h1>
            </div>
            <p className="app-results-screen__outcome">
              <span aria-hidden="true" className="app-results-screen__outcome-mark" />
              {status.runEndReason === 'extract' ? 'Extracted' : 'Round complete'}
            </p>
          </header>

          <section className="app-results-screen__hero" aria-label="Extraction result">
            <div className="app-results-screen__value">
              <p>Extracted value</p>
              <strong>${results.grossScore.toLocaleString()}</strong>
              <span>of ${results.maximumPotentialScore.toLocaleString()} possible</span>
            </div>
            <div className="app-results-screen__rating">
              <p aria-label={`${results.starRating} out of 5 stars`} className="app-results-screen__stars">
                <span aria-hidden="true">{'★'.repeat(results.starRating)}{'☆'.repeat(5 - results.starRating)}</span>
                <strong>{results.starRating}/5</strong>
              </p>
              <p className="app-results-screen__percentage">{extractedPercentage}% of possible value</p>
            </div>
          </section>

          <dl className="app-results-screen__metrics">
            <div>
              <dt>Final score</dt>
              <dd>${results.finalScore.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{timer.formattedElapsed}</dd>
            </div>
          </dl>

          <footer className="app-results-screen__footer">
            <button className="app-card__action" onClick={() => dispatch(beginTrainingRun(startSeed))} type="button">
              Start another run
            </button>
          </footer>
        </section>
      ) : (
        <section className="app-home" data-testid="start-screen">
          <header className="app-home__header">
            <div>
              <p className="app-card__kicker">ABI-GAMES.COM / Operations</p>
              <h1>Choose your run</h1>
            </div>
            <p className="app-home__summary">Select an extraction mode</p>
          </header>

          <div className="app-mode-grid" aria-label="Game modes">
            <article className="app-mode app-mode--available">
              <header className="app-mode__header">
                <p className="app-mode__index">01 / Solo</p>
                <span className="app-mode__status">Available</span>
              </header>
              <div className="app-mode__body">
                <h2>Stash Training</h2>
                <p>Loot across five bot drops, secure your gear, and extract before the five-minute limit.</p>
              </div>
              <dl className="app-mode__details">
                <div>
                  <dt>Duration</dt>
                  <dd>05:00</dd>
                </div>
                <div>
                  <dt>Objective</dt>
                  <dd>Maximize extracted value</dd>
                </div>
              </dl>
              <button
                className="app-card__action app-mode__action"
                onClick={() => dispatch(beginTrainingRun(startSeed))}
                type="button"
              >
                Start Run
              </button>
            </article>

            <article aria-disabled="true" className="app-mode app-mode--planned">
              <header className="app-mode__header">
                <p className="app-mode__index">02 / Versus</p>
                <span className="app-mode__status">Planned</span>
              </header>
              <div className="app-mode__body">
                <h2>Stash Race</h2>
                <p>Compete for the same loot pool. The highest extracted value wins.</p>
              </div>
              <dl className="app-mode__details">
                <div>
                  <dt>Players</dt>
                  <dd>Shared match</dd>
                </div>
                <div>
                  <dt>Ranking</dt>
                  <dd>By extracted value</dd>
                </div>
              </dl>
            </article>

            <article aria-disabled="true" className="app-mode app-mode--planned">
              <header className="app-mode__header">
                <p className="app-mode__index">03 / Daily</p>
                <span className="app-mode__status">Planned</span>
              </header>
              <div className="app-mode__body">
                <h2>Daily Stash</h2>
                <p>Enter the same fixed stash as everyone else and compete on the daily leaderboard.</p>
              </div>
              <dl className="app-mode__details">
                <div>
                  <dt>Stash</dt>
                  <dd>Fixed each day</dd>
                </div>
                <div>
                  <dt>Ranking</dt>
                  <dd>Daily extraction</dd>
                </div>
              </dl>
            </article>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
