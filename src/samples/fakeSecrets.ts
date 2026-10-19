const awsPrefix = ['A', 'K', 'I', 'A'].join('');
const awsBody = [
  '0',
  '1',
  'B',
  '2',
  'C',
  '3',
  'D',
  '4',
  'E',
  '5',
  'F',
  '6',
  'G',
  '7',
  'H',
  '8',
].join('');

const fakeAwsKey = `${awsPrefix}${awsBody}`;

/**
 * Sample fixtures deliberately contain placeholders instead of secrets or
 * control characters. Expansion happens only when a sample is selected.
 */
export function materialize(text: string): string {
  return text.replaceAll(/\{\{([^{}]+)\}\}/gu, (placeholder, name: string) => {
    switch (name) {
      case 'FAKE:aws-key':
        return fakeAwsKey;
      case 'FAKE:api-key':
        return fakeAwsKey;
      case 'U+202E':
        return String.fromCodePoint(0x202e);
      case 'CR':
        return String.fromCharCode(13);
      case 'ESC':
        return String.fromCharCode(27);
      case 'NUL':
        return String.fromCharCode(0);
      default:
        return placeholder;
    }
  });
}

export const FAKE_SECRET_PLACEHOLDER = '{{FAKE:aws-key}}' as const;
