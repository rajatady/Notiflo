#!/usr/bin/env node
// ts-node scripts/demo.ts
//
// Standalone demo: walks through the full Notiflo alert lifecycle via REST.
// Requires a running server (default: http://localhost:3000/api).
//
// Override the base URL:
//   BASE_URL=http://localhost:4000/api ts-node scripts/demo.ts

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function separator(title: string): void {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function log(label: string, value: unknown): void {
  const formatted =
    typeof value === 'object' && value !== null
      ? JSON.stringify(value, null, 2)
      : String(value);
  console.log(`  ${label}:\n${formatted.split('\n').map((l) => `    ${l}`).join('\n')}`);
}

async function request<T>(
  step: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  let res: Response;
  try {
    res = await fetch(url, opts);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n  [${step}] Network error: ${message}`);
    console.error(`  URL: ${method} ${url}`);
    process.exit(1);
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    console.error(`\n  [${step}] HTTP ${res.status} ${res.statusText}`);
    console.error(`  URL: ${method} ${url}`);
    console.error(`  Response: ${JSON.stringify(data, null, 2)}`);
    process.exit(1);
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Main demo
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\nNotiflo Alert Lifecycle Demo');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('Running steps 1–10...\n');

  // -------------------------------------------------------------------------
  // Step 1 — Create organization
  // -------------------------------------------------------------------------
  separator('Step 1: Create organization');

  const org = await request<{ _id: string; name: string; slug: string }>(
    'Step 1',
    'POST',
    '/organizations',
    {
      name: 'Demo Corp',
      slug: `demo-corp-${Date.now()}`,
      description: 'Created by the Notiflo demo script',
    },
  );

  log('Organization created', { id: org._id, name: org.name, slug: org.slug });
  const organizationId = org._id;

  // -------------------------------------------------------------------------
  // Step 2 — Create subscriber with email channel
  // -------------------------------------------------------------------------
  separator('Step 2: Create subscriber with email channel');

  const externalId = `demo-user-${Date.now()}`;
  const subscriber = await request<{ _id: string; externalId: string; email?: string }>(
    'Step 2',
    'POST',
    '/subscribers',
    {
      organizationId,
      externalId,
      email: 'demo@example.com',
      name: 'Demo User',
      channelPreferences: {
        email: { enabled: true },
      },
    },
  );

  log('Subscriber created', {
    id: subscriber._id,
    externalId: subscriber.externalId,
    email: subscriber.email,
  });
  const subscriberId = subscriber._id;

  // -------------------------------------------------------------------------
  // Step 3 — Create email template
  // -------------------------------------------------------------------------
  separator('Step 3: Create email template');

  const template = await request<{ _id: string; name: string }>(
    'Step 3',
    'POST',
    '/templates',
    {
      organizationId,
      name: 'AAPL Alert Template',
      description: 'Notifies when AAPL crosses a price threshold',
      channels: {
        email: {
          subject: 'Alert: AAPL price threshold crossed',
          body: 'Hello {{subscriber.name}}, AAPL has crossed {{alert.threshold}}. Current value: {{tick.value}}.',
        },
      },
      tags: ['alerts', 'stocks'],
    },
  );

  log('Template created', { id: template._id, name: template.name });
  const templateId = template._id;

  // -------------------------------------------------------------------------
  // Step 4 — Create threshold_crossing alert: AAPL > 150
  // -------------------------------------------------------------------------
  separator('Step 4: Create threshold_crossing alert (AAPL > 150)');

  const alert = await request<{
    _id: string;
    symbol: string;
    strategyType: string;
    strategyParams: Record<string, unknown>;
    active: boolean;
  }>(
    'Step 4',
    'POST',
    '/alerts',
    {
      organizationId,
      subscriberId,
      symbol: 'AAPL',
      strategyType: 'threshold_crossing',
      strategyParams: {
        threshold: 150,
        direction: 'above',
      },
      channels: ['email'],
      templateId,
      active: true,
      cooldownMs: 0,
      name: 'AAPL above 150',
      description: 'Fires when AAPL trades above $150',
    },
  );

  log('Alert created', {
    id: alert._id,
    symbol: alert.symbol,
    strategyType: alert.strategyType,
    strategyParams: alert.strategyParams,
    active: alert.active,
  });
  const alertId = alert._id;

  // -------------------------------------------------------------------------
  // Step 5 — Check engine condition count
  // -------------------------------------------------------------------------
  separator('Step 5: Check engine condition count');

  const countResult = await request<{ count: number }>(
    'Step 5',
    'GET',
    '/alerts/count',
  );

  log('Engine condition count', countResult);

  if (countResult.count === 0) {
    console.log(
      '\n  NOTE: Engine reports 0 conditions. The Rust engine bridge may\n' +
        '  not be fully initialized. Tick evaluation results may be empty.\n',
    );
  }

  // -------------------------------------------------------------------------
  // Step 6 — Submit tick: AAPL = 160 (expect match)
  // -------------------------------------------------------------------------
  separator('Step 6: Submit tick AAPL = 160 (expect match)');

  const tickAbove = await request<{ matches: unknown[]; count: number }>(
    'Step 6',
    'POST',
    '/alerts/ticks',
    {
      symbol: 'AAPL',
      value: 160,
      timestampUs: Date.now() * 1_000,
    },
  );

  log('Tick result (AAPL = 160)', tickAbove);

  if (tickAbove.count > 0) {
    console.log(`\n  Match confirmed: ${tickAbove.count} condition(s) fired.`);
  } else {
    console.log(
      '\n  No matches returned. If the engine is not fully initialized,\n' +
        '  this is expected — the condition is persisted in MongoDB but the\n' +
        '  Rust engine may need a restart to load it.',
    );
  }

  // -------------------------------------------------------------------------
  // Step 7 — Submit tick: AAPL = 140 (expect no match)
  // -------------------------------------------------------------------------
  separator('Step 7: Submit tick AAPL = 140 (expect no match)');

  const tickBelow = await request<{ matches: unknown[]; count: number }>(
    'Step 7',
    'POST',
    '/alerts/ticks',
    {
      symbol: 'AAPL',
      value: 140,
      timestampUs: Date.now() * 1_000,
    },
  );

  log('Tick result (AAPL = 140)', tickBelow);

  if (tickBelow.count === 0) {
    console.log('\n  Correct: no match for value below threshold (140 < 150).');
  } else {
    console.log(
      `\n  Unexpected: ${tickBelow.count} match(es) returned for AAPL = 140.`,
    );
  }

  // -------------------------------------------------------------------------
  // Step 8 — Check notifications
  // -------------------------------------------------------------------------
  separator('Step 8: Check notifications');

  const notifications = await request<unknown[]>(
    'Step 8',
    'GET',
    `/notifications?organizationId=${organizationId}&limit=10`,
  );

  const notifArray = Array.isArray(notifications) ? notifications : [];
  log(`Notifications found (total: ${notifArray.length})`, notifArray.slice(0, 3));

  if (notifArray.length === 0) {
    console.log(
      '\n  No notifications yet. Notifications are only created when the\n' +
        '  engine produces a match AND the delivery pipeline processes it.',
    );
  }

  // -------------------------------------------------------------------------
  // Step 9 — Check engine metrics
  // -------------------------------------------------------------------------
  separator('Step 9: Check engine metrics (GET /dashboard/engine)');

  const engineStatus = await request<Record<string, unknown>>(
    'Step 9',
    'GET',
    '/dashboard/engine',
  );

  log('Engine status', engineStatus);

  // -------------------------------------------------------------------------
  // Step 10 — Clean up: delete the alert
  // -------------------------------------------------------------------------
  separator('Step 10: Clean up — delete alert');

  const deleted = await request<Record<string, unknown>>(
    'Step 10',
    'DELETE',
    `/alerts/${alertId}`,
  );

  log('Alert deleted', { id: alertId, result: deleted });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  separator('Demo complete');
  console.log('  Resources created during this run:');
  console.log(`    Organization : ${organizationId}`);
  console.log(`    Subscriber   : ${subscriberId} (externalId: ${externalId})`);
  console.log(`    Template     : ${templateId}`);
  console.log(`    Alert        : ${alertId} (deleted)`);
  console.log('\n  The organization, subscriber, and template remain in the database.');
  console.log('  Re-run the script at any time to create a fresh set of resources.\n');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nUnhandled error: ${message}`);
  process.exit(1);
});
