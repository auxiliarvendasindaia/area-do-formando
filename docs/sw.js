// Service worker da Área do Formando.
//
// Faz duas coisas, sem inventar cache esperto:
//  1. guarda a casca do site (página, estilo, fonte, logo) para abrir mesmo sem
//     internet — quem instalou na tela de início não vê tela de erro do navegador;
//  2. deixa a porta pronta para a notificação (push), que só passa a chegar
//     quando o servidor tiver as chaves e o envio ligado.
//
// Regra: dado do formando NUNCA entra em cache. Só a casca. Todo pedido a
// /area-formando/ vai direto para a rede.

const VERSAO = 'formando-v1';
const CASCA = ['./', './index.html', './estilo.css', './app.js', './logo-formaturas.png', './Daniel.ttf', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA).catch(() => null)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const daApi = url.pathname.includes('/area-formando/');
  if (e.request.method !== 'GET' || daApi || url.origin !== location.origin) return;

  // rede primeiro (o site muda a cada publicação); o cache é a rede de segurança
  e.respondWith(
    fetch(e.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(VERSAO).then((c) => c.put(e.request, copia)).catch(() => null);
        return resposta;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});

// Notificação: chega pronta quando o envio for ligado no servidor.
self.addEventListener('push', (e) => {
  let dados = {};
  try { dados = e.data ? e.data.json() : {}; } catch { dados = {}; }
  const titulo = dados.titulo || 'Indaiá Formaturas';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: dados.texto || '',
    icon: './icone-192.png',
    badge: './icone-192.png',
    data: { url: dados.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
    const aberta = abas.find((a) => a.url.includes(location.origin));
    if (aberta) return aberta.focus();
    return clients.openWindow(destino);
  }));
});
