import { getAuth, logout, requestEmailCode, verifyEmailCode } from './auth';
import { HttpError, json, requireSameOrigin, securityHeaders } from './http';
import {
  deletePasskey,
  listPasskeys,
  loginOptions,
  loginVerify,
  registerOptions,
  registerVerify,
} from './passkeys';
import {
  deleteEntry,
  exportData,
  exportLifecycleBackup,
  getSettings,
  importData,
  listEntries,
  resetData,
  saveEntry,
  saveSettings,
} from './training';
import { deletePlan, listPlan, savePlan, updatePlanStatus } from './plan';
import { applyAccountOperation, getAccountState } from './account-sync';
import { cancelLifecycle, getLifecycleOutcome, prepareLifecycle } from './account-lifecycle';

async function api(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method;
  if (!['GET', 'HEAD'].includes(method)) requireSameOrigin(request, env);
  if (method === 'GET' && path === '/api/health') return json({ ok: true });
  if (method === 'GET' && path === '/api/account-state') return getAccountState(request, env);
  if (method === 'GET' && path === '/api/account-lifecycle/backup')
    return exportLifecycleBackup(request, env);
  if (method === 'POST' && path === '/api/account-lifecycle/outcome')
    return getLifecycleOutcome(request, env);
  if (method === 'POST' && path === '/api/account-lifecycle/prepare')
    return prepareLifecycle(request, env);
  if (method === 'POST' && path === '/api/account-lifecycle/cancel')
    return cancelLifecycle(request, env);
  if (method === 'POST' && path === '/api/account-operations')
    return applyAccountOperation(request, env);
  if (method === 'GET' && path === '/api/me')
    return json({ user: (await getAuth(request, env))?.user ?? null });
  if (method === 'POST' && path === '/api/auth/email/request')
    return requestEmailCode(request, env);
  if (method === 'POST' && path === '/api/auth/email/verify') return verifyEmailCode(request, env);
  if (method === 'POST' && path === '/api/auth/logout') return logout(request, env);
  if (method === 'POST' && path === '/api/auth/passkeys/login/options')
    return loginOptions(request, env);
  if (method === 'POST' && path === '/api/auth/passkeys/login/verify')
    return loginVerify(request, env);
  if (method === 'POST' && path === '/api/auth/passkeys/register/options')
    return registerOptions(request, env);
  if (method === 'POST' && path === '/api/auth/passkeys/register/verify')
    return registerVerify(request, env);
  if (method === 'GET' && path === '/api/auth/passkeys') return listPasskeys(request, env);
  const passkeyId = path.match(/^\/api\/auth\/passkeys\/([\w-]{1,2048})$/)?.[1];
  if (method === 'DELETE' && passkeyId) return deletePasskey(request, env, passkeyId);
  if (method === 'GET' && path === '/api/entries') return listEntries(request, env);
  if (method === 'POST' && path === '/api/entries') return saveEntry(request, env);
  const entryId = path.match(/^\/api\/entries\/([^/]{1,600})$/)?.[1];
  if (method === 'PUT' && entryId) return saveEntry(request, env, decodeURIComponent(entryId));
  if (method === 'DELETE' && entryId) return deleteEntry(request, env, decodeURIComponent(entryId));
  if (method === 'GET' && path === '/api/plan') return listPlan(request, env);
  if (method === 'POST' && path === '/api/plan') return savePlan(request, env);
  if (method === 'POST' && path === '/api/plan/status') return updatePlanStatus(request, env);
  const planId = path.match(/^\/api\/plan\/([^/]{1,600})$/)?.[1];
  if (method === 'PUT' && planId) return savePlan(request, env, decodeURIComponent(planId));
  if (method === 'DELETE' && planId) return deletePlan(request, env, decodeURIComponent(planId));
  if (method === 'GET' && path === '/api/settings') return getSettings(request, env);
  if (method === 'PUT' && path === '/api/settings') return saveSettings(request, env);
  if (method === 'GET' && path === '/api/export') return exportData(request, env);
  if (method === 'POST' && path === '/api/import') return importData(request, env);
  if (method === 'POST' && path === '/api/reset') return resetData(request, env);
  throw new HttpError(404, 'This endpoint was not found.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const response = url.pathname.startsWith('/api/')
        ? await api(request, env, url.pathname)
        : await env.ASSETS.fetch(request);
      return securityHeaders(response, env);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('An account may contain up to 2000 planned exercises.')
      ) {
        return securityHeaders(
          json({ error: 'An account can hold up to 2,000 planned exercises.' }, 400),
          env,
        );
      }
      if (
        error instanceof Error &&
        /account_storage_limit|practice_entry_limit/.test(error.message)
      ) {
        return securityHeaders(
          json(
            {
              error:
                'Your account has reached its storage limit. Export your data, then remove older entries or use a replacement import.',
            },
            400,
          ),
          env,
        );
      }
      if (error instanceof HttpError) {
        return securityHeaders(
          json(
            { error: error.message, ...error.details },
            error.status,
            error.status === 429 ? { 'Retry-After': '60' } : undefined,
          ),
          env,
        );
      }
      // Unexpected exceptions may contain SQL, request bodies, or secrets.
      console.error(
        JSON.stringify({
          event: 'request_failed',
          type: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
      return securityHeaders(json({ error: 'Something went wrong. Please try again.' }, 500), env);
    }
  },
  async scheduled(_controller, env): Promise<void> {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM email_codes WHERE expires_at <= ?').bind(now),
      env.DB.prepare('DELETE FROM ceremonies WHERE expires_at <= ?').bind(now),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at <= ?').bind(Math.floor(now / 1000)),
    ]);
  },
} satisfies ExportedHandler<Env>;
