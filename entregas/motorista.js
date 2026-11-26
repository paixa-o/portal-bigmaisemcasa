let sessaoMotorista = null;
let eventoInstalacaoPWA = null;

function configurarPWA() {
  if (!window.location.protocol.startsWith("http")) return;

  const linkManifest = document.createElement("link");
  linkManifest.rel = "manifest";
  linkManifest.href = "./manifest.json";
  document.head.appendChild(linkManifest);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }
}

window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  eventoInstalacaoPWA = e;
  const btnInstalar = document.getElementById("btn-instalar-app");
  if (btnInstalar) btnInstalar.style.display = "inline-block";
});

window.addEventListener("appinstalled", function () {
  eventoInstalacaoPWA = null;
  const btnInstalar = document.getElementById("btn-instalar-app");
  if (btnInstalar) btnInstalar.style.display = "none";
});

async function instalarAplicativoMotorista() {
  if (!eventoInstalacaoPWA) return;
  eventoInstalacaoPWA.prompt();
  await eventoInstalacaoPWA.userChoice;
  eventoInstalacaoPWA = null;
  const btnInstalar = document.getElementById("btn-instalar-app");
  if (btnInstalar) btnInstalar.style.display = "none";
}

function obterHojeISO() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function obterPrimeiroDiaMesISO() {
  return `${obterHojeISO().slice(0, 7)}-01`;
}

function formatarDataBR(iso) {
  if (!iso || iso.length !== 10 || iso.indexOf("-") === -1) return iso || "-";
  const p = iso.split("-");
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function formatarMoeda(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function mostrarErro(msg) {
  const el = document.getElementById("erro-login");
  el.textContent = msg;
  el.classList.add("visivel");
}

function limparErro() {
  const el = document.getElementById("erro-login");
  el.textContent = "";
  el.classList.remove("visivel");
}

async function carregarMotoristasAtivos() {
  const select = document.getElementById("select-motorista");
  try {
    if (typeof URL_API_PLANILHA === "undefined" || !URL_API_PLANILHA) {
      throw new Error("Configuração da API não carregada.");
    }

    const sep = URL_API_PLANILHA.includes("?") ? "&" : "?";
    const url = `${URL_API_PLANILHA}${sep}acao=listarMotoristasAtivosPublico&t=${Date.now()}`;
    const resp = await fetch(url);
    const dados = await resp.json();

    if (!dados || !dados.sucesso || !Array.isArray(dados.entregadores)) {
      throw new Error("Não foi possível carregar a lista.");
    }

    select.innerHTML = "";

    if (dados.entregadores.length === 0) {
      const optVazio = document.createElement("option");
      optVazio.value = "";
      optVazio.textContent = "Nenhum entregador ativo cadastrado";
      select.appendChild(optVazio);
      return;
    }

    const optPadrao = document.createElement("option");
    optPadrao.value = "";
    optPadrao.textContent = "-- Selecione seu nome --";
    select.appendChild(optPadrao);

    dados.entregadores.forEach(function (e) {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = `${e.nome} (${e.funcao})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Erro ao carregar motoristas:", err);
    select.innerHTML = "";
    const optErro = document.createElement("option");
    optErro.value = "";
    optErro.textContent = "Erro ao carregar lista. Recarregue a página.";
    select.appendChild(optErro);
    mostrarErro("Não foi possível conectar ao servidor agora.");
  }
}

async function buscarEntregasAPI(entregadorId, chapa, dataInicio, dataFim) {
  const sep = URL_API_PLANILHA.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    acao: "consultarEntregasMotorista",
    entregadorId: entregadorId,
    chapa: chapa,
    dataInicio: dataInicio,
    dataFim: dataFim,
    t: String(Date.now()),
  });
  const resp = await fetch(`${URL_API_PLANILHA}${sep}${params.toString()}`);
  return await resp.json();
}

async function entrarConsultaMotorista(event) {
  event.preventDefault();
  limparErro();

  const entregadorId = document.getElementById("select-motorista").value;
  const chapa = document.getElementById("senha-chapa").value.trim();
  const dataInicio = document.getElementById("login-data-inicio").value;
  const dataFim = document.getElementById("login-data-fim").value;
  const btn = document.getElementById("btn-consultar");

  if (!entregadorId || !chapa) {
    mostrarErro("Selecione seu nome e informe sua CHAPA.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Consultando...";

  try {
    const res = await buscarEntregasAPI(
      entregadorId,
      chapa,
      dataInicio,
      dataFim
    );

    if (!res || !res.sucesso) {
      mostrarErro((res && res.erro) || "Não foi possível validar sua CHAPA.");
      return;
    }

    sessaoMotorista = {
      entregadorId: entregadorId,
      chapa: chapa,
      entregador: res.entregador,
    };

    document.getElementById("filtro-data-inicio").value = dataInicio;
    document.getElementById("filtro-data-fim").value = dataFim;

    document.getElementById("motorista-nome-titulo").textContent =
      res.entregador.nome;
    document.getElementById("motorista-detalhes-titulo").textContent =
      `${res.entregador.funcao} • CHAPA ${res.entregador.chapa} • ${formatarMoeda(res.entregador.tarifa)}/entrega`;

    renderizarResultadosMotorista(res.lancamentos || []);

    document.getElementById("tela-login-motorista").style.display = "none";
    document.getElementById("tela-painel-motorista").style.display = "block";
  } catch (err) {
    mostrarErro("Falha de conexão ao consultar entregas.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Consultar Minhas Entregas";
  }
}

async function reconsultarPeriodoMotorista() {
  if (!sessaoMotorista) return;
  const listaEl = document.getElementById("lista-entregas-motorista");
  listaEl.innerHTML = `<div class="vazio-msg">Atualizando período...</div>`;

  const dataInicio = document.getElementById("filtro-data-inicio").value;
  const dataFim = document.getElementById("filtro-data-fim").value;

  try {
    const res = await buscarEntregasAPI(
      sessaoMotorista.entregadorId,
      sessaoMotorista.chapa,
      dataInicio,
      dataFim
    );
    if (res && res.sucesso) {
      renderizarResultadosMotorista(res.lancamentos || []);
    }
  } catch (e) {
    listaEl.innerHTML = `<div class="vazio-msg">Erro ao atualizar período.</div>`;
  }
}

function renderizarResultadosMotorista(lancamentos) {
  const diasSet = new Set();
  let totalEntregas = 0;
  let totalComissao = 0;

  lancamentos.forEach(function (l) {
    diasSet.add(l.data);
    totalEntregas += Number(l.quantidade) || 0;
    totalComissao += Number(l.valorComissao) || 0;
  });

  document.getElementById("resumo-dias").textContent = String(diasSet.size);
  document.getElementById("resumo-entregas").textContent = String(totalEntregas);
  document.getElementById("resumo-comissao").textContent =
    formatarMoeda(totalComissao);

  const listaEl = document.getElementById("lista-entregas-motorista");
  listaEl.innerHTML = "";

  if (lancamentos.length === 0) {
    const vazio = document.createElement("div");
    vazio.className = "vazio-msg";
    vazio.textContent = "Nenhuma entrega registrada neste período.";
    listaEl.appendChild(vazio);
    return;
  }

  lancamentos.forEach(function (l) {
    const item = document.createElement("div");
    item.className = "item-entrega";

    const info = document.createElement("div");
    info.className = "item-entrega-info";

    const titulo = document.createElement("strong");
    titulo.textContent = `${formatarDataBR(l.data)} • ${l.loja || "-"}`;

    const obs = document.createElement("small");
    obs.textContent = l.observacao || "Sem observação";

    info.appendChild(titulo);
    info.appendChild(obs);

    const valores = document.createElement("div");
    valores.className = "item-entrega-valores";

    const badge = document.createElement("span");
    badge.className = "qtd-badge";
    badge.textContent = `${l.quantidade} ent.`;

    const valorCom = document.createElement("span");
    valorCom.className = "valor-com";
    valorCom.textContent = formatarMoeda(l.valorComissao);

    valores.appendChild(badge);
    valores.appendChild(valorCom);

    item.appendChild(info);
    item.appendChild(valores);
    listaEl.appendChild(item);
  });
}

function sairConsultaMotorista() {
  sessaoMotorista = null;
  document.getElementById("senha-chapa").value = "";
  document.getElementById("tela-painel-motorista").style.display = "none";
  document.getElementById("tela-login-motorista").style.display = "block";
}

document.addEventListener("DOMContentLoaded", function () {
  configurarPWA();
  document.getElementById("login-data-inicio").value = obterPrimeiroDiaMesISO();
  document.getElementById("login-data-fim").value = obterHojeISO();
  carregarMotoristasAtivos();
});