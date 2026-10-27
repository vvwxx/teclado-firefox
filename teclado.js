// Mesmas teclas do módulo teclado do Vorgan Vault, mais as de aba e a pesquisa na página.
const editavel = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const semModificador = (e) => !e.ctrlKey && !e.metaKey && !e.altKey;
const pedir = (acao) => browser.runtime.sendMessage({ acao });

// Letras das dicas: fileira do meio primeiro, que é onde os dedos já estão.
const LETRAS = "asdfghjklqweruiopzxcvnm";

// O que costuma ser clicável numa página.
const CLICAVEIS = [
  "a[href]", "button", "select", "input:not([type=hidden])", "textarea", "summary", "label[for]",
  "[role=button]", "[role=tab]", "[role=menuitem]", "[role=checkbox]", "[role=link]", "[role=option]",
  "[tabindex]:not([tabindex='-1'])", "[onclick]", "[contenteditable=true]",
].join(",");

const CURSORES = new Set(["pointer", "zoom-in", "zoom-out", "grab"]);

const GOOGLE = "https://www.google.com/search?q=";

let painel = null;
let dicas = null;
// Teclas que viraram comando: o keyup delas também não pode chegar na página.
const soltar = new Set();

const ACOES = {
  d: () => rolar(1),
  u: () => rolar(-1),
  x: () => pedir("fechar"),
  X: () => pedir("recuperar"),
  t: () => pedir("novaAba"),
  b: () => abrirPesquisa(),
  f: () => mostrarDicas(),
  F: () => mostrarDicas(),
};

window.addEventListener("keydown", (e) => {
  if (dicas) return teclaNasDicas(e);
  if (painel) return teclaNaPesquisa(e);
  if (e.isComposing || !semModificador(e)) return;
  // O alvo real pode estar dentro de um shadow DOM (editores de sites, o próprio painel).
  const alvo = e.composedPath()[0];
  if (editavel(alvo) || editavel(document.activeElement)) return;
  const acao = ACOES[e.key];
  if (!acao) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  soltar.add(e.code);
  acao();
}, { capture: true });

// Com a pesquisa ou as dicas abertas nenhuma tecla chega nos atalhos da página.
// Parar a propagação não impede o texto de entrar no campo, só o preventDefault faria isso.
for (const tipo of ["keypress", "keyup"]) {
  window.addEventListener(tipo, (e) => {
    const nossa = tipo === "keyup" && soltar.delete(e.code);
    if (painel || dicas || nossa) e.stopImmediatePropagation();
  }, { capture: true });
}

// Rola meia tela na página ou, se ela não rola (sites com painel próprio), no maior painel com rolagem.
function rolar(sentido) {
  let alvo = document.scrollingElement;
  if (!alvo || alvo.scrollHeight <= alvo.clientHeight + 4) {
    alvo = null;
    let area = 0;
    for (const el of document.body?.querySelectorAll("*") ?? []) {
      if (el.scrollHeight <= el.clientHeight + 4) continue;
      const estilo = getComputedStyle(el).overflowY;
      if (estilo !== "auto" && estilo !== "scroll") continue;
      const r = el.getBoundingClientRect(), a = r.width * r.height;
      if (a > area) { alvo = el; area = a; }
    }
  }
  if (!alvo) return;
  const altura = alvo === document.scrollingElement ? innerHeight : alvo.clientHeight;
  alvo.scrollBy({ top: sentido * altura / 2, behavior: "smooth" });
}

// Janela no centro da tela para pesquisar no Google nesta aba. Esc fecha.
function abrirPesquisa() {
  if (painel) fecharPesquisa();
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647";
  const raiz = host.attachShadow({ mode: "closed" });
  raiz.innerHTML = `
    <style>
      .fundo { position:fixed; inset:0; display:flex; align-items:flex-start; justify-content:center;
               padding-top:28vh; background:#0008; backdrop-filter:blur(14px); }
      .caixa { width:min(560px, calc(100vw - 32px)); padding:14px; border:1px solid #ff3b30; border-radius:12px;
               background:#000; box-shadow:0 12px 40px #000c; font:16px system-ui,sans-serif; }
      input { box-sizing:border-box; width:100%; padding:10px 12px; border:1px solid #ff3b30; border-radius:8px;
              background:#000; color:#fff; font:inherit; outline:none; caret-color:#ff3b30; }
      input::placeholder { color:#5a5a5a; }
      input:focus { box-shadow:0 0 0 1px #ff3b30; }
    </style>
    <div class="fundo"><div class="caixa">
      <input placeholder="Digite e aperte Enter">
    </div></div>`;
  document.documentElement.append(host);
  const campo = raiz.querySelector("input");
  painel = { host, campo };

  raiz.querySelector(".fundo").addEventListener("mousedown", (e) => {
    if (e.target === e.currentTarget) fecharPesquisa();
  });
  campo.focus();
}

// Roda na captura da janela, antes de qualquer ouvinte da página, então a tecla para aqui.
// Tab também fica preso, senão o foco sai do campo e cai na página.
function teclaNaPesquisa(e) {
  e.stopImmediatePropagation();
  if (e.isComposing) return;
  if (e.key === "Escape" || e.key === "Tab") e.preventDefault();
  if (e.key === "Escape") return fecharPesquisa();
  if (e.key !== "Enter") return;
  e.preventDefault();
  const texto = painel.campo.value.trim();
  if (!texto) return;
  fecharPesquisa();
  location.assign(GOOGLE + encodeURIComponent(texto));
}

function fecharPesquisa() {
  painel?.host.remove();
  painel = null;
}

// F mostra uma dica de 2 letras em cada coisa clicável; digitar as letras clica nela.
function mostrarDicas() {
  const alvos = visiveis();
  if (!alvos.length) return;
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  const raiz = host.attachShadow({ mode: "closed" });
  raiz.innerHTML = `
    <style>
      .dica { position:absolute; padding:1px 4px; border:1px solid #ff3b30; border-radius:3px;
              background:#000; color:#ff3b30; font:700 11px/1.3 ui-monospace,monospace;
              letter-spacing:.06em; box-shadow:0 1px 4px #000c; }
      .feito { color:#5a5a5a; }
      .oculta { display:none; }
    </style>`;
  const nomes = [];
  // A primeira letra varia antes da segunda, para as dicas não começarem todas com a mesma tecla.
  for (const b of LETRAS) for (const a of LETRAS) nomes.push(a + b);
  const itens = alvos.slice(0, nomes.length).map((el, i) => {
    const r = el.getBoundingClientRect();
    const tag = document.createElement("div");
    tag.className = "dica";
    tag.style.left = Math.max(0, r.left - 4) + "px";
    tag.style.top = Math.max(0, r.top - 4) + "px";
    raiz.append(tag);
    return { el, nome: nomes[i], tag };
  });
  document.documentElement.append(host);
  dicas = { host, itens, digitado: "" };
  desenhar();
}

function desenhar() {
  const { itens, digitado } = dicas;
  for (const it of itens) {
    const bate = it.nome.startsWith(digitado);
    it.tag.classList.toggle("oculta", !bate);
    if (!bate) continue;
    const feito = document.createElement("span");
    feito.className = "feito";
    feito.textContent = digitado.toUpperCase();
    it.tag.replaceChildren(feito, it.nome.slice(digitado.length).toUpperCase());
  }
}

function teclaNasDicas(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key === "Escape") return fecharDicas();
  if (e.key === "Backspace") { dicas.digitado = dicas.digitado.slice(0, -1); return desenhar(); }
  const k = e.key.toLowerCase();
  if (k.length !== 1 || !LETRAS.includes(k)) return;
  const restam = dicas.itens.filter((it) => it.nome.startsWith(dicas.digitado + k));
  if (!restam.length) return;
  dicas.digitado += k;
  if (dicas.digitado.length < 2) return desenhar();
  fecharDicas();
  clicar(restam[0].el);
}

function fecharDicas() {
  dicas?.host.remove();
  dicas = null;
}

function clicar(el) {
  if (editavel(el)) return el.focus();
  el.focus?.({ preventScroll: true });
  const opts = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.click();
}

// Só o que está na tela e não está coberto por outra coisa; dentro de um item clicável, fica o de fora.
function visiveis() {
  const candidatos = new Set(document.querySelectorAll(CLICAVEIS));
  // Além da lista, vale o que tem cursor de mãozinha (sites que fazem botão com div).
  for (const el of document.body?.querySelectorAll("div, span, img, li, svg") ?? []) {
    if (candidatos.has(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    if (CURSORES.has(getComputedStyle(el).cursor)) candidatos.add(el);
  }
  const vistos = [];
  for (const el of candidatos) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const topo = document.elementFromPoint(x, y);
    if (!topo || !(el === topo || el.contains(topo) || topo.contains(el))) continue;
    if (vistos.some((v) => v.contains(el))) continue;
    for (let i = vistos.length - 1; i >= 0; i--) if (el.contains(vistos[i])) vistos.splice(i, 1);
    vistos.push(el);
  }
  return vistos;
}
