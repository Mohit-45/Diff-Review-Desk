import { BUILT_IN_SAMPLES, type BuiltInSample } from '../../samples';

/**
 * Sample titles are trusted constants, not diff text, so they render as plain
 * button content and keep the button's accessible name straightforward.
 */
export function SampleButtons({
  disabled,
  onLoadSample,
}: {
  readonly disabled: boolean;
  readonly onLoadSample: (sample: BuiltInSample) => void;
}) {
  return (
    <div className="button-row sample-row" role="group" aria-label="Built-in samples">
      {BUILT_IN_SAMPLES.map((sample) => (
        <button
          key={sample.id}
          type="button"
          className="button button-secondary"
          onClick={() => {
            onLoadSample(sample);
          }}
          disabled={disabled}
        >
          {sample.title}
        </button>
      ))}
    </div>
  );
}
