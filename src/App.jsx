import { useMemo, useState } from 'react';

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
    copy: 'No dosing recommendations. No diagnosis. Just a cleaner clinical conversation.',
  },
  {
    label: 'Safety-first framing',
    copy: 'Critical risk flags can stop unsafe next steps and force professional review.',
  },
  {
    label: 'Built for action',
    copy: 'Output includes next-step priorities you can discuss with a clinician immediately.',
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

function Landing({ onStart }) {
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
          <button className="btn" onClick={onStart}>
            Start assessment
          </button>
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
            <button className="btn" onClick={onStart}>
              Start assessment
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Quiz({ answers, setAnswers, step, setStep, onSubmit }) {
  const current = QUESTIONS[step];
  const total = QUESTIONS.length;

  const canContinue = (() => {
    const value = answers[current?.id];
    if (current?.type === 'single') return Boolean(value);
    if (current?.type === 'multi') return Array.isArray(value) && value.length > 0;
    return false;
  })();

  const setSingle = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMulti = (questionId, value) => {
    setAnswers((prev) => {
      const currentValues = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      if (value === 'none') {
        return { ...prev, [questionId]: currentValues.includes('none') ? [] : ['none'] };
      }

      const withoutNone = currentValues.filter((v) => v !== 'none');
      const next = withoutNone.includes(value)
        ? withoutNone.filter((v) => v !== value)
        : [...withoutNone, value];

      return { ...prev, [questionId]: next };
    });
  };

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
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Back
          </button>

          {step < total - 1 ? (
            <button
              className="btn"
              disabled={!canContinue}
              onClick={() => canContinue && setStep((s) => Math.min(total - 1, s + 1))}
            >
              Continue
            </button>
          ) : (
            <button
              className="btn"
              disabled={!canContinue}
              onClick={() => canContinue && onSubmit(true)}
            >
              Generate report
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Results({ result, answers, copyReport, reset }) {
  const maxScore = result.top?.score || 1;

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
      </section>

      <aside style={{ display: 'grid', gap: 12 }}>
        <div className="card">
          <h2>Next steps</h2>
          <div className="small" style={{ marginTop: 8 }}>
            <div style={{ marginBottom: 8 }}>• Share this report with your clinician.</div>
            <div style={{ marginBottom: 8 }}>• Ask for medication, lab, and monitoring review.</div>
            <div>• Re-run this intake after a follow-up when your treatment context changes.</div>
          </div>
          <button className="btn btn-full" onClick={copyReport} style={{ marginTop: 12 }}>Copy report</button>
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

export default function App() {
  const [mode, setMode] = useState('landing');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ risk_flags: [] });
  const [submitted, setSubmitted] = useState(false);

  const result = useMemo(() => scoreAnswers(answers), [answers]);

  const startIntake = () => {
    setMode('quiz');
    setStep(0);
    setSubmitted(false);
  };

  const copyReport = async () => {
    const report = buildReport(answers, result);
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(report);
      alert('Report copied to clipboard.');
    }
  };

  const reset = () => {
    setMode('landing');
    setStep(0);
    setAnswers({ risk_flags: [] });
    setSubmitted(false);
  };

  if (mode === 'quiz' && !submitted) {
    return (
      <div className="page">
        <Quiz
          answers={answers}
          setAnswers={setAnswers}
          step={step}
          setStep={setStep}
          onSubmit={(value) => setSubmitted(value)}
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
          reset={reset}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <Landing onStart={startIntake} />
    </div>
  );
}
