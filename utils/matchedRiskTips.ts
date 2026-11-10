import { gravida } from '@/utils/calendar';
import { getRiskTipForIndicator, type RiskTipResult } from '@/utils/riskTips';

export type RiskIndicatorInput = {
  id: string;
  label: string;
  indicator_type: string;
  threshold_value: number | null;
  advice_message?: string | null;
};

export type MotherRiskInput = {
  id: string;
  age: number | null;
  gravida_para: string | null;
  blood_pressure: string | null;
  risk_level: string | null;
};

export type MatchedRiskTip = RiskTipResult & {
  id: string;
  label: string;
  indicatorType: string;
  thresholdValue: number | null;
};

export function getMatchedRiskTips(
  mother: MotherRiskInput,
  activeIndicators: RiskIndicatorInput[],
  recordedIndicators: RiskIndicatorInput[],
): MatchedRiskTip[] {
  const matched: MatchedRiskTip[] = [];
  const seenIds = new Set<string>();
  const addIndicator = (indicator: RiskIndicatorInput) => {
    if (seenIds.has(indicator.id)) return;
    seenIds.add(indicator.id);
    matched.push({
      id: indicator.id,
      label: indicator.label,
      indicatorType: indicator.indicator_type,
      thresholdValue: indicator.threshold_value,
      ...getRiskTipForIndicator(indicator.label, indicator.indicator_type, indicator.threshold_value),
      ...(indicator.advice_message?.trim() ? { tipAdvice: indicator.advice_message.trim() } : {}),
    });
  };

  recordedIndicators.forEach(addIndicator);
  const isFirstPregnancy = gravida(mother.gravida_para) === 1;
  activeIndicators.forEach((indicator) => {
    const ageMatches = indicator.indicator_type === 'age_below'
      && mother.age != null
      && indicator.threshold_value != null
      && mother.age < indicator.threshold_value;
    const firstPregnancyMatches = indicator.indicator_type === 'first_pregnancy_age_above'
      && mother.age != null
      && isFirstPregnancy
      && indicator.threshold_value != null
      && mother.age >= indicator.threshold_value;
    if (ageMatches || firstPregnancyMatches) addIndicator(indicator);
  });

  if (mother.risk_level === 'high' && matched.length === 0) {
    const label = 'High Risk Case';
    matched.push({
      id: `general-${mother.id}`,
      label,
      indicatorType: 'checklist',
      thresholdValue: null,
      ...getRiskTipForIndicator(label, 'checklist', null),
    });
  }

  return matched;
}
