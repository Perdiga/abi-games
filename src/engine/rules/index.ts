import type {
  CatalogIndex,
  InventoryAction,
  ItemCategory,
  ItemDefinition,
  ItemInstance,
  ItemStateDefinition,
  RuleDefinition,
  RuleViolation,
} from '../../data'

export interface RuleEvaluationContext {
  catalog: CatalogIndex
  getItem(instanceId: string): ItemInstance | undefined
  getItemDefinition(instanceId: string): ItemDefinition | undefined
  getItemState(instanceId: string): ItemStateDefinition | undefined
  getEquippedItem(slotId: string): ItemInstance | undefined
  getProjectedBackpackDepth(instanceId: string, action: InventoryAction): number
  containerItemCount(instanceId: string): number
  isEquipped(instanceId: string): boolean
  getTargetState(targetStateId: string): ItemStateDefinition | undefined
}

const hasAnyTag = (tags: readonly string[], expected?: readonly string[]) =>
  !expected || expected.length === 0 || expected.some((tag) => tags.includes(tag))

const matchesCategory = (category: ItemCategory, expected: readonly ItemCategory[]) => expected.includes(category)

export const evaluateRules = (
  action: InventoryAction,
  context: RuleEvaluationContext,
  rules = context.catalog.rulesByPriority,
): RuleViolation[] => {
  const violations: RuleViolation[] = []

  for (const rule of rules) {
    const violation = evaluateRule(rule, action, context)
    if (violation) {
      violations.push(violation)
    }
  }

  return violations
}

const evaluateRule = (
  rule: RuleDefinition,
  action: InventoryAction,
  context: RuleEvaluationContext,
): RuleViolation | undefined => {
  switch (rule.kind) {
    case 'requires-compatible-face-shield': {
      if (action.type !== 'equip' || !rule.subjectSlots.includes(action.targetSlotId)) {
        return undefined
      }

      const host = context.getEquippedItem(rule.requiredHostSlot)
      const hostDefinition = host ? context.getItemDefinition(host.id) : undefined

      if (!host || !hostDefinition) {
        return { ruleId: rule.id, message: rule.message }
      }

      const subject = context.getItem(action.itemInstanceId)
      const subjectDefinition = subject ? context.getItemDefinition(subject.id) : undefined

      if (!subject || !subjectDefinition) {
        return undefined
      }

      if (hostDefinition.shieldsCompatible) {
        const shieldId = subjectDefinition.id.replace(/^abi-/, '')
        const isCompatible = hostDefinition.shieldsCompatible.some(
          (compatibleId) => compatibleId === shieldId || compatibleId === subjectDefinition.id,
        )
        if (!isCompatible) {
          return { ruleId: rule.id, message: rule.message }
        }
      } else if (!hostDefinition.tags.includes('supports-face-shield')) {
        return { ruleId: rule.id, message: rule.message }
      }

      return undefined
    }
    case 'requires-equipped-tag': {
      if (action.type !== 'equip' || !rule.subjectSlots.includes(action.targetSlotId)) {
        return undefined
      }

      const item = context.getItem(action.itemInstanceId)
      const definition = item ? context.getItemDefinition(item.id) : undefined

      if (!item || !definition || !hasAnyTag(definition.tags, rule.subjectTags)) {
        return undefined
      }

      const host = context.getEquippedItem(rule.requiredHostSlot)
      const hostDefinition = host ? context.getItemDefinition(host.id) : undefined

      if (!hostDefinition || !hasAnyTag(hostDefinition.tags, rule.requiredHostTags)) {
        return { ruleId: rule.id, message: rule.message }
      }

      return undefined
    }

    case 'paired-slot-tag-conflict': {
      if (action.type !== 'equip' || !rule.subjectSlots.includes(action.targetSlotId)) {
        return undefined
      }

      const subjectDefinition = context.getItemDefinition(action.itemInstanceId)

      if (!subjectDefinition || !hasAnyTag(subjectDefinition.tags, rule.subjectTags)) {
        return undefined
      }

      const conflictingItem = rule.otherSlots
        .map((slotId) => context.getEquippedItem(slotId))
        .find((item) => {
          if (!item) {
            return false
          }

          const definition = context.getItemDefinition(item.id)
          return Boolean(definition && hasAnyTag(definition.tags, rule.otherTags))
        })

      if (conflictingItem) {
        return { ruleId: rule.id, message: rule.message }
      }

      return undefined
    }

    case 'container-depth-limit': {
      if (action.type !== 'equip' && action.type !== 'move') {
        return undefined
      }

      const definition = context.getItemDefinition(action.itemInstanceId)

      if (!definition || !matchesCategory(definition.category, rule.subjectCategories)) {
        return undefined
      }

      if (context.getProjectedBackpackDepth(action.itemInstanceId, action) > rule.maxDepth) {
        return { ruleId: rule.id, message: rule.message }
      }

      return undefined
    }

    case 'state-requires-empty-container': {
      if (action.type !== 'change-state') {
        return undefined
      }

      const definition = context.getItemDefinition(action.itemInstanceId)
      const targetState = context.getTargetState(action.targetStateId)

      if (
        !definition ||
        !targetState ||
        !matchesCategory(definition.category, rule.subjectCategories) ||
        !hasAnyTag(targetState.tags, rule.targetStateTags)
      ) {
        return undefined
      }

      if (context.containerItemCount(action.itemInstanceId) > 0) {
        return { ruleId: rule.id, message: rule.message }
      }

      return undefined
    }

    case 'equippable-state-required': {
      if (action.type !== 'equip' || !rule.subjectSlots.includes(action.targetSlotId)) {
        return undefined
      }

      const state = context.getItemState(action.itemInstanceId)

      if (!state?.equippable) {
        return { ruleId: rule.id, message: rule.message }
      }

      return undefined
    }

    case 'equipped-state-requires-equippable': {
      if (action.type !== 'change-state') {
        return undefined
      }

      const definition = context.getItemDefinition(action.itemInstanceId)
      const targetState = context.getTargetState(action.targetStateId)

      if (!definition || !targetState || !matchesCategory(definition.category, rule.subjectCategories)) {
        return undefined
      }

      if (context.isEquipped(action.itemInstanceId) && !targetState.equippable) {
        return { ruleId: rule.id, message: rule.message }
      }

      return undefined
    }
  }
}
