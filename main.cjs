// Same scenario as the Ubuntu E2E in PR #130945, made cross-platform:
// N <video preload=auto> on hermes-media:// -> wait 10s -> count ESTABLISHED
// client sockets to the gateway -> control-plane net.fetch (same session,
// credentials mode) -> seek first clip -> play last clip for 8s.
const { app, BrowserWindow, protocol, net } = require('electron')
const { execSync } = require('child_process')
const { createMediaProtocolHandler } = require(process.env.MP)
const PORT = 18765, N = Number(process.env.N || 8)
setTimeout(() => { console.log('RESULT ' + JSON.stringify({ error: 'harness-timeout' })); app.exit(2) }, 120000)
app.setPath('userData', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'mp-e2e-')))
protocol.registerSchemesAsPrivileged([{ scheme: 'hermes-media', privileges: { secure: true, standard: true, stream: true, supportFetchAPI: true } }])

function establishedToGateway() {
  if (process.platform === 'win32') {
    // "  TCP    127.0.0.1:50123    127.0.0.1:18765    ESTABLISHED    4242"
    const out = execSync('netstat -ano -p TCP').toString()
    return out.split(/\r?\n/).filter(l => {
      const c = l.trim().split(/\s+/)
      return c[0] === 'TCP' && c[2] === `127.0.0.1:${PORT}` && c[3] === 'ESTABLISHED'
    }).length
  }
  return Number(execSync(`ss -tnH state established '( dport = :${PORT} )' | wc -l`).toString().trim())
}

app.whenReady().then(async () => {
  protocol.handle('hermes-media', createMediaProtocolHandler({
    ensureRemoteBearer: async () => null,
    fetchLocal: async () => new Response('', { status: 404 }),
    fetchRemote: (url, headers, method) => net.fetch(url, { bypassCustomProtocolHandlers: true, credentials: 'omit', headers, method }),
    fetchRemoteWithCookies: async () => { throw new Error('unused') },
    resolveLocalFile: async p => p,
    resolveRemoteConnection: async () => ({ authMode: 'token', baseUrl: `http://127.0.0.1:${PORT}`, mode: 'remote', token: 't' })
  }))
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } })
  const vids = Array.from({ length: N }, (_, i) => `<video preload="auto" muted src="hermes-media://remote/clip${i}.mp4"></video>`).join('')
  await win.loadURL('data:text/html,' + encodeURIComponent(`<html><body>${vids}</body></html>`))
  await new Promise(r => setTimeout(r, 10000))
  const ready = await win.webContents.executeJavaScript(`[...document.querySelectorAll('video')].map(v => v.readyState)`)
  const conns = establishedToGateway()
  const t0 = Date.now(); let ticket
  try { const r = await net.fetch(`http://127.0.0.1:${PORT}/api/ping`, { credentials: 'omit', signal: AbortSignal.timeout(15000) }); ticket = { status: r.status, ms: Date.now() - t0 } }
  catch (e) { ticket = { error: e.name, ms: Date.now() - t0 } }
  const seek = await win.webContents.executeJavaScript(`new Promise(res => { const v = document.querySelector('video'); const t = performance.now();
    v.addEventListener('seeked', () => res({ ok: true, ms: Math.round(performance.now() - t), at: Math.round(v.currentTime) }), { once: true });
    v.currentTime = v.duration * 0.7; setTimeout(() => res({ ok: false }), 15000) })`)
  const play = await win.webContents.executeJavaScript(`new Promise(res => { const vs = document.querySelectorAll('video'); const v = vs[vs.length - 1]; let w = 0; v.addEventListener('waiting', () => w++); v.play().catch(()=>{}); const s = v.currentTime;
    setTimeout(() => res({ advanced_s: +(v.currentTime - s).toFixed(1), stalls: w, dur: Math.round(v.duration), paused: v.paused, err: v.error && v.error.message, rs: v.readyState }), 8000) })`)
  const loaded = ready.filter(r => r >= 1).length
  console.log('RESULT ' + JSON.stringify({ platform: process.platform, electron: process.versions.electron, variant: process.env.VARIANT, n: N, loaded: `${loaded}/${N}`, ready, conns_idle: conns, ticket, seek, play }))
  app.exit(0)
})
