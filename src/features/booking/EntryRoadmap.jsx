import React from 'react';
import { ROADMAP_STEPS } from './bookingStatus.js';

export function EntryRoadmap({ progress }) {
  return (
    <section className="entry-roadmap" aria-labelledby="roadmap-title">
      <h3 id="roadmap-title">입장까지 과정</h3>
      <ol>
        {ROADMAP_STEPS.map(item => {
          const done = item.step <= progress.doneUntil;
          const current = item.step === progress.current;
          const halted = progress.halted && !done;
          return (
            <li
              key={item.step}
              className={`${done ? 'is-done' : ''} ${current ? 'is-current' : ''} ${halted ? 'is-halted' : ''}`.trim()}
              aria-current={current ? 'step' : undefined}
            >
              <span className="step-index" aria-hidden="true">
                {item.step}
              </span>
              <span className="step-copy">
                <strong>{item.title}</strong>
              </span>
            </li>
          );
        })}
      </ol>
      <p id="roadmap-hint">{progress.hint}</p>
    </section>
  );
}
