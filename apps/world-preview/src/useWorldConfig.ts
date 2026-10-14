import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPut } from './api';
import { DEFAULT_CONFIG, normaliseConfig, type WorldConfig } from './config';
import type { DataMode } from './useWorldData';

export type SaveState = 'loading' | 'ready' | 'saving' | 'saved' | 'error' | 'readonly' | 'demo';
const DEMO_KEY = 'world-preview-demo-config';

/**
 * The shop's look (character outfits, decorations, colours). LIVE: stored in the store's database through
 * /api/world-config (owner/admin only). DEMO: kept in this browser tab only, never sent anywhere.
 */
export function useWorldConfig(mode: DataMode | null) {
  const [config, setConfigState] = useState<WorldConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<SaveState>('loading');
  const dirty = useRef(false);
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    dirty.current = false;
    if (!mode) {
      setConfigState(DEFAULT_CONFIG);
      setState('loading');
      return;
    }
    if (mode === 'demo') {
      try {
        const raw = sessionStorage.getItem(DEMO_KEY);
        setConfigState(raw ? normaliseConfig(JSON.parse(raw)) : DEFAULT_CONFIG);
      } catch {
        setConfigState(DEFAULT_CONFIG);
      }
      loaded.current = true;
      setState('demo');
      return;
    }
    setState('loading');
    let off = false;
    apiGet<{ data: unknown }>('/world-config')
      .then((r) => {
        if (off) return;
        setConfigState(r.data ? normaliseConfig(r.data) : DEFAULT_CONFIG);
        loaded.current = true;
        setState('ready');
      })
      .catch((e: Error) => {
        if (off) return;
        // 403 = this account may look but not decorate; 404 = this API has no world-config yet (older server)
        loaded.current = true;
        setState(/403|404/.test(String(e.message)) ? 'readonly' : 'error');
      });
    return () => {
      off = true;
    };
  }, [mode]);

  const setConfig = useCallback((fn: (c: WorldConfig) => WorldConfig) => {
    if (!loaded.current) return;
    dirty.current = true;
    setConfigState((c) => fn(c));
  }, []);

  // save a moment after the last change
  useEffect(() => {
    if (!dirty.current || !mode || !loaded.current) return;
    if (mode === 'demo') {
      try {
        sessionStorage.setItem(DEMO_KEY, JSON.stringify(config));
      } catch {
        // storage can be blocked
      }
      return;
    }
    setState('saving');
    const id = setTimeout(() => {
      apiPut('/world-config', config)
        .then(() => {
          dirty.current = false;
          setState('saved');
        })
        .catch(() => setState('error'));
    }, 800);
    return () => clearTimeout(id);
  }, [config, mode]);

  const canEdit = state !== 'readonly' && state !== 'loading';
  return { config, setConfig, state, canEdit };
}
