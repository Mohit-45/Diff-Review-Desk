import { useEffect, useId, useRef, useState } from 'react';
import { carryFactsOf } from '../../app/carryFacts';
import { decidedCount, type PendingChoice, type PendingLoad } from '../../app/loadPlan';
import {
  carryMessages,
  continueDetail,
  restoreSummary,
  startNewDetail,
  stepSummary,
} from '../messages/carryover';

export type LoadDecisionProps = {
  readonly pending: PendingLoad;
  readonly onResolve: (choice: PendingChoice) => void;
  readonly onCancel: () => void;
};

type CarryPending = Extract<PendingLoad, { readonly kind: 'carry' }>;
type RestorePending = Extract<PendingLoad, { readonly kind: 'restore' }>;
type PartProps<T extends PendingLoad> = Omit<LoadDecisionProps, 'pending'> & {
  readonly pending: T;
};

function useFocusOnMount() {
  const ref = useRef<HTMLHeadingElement>(null);
  // The control that was clicked is gone, so focus would otherwise fall to the page.
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

function RestoreDecision({ pending, onResolve, onCancel }: PartProps<RestorePending>) {
  const headingId = useId();
  const headingRef = useFocusOnMount();
  const saved = decidedCount(pending.opened.state);
  return (
    <section className="load-decision" aria-labelledby={headingId}>
      <h3 id={headingId} ref={headingRef} tabIndex={-1}>
        {carryMessages.restoreHeading}
      </h3>
      <p>{restoreSummary(saved, pending.opened.state.round, pending.openDecisions)}</p>
      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            onResolve('restore');
          }}
        >
          {carryMessages.restore}
        </button>
        <button type="button" className="button button-secondary" onClick={onCancel}>
          {carryMessages.keepCurrent}
        </button>
      </div>
    </section>
  );
}

type OptionProps = {
  readonly name: string;
  readonly value: PendingChoice;
  readonly label: string;
  readonly detail: string;
  readonly checked: boolean;
  readonly onSelect: (value: PendingChoice) => void;
};

function ChoiceOption({ name, value, label, detail, checked, onSelect }: OptionProps) {
  const detailId = useId();
  return (
    <div className="load-decision-option">
      <label>
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          aria-describedby={detailId}
          onChange={() => {
            onSelect(value);
          }}
        />
        {label}
      </label>
      <p id={detailId}>{detail}</p>
    </div>
  );
}

function CarryDecision({ pending, onResolve, onCancel }: PartProps<CarryPending>) {
  const headingId = useId();
  const groupName = useId();
  const headingRef = useFocusOnMount();
  const { summary, previous } = pending;
  const facts = carryFactsOf(summary.state);
  const canContinue = summary.carriedIds.length > 0;
  const [choice, setChoice] = useState<PendingChoice>(canContinue ? 'carry-over' : 'new');
  const carried = facts === null ? 0 : facts.approved + facts.rejected;
  return (
    <section className="load-decision" aria-labelledby={headingId}>
      <h3 id={headingId} ref={headingRef} tabIndex={-1}>
        {canContinue ? carryMessages.stepHeading : carryMessages.newHeading}
      </h3>
      {facts === null ? null : <p>{stepSummary(facts)}</p>}
      <fieldset>
        <legend>{carryMessages.choiceLegend}</legend>
        {canContinue ? (
          <ChoiceOption
            name={groupName}
            value="carry-over"
            label={carryMessages.continueLabel(summary.state.round)}
            detail={continueDetail(carried, previous.round)}
            checked={choice === 'carry-over'}
            onSelect={setChoice}
          />
        ) : null}
        <ChoiceOption
          name={groupName}
          value="new"
          label={carryMessages.startNew}
          detail={startNewDetail(decidedCount(previous), previous.round)}
          checked={choice === 'new'}
          onSelect={setChoice}
        />
      </fieldset>
      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            onResolve(choice);
          }}
        >
          {choice === 'carry-over'
            ? carryMessages.continueLabel(summary.state.round)
            : carryMessages.startNew}
        </button>
        <button type="button" className="button button-secondary" onClick={onCancel}>
          {carryMessages.back}
        </button>
      </div>
    </section>
  );
}

/** Step 2 of the Load dialog: what the new diff means for the review already there. */
export function LoadDecision(props: LoadDecisionProps) {
  const { pending, onResolve, onCancel } = props;
  if (pending.kind === 'carry') {
    return <CarryDecision pending={pending} onResolve={onResolve} onCancel={onCancel} />;
  }
  return <RestoreDecision pending={pending} onResolve={onResolve} onCancel={onCancel} />;
}
