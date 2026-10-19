import type { LegacyHighs } from 'highs'
import type { CatalogIndex, EquipmentSlotId, InventoryState, ItemDefinition, ItemStateDefinition, PerfectExtractionItem } from '../../data'
import { getOccupiedCells, rotateMask, validatePlacement } from '../geometry'
import { isScorableAsLoot } from '../inventory'

type Term = readonly [number, string]

export interface PerfectExtractionResult {
  maximumPotentialScore: number
  items: readonly PerfectExtractionItem[]
}

interface Candidate {
  definition: ItemDefinition
  count: number
  value: number
  states: StateCandidate[]
  depth: string
  backpackDepth: string
}

interface StateCandidate {
  definition: ItemStateDefinition
  selected: string
  locations: string[]
}

interface EquippedCandidate {
  slotId: EquipmentSlotId
  definition: ItemDefinition
  variable: string
}

const expression = (terms: readonly Term[]): string => terms.length === 0 ? '0' : terms
  .map(([coefficient, variable]) => `${coefficient < 0 ? '-' : '+'} ${Math.abs(coefficient)} ${variable}`)
  .join(' ')
  .replace(/^\+ /, '')

export const calculatePerfectExtractionResult = (
  inventory: InventoryState,
  catalog: CatalogIndex,
  solver: LegacyHighs,
): PerfectExtractionResult => {
  let variableCount = 0
  const binary: string[] = []
  const integer: string[] = []
  const bounds: string[] = []
  const constraints: string[] = []
  const objective: Term[] = []
  const equipped: EquippedCandidate[] = []
  const candidates: Candidate[] = []
  const grouped = new Map<string, Candidate>()
  const variable = () => `variable_${variableCount++}`
  const binaryVariable = () => {
    const name = variable()
    binary.push(name)
    return name
  }
  const constrain = (terms: Term[], comparison: '<=' | '>=' | '=', limit: number) => {
    if (terms.length > 0) constraints.push(`${expression(terms)} ${comparison} ${limit}`)
  }

  for (const item of Object.values(inventory.itemInstances)) {
    const definition = catalog.itemDefinitionsById[item.itemDefinitionId]
    if (!definition) continue
    const states = catalog.itemStates.filter((state) => state.itemDefinitionId === definition.id)
    const isContainer = states.some((state) => state.containerLayoutId)
    const key = isContainer ? item.id : definition.id
    const existing = grouped.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    const candidate: Candidate = {
      definition,
      count: 1,
      value: isScorableAsLoot(item, catalog) ? definition.baseValue : 0,
      states: states.filter((state) => !isContainer || state.containerLayoutId).map((state) => ({
        definition: state,
        selected: variable(),
        locations: [],
      })),
      depth: variable(),
      backpackDepth: variable(),
    }
    grouped.set(key, candidate)
    candidates.push(candidate)
  }

  if (!candidates.some((candidate) => candidate.value > 0)) return { maximumPotentialScore: 0, items: [] }

  const containers = candidates.filter((candidate) => candidate.states.some((state) => state.definition.containerLayoutId))
  const depthLimit = containers.length + 1
  for (const candidate of candidates) {
    for (const state of candidate.states) {
      if (candidate.count === 1) binary.push(state.selected)
      else {
        integer.push(state.selected)
        bounds.push(`0 <= ${state.selected} <= ${candidate.count}`)
      }
      if (candidate.value !== 0) objective.push([candidate.value, state.selected])
      if (!state.definition.equippable) continue
      for (const slot of catalog.equipmentSlots) {
        if (!slot.acceptsCategories.includes(candidate.definition.category)) continue
        const location = binaryVariable()
        equipped.push({ slotId: slot.id, definition: candidate.definition, variable: location })
        state.locations.push(location)
      }
    }
    constrain(candidate.states.map((state) => [1, state.selected]), '<=', candidate.count)
  }

  for (const parent of containers) {
    bounds.push(`0 <= ${parent.depth} <= ${containers.length}`)
    const backpackLimit = Math.min(...catalog.rulesByPriority.flatMap((rule) => (
      rule.kind === 'container-depth-limit' && rule.subjectCategories.includes(parent.definition.category)
        ? [rule.maxDepth] : []
    )))
    if (Number.isFinite(backpackLimit)) bounds.push(`1 <= ${parent.backpackDepth} <= ${backpackLimit}`)

    for (const parentState of parent.states) {
      const layout = parentState.definition.containerLayoutId
        ? catalog.layoutsById[parentState.definition.containerLayoutId] : undefined
      if (!layout) continue
      for (const compartmentId of layout.compartmentIds) {
        const compartment = catalog.compartmentsById[compartmentId]!
        const occupiedCells = new Map(getOccupiedCells(compartment.shapeMask).map((cell) => [
          `${cell.x}:${cell.y}`, [[-1, parentState.selected] as Term],
        ]))
        for (const child of candidates) {
          if (child === parent) continue
          const nestedLocations: string[] = []
          for (const childState of child.states) {
            const itemState = childState.definition
            if (!itemState.storable) continue
            if (compartment.id === 'pockets-main' && (itemState.boundingWidth !== 1 || itemState.boundingHeight !== 1)) continue
            const rotations = child.definition.allowRotation ? [0, 90] as const : [0] as const
            const seenRotations = new Set<string>()
            for (const rotation of rotations) {
              const mask = rotateMask(itemState.shapeMask, rotation).join('/')
              if (seenRotations.has(mask)) continue
              seenRotations.add(mask)
              for (let gridY = 0; gridY < compartment.boundingHeight; gridY += 1) {
                for (let gridX = 0; gridX < compartment.boundingWidth; gridX += 1) {
                  const placement = validatePlacement({
                    itemMask: itemState.shapeMask,
                    rotation,
                    compartment,
                    position: { x: gridX, y: gridY },
                    layout,
                  })
                  if (!placement.isValid || placement.occupiedCells.length === 0) continue
                  const location = binaryVariable()
                  childState.locations.push(location)
                  nestedLocations.push(location)
                  for (const cell of placement.occupiedCells) occupiedCells.get(`${cell.x}:${cell.y}`)!.push([1, location])
                }
              }
            }
          }
          if (nestedLocations.length > 0 && containers.includes(child)) {
            const edge = binaryVariable()
            constrain([...nestedLocations.map((location): Term => [1, location]), [-1, edge]], '=', 0)
            constrain([[1, child.depth], [-1, parent.depth], [-depthLimit, edge]], '>=', 1 - depthLimit)
            if (child.definition.category === 'backpack' && parent.definition.category === 'backpack' && Number.isFinite(backpackLimit)) {
              constrain([[1, child.backpackDepth], [-1, parent.backpackDepth], [-depthLimit, edge]], '>=', 1 - depthLimit)
            }
          }
        }
        for (const terms of occupiedCells.values()) constrain(terms, '<=', 0)
      }
    }
  }

  for (const candidate of candidates) {
    for (const state of candidate.states) {
      constrain([[-1, state.selected], ...state.locations.map((location): Term => [1, location])], '=', 0)
    }
  }
  for (const slot of catalog.equipmentSlots) {
    constrain(equipped.filter((entry) => entry.slotId === slot.id).map((entry) => [1, entry.variable]), '<=', 1)
  }
  const matchesTags = (definition: ItemDefinition, tags?: readonly string[]) =>
    !tags?.length || tags.some((tag) => definition.tags.includes(tag))
  for (const rule of catalog.rulesByPriority) {
    if (rule.kind === 'requires-equipped-tag') {
      for (const subject of equipped.filter((entry) => rule.subjectSlots.includes(entry.slotId) && matchesTags(entry.definition, rule.subjectTags))) {
        constrain([
          [1, subject.variable],
          ...equipped.filter((entry) => entry.slotId === rule.requiredHostSlot && matchesTags(entry.definition, rule.requiredHostTags))
            .map((entry): Term => [-1, entry.variable]),
        ], '<=', 0)
      }
    } else if (rule.kind === 'paired-slot-tag-conflict') {
      for (const subjectSlot of rule.subjectSlots) {
        for (const otherSlot of rule.otherSlots) {
          constrain(equipped.filter((entry) => (
            (entry.slotId === subjectSlot && matchesTags(entry.definition, rule.subjectTags)) ||
            (entry.slotId === otherSlot && matchesTags(entry.definition, rule.otherTags))
          )).map((entry) => [1, entry.variable]), '<=', 1)
        }
      }
    }
  }

  const model = [
    'Maximize',
    `value: ${expression(objective)}`,
    'Subject To',
    ...constraints.map((constraint, index) => `constraint_${index}: ${constraint}`),
    'Bounds',
    ...bounds,
    'Binary',
    ...binary,
    ...(integer.length > 0 ? ['General', ...integer] : []),
    'End',
  ].join('\n')
  const solution = solver.solve(model, { mip_rel_gap: 0, mip_abs_gap: 0, time_limit: 120 })
  if (solution.Status !== 'Optimal') throw new Error(`Perfect extraction could not be proven: ${solution.Status}`)
  const itemsByDefinitionId = new Map<string, number>()
  for (const candidate of candidates) {
    const count = candidate.states.reduce(
      (total, state) => total + Math.round(solution.Columns[state.selected]!.Primal),
      0,
    )
    if (count > 0) itemsByDefinitionId.set(candidate.definition.id, (itemsByDefinitionId.get(candidate.definition.id) ?? 0) + count)
  }

  return {
    maximumPotentialScore: objective.reduce((value, [coefficient, name]) => value + coefficient * Math.round(solution.Columns[name]!.Primal), 0),
    items: [...itemsByDefinitionId.entries()]
      .map(([itemDefinitionId, count]) => ({ itemDefinitionId, count }))
      .sort((left, right) => (
        (catalog.itemDefinitionsById[right.itemDefinitionId]?.baseValue ?? 0) -
        (catalog.itemDefinitionsById[left.itemDefinitionId]?.baseValue ?? 0)
      )),
  }
}

export const calculatePerfectExtraction = (
  inventory: InventoryState,
  catalog: CatalogIndex,
  solver: LegacyHighs,
): number => calculatePerfectExtractionResult(inventory, catalog, solver).maximumPotentialScore
