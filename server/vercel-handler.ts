import type { Request, Response } from 'express';
import { appReady } from '../server.ts';

export default async function handler(req: Request, res: Response) {
  const target = new URL(req.url || '/', 'https://tinavitrine.local');
  const originalPath = target.searchParams.get('__tvroute');
  const isApiPath = originalPath?.startsWith('/api/');
  const isFacebookCallback = originalPath === '/auth/facebook/callback';

  if (originalPath && (isApiPath || isFacebookCallback)) {
    target.searchParams.delete('__tvroute');
    req.url = `${originalPath}${target.search}`;
  }

  const app = await appReady;
  return app(req, res);
}
