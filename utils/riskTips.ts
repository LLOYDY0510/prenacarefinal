// utils/riskTips.ts

export type RiskTipResult = {
  tipTitle: string;
  tipAdvice: string;
  clinicalAction: string;
  urgency: 'high' | 'moderate';
};

/**
 * Automatically maps a risk indicator's type, threshold, and label
 * to its corresponding clinical guidance, maternal advice, and recommended nurse actions.
 */
export function getRiskTipForIndicator(
  label: string,
  indicatorType: string,
  threshold: number | null
): RiskTipResult {
  const l = (label || '').toLowerCase();

  // 1. Age-based automatic indicators
  if (
    indicatorType === 'age_below' ||
    l.includes('teen') ||
    l.includes('young') ||
    l.includes('adolescent')
  ) {
    const ageLimit = threshold ?? 19;
    return {
      tipTitle: `Adolescent Pregnancy (< ${ageLimit} yrs) Care Protocol`,
      tipAdvice: `Young pregnant mothers face heightened physiological demands with elevated risk for iron-deficiency anemia, pregnancy-induced hypertension, and preterm labor. Prioritize comprehensive nutritional counseling (protein, calcium, and iron), and ensure consistent family/psychosocial support.`,
      clinicalAction: `Schedule prenatal visits every 2–4 weeks; provide therapeutic iron-folate supplementation; coordinate closely with the Barangay Nutrition Scholar.`,
      urgency: 'high',
    };
  }

  if (
    indicatorType === 'first_pregnancy_age_above' ||
    (l.includes('first') && l.includes('age'))
  ) {
    const ageLimit = threshold ?? 35;
    return {
      tipTitle: `Advanced Maternal Age (1st Pregnancy at ${ageLimit}+ yrs)`,
      tipAdvice: `First-time pregnancy at age ${ageLimit} or older carries higher incidence of gestational hypertension, pre-eclampsia, gestational diabetes, and fetal growth restriction. Advise daily kick counts starting at 28 weeks and routine cardiovascular checks.`,
      clinicalAction: `Order baseline obstetric ultrasound; monitor BP and urine protein at every visit; recommend facility birth with surgical capabilities (BEmONC/CEmONC).`,
      urgency: 'high',
    };
  }

  // 2. High-risk checklist & medical conditions
  if (
    l.includes('hypertens') ||
    l.includes('blood pressure') ||
    l.includes('bp') ||
    l.includes('preeclamp') ||
    l.includes('eclamp')
  ) {
    return {
      tipTitle: 'Hypertension & Pre-eclampsia Clinical Protocol',
      tipAdvice: `Elevated maternal blood pressure restricts uteroplacental blood flow. Educate the mother on immediate warning signs: persistent throbbing headache, visual blurring/spots, facial swelling, or severe epigastric pain. Emphasize left lateral rest and low-sodium hydration.`,
      clinicalAction: `Check BP at least twice weekly. Perform dipstick urinalysis for proteinuria. Refer promptly to the RHU Physician if BP exceeds 140/90 mmHg.`,
      urgency: 'high',
    };
  }

  if (l.includes('diabet') || l.includes('sugar') || l.includes('gdm')) {
    return {
      tipTitle: 'Gestational Diabetes Mellitus (GDM) Management',
      tipAdvice: `Unregulated maternal glucose increases risk of macrosomia, birth shoulder dystocia, polyhydramnios, and neonatal hypoglycemia. Counsel on strict low-glycemic dietary planning, small portioned meals, and avoiding sugary beverages.`,
      clinicalAction: `Schedule 75g oral glucose tolerance test (OGTT); track fasting and 2-hour postprandial glucose levels; monitor fetal abdominal circumference via serial ultrasound.`,
      urgency: 'high',
    };
  }

  if (
    l.includes('bleed') ||
    l.includes('spotting') ||
    l.includes('hemorrhage') ||
    l.includes('dugo')
  ) {
    return {
      tipTitle: 'Obstetric Hemorrhage & Bleeding Protocol',
      tipAdvice: `Any vaginal bleeding in pregnancy is an emergency warning sign that may indicate placenta previa, abruptio placentae, or threatened abortion. Mother must observe strict bed rest with no sexual intercourse, heavy lifting, or strenuous activity.`,
      clinicalAction: `EMERGENCY: Do NOT perform digital vaginal examination. Arrange immediate vehicle transport to hospital or RHU emergency facility.`,
      urgency: 'high',
    };
  }

  if (
    l.includes('cesarean') ||
    l.includes('c-section') ||
    l.includes('cs') ||
    l.includes('tahi') ||
    l.includes('scar')
  ) {
    return {
      tipTitle: 'Previous Cesarean Section (Uterine Scar)',
      tipAdvice: `Prior uterine incision carries risk of scar dehiscence, uterine rupture, and abnormal placental adherence during labor. Trial of labor must only take place in a surgical hospital with continuous fetal heart monitoring.`,
      clinicalAction: `Verify inter-pregnancy interval; ensure delivery is booked at a CEmONC hospital equipped for emergency surgery; strictly avoid home or unsupervised delivery.`,
      urgency: 'high',
    };
  }

  if (
    l.includes('miscarriage') ||
    l.includes('abort') ||
    l.includes('stillbirth') ||
    l.includes('kunan')
  ) {
    return {
      tipTitle: 'Recurrent Pregnancy Loss Protocol',
      tipAdvice: `History of prior pregnancy loss causes significant anxiety and warrants evaluation for cervical insufficiency or systemic factors. Reassure the mother and instruct her to report any pelvic heaviness, backache, or discharge immediately.`,
      clinicalAction: `Schedule early transvaginal cervical ultrasound; advise adequate rest; consult RHU physician for supportive therapies.`,
      urgency: 'moderate',
    };
  }

  if (
    l.includes('anemi') ||
    l.includes('hemoglobin') ||
    l.includes('iron') ||
    l.includes('maputla')
  ) {
    return {
      tipTitle: 'Maternal Anemia Management',
      tipAdvice: `Low hemoglobin compromises fetal oxygenation and leaves the mother vulnerable to severe postpartum hemorrhage. Recommend daily iron + folic acid taken with vitamin C (calamansi/citrus water) and never with coffee or tea. Promote local iron-rich foods (malunggay, kangkong, lean meats).`,
      clinicalAction: `Verify adherence to daily iron supplements; repeat CBC/hemoglobin after 4 weeks; test for intestinal parasites if indicated.`,
      urgency: 'moderate',
    };
  }

  if (
    l.includes('twin') ||
    l.includes('multiple') ||
    l.includes('triplet') ||
    l.includes('kambal')
  ) {
    return {
      tipTitle: 'Multiple Gestation Care Plan',
      tipAdvice: `Carrying multiples multiplies nutritional requirements and sharply increases risk of preterm labor and pre-eclampsia. Recommend increased caloric and micronutrient intake, scheduled rest intervals, and hydration.`,
      clinicalAction: `Increase visit frequency to every 2 weeks starting at 20 weeks; confirm chorionicity on early scan; finalize preterm labor hospital transport contingency.`,
      urgency: 'high',
    };
  }

  if (
    l.includes('asthma') ||
    l.includes('heart') ||
    l.includes('cardiac') ||
    l.includes('kidney') ||
    l.includes('renal') ||
    l.includes('pulmonary')
  ) {
    return {
      tipTitle: 'Chronic Medical Condition Co-management',
      tipAdvice: `Underlying systemic conditions place extra strain on maternal cardiac and pulmonary reserves. Mother must maintain compliance with pregnancy-safe maintenance medications as directed by her physician.`,
      clinicalAction: `Coordinate maternal medical clearance with attending physician/specialist; ensure emergency rescue medications are within reach.`,
      urgency: 'high',
    };
  }

  if (
    l.includes('height') ||
    l.includes('short') ||
    l.includes('pandak') ||
    l.includes('145')
  ) {
    return {
      tipTitle: 'Short Maternal Stature / CPD Awareness',
      tipAdvice: `Maternal height below 145 cm increases risk of Cephalopelvic Disproportion (CPD), where the fetal head is too large to negotiate the birth canal. Home or birthing station delivery without surgical backup is strictly contraindicated.`,
      clinicalAction: `Mandate hospital pre-registration; schedule clinical pelvimetry and ultrasound biometry in the third trimester.`,
      urgency: 'moderate',
    };
  }

  if (
    l.includes('weight') ||
    l.includes('bmi') ||
    l.includes('malnutrition') ||
    l.includes('obesity') ||
    l.includes('payat')
  ) {
    return {
      tipTitle: 'Maternal Nutritional Status Protocol',
      tipAdvice: `Maternal undernutrition or obesity increases risk of intrauterine growth restriction or macrosomia. Emphasize nutrient-dense meals with adequate protein, fiber, and clean hydration.`,
      clinicalAction: `Track gestational weight gain trajectory at every visit; refer to Barangay Nutrition Scholar for supplementary feeding program if undernourished.`,
      urgency: 'moderate',
    };
  }

  // 3. Fallback for custom configured indicators
  return {
    tipTitle: `Clinical Advisory: ${label}`,
    tipAdvice: `Patient has been flagged with maternal risk indicator "${label}". Provide enhanced clinical surveillance, review danger signs of pregnancy at each visit, and ensure she has a confirmed delivery facility.`,
    clinicalAction: `Conduct regular follow-up contacts; verify family emergency transport arrangements and blood donor readiness.`,
    urgency: 'moderate',
  };
}
