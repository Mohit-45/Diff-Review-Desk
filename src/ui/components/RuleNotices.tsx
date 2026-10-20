import type { RuleNoticeGroup } from '../ruleNotices';
import { moreFiles, ruleNotice, warningMessages } from '../messages/warnings';
import { RiskMediumIcon } from './Icons';
import { SafeText } from './SafeText';

type RuleNoticesProps = {
  readonly groups: readonly RuleNoticeGroup[];
};

/**
 * A rule that could not run says which rule and on which file, and nothing else: the notice text
 * from the engine is never shown, so no diff content can ride along. Other rules keep their flags.
 */
export function RuleNotices({ groups }: RuleNoticesProps) {
  if (groups.length === 0) {
    return null;
  }
  return (
    <section className="review-notice rule-notices" aria-label={warningMessages.ruleRegion}>
      <ul>
        {groups.map((group) => (
          <li key={group.ruleId}>
            <RiskMediumIcon /> {ruleNotice(group.ruleId)} <SafeText>{group.path}</SafeText>
            {moreFiles(group.files - 1)}.
          </li>
        ))}
      </ul>
      <p>{warningMessages.ruleNotStored}</p>
    </section>
  );
}
