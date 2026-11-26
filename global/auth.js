const CHAVE_SESSAO_PORTAL = "bigmais_sessao_usuario_v1";

function obterUsuarioConfig(usuarioId) {
  if (typeof USUARIOS_PREDEFINIDOS === "undefined") return null;
  return USUARIOS_PREDEFINIDOS.find((u) => u.id === usuarioId) || null;
}

function obterSessaoAtual() {
  try {
    const raw =
      sessionStorage.getItem(CHAVE_SESSAO_PORTAL) ||
      localStorage.getItem(CHAVE_SESSAO_PORTAL);
    if (!raw) return null;
    const sessao = JSON.parse(raw);
    if (!sessao || !sessao.id || !sessao.nome) return null;
    return sessao;
  } catch (e) {
    return null;
  }
}

function salvarSessaoAtual(usuario, lembrarDispositivo = true) {
  const payload = JSON.stringify({
    id: usuario.id,
    nome: usuario.nome,
    cargo: usuario.cargo,
    lojas: Array.isArray(usuario.lojas) ? usuario.lojas : [],
    loginEm: new Date().toISOString(),
  });

  sessionStorage.setItem(CHAVE_SESSAO_PORTAL, payload);
  if (lembrarDispositivo) {
    localStorage.setItem(CHAVE_SESSAO_PORTAL, payload);
  } else {
    localStorage.removeItem(CHAVE_SESSAO_PORTAL);
  }
}

function encerrarSessao(caminhoLogin = "index.html") {
  sessionStorage.removeItem(CHAVE_SESSAO_PORTAL);
  localStorage.removeItem(CHAVE_SESSAO_PORTAL);
  window.location.href = caminhoLogin;
}

function exigirAutenticacao(caminhoLogin = "../index.html") {
  const sessao = obterSessaoAtual();
  if (!sessao) {
    window.location.replace(caminhoLogin);
    return null;
  }
  return sessao;
}

function gerarSaltHex(tamanhoBytes = 16) {
  const bytes = new Uint8Array(tamanhoBytes);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function calcularHashSenha(senha, salt) {
  const encoder = new TextEncoder();
  const dados = encoder.encode(`${salt}:${senha}`);
  const digest = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

async function consultarStatusUsuarioPlanilha(usuarioId) {
  const separador = URL_API_PLANILHA.includes("?") ? "&" : "?";
  const url = `${URL_API_PLANILHA}${separador}acao=consultarUsuario&usuarioId=${encodeURIComponent(usuarioId)}&t=${Date.now()}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

async function cadastrarSenhaUsuarioPlanilha(usuarioConfig, senha) {
  const salt = gerarSaltHex(16);
  const senhaHash = await calcularHashSenha(senha, salt);

  const resp = await fetch(URL_API_PLANILHA, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      acao: "cadastrarSenha",
      usuarioId: usuarioConfig.id,
      nome: usuarioConfig.nome,
      cargo: usuarioConfig.cargo,
      lojas: usuarioConfig.lojas.join(", "),
      salt,
      senhaHash,
    }),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

async function autenticarUsuarioPlanilha(usuarioConfig, senha) {
  const consulta = await consultarStatusUsuarioPlanilha(usuarioConfig.id);
  if (!consulta.sucesso) {
    throw new Error(consulta.erro || "Erro ao consultar usuário na planilha.");
  }

  if (!consulta.cadastrado || !consulta.salt) {
    return {
      sucesso: false,
      naoCadastrado: true,
      erro: "Usuário ainda não possui senha cadastrada.",
    };
  }

  const senhaHash = await calcularHashSenha(senha, consulta.salt);

  const resp = await fetch(URL_API_PLANILHA, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      acao: "autenticarUsuario",
      usuarioId: usuarioConfig.id,
      senhaHash,
    }),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

function preencherDadosUsuarioLogado({
  seletoresSolicitante = ["#solicitante", "#est-solicitante"],
  seletoresLoja = ["#loja", "#est-loja"],
  somenteSeVazio = false,
} = {}) {
  const sessao = obterSessaoAtual();
  if (!sessao) return null;

  seletoresSolicitante.forEach((seletor) => {
    const el = document.querySelector(seletor);
    if (!el) return;
    if (somenteSeVazio && String(el.value || "").trim() !== "") return;
    el.value = sessao.nome;
  });

  if (Array.isArray(sessao.lojas) && sessao.lojas.length === 1) {
    const lojaUnica = sessao.lojas[0];
    seletoresLoja.forEach((seletor) => {
      const el = document.querySelector(seletor);
      if (!el || el.tagName !== "SELECT") return;
      if (somenteSeVazio && String(el.value || "").trim() !== "") return;
      const existeOpcao = Array.from(el.options).some(
        (opt) => opt.value === lojaUnica
      );
      if (existeOpcao) {
        el.value = lojaUnica;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  return sessao;
}