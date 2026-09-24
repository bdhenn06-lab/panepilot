import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isSupabaseConfigured,
  supabaseConfigError,
  supabaseEnvProblems,
} from '../config';

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const names = () => supabaseEnvProblems().map((p) => p.name);

describe('supabase env configuration', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    ENV_KEYS.forEach((k) => (saved[k] = process.env[k]));
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefgh.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_abc123';
  });

  afterEach(() => {
    ENV_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  it('accepts a complete environment', () => {
    expect(supabaseEnvProblems()).toEqual([]);
    expect(isSupabaseConfigured()).toBe(true);
  });

  it('reports each missing variable by name', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(names()).toEqual(ENV_KEYS);
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('treats an empty string the same as unset', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
    expect(names()).toEqual(['NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  });

  it('rejects a url that is not a url', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'abcdefgh.supabase.co';
    expect(names()).toEqual(['NEXT_PUBLIC_SUPABASE_URL']);
  });

  it('rejects unedited placeholders copied from .env.example', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://your-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '<your-anon-key>';
    expect(names()).toEqual(ENV_KEYS);
  });

  it('accepts a local supabase stack over http', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    expect(supabaseEnvProblems()).toEqual([]);
  });

  it('names the offending variables in the thrown error without leaking values', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_secretish';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const message = supabaseConfigError().message;
    expect(message).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(message).toContain('.env.local');
    expect(message).not.toContain('sb_publishable_secretish');
  });
});
