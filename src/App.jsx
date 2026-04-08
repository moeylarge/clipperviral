import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'peptide_report_history_v2';
const LEAD_KEY = 'peptide_leads_v1';
const ANALYTICS_KEY = 'peptide_analytics_events_v1';
const ANALYTICS_ENDPOINT = import.meta.env.VITE_ANALYTICS_ENDPOINT || '';
const PILOT_CHECKOUT_URL = import.meta.env.VITE_PILOT_CHECKOUT_URL || '';
const CLINICIAN_CONTACT = 'moeylarge@gmail.com';

function safeStorageGetItem(key) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSetItem(key, value) {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function trackEvent(name, payload) {
  if (typeof window === 'undefined') return;
  const event = {
    name,
    at: new Date().toISOString(),
    url: window.location.pathname,
    ...payload,
  };

  if (ANALYTICS_ENDPOINT) {
    try {
      fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
      }).catch(() => {
        const raw = safeStorageGetItem(ANALYTICS_KEY);
        const parsed = raw ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        })() : [];
        const queue = Array.isArray(parsed) ? parsed : [];
        queue.push(event);
        safeStorageSetItem(ANALYTICS_KEY, JSON.stringify(queue.slice(-200)));
      });
    } catch {
      const raw = safeStorageGetItem(ANALYTICS_KEY);
      const parsed = raw ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return [];
        }
      })() : [];
      const queue = Array.isArray(parsed) ? parsed : [];
      queue.push(event);
      safeStorageSetItem(ANALYTICS_KEY, JSON.stringify(queue.slice(-200)));
    }
    return;
  }

  const raw = safeStorageGetItem(ANALYTICS_KEY);
  const queue = raw ? (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  })() : [];
  queue.push(event);
  safeStorageSetItem(ANALYTICS_KEY, JSON.stringify(queue.slice(-200)));
}

function getSavedLeads() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = safeStorageGetItem(LEAD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLead(record) {
  if (typeof window === 'undefined') return [];
  const existing = getSavedLeads();
  const updated = [{ ...record, id: `lead_${Date.now()}` }, ...existing].slice(0, 50);
  safeStorageSetItem(LEAD_KEY, JSON.stringify(updated));
  return updated;
}

function buildHandoffMessage(answers, result, lead) {
  const lines = [];
  lines.push('Clinician handoff summary (decision-support intake)');
  lines.push('');
  if (lead?.name) lines.push(`Patient/Patient name: ${lead.name}`);
  if (lead?.email) lines.push(`Contact email: ${lead.email}`);
  if (lead?.ageRange) lines.push(`Age bracket: ${lead.ageRange}`);
  lines.push(`Date: ${new Date().toLocaleString()}`);
  lines.push(`Primary pathway: ${result.top?.title || 'Not determined'}`);
  lines.push(`Secondary pathway: ${result.secondary?.title || 'Not determined'}`);
  lines.push('');
  lines.push('Risk flags:');
  if (result.riskProfile.length) {
    for (const risk of result.riskProfile) lines.push(`- ${risk.text} (${risk.severity})`);
  } else {
    lines.push('- No major risk flags selected.');
  }
  lines.push('');
  lines.push('Score breakdown:');
  for (const track of result.ranked) {
    lines.push(`- ${track.title}: ${track.score}`);
  }
  lines.push('');
  lines.push('Important safety note: not for diagnosis or prescribing; intended for clinician discussion only.');
  return lines.join('\n');
}

function encodeBase64Url(jsonValue) {
  const bytes = new TextEncoder().encode(JSON.stringify(jsonValue));
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(token) {
  if (!token) return null;
  const normalized = token.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getSavedReports() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = safeStorageGetItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReportToHistory(record) {
  if (typeof window === 'undefined') return [];
  const existing = getSavedReports();
  const normalized = [
    { ...record, id: record.id || `r_${Date.now()}` },
    ...existing.filter((item) => item.id !== record.id),
  ].slice(0, 12);
  safeStorageSetItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function clearHistoryToken() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('report')) return;
  url.searchParams.delete('report');
  window.history.replaceState({}, '', url.toString());
}

const TRACKS = {
  metabolic: {
    id: 'metabolic',
    title: 'Metabolic Health / Weight Management',
    summary: 'Discussion pathway for appetite, glucose, and weight-focused goals.',
    candidates: ['Nutrition + baseline review', 'Lab review', 'Licensed clinician discussion'],
    approval: 'Some options in this area may be regulated; most require specialist screening.',
    evidence: 'Moderate evidence for selected approved pathways when appropriate for diagnosis/context.',
    warnings: ['Pancreatitis history', 'Thyroid risk history', 'Pregnancy-related considerations'],
  },
  recovery: {
    id: 'recovery',
    title: 'Injury Recovery',
    summary: 'Discussion pathway for pain, rehab, and recovery planning.',
    candidates: ['Formal rehab plan', 'Functional reassessment', 'Specialist follow-up where required'],
    approval: 'Most non-prescribed compounds in this area are not broadly approved for general use.',
    evidence: 'Limited and mixed quality data in non-prescription self-use contexts.',
    warnings: ['Self-medication risk', 'Potential delay in diagnosis', 'Source quality risk'],
  },
  performance: {
    id: 'performance',
    title: 'Body Composition / Performance',
    summary: 'Support pathway focused on training quality, nutrition, and recovery load.',
    candidates: ['Sleep and training optimization', 'Endocrine review if clinically indicated', 'Sustainable lifestyle plan'],
    approval: 'Most performance-related marketed peptides are not approved for this use in healthy users.',
    evidence: 'Mixed or weak evidence, often overstated in direct-to-consumer claims.',
    warnings: ['Hormonal side effects', 'Doping implications in some sports', 'Unknown long-term safety'],
  },
  sleep: {
    id: 'sleep',
    title: 'Sleep & Recovery Quality',
    summary: 'Discussion pathway for poor or inconsistent sleep and daytime recovery.',
    candidates: ['Sleep hygiene framework', 'Medical screening when risk present', 'Medication/supplement interaction check'],
    approval: 'Peptide-directed claims are usually less evidence-strong than general behavioral approaches.',
    evidence: 'Low-to-moderate evidence; strong confounding by stress/mental-health factors.',
    warnings: ['Sleep apnea possibility', 'Comorbidity confounding', 'Sedating interaction risk'],
  },
  longevity: {
    id: 'longevity',
    title: 'Longevity / Preventive Health',
    summary: 'Exploratory prevention-oriented pathway based on objective baseline metrics.',
    candidates: ['Lab baseline + trend plan', 'Lifestyle-first optimization', 'Specialist-guided risk review'],
    approval: 'Many marketing messages in this area outpace regulatory approval.',
    evidence: 'Uneven and often early-stage in healthy adults.',
    warnings: ['Overpromised outcomes', 'Polypharmacy complexity', 'Unreliable self-tracking'],
  },
};

const QUESTIONS = [
  {
    id: 'goal',
    label: 'Primary goal',
    type: 'single',
    options: [
      { value: 'fat_loss', label: 'Fat loss / metabolic health', weights: { metabolic: 4 } },
      { value: 'injury', label: 'Injury recovery', weights: { recovery: 4 } },
      { value: 'muscle', label: 'Body composition / performance', weights: { performance: 4 } },
      { value: 'sleep', label: 'Sleep / recovery quality', weights: { sleep: 4 } },
      { value: 'longevity', label: 'Longevity / prevention', weights: { longevity: 4 } },
    ],
  },
  {
    id: 'age',
    label: 'Age bracket',
    type: 'single',
    options: [
      { value: '18_29', label: '18–29', weights: { performance: 1 } },
      { value: '30_44', label: '30–44', weights: { metabolic: 1, performance: 1, longevity: 1 } },
      { value: '45_59', label: '45–59', weights: { metabolic: 2, sleep: 1, longevity: 1 } },
      { value: '60_plus', label: '60+', weights: { metabolic: 2, sleep: 1, longevity: 2 } },
    ],
  },
  {
    id: 'training',
    label: 'Training frequency',
    type: 'single',
    options: [
      { value: 'low', label: '0–1 days/week', weights: { metabolic: 2, sleep: 1 } },
      { value: 'moderate', label: '2–4 days/week', weights: { performance: 1, metabolic: 1 } },
      { value: 'high', label: '5+ days/week', weights: { performance: 2, recovery: 1 } },
    ],
  },
  {
    id: 'injury_status',
    label: 'Current injury / persistent pain',
    type: 'single',
    options: [
      { value: 'none', label: 'None', weights: {} },
      { value: 'minor', label: 'Minor but persistent', weights: { recovery: 2 } },
      { value: 'major', label: 'Moderate to significant', weights: { recovery: 4 } },
    ],
  },
  {
    id: 'sleep_quality',
    label: 'Sleep quality',
    type: 'single',
    options: [
      { value: 'good', label: 'Good', weights: {} },
      { value: 'average', label: 'Average', weights: { sleep: 1 } },
      { value: 'poor', label: 'Poor / inconsistent', weights: { sleep: 3, metabolic: 1 } },
    ],
  },
  {
    id: 'weight_context',
    label: 'Weight or appetite is a major issue',
    type: 'single',
    options: [
      { value: 'no', label: 'No', weights: {} },
      { value: 'somewhat', label: 'Somewhat', weights: { metabolic: 2 } },
      { value: 'yes', label: 'Yes', weights: { metabolic: 4 } },
    ],
  },
  {
    id: 'risk_flags',
    label: 'Risk flags',
    type: 'multi',
    options: [
      {
        value: 'pregnancy',
        label: 'Pregnant / trying to conceive',
        risk: true,
        severity: 'critical',
        riskText: 'Pregnancy-related planning required before any peptide discussion.',
      },
      {
        value: 'pancreatitis',
        label: 'History of pancreatitis',
        risk: true,
        severity: 'high',
        riskText: 'Potential metabolic pathway restrictions; specialist review needed.',
      },
      {
        value: 'thyroid',
        label: 'Personal/family thyroid cancer concern',
        risk: true,
        severity: 'high',
        riskText: 'Thyroid risk changes benefit/risk profile and requires clinical oversight.',
      },
      {
        value: 'cancer',
        label: 'Active / recent cancer history',
        risk: true,
        severity: 'critical',
        riskText: 'Recent cancer history should generally block peptide exploration until oncology review.',
      },
      {
        value: 'diabetes_meds',
        label: 'Currently on diabetes medication',
        risk: true,
        severity: 'high',
        riskText: 'Drug interactions and hypoglycemia risk require direct clinician management.',
      },
      { value: 'none', label: 'None of the above', risk: false },
    ],
  },
];

const WORKFLOW = [
  {
    number: '01',
    title: 'Choose your context',
    copy: 'Answer 7 focused questions about goals, symptoms, and risk factors.',
  },
  {
    number: '02',
    title: 'Score pathways',
    copy: 'The engine highlights the 2 most relevant discussion paths for a licensed clinician.',
  },
  {
    number: '03',
    title: 'Surface hard risks',
    copy: 'Critical medical flags are called out so your intake is safe by default.',
  },
  {
    number: '04',
    title: 'Export a report',
    copy: 'Copy a clean summary to bring into your next medical appointment.',
  },
];

const SUPPORT = [
  {
    label: 'Decision support only',
    copy: 'No dosing recommendations. No diagnosis. Only structured prep for an actual clinician visit.',
  },
  {
    label: 'Clinician-ready framing',
    copy: 'Each report is formatted like an intake handoff and explicitly calls out what needs clinician review.',
  },
  {
    label: 'Safety-first gating',
    copy: 'Critical medical flags create a safety gate so unsafe next steps are blocked by default.',
  },
];

function scoreAnswers(answers) {
  const scores = Object.fromEntries(Object.keys(TRACKS).map((id) => [id, 0]));
  const riskProfile = [];
  const criticalRisk = [];

  for (const q of QUESTIONS) {
    const answer = answers[q.id];
    if (!answer) continue;

    if (q.type === 'single') {
      const selected = q.options.find((o) => o.value === answer);
      if (!selected) continue;
      for (const [track, weight] of Object.entries(selected.weights || {})) {
        scores[track] = (scores[track] || 0) + weight;
      }
      continue;
    }

    if (q.type === 'multi' && Array.isArray(answer)) {
      for (const value of answer) {
        const selected = q.options.find((o) => o.value === value);
        if (!selected || !selected.risk) continue;
        riskProfile.push({
          id: value,
          text: selected.riskText,
          severity: selected.severity || 'moderate',
        });
        if (selected.severity === 'critical') criticalRisk.push(value);
      }
    }
  }

  const ranked = Object.entries(scores)
    .map(([id, score]) => ({ ...TRACKS[id], id, score }))
    .sort((a, b) => b.score - a.score);

  return {
    scores,
    ranked,
    top: ranked[0],
    secondary: ranked[1],
    riskProfile,
    critical: criticalRisk.length > 0,
  };
}

function buildReport(answers, result) {
  const lines = [];
  lines.push('Peptide Discussion Intake Report (Decision-Support only)');
  lines.push('Top pathway: ' + (result.top?.title || 'Not determined'));
  lines.push('Secondary: ' + (result.secondary?.title || 'Not determined'));
  lines.push('');
  lines.push('Risk flags:');
  if (result.riskProfile.length) {
    for (const risk of result.riskProfile) lines.push(`- ${risk.text} (${risk.severity})`);
  } else {
    lines.push('- No major risk flags selected.');
  }
  lines.push('');
  lines.push('Scores:');
  for (const track of result.ranked) lines.push(`- ${track.title}: ${track.score}`);
  lines.push('');
  lines.push('Answered questions: ' + Object.keys(answers).filter((k) => {
    const value = answers[k];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length + ' / ' + QUESTIONS.length);
  return lines.join('\n');
}

function buildSavedRecord(answers, result) {
  const report = buildReport(answers, result);
  return {
    id: `r_${Date.now()}`,
    createdAt: new Date().toISOString(),
    answers,
    top: result.top?.id || null,
    secondary: result.secondary?.id || null,
    critical: result.critical,
    riskProfile: result.riskProfile,
    scores: result.scores,
    report,
    shareToken: encodeBase64Url({ answers, result: { top: result.top?.id, secondary: result.secondary?.id }, report }),
  };
}

function Progress({ current, total }) {
  const width = Math.round((current / total) * 100);
  return (
    <div className="progressWrap" aria-label={`Progress ${width}%`}>
      <div className="progress" style={{ width: `${width}%` }} />
    </div>
  );
}

function Pill({ children, tone }) {
  const toneClass = tone === 'ok' ? 'tag-ok' : tone === 'warn' ? 'tag-warn' : tone === 'danger' ? 'tag-danger' : '';
  return <span className={`tag ${toneClass}`}>{children}</span>;
}

function OptionButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`option ${active ? 'active' : ''}`}
    >
      <span>{children}</span>
    </button>
  );
}

function Landing({ onStart, consentGiven, setConsentGiven }) {
  return (
    <div className="container" style={{ maxWidth: '1000px' }}>
      <section className="card" style={{ marginTop: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'start', gap: 20 }}>
          <div style={{ maxWidth: 700 }}>
            <div className="row" style={{ marginBottom: 14 }}>
              <Pill tone="warn">Peptide Decision MVP</Pill>
              <Pill>Medical discussion support</Pill>
            </div>
            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.4rem)' }}>
              Choose safer peptide pathways before talking to a clinician
            </h1>
            <p style={{ fontSize: '1.07rem', marginTop: 14 }}>
              This intake maps your goals, symptoms, and risk factors into the two most relevant discussion pathways and highlights critical safety flags.
            </p>
          </div>
          <button className="btn" onClick={onStart} disabled={!consentGiven}>
            Start assessment
          </button>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Trust and safety baseline</h2>
          <p>
            This tool does not prescribe, diagnose, or replace care. It helps you have a cleaner first conversation with a licensed clinician.
          </p>
          <label className="small" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(event) => setConsentGiven(event.target.checked)}
            />
            I understand this is decision-support only and not medical advice.
          </label>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <div className="card">
          <h2>What this is for</h2>
          <p>
            If you are considering peptides for body composition, recovery, or wellness support, this tool helps you prepare a safer, cleaner conversation for your clinician.
          </p>
          <div className="grid two" style={{ marginTop: 12 }}>
            {SUPPORT.map((item) => (
              <article key={item.label} className="card">
                <h3 style={{ fontSize: '1.05rem', marginBottom: 8 }}>{item.label}</h3>
                <p className="small">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <div className="card">
          <h2>How it works</h2>
          <div className="grid" style={{ marginTop: 12 }}>
            {WORKFLOW.map((step) => (
              <div key={step.number} className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid var(--border)', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
                  {step.number}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{step.title}</div>
                  <div className="small" style={{ marginTop: 4 }}>{step.copy}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Ready to start your clinical discussion prep</h2>
          <p>
            Start in under 90 seconds: structured questions, pathway scoring, and a copy-ready report with next-step prompts.
          </p>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={onStart} disabled={!consentGiven}>
              Start assessment
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Quiz({ answers, setAnswers, step, setStep, onSubmit, hasCriticalRisk, criticalFlags }) {
  const current = QUESTIONS[step];
  const total = QUESTIONS.length;
  const [acknowledged, setAcknowledged] = useState(false);

  const canContinue = (() => {
    const value = answers[current?.id];
    if (current?.type === 'single') return Boolean(value);
    if (current?.type === 'multi') return Array.isArray(value) && value.length > 0;
    return false;
  })();

  const setSingle = (questionId, value) => {
    trackEvent('quiz_question_answered', {
      questionId,
      selected: value,
      type: 'single',
    });
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMulti = (questionId, value) => {
    setAnswers((prev) => {
      const currentValues = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      if (value === 'none') {
        const next = currentValues.includes('none') ? [] : ['none'];
        trackEvent('quiz_question_answered', {
          questionId,
          selected: value,
          type: 'multi',
          totalSelected: next.length,
        });
        return { ...prev, [questionId]: next };
      }

      const withoutNone = currentValues.filter((v) => v !== 'none');
      const next = withoutNone.includes(value)
        ? withoutNone.filter((v) => v !== value)
        : [...withoutNone, value];

      trackEvent('quiz_question_answered', {
        questionId,
        selected: value,
        type: 'multi',
        totalSelected: next.length,
      });

      return { ...prev, [questionId]: next };
    });
  };

  useEffect(() => {
    setAcknowledged(false);
    trackEvent('quiz_step_view', {
      step: step + 1,
      questionId: current?.id,
      hasCriticalRisk,
      totalSteps: total,
    });
  }, [step, hasCriticalRisk, current?.id]);

  const requiresSafetyConfirm = hasCriticalRisk && step === total - 1;
  const canSubmit = canContinue && (!requiresSafetyConfirm || acknowledged);

  const criticalItems = (criticalFlags || []).map((risk) => risk.text);

  return (
    <div className="container">
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <Pill tone="ok">Step {step + 1} of {total}</Pill>
            <h1 style={{ fontSize: '1.8rem', marginTop: 10 }}>Answer the intake</h1>
          </div>
          <div style={{ width: 230 }}>
            <Progress current={step + 1} total={total} />
          </div>
        </div>

        <p className="small" style={{ marginBottom: 10 }}>Question {step + 1}</p>
        <h2>{current.label}</h2>

        <div className="grid" style={{ marginTop: 12 }}>
          {current.type === 'single' &&
            current.options.map((option) => {
              const active = answers[current.id] === option.value;
              return (
                <OptionButton
                  key={option.value}
                  active={active}
                  onClick={() => setSingle(current.id, option.value)}
                >
                  {option.label}
                </OptionButton>
              );
            })}

          {current.type === 'multi' &&
            current.options.map((option) => {
              const active = Array.isArray(answers[current.id]) && answers[current.id].includes(option.value);
              return (
                <OptionButton
                  key={option.value}
                  active={active}
                  onClick={() => toggleMulti(current.id, option.value)}
                >
                  {option.label}
                </OptionButton>
              );
            })}
        </div>

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button
            className="btn btn-outline"
            onClick={() => {
              trackEvent('quiz_step_back', {
                step: step + 1,
                questionId: current?.id,
              });
              setStep((s) => Math.max(0, s - 1));
            }}
            disabled={step === 0}
          >
            Back
          </button>

          {step < total - 1 ? (
            <button
              className="btn"
              disabled={!canContinue}
              onClick={() => {
                if (!canContinue) return;
                trackEvent('quiz_step_next', {
                  step: step + 1,
                  questionId: current.id,
                  totalSteps: total,
                });
                setStep((s) => Math.min(total - 1, s + 1));
              }}
            >
              Continue
            </button>
          ) : (
            <>
              {requiresSafetyConfirm ? (
                <div style={{ marginBottom: 10 }} className="card">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚠</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>Critical safety gate active</div>
                      <div className="small">Critical flags must be acknowledged before report generation.</div>
                    </div>
                  </div>
                  <ul className="list" style={{ marginTop: 8 }}>
                    {criticalItems.length
                      ? criticalItems.map((item) => <li key={item}>• {item}</li>)
                      : <li>No critical details found.</li>}
                  </ul>
                  <label style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }} className="small">
                    <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
                    I understand this is review-gated and I will only use this as a clinician discussion aid.
                  </label>
                </div>
              ) : null}
                <button
                  className="btn"
                  disabled={!canSubmit}
                  onClick={() => {
                    if (!canSubmit) return;
                  trackEvent('quiz_submit', {
                    hasCriticalRisk,
                    criticalCount: criticalItems.length,
                  });
                  onSubmit();
                }}
                >
                  {requiresSafetyConfirm ? 'Confirm and generate gated report' : 'Generate report'}
                </button>
                </>
              )}
            </div>
      </section>
    </div>
  );
}

function Results({ result, answers, copyReport, reset, copyShareLink, history, loadHistoryReport }) {
  const maxScore = result.top?.score || 1;
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [clinicianContact, setClinicianContact] = useState(CLINICIAN_CONTACT);
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [savedLeads, setSavedLeads] = useState(() => getSavedLeads());

  const handoffMessage = buildHandoffMessage(answers, result, {
    name: leadName,
    email: leadEmail,
    ageRange: answers?.age || '',
  });

  const handoffMailTo = `mailto:${clinicianContact || CLINICIAN_CONTACT}?subject=${encodeURIComponent('Peptide discussion report handoff')}&body=${encodeURIComponent(handoffMessage)}`;

  const submitLead = () => {
    const normalizedEmail = (leadEmail || '').trim().toLowerCase();
    if (!normalizedEmail) return alert('Add an email if you want to request pilot contact.');
    const nextLeads = saveLead({
      name: (leadName || '').trim(),
      email: normalizedEmail,
      clinicianContact: clinicianContact || CLINICIAN_CONTACT,
      trackTop: result.top?.id,
      trackSecondary: result.secondary?.id,
      createdAt: new Date().toISOString(),
      critical: result.critical,
    });
    setSavedLeads(nextLeads);
    trackEvent('lead_capture', { email: normalizedEmail, trackTop: result.top?.id });
    setLeadCaptured(true);
    alert('Lead saved locally. We can use this format for your pilot CRM in next pass.');
  };

  const copyHandoff = async () => {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(handoffMessage);
      trackEvent('handoff_copy', { top: result.top?.id, secondary: result.secondary?.id });
      alert('Handoff message copied.');
    }
  };

  return (
    <div className="container split" style={{ alignItems: 'start' }}>
      <section className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <Pill tone="ok">Assessment complete</Pill>
          <Pill>Decision-support only</Pill>
          {result.critical ? <Pill tone="danger">Critical safety gate</Pill> : null}
        </div>

        <h1>Your clinician-ready discussion map</h1>
        <p>
          Use this output only as a structured discussion starter for a licensed clinician.
        </p>

        <div className="grid two" style={{ marginTop: 16 }}>
          {[result.top, result.secondary].filter(Boolean).map((track, index) => (
            <article key={track.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="small" style={{ marginBottom: 4 }}>{index === 0 ? 'Top pathway' : 'Secondary pathway'}</div>
                  <h2>{track.title}</h2>
                </div>
                <Pill tone="ok">{track.score}</Pill>
              </div>
              <p className="small">{track.summary}</p>
              <div className="row" style={{ marginTop: 10 }}>
                {track.candidates.map((candidate) => (
                  <Pill key={`${track.id}-${candidate}`}>{candidate}</Pill>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ marginBottom: 8 }}>What to discuss with your clinician</h2>
          {(result.riskProfile.length ? result.riskProfile : [{ text: 'No major risk flags selected.' }]).map((risk) => (
            <p key={`${risk.text}`} style={{ margin: '8px 0' }}>• {risk.text}</p>
          ))}
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <h2>Compliance and scope</h2>
          <p className="small">
            This output is for clinical conversation preparation only. Do not use it to self-prescribe, delay care, or make immediate treatment changes.
          </p>
        </div>
      </section>

      <aside style={{ display: 'grid', gap: 12 }}>
        <div className="card">
          <h2>Doctor handoff + lead capture</h2>
          <div className="small" style={{ marginTop: 8 }}>
            <div style={{ marginBottom: 8 }}>Name</div>
            <input
              value={leadName}
              onChange={(event) => setLeadName(event.target.value)}
              placeholder="Optional"
              style={{ width: '100%', marginBottom: 10 }}
            />
            <div style={{ marginBottom: 8 }}>Email</div>
            <input
              value={leadEmail}
              onChange={(event) => setLeadEmail(event.target.value)}
              placeholder="your@email.com"
              style={{ width: '100%', marginBottom: 10 }}
            />
            <div style={{ marginBottom: 8 }}>Clinician email (optional)</div>
            <input
              value={clinicianContact}
              onChange={(event) => setClinicianContact(event.target.value)}
              placeholder={CLINICIAN_CONTACT}
              style={{ width: '100%', marginBottom: 10 }}
            />
            <div style={{ display: 'grid', gap: 8 }}>
              <button className="btn btn-full" onClick={copyHandoff}>Copy handoff message</button>
              <a className="btn btn-full btn-outline" href={handoffMailTo} onClick={() => trackEvent('handoff_email_open', { top: result.top?.id })}>Email handoff to clinician</a>
            </div>
            <button className="btn btn-full" onClick={submitLead} style={{ marginTop: 8 }}>Save lead for paid pilot</button>
            {leadCaptured ? <div style={{ marginTop: 8, color: '#9ca3af' }} className="small">Pilot lead captured locally.</div> : null}
          </div>
        </div>

        <div className="card">
          <h2>Next steps</h2>
          <div className="small" style={{ marginTop: 8 }}>
            <div style={{ marginBottom: 8 }}>• Share this report with your clinician.</div>
            <div style={{ marginBottom: 8 }}>• Ask for medication, lab, and monitoring review.</div>
            <div>• Re-run this intake after a follow-up when your treatment context changes.</div>
          </div>
          <button className="btn btn-full" onClick={copyReport} style={{ marginTop: 12 }}>Copy report</button>
          <button className="btn btn-full" onClick={() => copyShareLink()} style={{ marginTop: 12 }}>Copy shareable report link</button>
          {PILOT_CHECKOUT_URL ? (
            <a
              href={PILOT_CHECKOUT_URL}
              target="_blank"
              rel="noreferrer"
              className="btn btn-full"
              onClick={() => trackEvent('pilot_checkout_click', { top: result.top?.id })}
              style={{ marginTop: 12, textAlign: 'center', display: 'inline-block' }}
            >
              Start one-click paid pilot
            </a>
          ) : (
            <div className="small" style={{ marginTop: 12 }}>Paid pilot checkout URL not set. Add <code>VITE_PILOT_CHECKOUT_URL</code> in Vercel env.</div>
          )}
        </div>

        <div className="card">
          <h2>Pilot leads captured locally</h2>
          <div className="small" style={{ marginTop: 8 }}>
            {savedLeads.length === 0 ? 'No leads yet.' : `${savedLeads.length} lead${savedLeads.length === 1 ? '' : 's'} captured for pilot.`}
            {savedLeads.slice(0, 3).map((lead) => (
              <div key={lead.id} style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                {lead.name || 'Unnamed'} — {lead.email}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Saved local reports</h2>
          <div className="small" style={{ marginTop: 8 }}>
            {history.length === 0 ? (
              <div>No local reports yet. Every completed report is saved here on this device.</div>
            ) : (
              history.map((item) => (
                <div key={item.id} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600 }}>{new Date(item.createdAt).toLocaleString()}</div>
                  <div style={{ marginTop: 4 }}>{TRACKS[item.top || 'metabolic']?.title || 'Top pathway'} / {TRACKS[item.secondary || 'metabolic']?.title || 'Secondary pathway'}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-outline" onClick={() => loadHistoryReport(item.id)}>Load</button>
                    <button className="btn btn-outline" onClick={() => copyShareLink(item.id)}>Copy report link</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <h2>Pathway scores</h2>
          <div className="grid" style={{ marginTop: 10 }}>
            {result.ranked.map((item) => (
              <div key={item.id}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>{item.title}</span>
                  <span className="muted">{item.score}</span>
                </div>
                <Progress current={item.score} total={maxScore} />
              </div>
            ))}
          </div>
        </div>

        <button className="btn" onClick={reset}>Take it again</button>
      </aside>
    </div>
  );
}

function AppContent() {
  const [mode, setMode] = useState('landing');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ risk_flags: [] });
  const [submitted, setSubmitted] = useState(false);
  const [history, setHistory] = useState(() => getSavedReports());
  const [loadedReportId, setLoadedReportId] = useState(null);
  const [consentGiven, setConsentGiven] = useState(false);

  const result = useMemo(() => scoreAnswers(answers), [answers]);

  useEffect(() => {
    trackEvent('landing_viewed', { path: window.location.pathname });
    const shared = decodeBase64Url(new URLSearchParams(window.location.search).get('report'));
    if (!shared) return;
    const parsedAnswers = shared.answers;
    const hasAnswers = parsedAnswers && typeof parsedAnswers === 'object';
    if (!hasAnswers) return;
    setAnswers(parsedAnswers);
    setMode('results');
    setSubmitted(true);
    setLoadedReportId(shared.id || 'shared');
    clearHistoryToken();
  }, []);

  const startIntake = () => {
    if (!consentGiven) return;
    trackEvent('assessment_started', { route: 'quiz' });
    setMode('quiz');
    setStep(0);
    setSubmitted(false);
    setLoadedReportId(null);
  };

  const copyReport = async () => {
    const report = buildReport(answers, result);
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(report);
      trackEvent('report_copy', { top: result.top?.id, secondary: result.secondary?.id });
      alert('Report copied to clipboard.');
    }
  };

  const copyShareLink = async (reportId) => {
    const report = reportId
      ? history.find((item) => item.id === reportId)
      : buildSavedRecord(answers, result);
    if (!report || !navigator?.clipboard?.writeText) return;
    const sharePayload = report.shareToken
      ? decodeBase64Url(report.shareToken)
      : null;
    const safePayload = sharePayload || {
      id: report.id,
      createdAt: report.createdAt,
      answers: report.answers,
      report: report.report,
      top: report.top,
      secondary: report.secondary,
    };
    const link = `${window.location.origin}${window.location.pathname}?report=${encodeURIComponent(encodeBase64Url(safePayload))}`;
    await navigator.clipboard.writeText(link);
    trackEvent('share_link_copy', { reportId: report?.id, source: reportId ? 'history' : 'current' });
    alert('Share link copied to clipboard.');
  };

  const loadHistoryReport = (id) => {
    const item = history.find((entry) => entry.id === id);
    if (!item) return;
    trackEvent('history_load', { reportId: id });
    setAnswers(item.answers || {});
    setMode('results');
    setSubmitted(true);
    setLoadedReportId(item.id);
    setStep(QUESTIONS.length - 1);
  };

  const onSubmit = () => {
    trackEvent('report_generated', {
      top: result.top?.id,
      secondary: result.secondary?.id,
      critical: result.critical,
    });
    const nextRecord = buildSavedRecord(answers, result);
    const updated = saveReportToHistory(nextRecord);
    setHistory(updated);
    setLoadedReportId(nextRecord.id);
    setSubmitted(true);
  };

  const reset = () => {
    setMode('landing');
    setStep(0);
    setAnswers({ risk_flags: [] });
    setSubmitted(false);
    setLoadedReportId(null);
    setConsentGiven(false);
  };

  if (mode === 'quiz' && !submitted) {
    return (
      <div className="page">
        <Quiz
          answers={answers}
          setAnswers={setAnswers}
          step={step}
          setStep={setStep}
          onSubmit={onSubmit}
          hasCriticalRisk={result.critical}
          criticalFlags={result.riskProfile.filter((item) => item.severity === 'critical')}
        />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="page">
        <Results
          result={result}
          answers={answers}
          copyReport={copyReport}
          copyShareLink={copyShareLink}
          history={history}
          loadHistoryReport={loadHistoryReport}
          reset={reset}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <Landing onStart={startIntake} consentGiven={consentGiven} setConsentGiven={setConsentGiven} />
    </div>
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unexpected error' };
  }

  componentDidCatch(error, info) {
    trackEvent('app_render_error', {
      errorMessage: error?.message || '',
      componentStack: info?.componentStack || '',
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page">
          <section className="container">
            <div className="card">
              <h1>Something went wrong.</h1>
              <p className="small">The app hit a runtime error. This is now captured and won&apos;t remain a blank screen.</p>
              <pre className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{this.state.message}</pre>
              <button className="btn" type="button" onClick={() => window.location.reload()} style={{ marginTop: 12 }}>
                Reload
              </button>
            </div>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
}
