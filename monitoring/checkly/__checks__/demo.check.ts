// The monitor as code (live-demo L7). One browser check runs demo.spec.ts against the public demo every
// hour from one location, and emails CHECKLY_ALERT_EMAIL when it fails and when it recovers. The address
// is read at deploy time and never committed. With CHECKLY_FAIL_DRILL=1 the deploy adds a second,
// temporary check (drill.spec.ts) that can't pass, on the same channel, to prove the alert arrives; the
// next normal deploy removes it, since a deploy makes the account match this project.
import { BrowserCheck, EmailAlertChannel, Frequency } from 'checkly/constructs';

const address = process.env['CHECKLY_ALERT_EMAIL'];
if (!address) throw new Error('CHECKLY_ALERT_EMAIL is not set: the monitor needs somewhere to send its alerts (scripts/checkly.sh reads it from ~/.config/commet/checkly.env)');

export const alertEmail = new EmailAlertChannel('commet-demo-alert-email', {
  address,
  sendFailure: true,
  sendRecovery: true,
  sendDegraded: false,
  sslExpiry: false,
});

new BrowserCheck('commet-demo-journey', {
  name: 'Commet demo: opens, plays, draws, names a planet',
  code: { entrypoint: './demo.spec.ts' },
  frequency: Frequency.EVERY_1H,
  locations: ['us-east-1'],
  alertChannels: [alertEmail],
  tags: ['commet', 'demo'],
});

if (process.env['CHECKLY_FAIL_DRILL'] === '1') {
  new BrowserCheck('commet-demo-alert-drill', {
    name: 'DRILL (temporary): Commet demo names a planet that does not exist',
    code: { entrypoint: './drill.spec.ts' },
    frequency: Frequency.EVERY_10M,
    locations: ['us-east-1'],
    alertChannels: [alertEmail],
    tags: ['commet', 'drill'],
  });
}
