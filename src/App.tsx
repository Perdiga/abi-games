import './App.css'
import { useEffect, useMemo, useReducer, useState } from 'react'

import { EquipmentScreen } from './components/equipment-screen/EquipmentScreen'
import { abiAssetById } from './data/abi-assets.generated'
import { collectSecuredScorableItemIds } from './engine'
import { usePerfectExtraction } from './state/usePerfectExtraction'
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

const RULES_DISMISSED_STORAGE_KEY = 'abi-tetris:stash-training-rules-dismissed'

const hasDismissedRules = (): boolean => {
  try {
    return window.localStorage?.getItem(RULES_DISMISSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const saveRulesDismissal = (): void => {
  try {
    window.localStorage?.setItem(RULES_DISMISSED_STORAGE_KEY, 'true')
  } catch {
    // The briefing still works when browser storage is unavailable.
  }
}

function App({ startSeed, tickIntervalMs = 1000 }: AppProps) {
  const [state, dispatch] = useReducer(trainingModeReducer, createTrainingModeStore())
  const [isRulesDialogOpen, setIsRulesDialogOpen] = useState(false)
  const [skipRulesNextTime, setSkipRulesNextTime] = useState(false)
  const [isPerfectExtractionOpen, setPerfectExtractionOpen] = useState(false)
  usePerfectExtraction(state, dispatch)
  const status = useMemo(() => selectTrainingStatus(state), [state])
  const timer = useMemo(() => selectTrainingTimer(state), [state])
  const results = useMemo(() => selectTrainingResults(state), [state])
  const perfectExtractionStatus = state.run.perfectExtraction?.status
  const perfectExtractionItems = state.run.perfectExtraction?.items ?? []
  const extractedItemCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const itemId of collectSecuredScorableItemIds(state.run.inventory, state.catalog)) {
      const itemDefinitionId = state.run.inventory.itemInstances[itemId]?.itemDefinitionId
      if (itemDefinitionId) counts.set(itemDefinitionId, (counts.get(itemDefinitionId) ?? 0) + 1)
    }
    return counts
  }, [state.catalog, state.run.inventory])
  const extraExtractedItems = useMemo(
    () => [...extractedItemCounts.entries()]
      .filter(([itemDefinitionId]) => !perfectExtractionItems.some((item) => item.itemDefinitionId === itemDefinitionId))
      .map(([itemDefinitionId, count]) => ({ itemDefinitionId, count })),
    [extractedItemCounts, perfectExtractionItems],
  )

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

  const beginRun = () => {
    setPerfectExtractionOpen(false)
    dispatch(beginTrainingRun(startSeed))
  }

  const requestRunStart = () => {
    if (hasDismissedRules()) {
      beginRun()
      return
    }
    setIsRulesDialogOpen(true)
  }

  const handleRulesDialogStart = () => {
    if (skipRulesNextTime) {
      saveRulesDismissal()
    }
    setIsRulesDialogOpen(false)
    beginRun()
  }

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
              {perfectExtractionStatus === 'ready' ? (
                <span>of ${results.maximumPotentialScore.toLocaleString()} possible</span>
              ) : (
                <span role="status">{perfectExtractionStatus === 'error' ? 'Perfect extraction unavailable.' : 'Calculating perfect extraction…'}</span>
              )}
            </div>
            {perfectExtractionStatus === 'ready' && (
              <div className="app-results-screen__rating">
                <p aria-label={`${results.starRating} out of 5 stars`} className="app-results-screen__stars">
                  <span aria-hidden="true">{'★'.repeat(results.starRating)}{'☆'.repeat(5 - results.starRating)}</span>
                  <strong>{results.starRating}/5</strong>
                </p>
                <p className="app-results-screen__percentage">{extractedPercentage}% of possible value</p>
              </div>
            )}
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
            {perfectExtractionStatus === 'ready' && (
              <button
                className="app-card__action"
                onClick={() => setPerfectExtractionOpen(true)}
                type="button"
              >
                View perfect extraction
              </button>
            )}
            <button className="app-card__action" onClick={requestRunStart} type="button">
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
                onClick={requestRunStart}
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
      {isPerfectExtractionOpen && perfectExtractionStatus === 'ready' && (
        <div className="app-rules-modal" role="presentation">
          <section
            aria-labelledby="perfect-extraction-title"
            aria-modal="true"
            className="app-perfect-extraction"
            data-testid="perfect-extraction-preview"
            role="dialog"
          >
            <header className="app-perfect-extraction__header">
              <div>
                <p className="app-card__kicker">Extraction plan / Read only</p>
                <h2 id="perfect-extraction-title">Perfect extraction</h2>
              </div>
              <p>${results?.maximumPotentialScore.toLocaleString()} total value</p>
            </header>
            <div className="app-perfect-extraction__content">
              <p>Green shows the items you selected correctly. Red shows missed or unnecessary items. This view cannot be edited.</p>
              {perfectExtractionItems.length > 0 ? (
                <ul className="app-perfect-extraction__items">
                  {perfectExtractionItems.map(({ itemDefinitionId, count }) => {
                    const item = state.catalog.itemDefinitionsById[itemDefinitionId]
                    if (!item) return null
                    const extractedCount = extractedItemCounts.get(itemDefinitionId) ?? 0
                    const correctCount = Math.min(count, extractedCount)
                    const missingCount = count - correctCount
                    const assetId = itemDefinitionId.startsWith('abi-') ? itemDefinitionId.slice(4) : itemDefinitionId
                    const imageSrc = abiAssetById[assetId]?.assetPath
                    return (
                      <li className={missingCount > 0 ? 'app-perfect-extraction__item--missed' : 'app-perfect-extraction__item--correct'} key={itemDefinitionId}>
                        {imageSrc ? <img alt="" src={imageSrc} /> : <span aria-hidden="true">◆</span>}
                        <span>{item.name}</span>
                        <strong>×{count}</strong>
                        <em>${(item.baseValue * count).toLocaleString()}</em>
                        <div className="app-perfect-extraction__comparison">
                          {correctCount > 0 && <b>Correct ×{correctCount}</b>}
                          {missingCount > 0 && <i>Missed ×{missingCount}</i>}
                        </div>
                      </li>
                    )
                  })}
                  {extraExtractedItems.map(({ itemDefinitionId, count }) => {
                    const item = state.catalog.itemDefinitionsById[itemDefinitionId]
                    if (!item) return null
                    const assetId = itemDefinitionId.startsWith('abi-') ? itemDefinitionId.slice(4) : itemDefinitionId
                    const imageSrc = abiAssetById[assetId]?.assetPath
                    return (
                      <li className="app-perfect-extraction__item--extra" key={`extra-${itemDefinitionId}`}>
                        {imageSrc ? <img alt="" src={imageSrc} /> : <span aria-hidden="true">◆</span>}
                        <span>{item.name}</span>
                        <strong>×{count}</strong>
                        <em>${(item.baseValue * count).toLocaleString()}</em>
                        <div className="app-perfect-extraction__comparison"><i>Not recommended ×{count}</i></div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="app-perfect-extraction__empty">No loot can be secured in this run.</p>
              )}
            </div>
            <footer className="app-perfect-extraction__footer">
              <button autoFocus className="app-card__action" onClick={() => setPerfectExtractionOpen(false)} type="button">
                Back to results
              </button>
            </footer>
          </section>
        </div>
      )}
      {isRulesDialogOpen && (
        <div className="app-rules-modal" role="presentation">
          <section aria-labelledby="rules-dialog-title" aria-modal="true" className="app-rules-modal__dialog" role="dialog">
            <header className="app-rules-modal__header">
              <p className="app-card__kicker">Stash Training / Briefing</p>
              <h2 id="rules-dialog-title">Regras da operação</h2>
            </header>
            <div className="app-rules-modal__content">
              <p>Organize o loot dos bots no seu equipamento e extraia antes que o tempo termine.</p>
              <ul>
                <li>Você tem 5 minutos; novos drops aparecem conforme os bots são eliminados.</li>
                <li>5 bots serão eliminados a cada 10 segundos, do segundo 0 ao 40.</li>
                <li>Não há perda de pontos durante o primeiro minuto.</li>
                <li>Itens só podem ser colocados em espaços compatíveis e sem sobreposição.</li>
                <li>Gire itens compatíveis com <kbd>R</kbd> para encaixá-los melhor.</li>
                <li>Extraia quando estiver pronto: o valor protegido, menos o tempo gasto, define sua pontuação.</li>
              </ul>
              <label className="app-rules-modal__preference">
                <input
                  checked={skipRulesNextTime}
                  onChange={(event) => setSkipRulesNextTime(event.target.checked)}
                  type="checkbox"
                />
                Não mostrar novamente
              </label>
            </div>
            <footer className="app-rules-modal__footer">
              <button autoFocus className="app-card__action" onClick={handleRulesDialogStart} type="button">
                Começar
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
