// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSamePublicationOrigin } from '../app/lib/request-origin';
import { authRequestOrigin } from '../app/lib/auth-origin';
afterEach(()=>vi.unstubAllEnvs());
function req(origin:string,host?:string,url='http://localhost:3100/api/publicar',extra={}) {
  return new Request(url,{headers:{...(origin?{origin}:{}),...(host?{host}:{}),...extra}});
}
describe('real Next proxy loopback origin regression',()=>{
  it('preserves the browser cookie host for Auth callbacks',()=>{
    vi.stubEnv('NODE_ENV','development');expect(authRequestOrigin(req('','127.0.0.1:3100'))).toBe('http://127.0.0.1:3100');
  });
  it('does not trust nonloopback Host for Auth redirects',()=>{
    vi.stubEnv('NODE_ENV','development');expect(authRequestOrigin(req('','external.invalid'))).toBe('http://localhost:3100');
    expect(authRequestOrigin(req('','external.invalid','http://10.0.0.1:3100/auth/callback'))).toBe('https://inmueblesdirectosperu.com');
  });
  it('uses the configured canonical origin in production',()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_SITE_ORIGIN','https://portal.example.test');
    expect(authRequestOrigin(req('','127.0.0.1:3100'))).toBe('https://portal.example.test');
    expect(isSamePublicationOrigin(req('https://portal.example.test','127.0.0.1:3100'))).toBe(true);
    expect(isSamePublicationOrigin(req('https://inmueblesdirectosperu.com','127.0.0.1:3100'))).toBe(false);
  });
  it('fails closed in production when the configured origin is invalid',()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_SITE_ORIGIN','http://insecure.example.test');
    expect(isSamePublicationOrigin(req('http://insecure.example.test','127.0.0.1:3100'))).toBe(false);
  });
  it('production callback never derives a redirect from Host',()=>{
    vi.stubEnv('NODE_ENV','production');expect(authRequestOrigin(req('','127.0.0.1:3100'))).toBe('https://inmueblesdirectosperu.com');
  });
  it('accepts browser 127.0.0.1 when Next normalizes request URL to localhost',()=>{
    vi.stubEnv('NODE_ENV','development');expect(isSamePublicationOrigin(req('http://127.0.0.1:3100','127.0.0.1:3100'))).toBe(true);
  });
  it('keeps original same-origin localhost behavior without Host',()=>{
    vi.stubEnv('NODE_ENV','development');expect(isSamePublicationOrigin(req('http://localhost:3100'))).toBe(true);
  });
  it.each([
    ['http://localhost:3100','127.0.0.1:3100'],['http://127.0.0.1:3101','127.0.0.1:3101'],
    ['https://external.invalid','external.invalid'],['http://localhost:3100','external.invalid'],
    ['http://user:pass@127.0.0.1:3100','127.0.0.1:3100'],['http://127.0.0.1:3100/path','127.0.0.1:3100'],
    ['http://127.0.0.1:3100?x=1','127.0.0.1:3100'],['http://127.0.0.1:3100','user@127.0.0.1:3100'],
    ['http://127.0.0.1:3100','127.0.0.1:3100/path'],['','127.0.0.1:3100'],
  ])('rejects origin=%s and Host=%s',(origin,host)=>{
    vi.stubEnv('NODE_ENV','development');expect(isSamePublicationOrigin(req(origin,host))).toBe(false);
  });
  it('rejects nonloopback internal request even with a loopback Host',()=>{
    vi.stubEnv('NODE_ENV','development');expect(isSamePublicationOrigin(req('http://127.0.0.1:3100','127.0.0.1:3100','http://10.0.0.1:3100/api/publicar'))).toBe(false);
  });
  it('ignores spoofed forwarded headers',()=>{
    vi.stubEnv('NODE_ENV','development');expect(isSamePublicationOrigin(req('https://external.invalid','127.0.0.1:3100',undefined,{'x-forwarded-host':'external.invalid','x-forwarded-proto':'https'}))).toBe(false);
  });
  it('rejects explicit cross-site even if origin otherwise matches',()=>{
    vi.stubEnv('NODE_ENV','development');expect(isSamePublicationOrigin(req('http://127.0.0.1:3100','127.0.0.1:3100',undefined,{'sec-fetch-site':'cross-site'}))).toBe(false);
  });
  it.each(['http://127.0.0.1:3100','http://localhost:3100','https://other.invalid',''])('production rejects %s',origin=>{
    vi.stubEnv('NODE_ENV','production');expect(isSamePublicationOrigin(req(origin,'127.0.0.1:3100'))).toBe(false);
  });
  it('production retains its fixed canonical origin behind a reverse proxy',()=>{
    vi.stubEnv('NODE_ENV','production');expect(isSamePublicationOrigin(req('https://inmueblesdirectosperu.com','127.0.0.1:3100'))).toBe(true);
  });
});
