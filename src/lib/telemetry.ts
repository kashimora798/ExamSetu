import { supabase } from './supabase';

export type TelemetryEventName =
  | 'auth_google_click'
  | 'auth_magic_link_submit'
  | 'auth_magic_link_success'
  | 'auth_magic_link_error'
  | 'signup_google_click'
  | 'signup_magic_link_submit'
  | 'signup_magic_link_success'
  | 'signup_magic_link_error'
  | 'onboarding_step_view'
  | 'onboarding_complete'
  | 'session_load'
  | 'session_start'
  | 'session_answer'
  | 'session_submit_attempt'
  | 'session_submit_success'
  | 'session_submit_error'
  | 'results_load'
  | 'results_share'
  | 'bookmark_toggle'
  | 'app_error';

export interface TelemetryEvent {
  name: TelemetryEventName | string;
  payload?: Record<string, unknown>;
  userId?: string | null;
  path?: string;
  createdAt?: string;
}

const QUEUE_KEY = 'examsetu.telemetry.queue';

function readQueue(): TelemetryEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as TelemetryEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: TelemetryEvent[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-200)));
  } catch {
    // ignore storage failures
  }
}

function enqueue(event: TelemetryEvent) {
  const queue = readQueue();
  queue.push({
    ...event,
    path: event.path ?? window.location.pathname,
    createdAt: event.createdAt ?? new Date().toISOString(),
  });
  writeQueue(queue);
}

export async function trackEvent(
  name: TelemetryEventName | string,
  payload: Record<string, unknown> = {},
  userId?: string | null,
) {
  const event: TelemetryEvent = {
    name,
    payload,
    userId: userId ?? null,
    path: window.location.pathname,
    createdAt: new Date().toISOString(),
  };

  enqueue(event);

  try {
    const { error } = await supabase.from('analytics_events').insert({
      name: event.name,
      payload: event.payload,
      user_id: event.userId,
      path: event.path,
      created_at: event.createdAt,
      app_version: import.meta.env.VITE_APP_VERSION ?? 'dev',
      user_agent: navigator.userAgent,
    });

    if (!error) {
      const queue = readQueue().filter((entry) => entry.createdAt !== event.createdAt || entry.name !== event.name);
      writeQueue(queue);
    }
  } catch {
    // Keep queued locally for later flush.
  }
}

export async function trackError(
  error: unknown,
  context: Record<string, unknown> = {},
  userId?: string | null,
) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? null : null;

  await trackEvent('app_error', {
    message,
    stack,
    ...context,
  }, userId);

  try {
    await supabase.from('app_errors').insert({
      message,
      stack,
      context,
      user_id: userId ?? null,
      path: window.location.pathname,
      created_at: new Date().toISOString(),
      user_agent: navigator.userAgent,
    });
  } catch {
    // local queue already captured via trackEvent
  }
}

export async function flushTelemetryQueue() {
  const queue = readQueue();
  if (queue.length === 0) return;

  const stillQueued: TelemetryEvent[] = [];

  for (const event of queue) {
    try {
      const { error } = await supabase.from('analytics_events').insert({
        name: event.name,
        payload: event.payload ?? {},
        user_id: event.userId ?? null,
        path: event.path ?? window.location.pathname,
        created_at: event.createdAt ?? new Date().toISOString(),
        app_version: import.meta.env.VITE_APP_VERSION ?? 'dev',
        user_agent: navigator.userAgent,
      });

      if (error) stillQueued.push(event);
    } catch {
      stillQueued.push(event);
    }
  }

  writeQueue(stillQueued);
}
